import prisma from '../../../lib/prisma';
import { FIN_SETTINGS_ID, readPostingConfig, readPostingState, writePostingState } from '../services/settings.service';
import { isFinanceHubSchemaMissing } from '../services/schemaState';
import { configSourceOf, isPostingMode, syncSource, type PostingSourceType } from './sync';

// Automatic posting worker. Existing finance flows are never called or changed: the worker
// reads source tables (updatedAt/createdAt sweep + orphan check) and queues each changed record.

const IST_MS = 330 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 25;
const STUCK_AFTER_MS = 10 * 60 * 1000;

const istDayKey = (timestamp: Date) => new Date(timestamp.getTime() + IST_MS).toISOString().slice(0, 10);

/** Queues a source unless it is already waiting. Returns true when a row was added. */
export const enqueueSource = async (sourceType: PostingSourceType, sourceId: string, event: string) => {
  const waiting = await prisma.finPostingQueue.findFirst({ where: { sourceType, sourceId, status: 'PENDING' }, select: { id: true } });
  if (waiting) return false;
  await prisma.finPostingQueue.create({ data: { sourceType, sourceId: sourceId.slice(0, 100), event: event.slice(0, 60) } });
  return true;
};

type Enabled = ReturnType<typeof readPostingConfig>['sources'];

/** Everything changed since `since` (null = everything: first run / backfill). */
export const sweepChangedSources = async (since: Date | null, enabled: Enabled) => {
  const changed = (field: 'updatedAt' | 'createdAt') => (since ? { [field]: { gt: since } } : {});
  let queued = 0;
  const add = async (type: PostingSourceType, id: string, event: string) => { if (await enqueueSource(type, id, event)) queued += 1; };

  if (enabled.SELL_ACCOUNT) {
    const deals = await prisma.sellAccount.findMany({ where: changed('updatedAt'), select: { id: true } });
    const payments = since ? await prisma.sellAccountPayment.findMany({ where: { createdAt: { gt: since } }, select: { sellAccountId: true }, distinct: ['sellAccountId'] }) : [];
    for (const id of new Set([...deals.map((deal) => deal.id), ...payments.map((payment) => payment.sellAccountId)])) await add('SELL_ACCOUNT', id, 'SWEEP');
  }
  if (enabled.LISTING_PAYMENT) {
    for (const row of await prisma.listingPaymentSubmission.findMany({ where: changed('updatedAt'), select: { id: true } })) await add('LISTING_PAYMENT', row.id, 'SWEEP');
  }
  if (enabled.CUSTOMER_PRIME) {
    for (const row of await prisma.customerPrimeSubscription.findMany({ where: changed('updatedAt'), select: { id: true } })) await add('CUSTOMER_PRIME', row.id, 'SWEEP');
  }
  if (enabled.PARTNER_DEPOSIT) {
    for (const row of await prisma.partnerDeposit.findMany({ where: changed('updatedAt'), select: { id: true } })) await add('PARTNER_DEPOSIT', row.id, 'SWEEP');
  }
  if (enabled.API_WALLET) {
    const entries = await prisma.apiWalletLedger.findMany({ where: changed('createdAt'), select: { id: true, type: true, createdAt: true } });
    const days = new Set<string>();
    for (const entry of entries) {
      if (entry.type === 'CREDIT') await add('API_WALLET_LEDGER', entry.id, 'SWEEP');
      else days.add(istDayKey(entry.createdAt));
    }
    for (const day of days) await add('API_WALLET_DAY', day, 'SWEEP');
  }
  return queued;
};

/**
 * Sources that disappeared (hard-deleted Sold Vehicles, deleted payments) do not show up in an
 * updatedAt sweep, so compare what the books reference with what still exists.
 */
