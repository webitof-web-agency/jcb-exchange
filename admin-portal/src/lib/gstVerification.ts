export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

export type GstStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type GstRecord = {
  id: string;
  status: GstStatus;
  maskedGstin: string;
  gstinStatus: string | null;
  businessName: string | null;
  legalName: string | null;
  provider: string;
  providerClientId: string | null;
  messageCode: string | null;
  safeMessage: string | null;
  requestedBy?: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  completedAt: string | null;
};

export type GstResultResponse = {
  success: boolean;
  cacheHit?: boolean;
  record: GstRecord;
  result: Record<string, unknown> | null;
};

export const normalizeGstin = (value: string) => value.trim().toUpperCase();

export const validateGstin = (value: string) => {
  const gstin = normalizeGstin(value);
  if (!gstin) return 'GSTIN is required.';
  if (gstin.length !== 15) return 'GSTIN must contain exactly 15 characters.';
  if (!GSTIN_PATTERN.test(gstin)) return 'Enter a valid GSTIN in the format 08AKWPJ1234H1ZN.';
  return null;
};

export const safeApiError = (error: unknown, fallback: string) => {
  const response = error as { response?: { data?: { error?: unknown } } };
  const message = response.response?.data?.error;
  return typeof message === 'string' && message.trim() ? message : fallback;
};
