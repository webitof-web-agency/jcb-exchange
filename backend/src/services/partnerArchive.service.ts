import prisma from '../lib/prisma';

export const ARCHIVE_PARTNER_CONFIRMATION = 'ARCHIVE_PARTNER';

export class PartnerArchiveError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'PARTNER_ARCHIVE_ERROR') {
    super(message);
    this.name = 'PartnerArchiveError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

type ArchiveRequest = { reason?: unknown; confirmation?: unknown };
type PartnerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'CLOSED';

export const validatePartnerArchiveRequest = (request: ArchiveRequest) => {
  const reason = typeof request.reason === 'string' ? request.reason.trim().slice(0, 500) : '';
  if (reason.length < 5) {
    throw new PartnerArchiveError('A clear archive reason of at least 5 characters is required.', 400, 'ARCHIVE_REASON_REQUIRED');
  }
  if (request.confirmation !== ARCHIVE_PARTNER_CONFIRMATION) {
    throw new PartnerArchiveError('Explicit archive confirmation is required.', 400, 'ARCHIVE_CONFIRMATION_REQUIRED');
  }
  return { reason, confirmation: ARCHIVE_PARTNER_CONFIRMATION } as const;
};

export const buildPartnerArchiveMutation = ({
  currentStatus,
  actorUserId,
  reason,
  archivedAt,
}: {
  currentStatus: PartnerStatus;
  actorUserId: string;
  reason: string;
  archivedAt: Date;
}) => ({
  status: 'CLOSED' as const,
  archivedAt,
  archiveReason: reason,
  archivedById: actorUserId,
  archivedFromStatus: currentStatus === 'CLOSED' ? 'ACTIVE' : currentStatus,
  restoredAt: null,
  restoredById: null,
});

export const buildPartnerRestoreMutation = ({
  archivedFromStatus,
  actorUserId,
  restoredAt,
}: {
  archivedFromStatus?: PartnerStatus | null;
  actorUserId: string;
  restoredAt: Date;
}) => ({
  status: (archivedFromStatus && archivedFromStatus !== 'CLOSED' ? archivedFromStatus : 'ACTIVE') as Exclude<PartnerStatus, 'CLOSED'>,
  restoredAt,
  restoredById: actorUserId,
  archivedAt: null,
  archivedFromStatus: null,
});

const safeAuditFields = [
  'name', 'email', 'mobile', 'whatsappNumber', 'businessName', 'partnerType',
  'businessAddress', 'district', 'pinCode', 'countryId', 'stateId', 'cityId',
] as const;

export const buildPartnerEditAudit = (before: Record<string, unknown>, after: Record<string, unknown>) => {
  const beforeSnapshot: Record<string, unknown> = {};
  const afterSnapshot: Record<string, unknown> = {};

  for (const field of safeAuditFields) {
    if (!Object.prototype.hasOwnProperty.call(before, field) && !Object.prototype.hasOwnProperty.call(after, field)) continue;
    const beforeValue = before[field] ?? null;
    const afterValue = after[field] ?? null;
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      beforeSnapshot[field] = beforeValue;
      afterSnapshot[field] = afterValue;
    }
  }

  return {
    changed: Object.keys(beforeSnapshot).length > 0,
    before: beforeSnapshot,
    after: afterSnapshot,
  };
};

const partnerSelect = {
  id: true,
  role: true,
  status: true,
  name: true,
  email: true,
  mobile: true,
  archivedAt: true,
  archiveReason: true,
  archivedFromStatus: true,
  partnerProfile: {
    select: {
      id: true,
      partnerCode: true,
      businessName: true,
      accountStatus: true,
      onboardingStatus: true,
      kycStatus: true,
    },
  },
} as const;

type ArchiveDb = {
  user: any;
  partnerProfile: any;
  auditLog: any;
  notification: any;
  $transaction: <T>(callback: (tx: any) => Promise<T>, options?: unknown) => Promise<T>;
};

const getPartner = async (db: ArchiveDb, partnerId: string) => db.user.findUnique({ where: { id: partnerId }, select: partnerSelect });

const assertPartnerTarget = (target: any) => {
  if (!target || target.role !== 'PARTNER' || !target.partnerProfile?.id) {
    throw new PartnerArchiveError('Partner not found.', 404, 'PARTNER_NOT_FOUND');
  }
};

const partnerAccountStatusForRestore = (
  status: string,
  current: string | null | undefined,
  onboardingStatus?: string | null,
  kycStatus?: string | null,
) => {
  if (status === 'SUSPENDED') return 'SUSPENDED';
  if (status === 'BLOCKED') return 'BLOCKED';
  if (current !== 'CLOSED') return current || 'PENDING';
  return onboardingStatus === 'APPROVED' && kycStatus === 'APPROVED' ? 'ACTIVE' : 'PENDING';
};