export const queueOrphans = async () => {
  let queued = 0;
  const active = await prisma.finVoucher.findMany({
    where: { sourceType: { in: ['SELL_ACCOUNT', 'LISTING_PAYMENT', 'CUSTOMER_PRIME', 'PARTNER_DEPOSIT', 'API_WALLET_LEDGER'] }, reversalOfId: null, status: { in: ['DRAFT', 'POSTED'] } },
    select: { sourceType: true, sourceId: true, sourceEvent: true },
  });
  const byType = new Map<string, Set<string>>();
  const paymentKeys = new Map<string, string>();
  for (const voucher of active) {
    if (!voucher.sourceType || !voucher.sourceId) continue;
    byType.set(voucher.sourceType, (byType.get(voucher.sourceType) ?? new Set()).add(voucher.sourceId));
    const paymentId = voucher.sourceEvent?.match(/^(?:RECEIPT|SELLER_PAYMENT):(.+)$/)?.[1];
    if (voucher.sourceType === 'SELL_ACCOUNT' && paymentId) paymentKeys.set(paymentId, voucher.sourceId);
  }
  const exists = {
    SELL_ACCOUNT: (ids: string[]) => prisma.sellAccount.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    LISTING_PAYMENT: (ids: string[]) => prisma.listingPaymentSubmission.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    CUSTOMER_PRIME: (ids: string[]) => prisma.customerPrimeSubscription.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    PARTNER_DEPOSIT: (ids: string[]) => prisma.partnerDeposit.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    API_WALLET_LEDGER: (ids: string[]) => prisma.apiWalletLedger.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  } as const;
  for (const [type, ids] of byType) {
    const list = Array.from(ids);
    const found = new Set((await exists[type as keyof typeof exists](list)).map((row) => row.id));
    for (const id of list) if (!found.has(id) && await enqueueSource(type as PostingSourceType, id, 'ORPHAN')) queued += 1;
  }
  if (paymentKeys.size) {
    const found = new Set((await prisma.sellAccountPayment.findMany({ where: { id: { in: Array.from(paymentKeys.keys()) } }, select: { id: true } })).map((row) => row.id));
    for (const [paymentId, dealId] of paymentKeys) if (!found.has(paymentId) && await enqueueSource('SELL_ACCOUNT', dealId, 'PAYMENT_DELETED')) queued += 1;
  }
  return queued;
};

const backoffMs = (attempts: number) => Math.min(2 ** attempts, 60) * 60 * 1000;

/** Claims a batch with SKIP LOCKED so two backend instances never process the same row. */
const claimBatch = async () => prisma.$queryRaw<Array<{ id: string; sourceType: string; sourceId: string; attempts: number }>>`
  UPDATE "FinPostingQueue" SET "status" = 'PROCESSING', "updatedAt" = NOW()
  WHERE "id" IN (
    SELECT "id" FROM "FinPostingQueue"
    WHERE "status" = 'PENDING' AND "nextRunAt" <= NOW()
    ORDER BY "createdAt" ASC
    LIMIT ${BATCH_SIZE}
    FOR UPDATE SKIP LOCKED
  )
  RETURNING "id", "sourceType", "sourceId", "attempts"`;

export const processQueue = async (mode: 'SHADOW' | 'LIVE', enabled: Enabled) => {
  const result = { processed: 0, failed: 0, skipped: 0, created: 0, reversed: 0, posted: 0 };
  for (const item of await claimBatch()) {
    const sourceType = item.sourceType as PostingSourceType;
    if (!enabled[configSourceOf(sourceType)]) {
      await prisma.finPostingQueue.update({ where: { id: item.id }, data: { status: 'SKIPPED', lastError: 'Source switched off in posting settings.' } });
      result.skipped += 1;
      continue;
    }
    try {
      const summary = await syncSource(sourceType, item.sourceId, { mode });
      const vouchers = await prisma.finVoucher.findMany({ where: { sourceType, sourceId: item.sourceId, reversalOfId: null, status: { in: ['DRAFT', 'POSTED'] } }, select: { id: true } });
      await prisma.finPostingQueue.update({ where: { id: item.id }, data: { status: 'DONE', attempts: item.attempts + 1, lastError: null, resultVoucherIds: vouchers.map((voucher) => voucher.id) } });
      result.processed += 1;
      result.created += summary.created;
      result.reversed += summary.reversed;
      result.posted += summary.posted;
    } catch (error) {
      const attempts = item.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      await prisma.finPostingQueue.update({
        where: { id: item.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          attempts,
          lastError: message.slice(0, 2000),
          nextRunAt: new Date(Date.now() + backoffMs(attempts)),
        },
      });
      result.failed += 1;
    }
  }
  return result;
};

let running = false;

