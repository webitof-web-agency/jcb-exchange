export type PrimeValidityUnit = 'DAYS' | 'MONTHS';
export type PrimeSubscriptionStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
export type PrimeCustomerCategory = 'STANDARD_CUSTOMER' | 'PRIME_CUSTOMER';
export type CustomerPrimeSettings = {
    enabled: boolean;
    upiId: string | null;
    amount: number | null;
    validityValue: number | null;
    validityUnit: PrimeValidityUnit;
    applyToCustomerRoleOnly: boolean;
    requireForCall: boolean;
    requireForWhatsapp: boolean;
    requireForSellListing: boolean;
    updatedAt: string | null;
    updatedByUserId: string | null;
};
export type CustomerPrimeSettingsSnapshot = {
    enabled: boolean;
    upiId: string | null;
    amount: number | null;
    validityValue: number | null;
    validityUnit: PrimeValidityUnit;
    applyToCustomerRoleOnly: boolean;
    requireForCall: boolean;
    requireForWhatsapp: boolean;
    requireForSellListing: boolean;
    updatedAt: string | null;
    updatedByUserId: string | null;
};
type PrimeSubscriptionRecord = {
    id: string;
    status: PrimeSubscriptionStatus;
    startedAt?: Date | null;
    expiresAt?: Date | null;
};
export declare const normalizePrimeValidityUnit: (value?: string | null) => PrimeValidityUnit;
export declare const normalizeCustomerPrimeSettings: (settings?: Partial<CustomerPrimeSettings> | null) => CustomerPrimeSettings;
export declare const buildPrimeSettingsSnapshot: (settings: Partial<CustomerPrimeSettings> | CustomerPrimeSettings) => CustomerPrimeSettingsSnapshot;
export declare const calculatePrimeExpiryAt: ({ paidAt, validityValue, validityUnit, }: {
    paidAt: Date;
    validityValue: number;
    validityUnit: PrimeValidityUnit;
}) => Date;
export declare const buildUpiPaymentUri: ({ upiId, amount, payeeName, transactionNote, }: {
    upiId: string;
    amount: number;
    payeeName?: string | null;
    transactionNote?: string | null;
}) => string;
export declare const getCustomerPrimeAccessState: ({ role, now, subscriptions, }: {
    role?: string | null | undefined;
    now?: Date;
    subscriptions?: PrimeSubscriptionRecord[] | null;
}) => {
    isPrimeCustomer: boolean;
    customerCategory: PrimeCustomerCategory;
    hasActiveSubscription: boolean;
    activeSubscriptionId: string | null;
};
export {};
//# sourceMappingURL=customerPrime.d.ts.map