export type ChassisToRcVerificationStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type ChassisToRcRecord = {
  id: string;
  status: ChassisToRcVerificationStatus;
  maskedChassisNumber: string;
  rcNumber: string | null;
  ownerName: string | null;
  rcStatus: string | null;
  vehicleCategory: string | null;
  registrationDate: string | null;
  provider: string;
  providerClientId: string | null;
  messageCode: string | null;
  safeMessage: string | null;
  requestedBy?: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  completedAt: string | null;
};

export type ChassisToRcResponse = {
  success: boolean;
  cacheHit?: boolean;
  record: ChassisToRcRecord;
  result: Record<string, unknown> | null;
};

export const normalizeChassisNumber = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

export const validateChassisNumber = (value: string) => {
  const normalized = normalizeChassisNumber(value);
  if (!normalized) return 'Chassis number is required.';
  if (normalized.length < 5 || normalized.length > 100 || !/^[A-Z0-9/-]+$/.test(normalized)) {
    return 'Enter a valid chassis number.';
  }
  return null;
};

export const safeApiError = (error: unknown, fallback: string) => {
  const response = error as { response?: { data?: { error?: unknown } } };
  const message = response.response?.data?.error;
  return typeof message === 'string' && message.trim() ? message : fallback;
};
