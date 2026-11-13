import { z } from 'zod';

export const AI_DATA_CONTRACT_STATUSES = [
  'success',
  'empty',
  'permission_denied',
  'data_unavailable',
  'provider_unavailable',
  'ambiguous',
  'validation_error',
] as const;

export type AiDataContractStatus = (typeof AI_DATA_CONTRACT_STATUSES)[number];

export type AiDataContractSource = 'database' | 'cache' | 'surepass' | 'provider' | 'mixed' | 'none';
export type AiDataContractFreshness = 'current' | 'stale' | 'unknown';
export type AiDataContractPermission = 'allowed' | 'denied';
export type AiDataContractErrorStatus = Exclude<AiDataContractStatus, 'success' | 'empty'>;

export const AI_DATA_CONTRACT_MAX_LIMIT = 20;
export const AI_DATA_CONTRACT_MAX_DAYS = 90;

export type AiDataContractPagination = {
  limit: number;
  offset: number;
  returned: number | null;
  total: number | null;
  hasMore: boolean;
  nextCursor: string | null;
};

export type AiDataContractSafeLimits = {
  maxLimit: number;
  maxDays: number;
  requestedLimit: number | null;
  appliedLimit: number;
};

export type AiDataContract<T> = {
  status: AiDataContractStatus;
  source: AiDataContractSource;
  fetchedAt: string;
  freshness: AiDataContractFreshness;
  data: T;
  maskedFields: string[];
  permission: AiDataContractPermission;
  pagination: AiDataContractPagination;
  safeLimits: AiDataContractSafeLimits;
};

export const aiDataContractSchema = z.object({
  status: z.enum(AI_DATA_CONTRACT_STATUSES),
  source: z.enum(['database', 'cache', 'surepass', 'provider', 'mixed', 'none']),
  fetchedAt: z.string().datetime(),
  freshness: z.enum(['current', 'stale', 'unknown']),
  data: z.unknown(),
  maskedFields: z.array(z.string()),
  permission: z.enum(['allowed', 'denied']),
  pagination: z.object({
    limit: z.number().int().min(1).max(AI_DATA_CONTRACT_MAX_LIMIT),
    offset: z.number().int().min(0),
    returned: z.number().int().min(0).nullable(),
    total: z.number().int().min(0).nullable(),
    hasMore: z.boolean(),
    nextCursor: z.string().min(1).nullable(),
  }),
  safeLimits: z.object({
    maxLimit: z.literal(AI_DATA_CONTRACT_MAX_LIMIT),
    maxDays: z.literal(AI_DATA_CONTRACT_MAX_DAYS),
    requestedLimit: z.number().int().nullable(),
    appliedLimit: z.number().int().min(1).max(AI_DATA_CONTRACT_MAX_LIMIT),
  }),
});

export type CreateAiDataContractInput<T> = {
  status: AiDataContractStatus;
  source: AiDataContractSource;
  fetchedAt?: Date | string;
  freshness?: AiDataContractFreshness;
  data: T;
  maskedFields?: readonly string[];
  permission: AiDataContractPermission;
  requestedLimit?: number | undefined;
  pagination?: Partial<AiDataContractPagination> | undefined;
};

const isoTimestamp = (value: Date | string | undefined): string => {
  if (!value) return new Date().toISOString();
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const safeInteger = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value) ? value : fallback;

const safeLimit = (value: unknown): number => Math.min(
  AI_DATA_CONTRACT_MAX_LIMIT,
  Math.max(1, safeInteger(value, AI_DATA_CONTRACT_MAX_LIMIT)),
);

const collectionLength = (value: unknown): number | null => {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['items', 'records', 'results', 'listings', 'leads', 'vehicles', 'documents', 'tasks']) {
    if (Array.isArray(record[key])) return record[key].length;
  }
  return null;
};

