export type MobileToPanLookupStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type MobileToPanRecord = {
  id: string;
  status: MobileToPanLookupStatus;
  maskedName: string;
  maskedMobileNumber: string;
  provider: string;
  providerClientId: string | null;
  messageCode: string | null;
  safeMessage: string | null;
  requestedBy?: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  completedAt: string | null;
};

export type MobileToPanResult = {
  name: string;
  mobileNumber: string;
  panNumber: string;
  providerClientId?: string;
};

export type MobileToPanResponse = {
  success: boolean;
  cacheHit?: boolean;
  record: MobileToPanRecord;
  result: MobileToPanResult | null;
};

export const normalizeMobileNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || !/^[+()\-\s\d]+$/.test(trimmed)) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
};

export const validateMobileNumber = (value: string) => {
  const normalized = normalizeMobileNumber(value);
  if (!normalized) return 'Mobile number is required.';
  if (!/^(?:[1-9]\d{9}|0[1-9]\d{9})$/.test(normalized)) return 'Enter a valid 10-digit mobile number.';
  return null;
};

export const normalizeMobileToPanName = (value: string) => value.trim().replace(/\s+/g, ' ');

export const validateMobileToPanName = (value: string) => {
  const normalized = normalizeMobileToPanName(value);
  if (!normalized) return 'Name is required.';
  if (normalized.length > 150 || /[\u0000-\u001F\u007F]/.test(normalized)) return 'Enter a valid name.';
  return null;
};

export const safeApiError = (error: unknown, fallback: string) => {
  const response = error as { response?: { data?: { error?: unknown } } };
  const message = response.response?.data?.error;
  return typeof message === 'string' && message.trim() ? message : fallback;
};
