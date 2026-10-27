export type ApiBillableServiceKey =
  | 'AADHAAR_DIGILOCKER'
  | 'PAN_VERIFICATION'
  | 'GST_VERIFICATION'
  | 'MOBILE_TO_PAN'
  | 'DRIVING_LICENSE_VERIFICATION'
  | 'RC_OWNER_HISTORY'
  | 'RC_FULL'
  | 'RC_CHALLAN'
  | 'CHASSIS_TO_RC'
  | 'RC_TO_MOBILE'
  | 'MOBILE_TO_RC'
  | 'RC_MOBILE_NUMBER_CHECK';

export const API_BILLING_SUMMARY_CHANGED_EVENT = 'api-billing-summary-changed';

export const notifyApiBillingSummaryChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(API_BILLING_SUMMARY_CHANGED_EVENT));
  }
};

export type ApiBillingSummary = {
  wallet: {
    currency: 'INR';
    balanceRupees: string;
    mode: 'DISABLED' | 'ACTIVE';
  };
  services: Array<{
    serviceKey: ApiBillableServiceKey;
    displayName: string;
    priceRupees: string | null;
    active: boolean;
    version: number | null;
  }>;
};

export const formatApiWalletBalance = (balanceRupees: string): string => {
  const amount = Number(balanceRupees);
  if (!Number.isFinite(amount) || amount < 0) return '\u20B90.00';
  return '\u20B9' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const getApiServicePrice = (
  summary: ApiBillingSummary | null | undefined,
  serviceKey: ApiBillableServiceKey,
): string | null => {
  const service = summary?.services.find((item) => item.serviceKey === serviceKey);
  return service?.active && service.priceRupees ? service.priceRupees : null;
};
