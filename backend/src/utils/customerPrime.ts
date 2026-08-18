export type PrimeValidityUnit = 'DAYS' | 'MONTHS';

export type PrimeSubscriptionStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

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

const normalizeTrimmedValue = (value?: string | null) => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
};

const normalizeAmount = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Number(numericValue.toFixed(2));
};

const normalizeValidityValue = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Math.round(numericValue);
};

export const normalizePrimeValidityUnit = (value?: string | null): PrimeValidityUnit =>
  String(value || '').toUpperCase() === 'MONTHS' ? 'MONTHS' : 'DAYS';

export const normalizeCustomerPrimeSettings = (
  settings?: Partial<CustomerPrimeSettings> | null,
): CustomerPrimeSettings => ({
  enabled: settings?.enabled === true,
  upiId: normalizeTrimmedValue(settings?.upiId) || null,
  amount: normalizeAmount(settings?.amount),
  validityValue: normalizeValidityValue(settings?.validityValue),
  validityUnit: normalizePrimeValidityUnit(settings?.validityUnit),
  applyToCustomerRoleOnly: true,
  requireForCall: true,
  requireForWhatsapp: true,
  requireForSellListing: true,
  updatedAt: settings?.updatedAt || null,
  updatedByUserId: settings?.updatedByUserId || null,
});

export const buildPrimeSettingsSnapshot = (
  settings: Partial<CustomerPrimeSettings> | CustomerPrimeSettings,
): CustomerPrimeSettingsSnapshot => {
  const normalizedSettings = normalizeCustomerPrimeSettings(settings);

  return {
    enabled: normalizedSettings.enabled,
    upiId: normalizedSettings.upiId,
    amount: normalizedSettings.amount,
    validityValue: normalizedSettings.validityValue,
    validityUnit: normalizedSettings.validityUnit,
    applyToCustomerRoleOnly: normalizedSettings.applyToCustomerRoleOnly,
    requireForCall: normalizedSettings.requireForCall,
    requireForWhatsapp: normalizedSettings.requireForWhatsapp,
    requireForSellListing: normalizedSettings.requireForSellListing,
    updatedAt: normalizedSettings.updatedAt,
    updatedByUserId: normalizedSettings.updatedByUserId,
  };
};

export const calculatePrimeExpiryAt = ({
  paidAt,
  validityValue,
  validityUnit,
}: {
  paidAt: Date;
  validityValue: number;
  validityUnit: PrimeValidityUnit;
}) => {
  const expiryDate = new Date(paidAt);

  if (validityUnit === 'MONTHS') {
    expiryDate.setUTCMonth(expiryDate.getUTCMonth() + validityValue);
    return expiryDate;
  }

  expiryDate.setUTCDate(expiryDate.getUTCDate() + validityValue);
  return expiryDate;
};

export const buildUpiPaymentUri = ({
  upiId,
  amount,
  payeeName,
  transactionNote,
}: {
  upiId: string;
  amount: number;
  payeeName?: string | null;
  transactionNote?: string | null;
}) => {
  const searchParams = new URLSearchParams();
  searchParams.set('pa', upiId.trim());
  if (payeeName?.trim()) {
    searchParams.set('pn', payeeName.trim());
  }
  searchParams.set('am', amount.toFixed(2));
  searchParams.set('cu', 'INR');
  if (transactionNote?.trim()) {
    searchParams.set('tn', transactionNote.trim());
  }

  return `upi://pay?${searchParams.toString().replace(/\+/g, '%20')}`;
};

export const getCustomerPrimeAccessState = ({
  role,
  now,
  subscriptions,
}: {
  role?: string | null | undefined;
  now?: Date;
  subscriptions?: PrimeSubscriptionRecord[] | null;
}) => {
  const referenceDate = now || new Date();
  const activeSubscription =
    (subscriptions || []).find((subscription) => {
      if (subscription.status !== 'ACTIVE') {
        return false;
      }

      if (!subscription.startedAt || !subscription.expiresAt) {
        return false;
      }

      return subscription.startedAt <= referenceDate && subscription.expiresAt >= referenceDate;
    }) || null;

  const isPrimeCustomer = role === 'CUSTOMER' && !!activeSubscription;

  return {
    isPrimeCustomer,
    customerCategory: (isPrimeCustomer ? 'PRIME_CUSTOMER' : 'STANDARD_CUSTOMER') as PrimeCustomerCategory,
    hasActiveSubscription: !!activeSubscription,
    activeSubscriptionId: activeSubscription?.id || null,
  };
};
