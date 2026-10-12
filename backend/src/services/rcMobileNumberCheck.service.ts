import prisma from '../lib/prisma';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import { getPanVerificationRuntimeConfig } from './panVerificationSettings.service';
import { maskRcNumber } from './rcOwnerHistory.service';
import { normalizeRcNumber } from './rcOwnerHistory.validation';
import { normalizeMobileNumber } from './mobileToRcLookup.validation';
import {
  normalizeRcMobileNumberCheck,
  validateRcMobileNumberCheck,
  type RcMobileNumberCheckInput,
} from './rcMobileNumberCheck.validation';
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

const RC_MOBILE_NUMBER_CHECK_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

type RcMobileNumberCheckRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

type RcMobileNumberCheckAuditRepository = { create: (args: any) => Promise<any> };

type RcMobileNumberCheckDependencies = {
  record?: RcMobileNumberCheckRecordRepository;
  audit?: RcMobileNumberCheckAuditRepository;
  provider?: ReturnType<typeof createSurepassClient>;
  dataSecret?: string;
  billing?: ApiBillingGateway;
};

export class RcMobileNumberCheckError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'RcMobileNumberCheckError';
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

export type RcMobileNumberCheckResult = {
  rcNumber: string;
  mobileNumber: string;
  isMobileNumberMatch: boolean;
  providerClientId?: string;
};

export const normalizeRcMobileNumberCheckResult = (
  value: unknown,
  fallback: { rcNumber: string; mobileNumber: string },
): RcMobileNumberCheckResult => {
  const data = objectValue(value) || {};
  const providerClientId = safeText(data.client_id ?? data.clientId, 150);
  const rcNumber = normalizeRcNumber(safeText(data.rc_number ?? data.rcNumber, 40) || fallback.rcNumber) || fallback.rcNumber;
  const mobileNumber = normalizeMobileNumber(safeText(data.mobile_number ?? data.mobileNumber, 30) || fallback.mobileNumber) || fallback.mobileNumber;
  const rawMatch = data.is_mobile_number_match ?? data.isMobileNumberMatch;
  const isMobileNumberMatch = typeof rawMatch === 'boolean'
    ? rawMatch
    : typeof rawMatch === 'string' && /^(true|false)$/i.test(rawMatch)
      ? rawMatch.toLowerCase() === 'true'
      : null;
  if (isMobileNumberMatch === null) {
    throw new RcMobileNumberCheckError('RC Mobile Number Check provider returned an invalid response.', 502, 'provider_malformed_response');
  }
  const result: RcMobileNumberCheckResult = { rcNumber, mobileNumber, isMobileNumberMatch };
  if (providerClientId) result.providerClientId = providerClientId;
  return result;
};

const recordSummary = (record: any) => ({
  id: record.id,
  status: record.status,
  maskedRcNumber: record.maskedRcNumber,
  maskedMobileNumber: record.maskedMobileNumber,
  isMobileNumberMatch: record.isMobileNumberMatch ?? null,
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
    INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'We could not check the mobile number against this RC. Please check both values and try again.' },
    AUTHENTICATION: { status: 502, code: 'provider_configuration_error', message: 'RC Mobile Number Check provider configuration is invalid.' },
    FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'RC Mobile Number Check provider access is not available.' },
    RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many RC Mobile Number Check requests. Please try again later.' },
    PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'RC Mobile Number Check is temporarily unavailable. Please try again later.' },
    MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'RC Mobile Number Check provider returned an invalid response.' },
  };
  const safe = byKind[error.kind];
  return new RcMobileNumberCheckError(safe.message, safe.status, safe.code);
};

const operationError = (message: string, statusCode = 400, code = 'invalid_rc_mobile_number_check_request') =>
  new RcMobileNumberCheckError(message, statusCode, code);

const isUniqueConstraintError = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002');

const ensureProviderData = (body: unknown) => {
  const response = objectValue(body);
  const data = objectValue(response?.data);
  if (!response || !data) {
    throw new RcMobileNumberCheckError('RC Mobile Number Check provider returned an invalid response.', 502, 'provider_malformed_response');
  }
  return { response, data };
};

export class RcMobileNumberCheckService {
  private readonly record: RcMobileNumberCheckRecordRepository;
  private readonly audit: RcMobileNumberCheckAuditRepository | undefined;
  private readonly provider: ReturnType<typeof createSurepassClient> | undefined;
  private readonly dataSecret: string | undefined;
  private readonly billing: ApiBillingGateway | undefined;

