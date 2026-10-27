export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export type PanOperation = 'PAN_VERIFY' | 'PAN_TO_AADHAAR' | 'PAN_CONTACT_LOOKUP' | 'PAN_COMPREHENSIVE_V2';
export const PAN_COMPREHENSIVE_OPERATION: PanOperation = 'PAN_COMPREHENSIVE_V2';
export const PAN_COMPREHENSIVE_ROUTE = '/pan-verification/comprehensive';
export type PanStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type PanRecord = {
  id: string;
  operation: PanOperation;
  status: PanStatus;
  maskedPan: string;
  provider: string;
  providerClientId: string | null;
  messageCode: string | null;
  safeMessage: string | null;
  requestedBy?: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  completedAt: string | null;
  rawDataExpiresAt?: string | null;
  template?: PanTemplateSummary | null;
};

export type PanTemplateSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  createdAt: string;
};

export type PanResultResponse = {
  success: boolean;
  cacheHit?: boolean;
  alreadyUploaded?: boolean;
  record: PanRecord;
  result: Record<string, unknown> | null;
  template?: PanTemplateSummary | null;
};

export const normalizePan = (value: string) => value.trim().toUpperCase();

export const validatePan = (value: string) => {
  const pan = normalizePan(value);
  return pan ? (PAN_PATTERN.test(pan) ? null : 'Enter a valid PAN in the format ABCDE1234F.') : 'PAN number is required.';
};

export const validateDob = (value: string) => {
  if (!value) return 'Date of birth is required.';
  const date = new Date(`${value}T00:00:00.000Z`);
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1900 || date.getTime() > todayUtc) {
    return 'Enter a valid past date of birth.';
  }
  return null;
};

export const operationLabel = (operation: PanOperation) => {
  if (operation === 'PAN_TO_AADHAAR') return 'PAN to Aadhaar';
  if (operation === 'PAN_CONTACT_LOOKUP') return 'PAN to Email / Mobile';
  if (operation === PAN_COMPREHENSIVE_OPERATION) return 'PAN Comprehensive';
  return 'PAN Verify';
};

export const safeApiError = (error: unknown, fallback: string) => {
  const response = error as { response?: { data?: { error?: unknown } } };
  const message = response.response?.data?.error;
  return typeof message === 'string' && message.trim() ? message : fallback;
};
