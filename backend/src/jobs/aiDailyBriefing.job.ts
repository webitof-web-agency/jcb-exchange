import { randomUUID } from 'node:crypto';
import cron, { type ScheduledTask } from 'node-cron';
import { AiBriefingStatus, Role, UserStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { loadAiPermissionScope } from '../middlewares/aiAccess.middleware';
import { aiReadOnlyToolsService, type AiToolContext, type AiToolExecutionResult } from '../services/ai/aiReadOnlyTools.service';
import { aiGatewayService } from '../services/ai/aiGatewayInstance';
import { getAiRuntimeStatus } from '../services/ai/aiGateway.service';
import {
  AI_DAILY_BRIEFING_LEASE_MS,
  AI_DAILY_BRIEFING_MAX_ATTEMPTS,
  AI_DAILY_BRIEFING_TIMEZONE,
  buildDailyBriefingPrompt,
  getBriefingDateKey,
  getBriefingDateUtc,
  getBriefingScopeKey,
  getRetryDelayMs,
  hashBriefingSnapshot,
} from '../services/ai/aiDailyBriefing.service';

const TENANT_KEY = process.env.AI_TENANT_KEY?.trim() || 'platform';
const BRIEFING_START_HOUR = 8;
const NOTIFICATION_MAX_ATTEMPTS = 5;
const NOTIFICATION_LEASE_MS = 5 * 60 * 1000;

export type DailyBriefingRole = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE';

export type DailyBriefingRecipient = {
  userId: string;
  role: DailyBriefingRole;
  permissions: string[];
};

type BriefingRow = {
  id: string;
  status: 'GENERATING' | 'READY' | 'FAILED' | 'STALE';
  attemptCount: number;
};

type Snapshot = { sections: AiToolExecutionResult[] };

export type DailyBriefingWorkerDependencies = {
  now?: () => Date;
  lockToken?: () => string;
  ensureBriefing: (input: { scopeKey: string; briefingDate: Date }) => Promise<BriefingRow>;
  claimBriefing: (input: { id: string; lockToken: string; now: Date; lockedUntil: Date }) => Promise<boolean>;
  collectSnapshot: (recipient: DailyBriefingRecipient) => Promise<Snapshot>;
  generate: (input: { recipient: DailyBriefingRecipient; prompt: string; snapshot: Snapshot }) => Promise<{ answer: string; provider: string; model: string }>;
  completeBriefing: (input: { id: string; lockToken: string; recipient: DailyBriefingRecipient; briefingDate: Date; sourceSnapshotHash: string; result: { answer: string; provider: string; model: string } }) => Promise<void>;
  failBriefing: (input: { id: string; lockToken: string; attemptNumber: number; nextAttemptAt: Date | null; errorCode: string }) => Promise<void>;
};

export const runDailyBriefingForRecipient = async (
  recipient: DailyBriefingRecipient,
  dependencies: DailyBriefingWorkerDependencies,
): Promise<{ status: 'ready' | 'locked' | 'generated' | 'failed'; errorCode?: string }> => {
  const now = dependencies.now?.() ?? new Date();
  const dateKey = getBriefingDateKey(now);
  const briefingDate = getBriefingDateUtc(dateKey);
  const scopeKey = getBriefingScopeKey(TENANT_KEY, recipient.userId);
  const row = await dependencies.ensureBriefing({ scopeKey, briefingDate });

  if (row.status === 'READY') return { status: 'ready' };

  const lockToken = dependencies.lockToken?.() ?? randomUUID();
  const claimed = await dependencies.claimBriefing({
    id: row.id,
    lockToken,
    now,
    lockedUntil: new Date(now.getTime() + AI_DAILY_BRIEFING_LEASE_MS),
  });
  if (!claimed) return { status: 'locked' };

  const attemptNumber = row.attemptCount + 1;
  try {
    const snapshot = await dependencies.collectSnapshot(recipient);
    if (!snapshot.sections.length) throw new Error('No permitted read-only briefing sources are available.');
    const result = await dependencies.generate({
      recipient,
      snapshot,
      prompt: buildDailyBriefingPrompt(dateKey),
    });
    await dependencies.completeBriefing({
      id: row.id,
      lockToken,
      recipient,
      briefingDate,
      sourceSnapshotHash: hashBriefingSnapshot(snapshot),
      result,
    });
    return { status: 'generated' };
  } catch (error) {
    const errorCode = error instanceof Error && error.message.includes('No permitted')
      ? 'AI_BRIEFING_NO_DATA_SOURCES'
      : 'AI_BRIEFING_GENERATION_FAILED';
    const nextAttemptAt = attemptNumber < AI_DAILY_BRIEFING_MAX_ATTEMPTS
      ? new Date(now.getTime() + getRetryDelayMs(attemptNumber))
      : null;
    await dependencies.failBriefing({ id: row.id, lockToken, attemptNumber, nextAttemptAt, errorCode });
    return { status: 'failed', errorCode };
  }
};

const isBriefingDue = (date: Date): boolean => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: AI_DAILY_BRIEFING_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(date));
  return hour >= BRIEFING_START_HOUR;
};