  constructor(dependencies: RcMobileNumberCheckDependencies = {}) {
    this.record = dependencies.record || (prisma as any).rcMobileNumberCheckRecord;
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
        throw new Error('RC Mobile Number Check is not configured.');
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
      throw new RcMobileNumberCheckError('RC Mobile Number Check provider is not configured.', 503, 'provider_not_configured');
    }
  }

  private async ensureNoRecentDuplicate(requestFingerprint: string) {
    const existing = await this.record.findFirst({
      where: { requestFingerprint, status: RC_MOBILE_NUMBER_CHECK_STATUS.PENDING, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
      select: { id: true },
    });
    if (existing) throw operationError('This RC Mobile Number Check is already in progress. Please wait a moment.', 409, 'check_in_progress');
  }

  private async findFreshCachedResult(requestFingerprint: string, dataSecret: string) {
    const cached = await this.record.findFirst({
      where: { requestFingerprint, status: RC_MOBILE_NUMBER_CHECK_STATUS.SUCCESS, completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, encryptedResult: { not: null } },
      orderBy: { completedAt: 'desc' },
      include: { requestedBy: { select: { id: true, name: true, email: true } } },
    });
    if (!cached || !isFreshVerificationResult(cached)) return null;
    try {
      return { record: recordSummary(cached), result: JSON.parse(decryptPanData(cached.encryptedResult, dataSecret)) as RcMobileNumberCheckResult, cacheHit: true };
    } catch {
      return null;
    }
  }

  private async markFailed(id: string, error: RcMobileNumberCheckError, messageCode: string | null = null) {
    try {
      await this.record.update({ where: { id }, data: { status: RC_MOBILE_NUMBER_CHECK_STATUS.FAILED, safeMessage: error.message, messageCode, completedAt: new Date() } });
    } catch {
      // Preserve the safe provider error when history persistence itself fails.
    }
  }

  private async writeAudit(actorUserId: string, action: string, entityId: string, afterJson: Record<string, unknown>) {
    if (!this.audit) return;
    try {
      await this.audit.create({ data: { actorUserId, entityType: 'RC_MOBILE_NUMBER_CHECK', entityId, action, afterJson } });
    } catch {
      // Audit failure must not expose sensitive values or block a successful check.
    }
  }

  private async run(input: { rcNumber: string; mobileNumber: string }, requestedById: string, requestFingerprint: string) {
    const runtime = await this.getRuntime();
    const maskedRcNumber = maskRcNumber(input.rcNumber);
    const maskedMobileNumber = maskMobileNumber(input.mobileNumber);
    const cached = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret);
    if (cached) return cached;
    await this.ensureNoRecentDuplicate(requestFingerprint);

    const existing = await this.record.findFirst({ where: { requestFingerprint }, orderBy: { completedAt: 'desc' } });
    const pendingData = {
      status: RC_MOBILE_NUMBER_CHECK_STATUS.PENDING,
      maskedRcNumber,
      maskedMobileNumber,
      requestFingerprint,
      isMobileNumberMatch: null,
      requestedById,
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
        if (raceWinner.status === RC_MOBILE_NUMBER_CHECK_STATUS.SUCCESS) {
          const racedCache = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret);
          if (racedCache) return racedCache;
        }
        if (raceWinner.status === RC_MOBILE_NUMBER_CHECK_STATUS.PENDING) throw operationError('This RC Mobile Number Check is already in progress. Please wait a moment.', 409, 'check_in_progress');
        pending = await this.record.update({ where: { id: raceWinner.id }, data: pendingData });
      }
    }
    await this.writeAudit(requestedById, 'RC_MOBILE_NUMBER_CHECK_REQUESTED', pending.id, { maskedRcNumber, maskedMobileNumber, status: RC_MOBILE_NUMBER_CHECK_STATUS.PENDING });

    try {
      const billing = this.billing
        ? await this.billing.chargeForProviderCall({
            serviceKey: 'RC_MOBILE_NUMBER_CHECK',
            verificationRecordId: pending.id,
            requestedById,
          })
        : undefined;
      const body = await runtime.provider.checkRcMobileNumber({ rc_number: input.rcNumber, mobile_number: input.mobileNumber });
      const { response, data } = ensureProviderData(body);
      const normalized = normalizeRcMobileNumberCheckResult(data, input);
      const encryptedResult = encryptPanData(JSON.stringify(normalized), runtime.dataSecret);
      const completed = await this.record.update({
        where: { id: pending.id },
        data: {
          status: RC_MOBILE_NUMBER_CHECK_STATUS.SUCCESS,
          isMobileNumberMatch: normalized.isMobileNumberMatch,
          providerClientId: typeof normalized.providerClientId === 'string' ? normalized.providerClientId : null,
          messageCode: typeof response.message_code === 'string' ? response.message_code : null,
          encryptedResult,
          completedAt: new Date(),
        },
        include: { requestedBy: { select: { id: true, name: true, email: true } } },
      });
      await this.writeAudit(requestedById, 'RC_MOBILE_NUMBER_CHECK_SUCCEEDED', pending.id, { maskedRcNumber, maskedMobileNumber, isMobileNumberMatch: normalized.isMobileNumberMatch, status: RC_MOBILE_NUMBER_CHECK_STATUS.SUCCESS });
      return { record: recordSummary(completed), result: normalized, cacheHit: false, ...(billing ? { billing } : {}) };
    } catch (error) {
      const normalizedError = isApiWalletBillingError(error)
        ? new RcMobileNumberCheckError(error.message, error.statusCode, error.code)
        : error instanceof SurepassProviderError
        ? providerFailure(error)
        : error instanceof RcMobileNumberCheckError
          ? error
          : new RcMobileNumberCheckError('RC Mobile Number Check could not be completed.', 502, 'check_failed');
      await this.markFailed(pending.id, normalizedError, error instanceof SurepassProviderError ? error.messageCode : null);
      await this.writeAudit(requestedById, 'RC_MOBILE_NUMBER_CHECK_FAILED', pending.id, { maskedRcNumber, maskedMobileNumber, status: RC_MOBILE_NUMBER_CHECK_STATUS.FAILED, code: normalizedError.code });
      throw normalizedError;
    }
  }

  async checkRcMobileNumber(input: RcMobileNumberCheckInput, requestedById: string) {
    const normalized = normalizeRcMobileNumberCheck(input);
    const validationError = validateRcMobileNumberCheck(input);
    if (validationError) throw operationError(validationError);
    return this.run(normalized, requestedById, createVerificationFingerprint('RC_MOBILE_NUMBER_CHECK', { rc_number: normalized.rcNumber, mobile_number: normalized.mobileNumber }));
  }

  async listHistory(filters: { page?: unknown; limit?: unknown; status?: unknown; search?: unknown }) {
    const parsedPage = Number.parseInt(String(filters.page ?? '1'), 10);
    const parsedLimit = Number.parseInt(String(filters.limit ?? '20'), 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10_000) : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const status = typeof filters.status === 'string' && Object.values(RC_MOBILE_NUMBER_CHECK_STATUS).includes(filters.status as typeof RC_MOBILE_NUMBER_CHECK_STATUS[keyof typeof RC_MOBILE_NUMBER_CHECK_STATUS])
      ? filters.status as typeof RC_MOBILE_NUMBER_CHECK_STATUS[keyof typeof RC_MOBILE_NUMBER_CHECK_STATUS]
      : undefined;
    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 50) : '';
    const where = { ...(status ? { status } : {}), ...(search ? { OR: [{ maskedRcNumber: { contains: search, mode: 'insensitive' } }, { maskedMobileNumber: { contains: search, mode: 'insensitive' } }] } : {}) };
    const [total, records] = await Promise.all([
      this.record.count({ where }),
      this.record.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { requestedBy: { select: { id: true, name: true, email: true } } } }),
    ]);
    return { records: records.map(recordSummary), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getHistoryDetail(id: string) {
    const record = await this.record.findUnique({ where: { id }, include: { requestedBy: { select: { id: true, name: true, email: true } } } });
    if (!record) throw new RcMobileNumberCheckError('RC Mobile Number Check history record not found.', 404, 'record_not_found');
    let result: RcMobileNumberCheckResult | null = null;
    if (record.status === RC_MOBILE_NUMBER_CHECK_STATUS.SUCCESS && record.encryptedResult) {
      try {
        const runtime = this.dataSecret ? null : await getPanVerificationRuntimeConfig();
        const secret = this.dataSecret || runtime?.dataSecret;
        if (!secret) throw new Error('Missing data secret');
        result = JSON.parse(decryptPanData(record.encryptedResult, secret)) as RcMobileNumberCheckResult;
      } catch {
        throw new RcMobileNumberCheckError('The stored RC Mobile Number Check result is unavailable.', 500, 'stored_result_unavailable');
      }
    }
    return { record: recordSummary(record), result };
  }
}

export const rcMobileNumberCheckService = new RcMobileNumberCheckService();