export const createAiDataContract = <T>(input: CreateAiDataContractInput<T>): AiDataContract<T> => {
  const contract = {
    status: input.status,
    source: input.source,
    fetchedAt: isoTimestamp(input.fetchedAt),
    freshness: input.freshness ?? (input.status === 'success' || input.status === 'empty' ? 'current' : 'unknown'),
    data: input.data,
    maskedFields: [...new Set((input.maskedFields ?? []).map((field) => field.trim()).filter(Boolean))],
    permission: input.permission,
    pagination: {
      limit: safeLimit(input.pagination?.limit ?? input.requestedLimit),
      offset: Math.max(0, safeInteger(input.pagination?.offset, 0)),
      returned: input.pagination?.returned === undefined
        ? collectionLength(input.data)
        : input.pagination.returned === null
          ? null
          : Math.max(0, safeInteger(input.pagination.returned, 0)),
      total: input.pagination?.total === undefined
        ? null
        : input.pagination.total === null
          ? null
          : Math.max(0, safeInteger(input.pagination.total, 0)),
      hasMore: input.pagination?.hasMore === true,
      nextCursor: typeof input.pagination?.nextCursor === 'string' && input.pagination.nextCursor.trim()
        ? input.pagination.nextCursor.trim()
        : null,
    },
    safeLimits: {
      maxLimit: AI_DATA_CONTRACT_MAX_LIMIT,
      maxDays: AI_DATA_CONTRACT_MAX_DAYS,
      requestedLimit: input.requestedLimit === undefined
        ? null
        : safeInteger(input.requestedLimit, AI_DATA_CONTRACT_MAX_LIMIT),
      appliedLimit: safeLimit(input.pagination?.limit ?? input.requestedLimit),
    },
  };

  return aiDataContractSchema.parse(contract) as AiDataContract<T>;
};

export const aiDataContractStatusForErrorCode = (code: string): AiDataContractErrorStatus => {
  if (code === 'AI_TOOL_PERMISSION_REQUIRED' || code === 'AI_ACCESS_FORBIDDEN' || code.endsWith('_FORBIDDEN')) {
    return 'permission_denied';
  }
  if (code === 'AI_INTENT_AMBIGUOUS' || code === 'AI_TOOL_AMBIGUOUS' || code.endsWith('_AMBIGUOUS')) {
    return 'ambiguous';
  }
  if (code === 'AI_DISABLED' || code === 'AI_CONFIGURATION_INVALID' || code.startsWith('AI_PROVIDER_')) {
    return 'provider_unavailable';
  }
  if (
    code === 'AI_INPUT_TOKEN_BUDGET_EXCEEDED'
    || code === 'AI_PROMPT_INJECTION_REJECTED'
    || code.endsWith('_INVALID')
    || code.endsWith('_NOT_AVAILABLE')
  ) {
    return 'validation_error';
  }
  return 'data_unavailable';
};

export const createAiDataErrorContract = (
  status: AiDataContractErrorStatus,
  input: {
    source?: AiDataContractSource;
    fetchedAt?: Date | string;
    maskedFields?: readonly string[];
    requestedLimit?: number | undefined;
    pagination?: Partial<AiDataContractPagination> | undefined;
  } = {},
): AiDataContract<null> => createAiDataContract({
  status,
  source: input.source ?? 'none',
  ...(input.fetchedAt !== undefined ? { fetchedAt: input.fetchedAt } : {}),
  freshness: 'unknown',
  data: null,
  ...(input.maskedFields !== undefined ? { maskedFields: input.maskedFields } : {}),
  permission: status === 'permission_denied' ? 'denied' : 'allowed',
  ...(input.requestedLimit !== undefined ? { requestedLimit: input.requestedLimit } : {}),
  ...(input.pagination !== undefined ? { pagination: input.pagination } : {}),
});

export const createAiDataErrorContractForCode = (
  code: string,
  input: {
    source?: AiDataContractSource;
    fetchedAt?: Date | string;
    maskedFields?: readonly string[];
    requestedLimit?: number | undefined;
    pagination?: Partial<AiDataContractPagination> | undefined;
  } = {},
): AiDataContract<null> => createAiDataErrorContract(aiDataContractStatusForErrorCode(code), input);
