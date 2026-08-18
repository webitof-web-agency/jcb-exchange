import prisma from '../lib/prisma';
import { getAppSettings } from './appSettings';
import {
  buildPrimeSettingsSnapshot,
  buildUpiPaymentUri,
  calculatePrimeExpiryAt,
  getCustomerPrimeAccessState,
  normalizeCustomerPrimeSettings,
  type CustomerPrimeSettingsSnapshot,
} from './customerPrime';

const prismaAny = prisma as any;

type PrimeDbRecord = {
  id: string;
  userId: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  transactionRef?: string | null;
  receiptUrl?: string | null;
  paidAmount: unknown;
  paidUpiId?: string | null;
  settingsSnapshot: unknown;
  startedAt?: Date | null;
  expiresAt?: Date | null;
  submittedAt: Date;
  approvedByUserId?: string | null;
  approvedAt?: Date | null;
  rejectedByUserId?: string | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    mobile?: string | null;
  } | null;
};

const normalizeText = (value?: string | null) => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  if (value && typeof value === 'object' && 'toString' in value) {
    const parsedValue = Number(String(value));
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
};

const normalizeSettingsSnapshot = (value: unknown): CustomerPrimeSettingsSnapshot => {
  if (!value || typeof value !== 'object') {
    return buildPrimeSettingsSnapshot({});
  }

  return buildPrimeSettingsSnapshot(value as Partial<CustomerPrimeSettingsSnapshot>);
};

const mapSubscriptionRecord = (record: PrimeDbRecord) => ({
  id: record.id,
  userId: record.userId,
  status: record.status,
  transactionRef: record.transactionRef || null,
  receiptUrl: record.receiptUrl || null,
  paidAmount: toNumber(record.paidAmount) || 0,
  paidUpiId: record.paidUpiId || null,
  settingsSnapshot: normalizeSettingsSnapshot(record.settingsSnapshot),
  startedAt: record.startedAt || null,
  expiresAt: record.expiresAt || null,
  submittedAt: record.submittedAt,
  approvedByUserId: record.approvedByUserId || null,
  approvedAt: record.approvedAt || null,
  rejectedByUserId: record.rejectedByUserId || null,
  rejectedAt: record.rejectedAt || null,
  rejectionReason: record.rejectionReason || null,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  user: record.user || null,
});

export const syncExpiredCustomerPrimeSubscriptions = async (userId?: string) => {
  await prismaAny.customerPrimeSubscription.updateMany({
    where: {
      status: 'ACTIVE',
      expiresAt: {
        lt: new Date(),
      },
      ...(userId ? { userId } : {}),
    },
    data: {
      status: 'EXPIRED',
    },
  });
};

export const getCustomerPrimeAccessPayload = async ({
  userId,
  role,
}: {
  userId?: string | null | undefined;
  role?: string | null | undefined;
}) => {
  const settings = normalizeCustomerPrimeSettings((await getAppSettings()).customerPrime);
  const appliesToRole = role === 'CUSTOMER';

  if (!userId) {
    return {
      settings,
      appliesToRole,
      gatingEnabled: settings.enabled && appliesToRole,
      qrPaymentUri: null,
      activeSubscription: null,
      pendingSubscription: null,
      ...getCustomerPrimeAccessState({
        role,
        subscriptions: [],
      }),
    };
  }

  await syncExpiredCustomerPrimeSubscriptions(userId);

  const subscriptions = ((await prismaAny.customerPrimeSubscription.findMany({
    where: {
      userId,
      status: {
        in: ['ACTIVE', 'PENDING'],
      },
    },
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
  })) || []) as PrimeDbRecord[];

  const mappedSubscriptions = subscriptions.map(mapSubscriptionRecord);
  const accessState = getCustomerPrimeAccessState({
    role,
    subscriptions: mappedSubscriptions.map((subscription) => ({
      id: subscription.id,
      status: subscription.status,
      startedAt: subscription.startedAt,
      expiresAt: subscription.expiresAt,
    })),
  });

  return {
    settings,
    appliesToRole,
    gatingEnabled: settings.enabled && appliesToRole,
    qrPaymentUri:
      settings.enabled && appliesToRole && settings.upiId && settings.amount
        ? buildUpiPaymentUri({
            upiId: settings.upiId,
            amount: settings.amount,
            payeeName: 'JCB Exchange',
            transactionNote: 'Prime customer subscription',
          })
        : null,
    activeSubscription:
      mappedSubscriptions.find((subscription) => subscription.status === 'ACTIVE') || null,
    pendingSubscription:
      mappedSubscriptions.find((subscription) => subscription.status === 'PENDING') || null,
    ...accessState,
  };
};

