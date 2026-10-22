import type { Request } from 'express';
import prisma from '../../../lib/prisma';
import { badRequest, FinHttpError, handle } from '../http';
import { previewPosting } from '../posting/preview';
import { POSTING_SOURCE_TYPES, type PostingSourceType } from '../posting/sync';
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