export const archivePartnerUser = async ({
  db = prisma as unknown as ArchiveDb,
  partnerId,
  actorUserId,
  request,
}: {
  db?: ArchiveDb;
  partnerId: string;
  actorUserId: string;
  request: ArchiveRequest;
}) => {
  const { reason } = validatePartnerArchiveRequest(request);
  const target = await getPartner(db, partnerId);
  assertPartnerTarget(target);
  if (target.status === 'CLOSED' || target.archivedAt) {
    throw new PartnerArchiveError('Partner is already archived.', 409, 'PARTNER_ALREADY_ARCHIVED');
  }

  const archivedAt = new Date();
  const mutation = buildPartnerArchiveMutation({
    currentStatus: target.status as PartnerStatus,
    actorUserId,
    reason,
    archivedAt,
  });

  return db.$transaction(async (tx) => {
    const current = await getPartner(tx, partnerId);
    assertPartnerTarget(current);
    if (current.status === 'CLOSED' || current.archivedAt) {
      throw new PartnerArchiveError('Partner is already archived.', 409, 'PARTNER_ALREADY_ARCHIVED');
    }

    await tx.user.update({ where: { id: partnerId }, data: mutation });
    await tx.partnerProfile.update({ where: { userId: partnerId }, data: { accountStatus: 'CLOSED' } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        entityType: 'PARTNER_PROFILE',
        entityId: current.partnerProfile.id,
        action: 'PARTNER_ARCHIVED',
        beforeJson: {
          userId: current.id,
          partnerCode: current.partnerProfile.partnerCode,
          status: current.status,
          accountStatus: current.partnerProfile.accountStatus,
        },
        afterJson: {
          userId: current.id,
          status: 'CLOSED',
          accountStatus: 'CLOSED',
          reason,
          archivedAt: archivedAt.toISOString(),
        },
      },
    });
    await tx.notification.create({
      data: {
        userId: partnerId,
        title: 'Partner account archived',
        message: `Your partner account was archived by JCB Exchange. Reason: ${reason}`,
        type: 'PARTNER_ARCHIVED',
        link: '/profile?tab=listings',
      },
    });

    return { id: partnerId, profileId: current.partnerProfile.id, status: 'CLOSED' as const, archivedAt };
  }, { maxWait: 10_000, timeout: 30_000 });
};

export const restorePartnerUser = async ({
  db = prisma as unknown as ArchiveDb,
  partnerId,
  actorUserId,
}: {
  db?: ArchiveDb;
  partnerId: string;
  actorUserId: string;
}) => {
  const target = await getPartner(db, partnerId);
  assertPartnerTarget(target);
  if (target.status !== 'CLOSED' && !target.archivedAt) {
    throw new PartnerArchiveError('Partner is not archived.', 409, 'PARTNER_NOT_ARCHIVED');
  }

  const restoredAt = new Date();
  const mutation = buildPartnerRestoreMutation({
    archivedFromStatus: target.archivedFromStatus as PartnerStatus | null,
    actorUserId,
    restoredAt,
  });

  return db.$transaction(async (tx) => {
    const current = await getPartner(tx, partnerId);
    assertPartnerTarget(current);
    if (current.status !== 'CLOSED' && !current.archivedAt) {
      throw new PartnerArchiveError('Partner is not archived.', 409, 'PARTNER_NOT_ARCHIVED');
    }

    await tx.user.update({ where: { id: partnerId }, data: mutation });
    await tx.partnerProfile.update({
      where: { userId: partnerId },
      data: {
        accountStatus: partnerAccountStatusForRestore(
          mutation.status,
          current.partnerProfile.accountStatus,
          current.partnerProfile.onboardingStatus,
          current.partnerProfile.kycStatus,
        ),
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId,
        entityType: 'PARTNER_PROFILE',
        entityId: current.partnerProfile.id,
        action: 'PARTNER_RESTORED',
        beforeJson: {
          userId: current.id,
          status: current.status,
          archivedAt: current.archivedAt,
          archiveReason: current.archiveReason,
        },
        afterJson: {
          userId: current.id,
          status: mutation.status,
          restoredAt: restoredAt.toISOString(),
        },
      },
    });
    await tx.notification.create({
      data: {
        userId: partnerId,
        title: 'Partner account restored',
        message: 'Your partner account has been restored. You can access your JCB Exchange account again.',
        type: 'PARTNER_RESTORED',
        link: '/profile?tab=listings',
      },
    });

    return { id: partnerId, profileId: current.partnerProfile.id, status: mutation.status, restoredAt };
  }, { maxWait: 10_000, timeout: 30_000 });
};