export const assertCustomerPrimeEligibility = async ({
  userId,
  role,
  feature,
}: {
  userId?: string | null | undefined;
  role?: string | null | undefined;
  feature: 'CALL' | 'WHATSAPP' | 'SELL_LISTING';
}) => {
  const accessPayload = await getCustomerPrimeAccessPayload({ userId, role });
  const requiresPrime = accessPayload.gatingEnabled;

  return {
    ...accessPayload,
    requiresPrime,
    isAllowed: !requiresPrime || accessPayload.hasActiveSubscription,
  };
};

export const createCustomerPrimeSubscriptionRequest = async ({
  userId,
  role,
  receiptUrl,
}: {
  userId: string;
  role?: string | null | undefined;
  receiptUrl?: string | null | undefined;
}) => {
  const accessPayload = await getCustomerPrimeAccessPayload({ userId, role });

  if (!accessPayload.gatingEnabled) {
    throw new Error('Prime customer subscription is not enabled for this account.');
  }

  if (!accessPayload.settings.upiId || !accessPayload.settings.amount || !accessPayload.settings.validityValue) {
    throw new Error('Prime customer payment settings are incomplete.');
  }

  if (accessPayload.hasActiveSubscription) {
    throw new Error('You already have an active Prime customer subscription.');
  }

  if (accessPayload.pendingSubscription) {
    throw new Error('Your earlier Prime payment request is still pending super admin approval.');
  }

  const normalizedReceiptUrl = normalizeText(receiptUrl);
  if (!normalizedReceiptUrl) {
    throw new Error('Payment receipt upload is required to submit Prime payment.');
  }

  const settingsSnapshot = buildPrimeSettingsSnapshot(accessPayload.settings);

  const record = (await prismaAny.customerPrimeSubscription.create({
    data: {
      userId,
      status: 'PENDING',
      receiptUrl: normalizedReceiptUrl,
      paidAmount: accessPayload.settings.amount,
      paidUpiId: accessPayload.settings.upiId,
      settingsSnapshot,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
        },
      },
    },
  })) as PrimeDbRecord;

  return mapSubscriptionRecord(record);
};

export const approveCustomerPrimeSubscription = async ({
  subscriptionId,
  approverUserId,
}: {
  subscriptionId: string;
  approverUserId: string;
}) => {
  const existingRecord = (await prismaAny.customerPrimeSubscription.findUnique({
    where: { id: subscriptionId },
  })) as PrimeDbRecord | null;

  if (!existingRecord) {
    throw new Error('Prime subscription request not found.');
  }

  if (existingRecord.status !== 'PENDING') {
    throw new Error('Only pending Prime subscription requests can be approved.');
  }

  await syncExpiredCustomerPrimeSubscriptions(existingRecord.userId);

  const snapshot = normalizeSettingsSnapshot(existingRecord.settingsSnapshot);
  if (!snapshot.validityValue) {
    throw new Error('Prime subscription snapshot is missing validity information.');
  }

  const startedAt = existingRecord.submittedAt;
  const expiresAt = calculatePrimeExpiryAt({
    paidAt: startedAt,
    validityValue: snapshot.validityValue,
    validityUnit: snapshot.validityUnit,
  });

  const record = (await prismaAny.customerPrimeSubscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'ACTIVE',
      startedAt,
      expiresAt,
      approvedByUserId: approverUserId,
      approvedAt: new Date(),
      rejectedByUserId: null,
      rejectedAt: null,
      rejectionReason: null,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
        },
      },
    },
  })) as PrimeDbRecord;

  return mapSubscriptionRecord(record);
};

export const rejectCustomerPrimeSubscription = async ({
  subscriptionId,
  approverUserId,
  rejectionReason,
}: {
  subscriptionId: string;
  approverUserId: string;
  rejectionReason?: string | null | undefined;
}) => {
  const existingRecord = (await prismaAny.customerPrimeSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
        },
      },
    },
  })) as PrimeDbRecord | null;

  if (!existingRecord) {
    throw new Error('Prime subscription request not found.');
  }

  if (existingRecord.status !== 'PENDING') {
    throw new Error('Only pending Prime subscription requests can be rejected.');
  }

  const record = (await prismaAny.customerPrimeSubscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'REJECTED',
      rejectedByUserId: approverUserId,
      rejectedAt: new Date(),
      rejectionReason: normalizeText(rejectionReason) || 'Payment proof could not be verified.',
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
        },
      },
    },
  })) as PrimeDbRecord;

  return mapSubscriptionRecord(record);
};

export const listCustomerPrimeSubscriptions = async ({
  status,
  take = 25,
}: {
  status?: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | undefined;
  take?: number;
}) => {
  await syncExpiredCustomerPrimeSubscriptions();

  const records = ((await prismaAny.customerPrimeSubscription.findMany({
    where: status ? { status } : undefined,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
        },
      },
    },
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    take,
  })) || []) as PrimeDbRecord[];

  return records.map(mapSubscriptionRecord);
};
