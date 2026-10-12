export type DrivingLicenseStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type DrivingLicenseRecord = {
  id: string;
  status: DrivingLicenseStatus;
  maskedLicenseNumber: string;
  currentStatus: string | null;
  state: string | null;
  holderName: string | null;
  provider: string;
  providerClientId: string | null;
  messageCode: string | null;
  safeMessage: string | null;
  requestedBy?: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  completedAt: string | null;
};

export type DrivingLicenseResultResponse = {
  success: boolean;
  record: DrivingLicenseRecord;
  result: Record<string, unknown> | null;
};

export const normalizeDrivingLicenseNumber = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

export const validateDrivingLicenseNumber = (value: string) => {
  const normalized = normalizeDrivingLicenseNumber(value);
  if (!normalized) return 'Driving license number is required.';
  if (normalized.length < 3 || normalized.length > 50 || !/^[A-Z0-9/-]+$/.test(normalized)) {
    return 'Enter a valid driving license number.';
  }
  return null;
};

export const validateDrivingLicenseDob = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter a valid date of birth.';
  const date = new Date(`${value}T00:00:00.000Z`);
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1900 || date.getTime() > todayUtc) {
    return 'Enter a valid date of birth.';
  }
  return null;
};

export const safeApiError = (error: unknown, fallback: string) => {
  const response = error as { response?: { data?: { error?: unknown } } };
  const message = response.response?.data?.error;
  return typeof message === 'string' && message.trim() ? message : fallback;
};
