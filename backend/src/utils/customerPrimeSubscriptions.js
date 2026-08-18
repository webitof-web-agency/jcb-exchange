"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCustomerPrimeSubscriptions = exports.rejectCustomerPrimeSubscription = exports.approveCustomerPrimeSubscription = exports.createCustomerPrimeSubscriptionRequest = exports.assertCustomerPrimeEligibility = exports.getCustomerPrimeAccessPayload = exports.syncExpiredCustomerPrimeSubscriptions = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const appSettings_1 = require("./appSettings");
const customerPrime_1 = require("./customerPrime");
const prismaAny = prisma_1.default;
const normalizeText = (value) => {
    const trimmedValue = value?.trim();
    return trimmedValue ? trimmedValue : null;
};
const toNumber = (value) => {
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
const normalizeSettingsSnapshot = (value) => {
    if (!value || typeof value !== 'object') {
        return (0, customerPrime_1.buildPrimeSettingsSnapshot)({});
    }
    return (0, customerPrime_1.buildPrimeSettingsSnapshot)(value);
};
const mapSubscriptionRecord = (record) => ({
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
const syncExpiredCustomerPrimeSubscriptions = async (userId) => {
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
exports.syncExpiredCustomerPrimeSubscriptions = syncExpiredCustomerPrimeSubscriptions;
const getCustomerPrimeAccessPayload = async ({ userId, role, }) => {
    const settings = (0, customerPrime_1.normalizeCustomerPrimeSettings)((await (0, appSettings_1.getAppSettings)()).customerPrime);
    const appliesToRole = role === 'CUSTOMER';
    if (!userId) {
        return {
            settings,
            appliesToRole,
            gatingEnabled: settings.enabled && appliesToRole,
            qrPaymentUri: null,
            activeSubscription: null,
            pendingSubscription: null,
            ...(0, customerPrime_1.getCustomerPrimeAccessState)({
                role,
                subscriptions: [],
            }),
        };
    }
    await (0, exports.syncExpiredCustomerPrimeSubscriptions)(userId);
    const subscriptions = ((await prismaAny.customerPrimeSubscription.findMany({
        where: {
            userId,
            status: {
                in: ['ACTIVE', 'PENDING'],
            },
        },
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    })) || []);
    const mappedSubscriptions = subscriptions.map(mapSubscriptionRecord);
    const accessState = (0, customerPrime_1.getCustomerPrimeAccessState)({
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
        qrPaymentUri: settings.enabled && appliesToRole && settings.upiId && settings.amount
            ? (0, customerPrime_1.buildUpiPaymentUri)({
                upiId: settings.upiId,
                amount: settings.amount,
                payeeName: 'JCB Exchange',
                transactionNote: 'Prime customer subscription',
            })
            : null,
        activeSubscription: mappedSubscriptions.find((subscription) => subscription.status === 'ACTIVE') || null,
        pendingSubscription: mappedSubscriptions.find((subscription) => subscription.status === 'PENDING') || null,
        ...accessState,
    };
};
exports.getCustomerPrimeAccessPayload = getCustomerPrimeAccessPayload;
const assertCustomerPrimeEligibility = async ({ userId, role, feature, }) => {
    const accessPayload = await (0, exports.getCustomerPrimeAccessPayload)({ userId, role });
    const requiresPrime = accessPayload.gatingEnabled;
    return {
        ...accessPayload,
        requiresPrime,
        isAllowed: !requiresPrime || accessPayload.hasActiveSubscription,
    };
};
exports.assertCustomerPrimeEligibility = assertCustomerPrimeEligibility;
const createCustomerPrimeSubscriptionRequest = async ({ userId, role, receiptUrl, }) => {
    const accessPayload = await (0, exports.getCustomerPrimeAccessPayload)({ userId, role });
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
    const settingsSnapshot = (0, customerPrime_1.buildPrimeSettingsSnapshot)(accessPayload.settings);
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
    }));
    return mapSubscriptionRecord(record);
};
exports.createCustomerPrimeSubscriptionRequest = createCustomerPrimeSubscriptionRequest;
const approveCustomerPrimeSubscription = async ({ subscriptionId, approverUserId, }) => {
    const existingRecord = (await prismaAny.customerPrimeSubscription.findUnique({
        where: { id: subscriptionId },
    }));
    if (!existingRecord) {
        throw new Error('Prime subscription request not found.');
    }
    if (existingRecord.status !== 'PENDING') {
        throw new Error('Only pending Prime subscription requests can be approved.');
    }
    await (0, exports.syncExpiredCustomerPrimeSubscriptions)(existingRecord.userId);
    const snapshot = normalizeSettingsSnapshot(existingRecord.settingsSnapshot);
    if (!snapshot.validityValue) {
        throw new Error('Prime subscription snapshot is missing validity information.');
    }
    const startedAt = existingRecord.submittedAt;
    const expiresAt = (0, customerPrime_1.calculatePrimeExpiryAt)({
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
    }));
    return mapSubscriptionRecord(record);
};
exports.approveCustomerPrimeSubscription = approveCustomerPrimeSubscription;
const rejectCustomerPrimeSubscription = async ({ subscriptionId, approverUserId, rejectionReason, }) => {
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
    }));
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
    }));
    return mapSubscriptionRecord(record);
};
exports.rejectCustomerPrimeSubscription = rejectCustomerPrimeSubscription;
const listCustomerPrimeSubscriptions = async ({ status, take = 25, }) => {
    await (0, exports.syncExpiredCustomerPrimeSubscriptions)();
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
    })) || []);
    return records.map(mapSubscriptionRecord);
};
exports.listCustomerPrimeSubscriptions = listCustomerPrimeSubscriptions;
//# sourceMappingURL=customerPrimeSubscriptions.js.map