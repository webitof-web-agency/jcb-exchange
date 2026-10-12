export type RcMobileNumberCheckStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type RcMobileNumberCheckRecord = {
  id: string;
  status: RcMobileNumberCheckStatus;
  maskedRcNumber: string;
  maskedMobileNumber: string;
  isMobileNumberMatch: boolean | null;
  provider: string;
  providerClientId: string | null;
  messageCode: string | null;
  safeMessage: string | null;
  requestedBy?: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  completedAt: string | null;
};

export type RcMobileNumberCheckResult = {
  rcNumber: string;
  mobileNumber: string;
  isMobileNumberMatch: boolean;
  providerClientId?: string;
};

export type RcMobileNumberCheckResponse = {
  success: boolean;
  cacheHit?: boolean;
  record: RcMobileNumberCheckRecord;
  result: RcMobileNumberCheckResult | null;
};

export const normalizeRcNumber = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

export const normalizeMobileNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || !/^[+()\-\s\d]+$/.test(trimmed)) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
};

export const normalizeRcMobileNumberCheck = (input: {
  rcNumber?: string;
  mobileNumber?: string;
  rc_number?: string;
  mobile_number?: string;
}) => ({
  rcNumber: normalizeRcNumber(input.rcNumber ?? input.rc_number ?? ''),
  mobileNumber: normalizeMobileNumber(input.mobileNumber ?? input.mobile_number ?? ''),
});

export const validateRcMobileNumberCheck = (input: {
  rcNumber?: string;
  mobileNumber?: string;
  rc_number?: string;
  mobile_number?: string;
}) => {
  const normalized = normalizeRcMobileNumberCheck(input);
  const rcNumber = normalized.rcNumber;
  if (!rcNumber) return 'Vehicle registration number is required.';
  if (rcNumber.length < 3 || rcNumber.length > 30 || !/^[A-Z0-9/-]+$/.test(rcNumber)) return 'Enter a valid vehicle registration number.';
  const mobileNumber = normalized.mobileNumber;
  if (!mobileNumber) return 'Mobile number is required.';
  if (!/^(?:[1-9]\d{9}|0[1-9]\d{9})$/.test(mobileNumber)) return 'Enter a valid 10-digit mobile number.';
  return null;
};

export const safeApiError = (error: unknown, fallback: string) => {
  const response = error as { response?: { data?: { error?: unknown } } };
  const message = response.response?.data?.error;
  return typeof message === 'string' && message.trim() ? message : fallback;
};
