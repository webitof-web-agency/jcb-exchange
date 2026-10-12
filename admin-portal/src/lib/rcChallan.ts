export type RcChallanFormState = {
  rcNumber: string;
  chassisNumber: string;
  engineNumber: string;
};

export type RcChallanRequest = {
  rc_number: string;
  chassis_number: string;
  engine_number: string;
  state_only?: boolean;
  state_portal?: string[];
};

export type RcChallanRecord = {
  recordKey: string;
  number: number | null;
  challanNumber: string | null;
  offenseDetails: string | null;
  challanPlace: string | null;
  challanDate: string | null;
  state: string | null;
  rto: string | null;
  upstreamCode: string | null;
  accusedName: string | null;
  amount: number | null;
  challanStatus: string | null;
  courtChallan: boolean | null;
};

export type RcChallanSummary = {
  totalChallans: number;
  totalReturnedAmount: number;
  knownPendingCount: number;
  knownPendingAmount: number;
  courtChallanCount: number;
  blacklistCount: number;
};

export type RcChallanResult = {
  providerClientId: string | null;
  challans: RcChallanRecord[];
  blacklist: unknown[];
  summary: RcChallanSummary;
};

export type RcChallanVerificationStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type RcChallanHistoryRecord = {
  id: string;
  status: RcChallanVerificationStatus;
  maskedRcNumber: string;
  totalChallans: number;
  knownPendingCount: number;
  totalReturnedAmount: number | string;
  knownPendingAmount: number | string;
  courtChallanCount: number;
  blacklistCount: number;
  provider: string;
  providerEnvironment: string | null;
  providerClientId: string | null;
  messageCode: string | null;
  safeMessage: string | null;
  requestedBy?: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  completedAt: string | null;
};

export type RcChallanVerificationResponse = {
  success: boolean;
  cacheHit?: boolean;
  record: RcChallanHistoryRecord;
  result: RcChallanResult | null;
};

export type RcChallanHistoryResponse = {
  records: RcChallanHistoryRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const normalizeIdentifier = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

export const normalizeRcChallanForm = (form: RcChallanFormState): RcChallanRequest => {
  return {
    rc_number: normalizeIdentifier(form.rcNumber),
    chassis_number: normalizeIdentifier(form.chassisNumber),
    engine_number: normalizeIdentifier(form.engineNumber),
  };
};

const validateIdentifier = (label: string, value: string) => {
  if (!value) return `${label} is required.`;
  if (value.length > 100 || /[\u0000-\u001F\u007F]/.test(value)) return `${label} is invalid.`;
  return null;
};

export const validateRcChallanForm = (form: RcChallanFormState) => {
  const request = normalizeRcChallanForm(form);
  const rcError = validateIdentifier('Registration number', request.rc_number);
  if (rcError) return rcError;
  const chassisError = validateIdentifier('Chassis number', request.chassis_number);
  if (chassisError) return chassisError;
  const engineError = validateIdentifier('Engine number', request.engine_number);
  if (engineError) return engineError;
  return null;
};

export const safeApiError = (error: unknown, fallback: string) => {
  const response = error as { response?: { data?: { error?: unknown } } };
  const message = response.response?.data?.error;
  return typeof message === 'string' && message.trim() ? message : fallback;
};
