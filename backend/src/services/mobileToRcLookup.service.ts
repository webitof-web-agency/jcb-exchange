import prisma from '../lib/prisma';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import { getPanVerificationRuntimeConfig } from './panVerificationSettings.service';
import {
  normalizeMobileNumber,
  validateMobileNumber,
} from './mobileToRcLookup.validation';
import {
  createSurepassClient,
  SurepassProviderError,
  type SurepassErrorKind,
} from './surepassClient';
import { createVerificationFingerprint, isFreshVerificationResult } from './verificationCache';
import {
  apiWalletBillingService,
  isApiWalletBillingError,
  type ApiBillingGateway,
} from './apiWalletBilling.service';

const MOBILE_TO_RC_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

type MobileToRcRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

type MobileToRcAuditRepository = { create: (args: any) => Promise<any> };

type MobileToRcDependencies = {
  record?: MobileToRcRecordRepository;
  audit?: MobileToRcAuditRepository;
  provider?: ReturnType<typeof createSurepassClient>;
  dataSecret?: string;
  billing?: ApiBillingGateway;
};

export class MobileToRcLookupError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MobileToRcLookupError';
  }
}

const safeText = (value: unknown, maxLength = 500) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001F\u007F]/.test(normalized)) return null;
  return normalized;
};

const objectValue = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export const maskMobileNumber = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, '');
  if (!normalized) return '********';
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${'*'.repeat(Math.max(4, normalized.length - 4))}${normalized.slice(-4)}`;
};

export type MobileToRcLookupResult = {
  mobileNumber: string;
  rcNumbers: string[];
  providerClientId?: string;
};

export const normalizeMobileToRcResult = (
  value: unknown,
  fallbackMobileNumber: string,
): MobileToRcLookupResult => {
  const data = objectValue(value) || {};
  const providerClientId = safeText(data.client_id ?? data.clientId, 150);
  const mobileNumber = normalizeMobileNumber(
    typeof data.mobile_number === 'string' ? data.mobile_number : fallbackMobileNumber,
  ) || fallbackMobileNumber;
  const rawRcNumbers = Array.isArray(data.rc_number)
    ? data.rc_number
    : Array.isArray(data.rcNumber)
      ? data.rcNumber
      : typeof data.rc_number === 'string'
        ? [data.rc_number]
        : typeof data.rcNumber === 'string'
          ? [data.rcNumber]
          : [];
  const rcNumbers = Array.from(new Set(
    rawRcNumbers
      .map((entry) => safeText(entry, 40)?.toUpperCase().replace(/\s+/g, ''))
      .filter((entry): entry is string => Boolean(entry && /^[A-Z0-9/-]+$/.test(entry))),
  )).slice(0, 100);
  const result: MobileToRcLookupResult = { mobileNumber, rcNumbers };
  if (providerClientId) result.providerClientId = providerClientId;
  return result;
};

const recordSummary = (record: any) => ({
  id: record.id,
  status: record.status,
  maskedMobileNumber: record.maskedMobileNumber,
  rcNumbersCount: record.rcNumbersCount ?? 0,
  provider: record.provider,
  providerClientId: record.providerClientId ?? null,
  messageCode: record.messageCode ?? null,
  safeMessage: record.safeMessage ?? null,
  requestedBy: record.requestedBy
    ? { id: record.requestedBy.id, name: record.requestedBy.name ?? null, email: record.requestedBy.email ?? null }
    : null,
  createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
  completedAt: record.completedAt instanceof Date ? record.completedAt.toISOString() : record.completedAt,
});

const providerFailure = (error: SurepassProviderError) => {
  const byKind: Record<SurepassErrorKind, { status: number; code: string; message: string }> = {
    INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'We could not find RC numbers linked to this mobile number. Please check the mobile number and try again.' },
    AUTHENTICATION: { status: 502, code: 'provider_configuration_error', message: 'Mobile To RC provider configuration is invalid.' },
    FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'Mobile To RC provider access is not available.' },
    RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many Mobile To RC requests. Please try again later.' },
    PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'Mobile To RC is temporarily unavailable. Please try again later.' },
    MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'Mobile To RC provider returned an invalid response.' },
  };
  const safe = byKind[error.kind];
  return new MobileToRcLookupError(safe.message, safe.status, safe.code);
};

const operationError = (message: string, statusCode = 400, code = 'invalid_mobile_to_rc_request') =>
  new MobileToRcLookupError(message, statusCode, code);

const isUniqueConstraintError = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002');

const ensureProviderData = (body: unknown) => {
  const response = objectValue(body);
  const data = objectValue(response?.data);
  if (!response || !data) {
    throw new MobileToRcLookupError('Mobile To RC provider returned an invalid response.', 502, 'provider_malformed_response');
  }
  return { response, data };
};

export class MobileToRcLookupService {
  private readonly record: MobileToRcRecordRepository;
  private readonly audit: MobileToRcAuditRepository | undefined;
  private readonly provider: ReturnType<typeof createSurepassClient> | undefined;
  private readonly dataSecret: string | undefined;
  private readonly billing: ApiBillingGateway | undefined;

  constructor(dependencies: MobileToRcDependencies = {}) {
    this.record = dependencies.record || (prisma as any).mobileToRcLookupRecord;
    this.audit = dependencies.audit || (!dependencies.record ? (prisma as any).auditLog : undefined);
    this.provider = dependencies.provider;
    this.dataSecret = dependencies.dataSecret?.trim() || undefined;
    this.billing = dependencies.billing ?? (!dependencies.record ? apiWalletBillingService : undefined);
  }

  private async getRuntime() {
    if (this.provider && this.dataSecret) return { provider: this.provider, dataSecret: this.dataSecret };
    try {
      const config = await getPanVerificationRuntimeConfig();
      if (!config || !config.enabled || !config.baseUrl || !config.token || !config.dataSecret) {
        throw new Error('Mobile To RC is not configured.');
      }
      return {
        provider: createSurepassClient({
          baseUrl: config.baseUrl,
          token: config.token,
          ...(config.customerId ? { customerId: config.customerId } : {}),
        }),
        dataSecret: config.dataSecret,
      };
    } catch {
      throw new MobileToRcLookupError('Mobile To RC provider is not configured.', 503, 'provider_not_configured');
    }
  }

  private async ensureNoRecentDuplicate(requestFingerprint: string) {
    const existing = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: MOBILE_TO_RC_STATUS.PENDING,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (existing) {
      throw operationError('This Mobile To RC lookup is already in progress. Please wait a moment.', 409, 'lookup_in_progress');
    }
  }

  private async findFreshCachedResult(requestFingerprint: string, dataSecret: string) {
    const cached = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: MOBILE_TO_RC_STATUS.SUCCESS,
        completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        encryptedResult: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      include: { requestedBy: { select: { id: true, name: true, email: true } } },
    });
    if (!cached || !isFreshVerificationResult(cached)) return null;
    try {
      return {
        record: recordSummary(cached),
        result: JSON.parse(decryptPanData(cached.encryptedResult, dataSecret)) as MobileToRcLookupResult,
        cacheHit: true,
      };
    } catch {
      return null;
    }
  }

  private async markFailed(id: string, error: MobileToRcLookupError, messageCode: string | null = null) {
    try {
      await this.record.update({
        where: { id },
        data: { status: MOBILE_TO_RC_STATUS.FAILED, safeMessage: error.message, messageCode, completedAt: new Date() },
      });
    } catch {
      // Preserve the safe provider error when history persistence itself fails.
    }
  }

  private async writeAudit(actorUserId: string, action: string, entityId: string, afterJson: Record<string, unknown>) {
    if (!this.audit) return;
    try {
      await this.audit.create({ data: { actorUserId, entityType: 'MOBILE_TO_RC_LOOKUP', entityId, action, afterJson } });
    } catch {
      // Audit failure must not expose the mobile number or block a successful lookup.
    }
  }

  private async run(mobileNumber: string, requestedById: string, requestFingerprint: string) {
    const runtime = await this.getRuntime();
    const maskedMobileNumber = maskMobileNumber(mobileNumber);
    const cached = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret);
    if (cached) return cached;
    await this.ensureNoRecentDuplicate(requestFingerprint);

    const existing = await this.record.findFirst({ where: { requestFingerprint }, orderBy: { completedAt: 'desc' } });
    const pendingData = {
      status: MOBILE_TO_RC_STATUS.PENDING,
      maskedMobileNumber,
      requestFingerprint,
      requestedById,
      rcNumbersCount: 0,
      createdAt: new Date(),
      safeMessage: null,
      messageCode: null,
      encryptedResult: null,
      providerClientId: null,
      completedAt: null,
    };
    let pending: any;
    if (existing) {
      pending = await this.record.update({ where: { id: existing.id }, data: pendingData });
    } else {
      try {
        pending = await this.record.create({ data: pendingData });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const raceWinner = await this.record.findFirst({ where: { requestFingerprint }, orderBy: { completedAt: 'desc' } });
        if (!raceWinner) throw error;
        if (raceWinner.status === MOBILE_TO_RC_STATUS.SUCCESS) {
          const racedCache = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret);
          if (racedCache) return racedCache;
        }
        if (raceWinner.status === MOBILE_TO_RC_STATUS.PENDING) {
          throw operationError('This Mobile To RC lookup is already in progress. Please wait a moment.', 409, 'lookup_in_progress');
        }
        pending = await this.record.update({ where: { id: raceWinner.id }, data: pendingData });
      }
    }
    await this.writeAudit(requestedById, 'MOBILE_TO_RC_LOOKUP_REQUESTED', pending.id, { maskedMobileNumber, status: MOBILE_TO_RC_STATUS.PENDING });

    try {
      const billing = this.billing
        ? await this.billing.chargeForProviderCall({
            serviceKey: 'MOBILE_TO_RC',
            verificationRecordId: pending.id,
            requestedById,
          })
        : undefined;
      const body = await runtime.provider.verifyMobileToRc({ mobile_number: mobileNumber });
      const { response, data } = ensureProviderData(body);
      const normalized = normalizeMobileToRcResult(data, mobileNumber);
      const encryptedResult = encryptPanData(JSON.stringify(normalized), runtime.dataSecret);
      const completed = await this.record.update({
        where: { id: pending.id },
        data: {
          status: MOBILE_TO_RC_STATUS.SUCCESS,
          rcNumbersCount: normalized.rcNumbers.length,
          providerClientId: typeof normalized.providerClientId === 'string' ? normalized.providerClientId : null,
          messageCode: typeof response.message_code === 'string' ? response.message_code : null,
          encryptedResult,
          completedAt: new Date(),
        },
        include: { requestedBy: { select: { id: true, name: true, email: true } } },
      });
      await this.writeAudit(requestedById, 'MOBILE_TO_RC_LOOKUP_SUCCEEDED', pending.id, {
        maskedMobileNumber,
        rcNumbersCount: normalized.rcNumbers.length,
        status: MOBILE_TO_RC_STATUS.SUCCESS,
      });
      return { record: recordSummary(completed), result: normalized, cacheHit: false, ...(billing ? { billing } : {}) };
    } catch (error) {
      const normalizedError = isApiWalletBillingError(error)
        ? new MobileToRcLookupError(error.message, error.statusCode, error.code)
        : error instanceof SurepassProviderError
        ? providerFailure(error)
        : error instanceof MobileToRcLookupError
          ? error
          : new MobileToRcLookupError('Mobile To RC lookup could not be completed.', 502, 'lookup_failed');
      await this.markFailed(pending.id, normalizedError, error instanceof SurepassProviderError ? error.messageCode : null);
      await this.writeAudit(requestedById, 'MOBILE_TO_RC_LOOKUP_FAILED', pending.id, {
        maskedMobileNumber,
        status: MOBILE_TO_RC_STATUS.FAILED,
        code: normalizedError.code,
      });
      throw normalizedError;
    }
  }

  async lookupMobileToRc(input: Record<string, unknown>, requestedById: string) {
    const mobileNumber = normalizeMobileNumber(input.mobile_number ?? input.mobileNumber);
    const mobileError = validateMobileNumber(mobileNumber);
    if (mobileError) throw operationError(mobileError);
    return this.run(mobileNumber, requestedById, createVerificationFingerprint('MOBILE_TO_RC', { mobile_number: mobileNumber }));
  }

  async listHistory(filters: { page?: unknown; limit?: unknown; status?: unknown; search?: unknown }) {
    const parsedPage = Number.parseInt(String(filters.page ?? '1'), 10);
    const parsedLimit = Number.parseInt(String(filters.limit ?? '20'), 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10_000) : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const status = typeof filters.status === 'string' && Object.values(MOBILE_TO_RC_STATUS).includes(filters.status as typeof MOBILE_TO_RC_STATUS[keyof typeof MOBILE_TO_RC_STATUS])
      ? filters.status as typeof MOBILE_TO_RC_STATUS[keyof typeof MOBILE_TO_RC_STATUS]
      : undefined;
    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 50) : '';
    const where = { ...(status ? { status } : {}), ...(search ? { maskedMobileNumber: { contains: search, mode: 'insensitive' } } : {}) };
    const [total, records] = await Promise.all([
      this.record.count({ where }),
      this.record.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { requestedBy: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    return { records: records.map(recordSummary), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getHistoryDetail(id: string) {
    const record = await this.record.findUnique({
      where: { id },
      include: { requestedBy: { select: { id: true, name: true, email: true } } },
    });
    if (!record) throw new MobileToRcLookupError('Mobile To RC history record not found.', 404, 'record_not_found');
    let result: MobileToRcLookupResult | null = null;
    if (record.status === MOBILE_TO_RC_STATUS.SUCCESS && record.encryptedResult) {
      try {
        const runtime = this.dataSecret ? null : await getPanVerificationRuntimeConfig();
        const secret = this.dataSecret || runtime?.dataSecret;
        if (!secret) throw new Error('Missing data secret');
        result = JSON.parse(decryptPanData(record.encryptedResult, secret)) as MobileToRcLookupResult;
      } catch {
        throw new MobileToRcLookupError('The stored Mobile To RC result is unavailable.', 500, 'stored_result_unavailable');
      }
    }
    return { record: recordSummary(record), result };
  }
}

export const mobileToRcLookupService = new MobileToRcLookupService();
