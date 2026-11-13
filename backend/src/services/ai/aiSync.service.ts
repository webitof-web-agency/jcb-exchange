import { AiSyncStatus } from '@prisma/client';
import prisma from '../../lib/prisma';

export type AiSyncCheckpointRecord = {
  module: string;
  status: AiSyncStatus;
  recordsObserved: number;
  lastObservedAt: Date | null;
  lastSyncedAt: Date | null;
  errorCode: string | null;
  updatedAt?: Date;
};

export type AiSyncUpsertInput = {
  module: string;
  status: AiSyncStatus;
  recordsObserved: number;
  lastObservedAt: Date;
  lastSyncedAt?: Date;
  errorCode?: string | null;
};

export type AiSyncRepository = {
  upsert: (input: AiSyncUpsertInput) => Promise<AiSyncCheckpointRecord>;
  list: () => Promise<AiSyncCheckpointRecord[]>;
};

export type AiSyncProbe = {
  module: string;
  observe: () => Promise<number>;
};

const total = (...counts: number[]) => counts.reduce((sum, count) => sum + Math.max(0, count), 0);

/**
 * The assistant reads exact operational values from the source tables at query
 * time. These probes keep the freshness of every domain visible and provide a
 * reliable hook for future CDC/vector-index workers without sending raw rows to
 * a model provider.
 */
export const defaultAiSyncProbes: AiSyncProbe[] = [
  {
    module: 'operations',
    observe: async () => total(await prisma.listing.count(), await prisma.lead.count(), await prisma.saleRecord.count()),
  },
  {
    module: 'partners-kyc',
    observe: async () => total(await prisma.partnerProfile.count(), await prisma.kycDocument.count()),
  },
  {
    module: 'finance',
    observe: async () => total(await prisma.financeTransaction.count(), await prisma.listingPaymentSubmission.count()),
  },
  {
    module: 'recruitment',
    observe: async () => total(await prisma.job.count(), await prisma.jobApplication.count()),
  },
  {
    module: 'communication',
    observe: async () => total(await prisma.whatsAppMessageLog.count(), await prisma.smsMessageLog.count()),
  },
  {
    module: 'content',
    observe: async () => total(await prisma.blogPost.count(), await prisma.translationKeyRegistry.count()),
  },
  {
    module: 'access',
    observe: async () => total(await prisma.user.count(), await prisma.customRole.count(), await prisma.adminPermission.count()),
  },
  {
    module: 'subscriptions',
    observe: async () => prisma.customerPrimeSubscription.count(),
  },
];

const defaultRepository: AiSyncRepository = {
  async upsert(input) {
    return prisma.aiSyncCheckpoint.upsert({
      where: { module: input.module },
      update: {
        status: input.status,
        recordsObserved: input.recordsObserved,
        lastObservedAt: input.lastObservedAt,
        ...(input.lastSyncedAt ? { lastSyncedAt: input.lastSyncedAt } : {}),
        errorCode: input.errorCode ?? null,
      },
      create: {
        module: input.module,
        status: input.status,
        recordsObserved: input.recordsObserved,
        lastObservedAt: input.lastObservedAt,
        ...(input.lastSyncedAt ? { lastSyncedAt: input.lastSyncedAt } : {}),
        errorCode: input.errorCode ?? null,
      },
      select: { module: true, status: true, recordsObserved: true, lastObservedAt: true, lastSyncedAt: true, errorCode: true, updatedAt: true },
    });
  },
  async list() {
    return prisma.aiSyncCheckpoint.findMany({
      orderBy: { module: 'asc' },
      select: { module: true, status: true, recordsObserved: true, lastObservedAt: true, lastSyncedAt: true, errorCode: true, updatedAt: true },
    });
  },
};

export const runAiSyncCycle = async (dependencies: {
  probes?: readonly AiSyncProbe[];
  repository?: AiSyncRepository;
  now?: () => Date;
} = {}) => {
  const probes = dependencies.probes ?? defaultAiSyncProbes;
  const repository = dependencies.repository ?? defaultRepository;
  const now = dependencies.now ?? (() => new Date());
  let succeeded = 0;
  let failed = 0;

  for (const probe of probes) {
    const observedAt = now();
    try {
      const recordsObserved = await probe.observe();
      await repository.upsert({
        module: probe.module,
        status: AiSyncStatus.READY,
        recordsObserved: Math.max(0, Math.floor(recordsObserved)),
        lastObservedAt: observedAt,
        lastSyncedAt: observedAt,
        errorCode: null,
      });
      succeeded += 1;
    } catch {
      await repository.upsert({
        module: probe.module,
        status: AiSyncStatus.FAILED,
        recordsObserved: 0,
        lastObservedAt: observedAt,
        errorCode: 'AI_SYNC_PROBE_FAILED',
      });
      failed += 1;
    }
  }

  return { modules: probes.length, succeeded, failed };
};

export class AiSyncService {
  constructor(private readonly repository: AiSyncRepository = defaultRepository) {}

  async run(now?: () => Date) {
    return runAiSyncCycle({ repository: this.repository, ...(now ? { now } : {}) });
  }

  async status() {
    return this.repository.list();
  }
}

export const aiSyncService = new AiSyncService();
