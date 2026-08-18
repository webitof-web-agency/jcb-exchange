import { type CustomerPrimeSettingsSnapshot } from './customerPrime';
export declare const syncExpiredCustomerPrimeSubscriptions: (userId?: string) => Promise<void>;
export declare const getCustomerPrimeAccessPayload: ({ userId, role, }: {
    userId?: string | null | undefined;
    role?: string | null | undefined;
}) => Promise<{
    isPrimeCustomer: boolean;
    customerCategory: import("./customerPrime").PrimeCustomerCategory;
    hasActiveSubscription: boolean;
    activeSubscriptionId: string | null;
    settings: import("./customerPrime").CustomerPrimeSettings;
    appliesToRole: boolean;
    gatingEnabled: boolean;
    qrPaymentUri: string | null;
    activeSubscription: {
        id: string;
        userId: string;
        status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING" | "REJECTED";
        transactionRef: string | null;
        receiptUrl: string | null;
        paidAmount: number;
        paidUpiId: string | null;
        settingsSnapshot: CustomerPrimeSettingsSnapshot;
        startedAt: Date | null;
        expiresAt: Date | null;
        submittedAt: Date;
        approvedByUserId: string | null;
        approvedAt: Date | null;
        rejectedByUserId: string | null;
        rejectedAt: Date | null;
        rejectionReason: string | null;
        createdAt: Date;
        updatedAt: Date;
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            mobile?: string | null;
        } | null;
    } | null;
    pendingSubscription: {
        id: string;
        userId: string;
        status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING" | "REJECTED";
        transactionRef: string | null;
        receiptUrl: string | null;
        paidAmount: number;
        paidUpiId: string | null;
        settingsSnapshot: CustomerPrimeSettingsSnapshot;
        startedAt: Date | null;
        expiresAt: Date | null;
        submittedAt: Date;
        approvedByUserId: string | null;
        approvedAt: Date | null;
        rejectedByUserId: string | null;
        rejectedAt: Date | null;
        rejectionReason: string | null;
        createdAt: Date;
        updatedAt: Date;
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            mobile?: string | null;
        } | null;
    } | null;
}>;
export declare const assertCustomerPrimeEligibility: ({ userId, role, feature, }: {
    userId?: string | null | undefined;
    role?: string | null | undefined;
    feature: 'CALL' | 'WHATSAPP' | 'SELL_LISTING';
}) => Promise<{
    isPrimeCustomer: boolean;
    customerCategory: import("./customerPrime").PrimeCustomerCategory;
    hasActiveSubscription: boolean;
    activeSubscriptionId: string | null;
    settings: import("./customerPrime").CustomerPrimeSettings;
    appliesToRole: boolean;
    gatingEnabled: boolean;
    qrPaymentUri: string | null;
    activeSubscription: {
        id: string;
        userId: string;
        status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING" | "REJECTED";
        transactionRef: string | null;
        receiptUrl: string | null;
        paidAmount: number;
        paidUpiId: string | null;
        settingsSnapshot: CustomerPrimeSettingsSnapshot;
        startedAt: Date | null;
        expiresAt: Date | null;
        submittedAt: Date;
        approvedByUserId: string | null;
        approvedAt: Date | null;
        rejectedByUserId: string | null;
        rejectedAt: Date | null;
        rejectionReason: string | null;
        createdAt: Date;
        updatedAt: Date;
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            mobile?: string | null;
        } | null;
    } | null;
    pendingSubscription: {
        id: string;
        userId: string;
        status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING" | "REJECTED";
        transactionRef: string | null;
        receiptUrl: string | null;
        paidAmount: number;
        paidUpiId: string | null;
        settingsSnapshot: CustomerPrimeSettingsSnapshot;
        startedAt: Date | null;
        expiresAt: Date | null;
        submittedAt: Date;
        approvedByUserId: string | null;
        approvedAt: Date | null;
        rejectedByUserId: string | null;
        rejectedAt: Date | null;
        rejectionReason: string | null;
        createdAt: Date;
        updatedAt: Date;
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            mobile?: string | null;
        } | null;
    } | null;
    requiresPrime: boolean;
    isAllowed: boolean;
}>;
export declare const createCustomerPrimeSubscriptionRequest: ({ userId, role, receiptUrl, }: {
    userId: string;
    role?: string | null | undefined;
    receiptUrl?: string | null | undefined;
}) => Promise<{
    id: string;
    userId: string;
    status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING" | "REJECTED";
    transactionRef: string | null;
    receiptUrl: string | null;
    paidAmount: number;
    paidUpiId: string | null;
    settingsSnapshot: CustomerPrimeSettingsSnapshot;
    startedAt: Date | null;
    expiresAt: Date | null;
    submittedAt: Date;
    approvedByUserId: string | null;
    approvedAt: Date | null;
    rejectedByUserId: string | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    user: {
        id: string;
        name?: string | null;
        email?: string | null;
        mobile?: string | null;
    } | null;
}>;
export declare const approveCustomerPrimeSubscription: ({ subscriptionId, approverUserId, }: {
    subscriptionId: string;
    approverUserId: string;
}) => Promise<{
    id: string;
    userId: string;
    status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING" | "REJECTED";
    transactionRef: string | null;
    receiptUrl: string | null;
    paidAmount: number;
    paidUpiId: string | null;
    settingsSnapshot: CustomerPrimeSettingsSnapshot;
    startedAt: Date | null;
    expiresAt: Date | null;
    submittedAt: Date;
    approvedByUserId: string | null;
    approvedAt: Date | null;
    rejectedByUserId: string | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    user: {
        id: string;
        name?: string | null;
        email?: string | null;
        mobile?: string | null;
    } | null;
}>;
export declare const rejectCustomerPrimeSubscription: ({ subscriptionId, approverUserId, rejectionReason, }: {
    subscriptionId: string;
    approverUserId: string;
    rejectionReason?: string | null | undefined;
}) => Promise<{
    id: string;
    userId: string;
    status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING" | "REJECTED";
    transactionRef: string | null;
    receiptUrl: string | null;
    paidAmount: number;
    paidUpiId: string | null;
    settingsSnapshot: CustomerPrimeSettingsSnapshot;
    startedAt: Date | null;
    expiresAt: Date | null;
    submittedAt: Date;
    approvedByUserId: string | null;
    approvedAt: Date | null;
    rejectedByUserId: string | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    user: {
        id: string;
        name?: string | null;
        email?: string | null;
        mobile?: string | null;
    } | null;
}>;
export declare const listCustomerPrimeSubscriptions: ({ status, take, }: {
    status?: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | undefined;
    take?: number;
}) => Promise<{
    id: string;
    userId: string;
    status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING" | "REJECTED";
    transactionRef: string | null;
    receiptUrl: string | null;
    paidAmount: number;
    paidUpiId: string | null;
    settingsSnapshot: CustomerPrimeSettingsSnapshot;
    startedAt: Date | null;
    expiresAt: Date | null;
    submittedAt: Date;
    approvedByUserId: string | null;
    approvedAt: Date | null;
    rejectedByUserId: string | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    user: {
        id: string;
        name?: string | null;
        email?: string | null;
        mobile?: string | null;
    } | null;
}[]>;
//# sourceMappingURL=customerPrimeSubscriptions.d.ts.map