const eligibleRecipients = async (): Promise<DailyBriefingRecipient[]> => {
  const users = await prisma.user.findMany({
    where: { role: { in: [Role.SUPER_ADMIN, Role.ADMIN, Role.EMPLOYEE] }, status: UserStatus.ACTIVE },
    select: {
      id: true,
      role: true,
      customRole: { select: { permissions: true } },
      adminPermissions: { select: { permission: true } },
    },
  });
  const recipients: DailyBriefingRecipient[] = [];
  for (const user of users) {
    const role = user.role as DailyBriefingRole;
    const permissions = role === 'SUPER_ADMIN' || role === 'ADMIN'
      ? ['ALL_ACCESS']
      : await loadAiPermissionScope(user.id);
    if (role === 'EMPLOYEE' && !permissions.includes('ALL_ACCESS') && !permissions.includes('ai.use')) continue;
    recipients.push({ userId: user.id, role, permissions });
  }
  return recipients;
};

const snapshotForRecipient = async (recipient: DailyBriefingRecipient): Promise<Snapshot> => {
  const context: AiToolContext = recipient;
  const toolArguments: Partial<Record<string, Record<string, unknown>>> = {
    'dashboard.summary': { days: 1 },
    'pending.kyc': { limit: 10 },
    'hot.leads': { limit: 10 },
    'lead.statistics': { days: 7 },
    'listing.statistics': { days: 7 },
    'revenue.summary': { days: 7 },
    'partner.statistics': {},
    'rto.pending.tasks': { limit: 10 },
    'crm.followups': { owner: 'all' },
    'recruitment.summary': {},
    'whatsapp.activity.summary': { days: 7 },
  };
  const available = aiReadOnlyToolsService.listTools(context).filter((tool) => tool.available && tool.name in toolArguments);
  const results = await Promise.allSettled(available.map((tool) => aiReadOnlyToolsService.execute(context, {
    name: tool.name,
    arguments: toolArguments[tool.name],
  })));
  return {
    sections: results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []),
  };
};

const defaultDependencies: DailyBriefingWorkerDependencies = {
  ensureBriefing: async ({ scopeKey, briefingDate }) => prisma.aiDailyBriefing.upsert({
    where: { scopeKey_briefingDate: { scopeKey, briefingDate } },
    update: {},
    create: { scopeKey, briefingDate, status: AiBriefingStatus.GENERATING, modelAlias: 'pending', timezone: AI_DAILY_BRIEFING_TIMEZONE },
    select: { id: true, status: true, attemptCount: true },
  }),
  claimBriefing: async ({ id, lockToken, now, lockedUntil }) => (await prisma.aiDailyBriefing.updateMany({
    where: {
      id,
      status: { in: [AiBriefingStatus.GENERATING, AiBriefingStatus.FAILED, AiBriefingStatus.STALE] },
      attemptCount: { lt: AI_DAILY_BRIEFING_MAX_ATTEMPTS },
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      ],
    },
    data: { status: AiBriefingStatus.GENERATING, attemptCount: { increment: 1 }, lockToken, lockedUntil },
  })).count === 1,
  collectSnapshot: snapshotForRecipient,
  generate: async ({ recipient, prompt, snapshot }) => aiGatewayService.chat({
    userId: recipient.userId,
    role: recipient.role,
    message: prompt,
    toolContext: { toolName: 'daily.briefing.snapshot', label: 'Daily operations snapshot', data: snapshot },
  }),
  completeBriefing: async ({ id, lockToken, recipient, briefingDate, sourceSnapshotHash, result }) => {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.aiDailyBriefing.updateMany({
        where: { id, lockToken },
        data: {
          status: AiBriefingStatus.READY,
          modelAlias: result.model,
          provider: result.provider,
          sourceSnapshotHash,
          resultRedacted: result.answer,
          resultHash: hashBriefingSnapshot(result.answer),
          generatedAt: new Date(),
          expiresAt: new Date(briefingDate.getTime() + 2 * 24 * 60 * 60 * 1000),
          errorCode: null,
          lastErrorRedacted: null,
          nextAttemptAt: null,
          lockToken: null,
          lockedUntil: null,
        },
      });
      if (updated.count !== 1) return;
      await tx.aiBriefingNotification.upsert({
        where: { briefingId_recipientUserId: { briefingId: id, recipientUserId: recipient.userId } },
        update: { status: 'PENDING', nextAttemptAt: null, lockedUntil: null, lockToken: null },
        create: { briefingId: id, recipientUserId: recipient.userId },
      });
    });
  },
  failBriefing: async ({ id, lockToken, nextAttemptAt, errorCode }) => {
    await prisma.aiDailyBriefing.updateMany({
      where: { id, lockToken },
      data: {
        status: AiBriefingStatus.FAILED,
        errorCode,
        lastErrorRedacted: errorCode,
        nextAttemptAt,
        lockToken: null,
        lockedUntil: null,
      },
    });
  },
};

