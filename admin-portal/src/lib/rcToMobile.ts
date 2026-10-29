export type RcToMobileVerificationStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type RcToMobileRecord = {
  id: string;
  status: RcToMobileVerificationStatus;
  maskedRcNumber: string;
  maskedMobileNumber: string | null;
  provider: string;
  providerClientId: string | null;
  messageCode: string | null;
  safeMessage: string | null;
  requestedBy?: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  completedAt: string | null;
};

export type RcToMobileResult = {
  rcNumber?: string | null;
  mobileNumber?: string | null;
  providerClientId?: string | null;
  [key: string]: unknown;
};

export type RcToMobileResponse = {
  success: boolean;
  cacheHit?: boolean;
  record: RcToMobileRecord;
  result: RcToMobileResult | null;
};

export const normalizeRcNumber = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

export const validateRcNumber = (value: string) => {
  const normalized = normalizeRcNumber(value);
  if (!normalized) return 'Vehicle registration number is required.';
  if (normalized.length < 3 || normalized.length > 30 || !/^[A-Z0-9/-]+$/.test(normalized)) {
    return 'Enter a valid vehicle registration number.';
  }
  return null;
};

export const safeApiError = (error: unknown, fallback: string) => {
  const response = error as { response?: { data?: { error?: unknown } } };
  const message = response.response?.data?.error;
  return typeof message === 'string' && message.trim() ? message : fallback;
};
