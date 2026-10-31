export type RcOwnerHistoryStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type RcOwnerHistoryRecord = {
  id: string;
  status: RcOwnerHistoryStatus;
  maskedRcNumber: string;
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
  rawDataExpiresAt?: string | null;
  template?: RcOwnerHistoryTemplateSummary | null;
};

export type RcOwnerHistoryTemplateSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  createdAt: string;
};

export type RcOwnerHistoryResponse = {
  success: boolean;
  record: RcOwnerHistoryRecord;
  result: Record<string, unknown> | null;
  template?: RcOwnerHistoryTemplateSummary | null;
  publicVerificationUrl?: string | null;
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
