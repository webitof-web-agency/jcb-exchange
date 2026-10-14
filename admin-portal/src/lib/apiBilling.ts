export type ApiBillableServiceKey =
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
  if (!Number.isFinite(amount) || amount < 0) return '₹0.00';
  return `₹${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
};

export const getApiServicePrice = (
  summary: ApiBillingSummary | null | undefined,
  serviceKey: ApiBillableServiceKey,
): string | null => {
  const service = summary?.services.find((item) => item.serviceKey === serviceKey);
  return service?.active && service.priceRupees ? service.priceRupees : null;
};
