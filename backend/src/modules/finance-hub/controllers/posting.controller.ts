import type { Request } from 'express';
import prisma from '../../../lib/prisma';
import { badRequest, FinHttpError, handle } from '../http';
import { previewPosting } from '../posting/preview';
import { configSourceOf, POSTING_SOURCE_TYPES, type PostingSourceType } from '../posting/sync';
import { enqueueSource, postingQueueSnapshot, queueSourcesWithAutoDrafts, retryAllFailed, retryQueueItem, runPostingTick } from '../posting/worker';
import { actorFromRequest, requestBody } from '../services/context';
import { buildPostingSettingsUpdate, FIN_SETTINGS_ID, readPostingConfig, readPostingState, updatePostingSettings } from '../services/settings.service';

export const getPostingStatus = handle(async () => {
  const [settings, queue, autoDrafts, autoPosted] = await Promise.all([
    prisma.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID } }),
    postingQueueSnapshot(),
    prisma.finVoucher.count({ where: { status: 'DRAFT', sourceType: { not: null }, NOT: { sourceType: 'OPENING_BALANCE' } } }),
    prisma.finVoucher.count({ where: { status: { in: ['POSTED', 'REVERSED'] }, sourceType: { not: null }, NOT: { sourceType: 'OPENING_BALANCE' } } }),
  ]);
  return {
    postingMode: settings?.postingMode ?? 'OFF',
    config: readPostingConfig(settings?.config),
    state: readPostingState(settings?.config),
    queue,
    autoDrafts,
    autoPosted,
  };
});

export const putPostingSettings = handle(async (req: Request) => {
  const parsed = buildPostingSettingsUpdate(requestBody(req));
  if ('error' in parsed) throw badRequest(parsed.error);
  const current = await prisma.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID }, select: { postingMode: true } });
  const changingMode = parsed.data.postingMode && parsed.data.postingMode !== (current?.postingMode ?? 'OFF');
  if (changingMode && req.user?.role !== 'SUPER_ADMIN') throw new FinHttpError(403, 'Only a super admin can change the posting mode.');
  if (changingMode && parsed.data.postingMode === 'LIVE' && !parsed.data.reason) throw badRequest('A reason is required to switch automatic posting to LIVE.');
  const settings = await updatePostingSettings(parsed.data, actorFromRequest(req));
  const queuedDrafts = changingMode && parsed.data.postingMode === 'LIVE' ? await queueSourcesWithAutoDrafts() : 0;
  return { ...settings, queuedDrafts };
});

export const postRunNow = handle(async (req: Request) => runPostingTick({ fullSweep: requestBody(req).fullSweep === true }));

export const postPreview = handle(async (req: Request) => {
  const limit = Number(requestBody(req).limit ?? 10);
  return previewPosting(Number.isInteger(limit) && limit > 0 && limit <= 50 ? limit : 10);
});

export const postRetry = handle(async (req: Request) => {
  const id = typeof req.params.id === 'string' ? req.params.id : '';
  if (!id) throw badRequest('Queue item id is required.');
  await retryQueueItem(id);
  return { retried: 1 };
});

export const postRetryAll = handle(async () => ({ retried: (await retryAllFailed()).count }));

export const postResync = handle(async (req: Request) => {
  const body = requestBody(req);
  const sourceType = String(body.sourceType || '') as PostingSourceType;
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
  if (!(POSTING_SOURCE_TYPES as readonly string[]).includes(sourceType) || !sourceId) throw badRequest('sourceType and sourceId are required.');
  return { queued: await enqueueSource(sourceType, sourceId, 'MANUAL_RESYNC') };
});

/**
 * Where each source record stands in the books, for screens outside the workspace (e.g. the
 * Expenses page). ?sourceType=FINANCE_TRANSACTION&ids=a,b (up to 200 ids).
 */
export const getSourceBookStatus = handle(async (req: Request) => {
  const sourceType = String(req.query.sourceType || '') as PostingSourceType;
  if (!POSTING_SOURCE_TYPES.includes(sourceType)) throw badRequest('Unknown source type.');
  const ids = String(req.query.ids || '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 200);
  const settings = await prisma.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID } });
  const config = readPostingConfig(settings?.config);
  const enabled = (settings?.postingMode ?? 'OFF') !== 'OFF' && config.sources[configSourceOf(sourceType)] !== false;
  if (!ids.length) return { enabled, postingMode: settings?.postingMode ?? 'OFF', items: {} };

  const [vouchers, queue] = await Promise.all([
    prisma.finVoucher.findMany({
      where: { sourceType, sourceId: { in: ids }, status: { notIn: ['REVERSED', 'REJECTED'] } },
      select: { sourceId: true, number: true, status: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.finPostingQueue.findMany({
      where: { sourceType, sourceId: { in: ids } },
      select: { sourceId: true, status: true, lastError: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const items: Record<string, { state: 'IN_BOOKS' | 'DRAFT' | 'QUEUED' | 'NEEDS_ATTENTION' | 'NOT_IN_BOOKS'; voucherNumber: string | null; error: string | null }> = {};
  for (const id of ids) {
    const voucher = vouchers.find((row) => row.sourceId === id);
    const latest = queue.find((row) => row.sourceId === id);
    if (voucher?.status === 'POSTED') items[id] = { state: 'IN_BOOKS', voucherNumber: voucher.number, error: null };
    else if (voucher) items[id] = { state: 'DRAFT', voucherNumber: null, error: null };
    else if (latest?.status === 'FAILED') items[id] = { state: 'NEEDS_ATTENTION', voucherNumber: null, error: latest.lastError };
    else if (latest && ['PENDING', 'PROCESSING'].includes(latest.status)) items[id] = { state: 'QUEUED', voucherNumber: null, error: null };
    else items[id] = { state: 'NOT_IN_BOOKS', voucherNumber: null, error: null };
  }
  return { enabled, postingMode: settings?.postingMode ?? 'OFF', items };
});