export const runAiDailyBriefings = async (): Promise<{ processed: number; generated: number; failed: number }> => {
  const runtime = await getAiRuntimeStatus();
  if (!runtime.enabled) return { processed: 0, generated: 0, failed: 0 };
  const recipients = await eligibleRecipients();
  let generated = 0;
  let failed = 0;
  for (const recipient of recipients) {
    const result = await runDailyBriefingForRecipient(recipient, defaultDependencies);
    if (result.status === 'generated') generated += 1;
    if (result.status === 'failed') failed += 1;
  }
  return { processed: recipients.length, generated, failed };
};

type NotificationRow = { id: string; briefingId: string; recipientUserId: string; attempts: number; recipient: { role: Role } };

const processAiBriefingNotifications = async () => {
  const now = new Date();
  const rows = await prisma.aiBriefingNotification.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      attempts: { lt: NOTIFICATION_MAX_ATTEMPTS },
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { id: true, briefingId: true, recipientUserId: true, attempts: true, recipient: { select: { role: true } } },
  });
  let delivered = 0;
  for (const row of rows as NotificationRow[]) {
    const lockToken = randomUUID();
    const claimed = await prisma.aiBriefingNotification.updateMany({
      where: { id: row.id, status: { in: ['PENDING', 'FAILED'] }, attempts: row.attempts, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, lockToken, lockedUntil: new Date(now.getTime() + NOTIFICATION_LEASE_MS) },
    });
    if (claimed.count !== 1) continue;
    try {
      await prisma.notification.create({
        data: {
          userId: row.recipientUserId,
          title: 'Daily AI briefing is ready',
          message: 'Your cached operations briefing is ready to review.',
          type: 'AI_DAILY_BRIEFING',
          link: row.recipient.role === Role.EMPLOYEE ? '/employee/ai' : '/admin/ai',
          dedupeKey: `ai-briefing:${row.briefingId}:${row.recipientUserId}`,
        },
      });
      await prisma.aiBriefingNotification.updateMany({ where: { id: row.id, lockToken }, data: { status: 'DELIVERED', deliveredAt: new Date(), lockedUntil: null, lockToken: null, lastErrorCode: null } });
      delivered += 1;
    } catch (error) {
      const uniqueNotification = typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
      if (uniqueNotification) {
        await prisma.aiBriefingNotification.updateMany({ where: { id: row.id, lockToken }, data: { status: 'DELIVERED', deliveredAt: new Date(), lockedUntil: null, lockToken: null } });
        delivered += 1;
      } else {
        const attemptNumber = row.attempts + 1;
        await prisma.aiBriefingNotification.updateMany({
          where: { id: row.id, lockToken },
          data: { status: 'FAILED', lastErrorCode: 'AI_BRIEFING_NOTIFICATION_FAILED', nextAttemptAt: attemptNumber < NOTIFICATION_MAX_ATTEMPTS ? new Date(now.getTime() + getRetryDelayMs(attemptNumber)) : null, lockedUntil: null, lockToken: null },
        });
      }
    }
  }
  return { delivered };
};

export const aiDailyBriefingTick = async (now = new Date()) => {
  if (!isBriefingDue(now)) return { skipped: 'before briefing window' as const };
  const briefing = await runAiDailyBriefings();
  const notifications = await processAiBriefingNotifications();
  return { briefing, notifications };
};

let task: ScheduledTask | null = null;
let localTickRunning = false;

/**
 * The timer only wakes the worker. Database unique keys and lease claims are the
 * production coordination mechanism, so multiple API instances are safe.
 */
export const startAiDailyBriefingJob = () => {
  if (task || process.env.AI_DAILY_BRIEFING_WORKER === 'off') return;
  task = cron.schedule('*/5 * * * *', () => {
    if (localTickRunning) return;
    localTickRunning = true;
    void aiDailyBriefingTick()
      .catch((error) => console.error('[ai-briefing] worker tick failed:', error instanceof Error ? error.message : error))
      .finally(() => { localTickRunning = false; });
  }, { timezone: AI_DAILY_BRIEFING_TIMEZONE });
  setTimeout(() => {
    if (localTickRunning) return;
    localTickRunning = true;
    void aiDailyBriefingTick()
      .catch((error) => console.error('[ai-briefing] startup catch-up failed:', error instanceof Error ? error.message : error))
      .finally(() => { localTickRunning = false; });
  }, 30_000).unref();
};

export const getCachedDailyBriefing = async (userId: string) => {
  const briefingDate = getBriefingDateUtc(getBriefingDateKey());
  const scopeKey = getBriefingScopeKey(TENANT_KEY, userId);
  return prisma.aiDailyBriefing.findUnique({
    where: { scopeKey_briefingDate: { scopeKey, briefingDate } },
    select: { status: true, resultRedacted: true, generatedAt: true, expiresAt: true, updatedAt: true, nextAttemptAt: true, errorCode: true },
  });
};