/** One worker pass. Does nothing while posting mode is OFF. */
export const runPostingTick = async (options: { fullSweep?: boolean } = {}) => {
  if (running) return { skipped: 'already running' as const };
  running = true;
  try {
    const settings = await prisma.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID } });
    if (!settings || !isPostingMode(settings.postingMode)) return { skipped: 'posting mode is OFF' as const };
    const config = readPostingConfig(settings.config);
    const state = readPostingState(settings.config);
    const startedAt = new Date();

    await prisma.finPostingQueue.updateMany({ where: { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } }, data: { status: 'PENDING' } });
    const since = options.fullSweep || !state.lastSweepAt ? null : new Date(new Date(state.lastSweepAt).getTime() - 60 * 1000);
    const swept = await sweepChangedSources(since, config.sources);
    const orphans = await queueOrphans();
    let totals = { processed: 0, failed: 0, skipped: 0, created: 0, reversed: 0, posted: 0 };
    // Drain several batches per tick so a backfill finishes in a few minutes.
    for (let batch = 0; batch < 8; batch += 1) {
      const result = await processQueue(settings.postingMode, config.sources);
      totals = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value + result[key as keyof typeof result]])) as typeof totals;
      if (result.processed + result.failed + result.skipped < BATCH_SIZE) break;
    }
    const summary = { mode: settings.postingMode, swept, orphans, ...totals, finishedAt: new Date().toISOString() };
    await writePostingState({ lastSweepAt: startedAt.toISOString(), lastRunAt: new Date().toISOString(), lastRunSummary: summary });
    return summary;
  } finally {
    running = false;
  }
};

let timer: NodeJS.Timeout | null = null;

/** Started from server.ts. FINANCE_HUB_WORKER=off disables it (e.g. on a second instance). */
export const startFinanceHubWorker = (intervalMs = 60 * 1000) => {
  if (timer || process.env.FINANCE_HUB_WORKER === 'off') return;
  const tick = () => {
    runPostingTick().catch((error) => {
      if (isFinanceHubSchemaMissing(error)) return;
      console.error('[finance-hub] posting worker tick failed:', error instanceof Error ? error.message : error);
    });
  };
  setTimeout(tick, 30 * 1000).unref();
  timer = setInterval(tick, intervalMs);
  timer.unref();
};

export type QueueStatusCounts = Record<'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'SKIPPED', number>;

export const postingQueueSnapshot = async () => {
  const [counts, failing] = await Promise.all([
    prisma.finPostingQueue.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.finPostingQueue.findMany({
      where: { OR: [{ status: 'FAILED' }, { status: 'PENDING', attempts: { gt: 0 } }] },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, sourceType: true, sourceId: true, status: true, attempts: true, lastError: true, nextRunAt: true, updatedAt: true },
    }),
  ]);
  const byStatus: QueueStatusCounts = { PENDING: 0, PROCESSING: 0, DONE: 0, FAILED: 0, SKIPPED: 0 };
  counts.forEach((row) => { byStatus[row.status] = row._count._all; });
  return { counts: byStatus, failing };
};

export const retryQueueItem = (id: string) =>
  prisma.finPostingQueue.update({ where: { id }, data: { status: 'PENDING', attempts: 0, nextRunAt: new Date(), lastError: null } });

export const retryAllFailed = () =>
  prisma.finPostingQueue.updateMany({ where: { status: 'FAILED' }, data: { status: 'PENDING', attempts: 0, nextRunAt: new Date() } });


/** After switching to LIVE, queue every source that still has automatic drafts so they get posted. */
export const queueSourcesWithAutoDrafts = async () => {
  const drafts = await prisma.finVoucher.findMany({
    where: { status: 'DRAFT', sourceType: { not: null }, reversalOfId: null, NOT: { sourceType: 'OPENING_BALANCE' } },
    select: { sourceType: true, sourceId: true },
    distinct: ['sourceType', 'sourceId'],
  });
  let queued = 0;
  for (const draft of drafts) {
    if (draft.sourceType && draft.sourceId && await enqueueSource(draft.sourceType as PostingSourceType, draft.sourceId, 'GO_LIVE')) queued += 1;
  }
  return queued;
};

/**
 * Setup changes (new bank account, payment-method mapping, chart install) can unblock items that
 * were waiting on them; retry those now instead of after their back-off. Never throws.
 */
export const requeueBlockedBySetup = async () => {
  try {
    const result = await prisma.finPostingQueue.updateMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        OR: [
          { lastError: { contains: 'Choose the bank/cash account' } },
          { lastError: { contains: 'Install the default chart' } },
          { lastError: { contains: 'missing from the chart of accounts' } },
          { lastError: { contains: 'Create a financial year first' } },
        ],
      },
      data: { status: 'PENDING', attempts: 0, nextRunAt: new Date() },
    });
    return result.count;
  } catch {
    return 0;
  }
};
