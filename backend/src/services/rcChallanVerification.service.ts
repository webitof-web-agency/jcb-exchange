import crypto from 'node:crypto';

import prisma from '../lib/prisma';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import { getPanVerificationRuntimeConfig } from './panVerificationSettings.service';
import {
  normalizeRcChallanRequest,
  validateRcChallanRequest,
  type RcChallanRequest,
} from './rcChallanVerification.validation';
import {
  createSurepassClient,
  SurepassProviderError,
  type SurepassErrorKind,
} from './surepassClient';
import {
  createVerificationFingerprint,
  isFreshVerificationResult,
} from './verificationCache';
import {
  apiWalletBillingService,
  isApiWalletBillingError,
  type ApiBillingGateway,
} from './apiWalletBilling.service';

const RC_CHALLAN_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

type RcChallanRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

type RcChallanAuditRepository = { create: (args: any) => Promise<any> };

type RcChallanVerificationDependencies = {
  record?: RcChallanRecordRepository;
  audit?: RcChallanAuditRepository;
  provider?: ReturnType<typeof createSurepassClient>;
  dataSecret?: string;
  baseUrl?: string;
  billing?: ApiBillingGateway;
};

export class RcChallanVerificationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'RcChallanVerificationError';
  }
}

const objectValue = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const safeText = (value: unknown, maxLength = 500) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

const safeNumber = (value: unknown) => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000_000 ? parsed : null;
};

const safeInteger = (value: unknown) => {
  const parsed = safeNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};

const safeStructuredValue = (value: unknown, depth = 0): unknown => {
  if (depth > 5 || value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim().slice(0, 500) || null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => safeStructuredValue(item, depth + 1))
      .filter((item) => item !== null);
  }

  const object = objectValue(value);
  if (!object) return null;
  return Object.fromEntries(
    Object.entries(object)
      .slice(0, 50)
      .map(([key, item]) => [key.slice(0, 100), safeStructuredValue(item, depth + 1)])
      .filter(([, item]) => item !== null),
  );
};

const safeStructuredObject = (value: unknown): Record<string, unknown> =>
  objectValue(safeStructuredValue(value)) || {};

export type RcChallanOffense = {
  offenseName: string | null;
  providerData: Record<string, unknown>;
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
  offenseDetailsList: RcChallanOffense[];
  challanDateTime: string | null;
  courtName: string | null;
  providerData: Record<string, unknown>;
};

export type RcChallanSummary = {
  totalChallans: number;
  totalReturnedAmount: number;
  knownPendingCount: number;
  knownPendingAmount: number;
  courtChallanCount: number;
  blacklistCount: number;
};

export type RcChallanProviderResult = {
  providerClientId: string | null;
  rcNumber: string | null;
  providerResponse: {
    statusCode: number | null;
    success: boolean | null;
    message: string | null;
    messageCode: string | null;
  };
  providerData: Record<string, unknown>;
  challans: RcChallanRecord[];
  blacklist: unknown[];
  summary: RcChallanSummary;
};

const normalizeChallan = (value: unknown, index: number): RcChallanRecord | null => {
  const data = objectValue(value);
  if (!data) return null;

  const offenseDetailsValue = data.offense_details_list ?? data.offenseDetailsList;
  const offenseDetailsList = Array.isArray(offenseDetailsValue)
    ? offenseDetailsValue.map((item): RcChallanOffense => {
      const offense = objectValue(item);
      return {
        offenseName: safeText(
          offense?.offense_name
          ?? offense?.offenseName
          ?? (typeof item === 'string' ? item : null),
          500,
        ),
        providerData: safeStructuredObject(item),
      };
    })
    : [];

  const record = {
    number: safeInteger(data.number),
    challanNumber: safeText(data.challan_number ?? data.challanNumber, 100),
    offenseDetails: safeText(data.offense_details ?? data.offenseDetails, 1_000),
    challanPlace: safeText(data.challan_place ?? data.challanPlace, 250),
    challanDate: safeText(data.challan_date ?? data.challanDate, 50),
    state: safeText(data.state, 50),
    rto: safeText(data.rto, 250),
    upstreamCode: safeText(data.upstream_code ?? data.upstreamCode, 100),
    accusedName: safeText(data.accused_name ?? data.accusedName, 250),
    amount: safeNumber(data.amount),
    challanStatus: safeText(data.challan_status ?? data.challanStatus, 100),
    courtChallan: typeof data.court_challan === 'boolean'
      ? data.court_challan
      : typeof data.courtChallan === 'boolean'
        ? data.courtChallan
        : null,
    offenseDetailsList,
    challanDateTime: safeText(data.challan_date_time ?? data.challanDateTime, 80),
    courtName: safeText(data.court_name ?? data.courtName, 250),
    providerData: safeStructuredObject(data),
  } satisfies Omit<RcChallanRecord, 'recordKey'>;

  const recordKey = crypto
    .createHash('sha256')
    .update(JSON.stringify({ index, ...record }))
    .digest('hex')
    .slice(0, 24);

  return { recordKey, ...record };
};

export const normalizeRcChallanProviderResult = (value: unknown, responseValue?: unknown): RcChallanProviderResult => {
  const data = objectValue(value) || {};
  const detailsValue = data.challan_details ?? data.challanDetails;
  const details = objectValue(detailsValue);
  const challanValues = Array.isArray(detailsValue)
    ? detailsValue
    : details && Array.isArray(details.challans)
      ? details.challans
      : [];
  const challans = challanValues
    .map(normalizeChallan)
    .filter((item): item is RcChallanRecord => item !== null);
  const blacklistValues = details && Array.isArray(details.blacklist) ? details.blacklist : [];
  const blacklist = blacklistValues
    .map((item) => safeStructuredValue(item))
    .filter((item) => item !== null);
  const providerResponse = objectValue(responseValue);

  const totalReturnedAmount = challans.reduce((total, challan) => total + (challan.amount ?? 0), 0);
  const pendingChallans = challans.filter((challan) => challan.challanStatus?.trim().toLowerCase() === 'pending');
  const knownPendingAmount = pendingChallans.reduce((total, challan) => total + (challan.amount ?? 0), 0);

  return {
    providerClientId: safeText(data.client_id ?? data.clientId, 150),
    rcNumber: safeText(data.rc_number ?? data.rcNumber, 50),
    providerResponse: {
      statusCode: safeInteger(providerResponse?.status_code ?? providerResponse?.statusCode),
      success: typeof providerResponse?.success === 'boolean' ? providerResponse.success : null,
      message: safeText(providerResponse?.message, 500),
      messageCode: safeText(providerResponse?.message_code ?? providerResponse?.messageCode, 150),
    },
    providerData: safeStructuredObject(data),
    challans,
    blacklist,
    summary: {
      totalChallans: challans.length,
      totalReturnedAmount,
      knownPendingCount: pendingChallans.length,
      knownPendingAmount,
      courtChallanCount: challans.filter((challan) => challan.courtChallan === true).length,
      blacklistCount: blacklist.length,
    },
  };
};

const recordSummary = (record: any) => ({
  id: record.id,
  status: record.status,
  maskedRcNumber: record.maskedRcNumber,
  totalChallans: record.totalChallans ?? 0,
  knownPendingCount: record.knownPendingCount ?? 0,
  totalReturnedAmount: record.totalReturnedAmount ?? 0,
  knownPendingAmount: record.knownPendingAmount ?? 0,
  courtChallanCount: record.courtChallanCount ?? 0,
  blacklistCount: record.blacklistCount ?? 0,
  provider: record.provider,
  providerEnvironment: record.providerEnvironment ?? null,
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
    INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'Surepass could not verify the supplied RC challan details. Check the identifiers and try again.' },
    AUTHENTICATION: { status: 502, code: 'provider_configuration_error', message: 'Surepass provider configuration is invalid.' },
    FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'This Surepass account is not authorized for RC Challan verification.' },
    RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many RC Challan verification requests. Please try again later.' },
    PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'RC Challan verification is temporarily unavailable. Please try again later.' },
    MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'Surepass returned an invalid RC Challan response.' },
  };
  const safe = byKind[error.kind];
  return new RcChallanVerificationError(safe.message, safe.status, safe.code);
};

const operationError = (message: string, statusCode = 400, code = 'invalid_rc_challan_request') =>
  new RcChallanVerificationError(message, statusCode, code);

const providerEnvironment = (baseUrl?: string) => {
  if (!baseUrl) return 'UNKNOWN';
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (hostname.includes('sandbox')) return 'SANDBOX';
    if (hostname === 'kyc-api.surepass.io' || hostname === 'kyc-api.surepass.app') return 'PRODUCTION';
    return 'CUSTOM';
  } catch {
    return 'CUSTOM';
  }
};

const ensureProviderData = (body: unknown) => {
  const response = objectValue(body);
  const data = objectValue(response?.data);
  const details = data?.challan_details ?? data?.challanDetails;
  if (!response || !data || (!Array.isArray(details) && !objectValue(details))) {
    throw new RcChallanVerificationError('Surepass returned an invalid RC Challan response.', 502, 'provider_malformed_response');
  }
  return { response, data };
};

export class RcChallanVerificationService {
  private readonly record: RcChallanRecordRepository;
  private readonly audit: RcChallanAuditRepository | undefined;
  private readonly provider: ReturnType<typeof createSurepassClient> | undefined;
  private readonly dataSecret: string | undefined;
  private readonly baseUrl: string | undefined;
  private readonly billing: ApiBillingGateway | undefined;

  constructor(dependencies: RcChallanVerificationDependencies = {}) {
    this.record = dependencies.record || (prisma as any).rcChallanVerificationRecord;
    this.audit = dependencies.audit || (!dependencies.record ? (prisma as any).auditLog : undefined);
    this.provider = dependencies.provider;
    this.dataSecret = dependencies.dataSecret;
    this.baseUrl = dependencies.baseUrl;
    this.billing = dependencies.billing ?? (!dependencies.record ? apiWalletBillingService : undefined);
  }

  private async getRuntime() {
    if (this.provider && this.dataSecret) {
      return { provider: this.provider, dataSecret: this.dataSecret, environment: providerEnvironment(this.baseUrl) };
    }

    try {
      const config = await getPanVerificationRuntimeConfig();
      if (!config || !config.enabled || !config.baseUrl || !config.token || !config.dataSecret) {
        throw new Error('Surepass is not configured.');
      }
      return {
        provider: createSurepassClient({
          baseUrl: config.baseUrl,
          token: config.token,
          ...(config.customerId ? { customerId: config.customerId } : {}),
        }),
        dataSecret: config.dataSecret,
        environment: providerEnvironment(config.baseUrl),
      };
    } catch {
      throw new RcChallanVerificationError('Surepass RC Challan verification is not configured.', 503, 'provider_not_configured');
    }
  }

  private async ensureNoRecentDuplicate(requestFingerprint: string) {
    const existing = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: RC_CHALLAN_STATUS.PENDING,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (existing) {
      throw operationError('This RC Challan verification is already in progress. Please wait a moment.', 409, 'verification_in_progress');
    }
  }

  private async findFreshCachedResult(requestFingerprint: string, dataSecret: string) {
    const cached = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: RC_CHALLAN_STATUS.SUCCESS,
        completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        encryptedResult: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      include: { requestedBy: { select: { id: true, name: true, email: true } } },
    });
    if (!cached || !isFreshVerificationResult(cached)) return null;

    try {
      const result = JSON.parse(decryptPanData(cached.encryptedResult, dataSecret)) as RcChallanProviderResult;
      return { record: recordSummary(cached), result };
    } catch {
      return null;
    }
  }

  private async markFailed(id: string, error: RcChallanVerificationError, messageCode: string | null = null) {
    try {
      await this.record.update({
        where: { id },
        data: { status: RC_CHALLAN_STATUS.FAILED, safeMessage: error.message, messageCode, completedAt: new Date() },
      });
    } catch {
      // Preserve the safe provider error if history persistence itself fails.
    }
  }

  private async writeAudit(actorUserId: string, action: string, entityId: string, afterJson: Record<string, unknown>) {
    if (!this.audit) return;
    try {
      await this.audit.create({ data: { actorUserId, entityType: 'RC_CHALLAN_VERIFICATION', entityId, action, afterJson } });
    } catch {
      // Audit failure must not expose provider data or block the lookup.
    }
  }

  private async run(input: RcChallanRequest, requestedById: string) {
    const runtime = await this.getRuntime();
    const maskedRcNumber = `${input.rc_number.slice(0, 4)}********${input.rc_number.slice(-4)}`;
    const requestFingerprint = createVerificationFingerprint('RC_CHALLAN', input);

    const cached = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret);
    if (cached) {
      await this.writeAudit(requestedById, 'RC_CHALLAN_VERIFICATION_CACHE_HIT', cached.record.id, {
        maskedRcNumber,
        status: RC_CHALLAN_STATUS.SUCCESS,
        cacheTtlHours: 24,
      });
      return cached;
    }

    await this.ensureNoRecentDuplicate(requestFingerprint);
    const existing = await this.record.findFirst({
      where: { requestFingerprint },
      orderBy: { completedAt: 'desc' },
    });
    const pending = existing
      ? await this.record.update({
          where: { id: existing.id },
          data: {
            status: RC_CHALLAN_STATUS.PENDING,
            maskedRcNumber,
            requestFingerprint,
            requestedById,
            providerEnvironment: runtime.environment,
            createdAt: new Date(),
            safeMessage: null,
            messageCode: null,
            encryptedResult: null,
            completedAt: null,
          },
        })
      : await this.record.create({
          data: {
            status: RC_CHALLAN_STATUS.PENDING,
            maskedRcNumber,
            requestFingerprint,
            requestedById,
            providerEnvironment: runtime.environment,
          },
        });
    await this.writeAudit(requestedById, 'RC_CHALLAN_VERIFICATION_REQUESTED', pending.id, {
      maskedRcNumber,
      status: RC_CHALLAN_STATUS.PENDING,
      providerEnvironment: runtime.environment,
    });

    try {
      const billing = this.billing
        ? await this.billing.chargeForProviderCall({
            serviceKey: 'RC_CHALLAN',
            verificationRecordId: pending.id,
            requestedById,
          })
        : undefined;
      const body = await runtime.provider.verifyRcChallan(input);
      const { response, data } = ensureProviderData(body);
      const normalized = normalizeRcChallanProviderResult(data, response);
      const encryptedResult = encryptPanData(JSON.stringify(normalized), runtime.dataSecret);
      const completed = await this.record.update({
        where: { id: pending.id },
        data: {
          status: RC_CHALLAN_STATUS.SUCCESS,
          totalChallans: normalized.summary.totalChallans,
          knownPendingCount: normalized.summary.knownPendingCount,
          totalReturnedAmount: normalized.summary.totalReturnedAmount,
          knownPendingAmount: normalized.summary.knownPendingAmount,
          courtChallanCount: normalized.summary.courtChallanCount,
          blacklistCount: normalized.summary.blacklistCount,
          providerClientId: normalized.providerClientId,
          messageCode: typeof response.message_code === 'string' ? response.message_code : null,
          encryptedResult,
          completedAt: new Date(),
        },
        include: { requestedBy: { select: { id: true, name: true, email: true } } },
      });
      await this.writeAudit(requestedById, 'RC_CHALLAN_VERIFICATION_SUCCEEDED', pending.id, {
        maskedRcNumber,
        status: RC_CHALLAN_STATUS.SUCCESS,
        totalChallans: normalized.summary.totalChallans,
        knownPendingCount: normalized.summary.knownPendingCount,
      });
      return { record: recordSummary(completed), result: normalized, cacheHit: false, ...(billing ? { billing } : {}) };
    } catch (error) {
      const normalizedError = isApiWalletBillingError(error)
        ? new RcChallanVerificationError(error.message, error.statusCode, error.code)
        : error instanceof SurepassProviderError
        ? providerFailure(error)
        : error instanceof RcChallanVerificationError
          ? error
          : new RcChallanVerificationError('RC Challan verification could not be completed.', 502, 'verification_failed');
      await this.markFailed(pending.id, normalizedError, error instanceof SurepassProviderError ? error.messageCode : null);
      await this.writeAudit(requestedById, 'RC_CHALLAN_VERIFICATION_FAILED', pending.id, {
        maskedRcNumber,
        status: RC_CHALLAN_STATUS.FAILED,
        code: normalizedError.code,
      });
      throw normalizedError;
    }
  }

  async verifyRcChallan(input: Record<string, unknown>, requestedById: string) {
    const normalized = normalizeRcChallanRequest(input);
    const error = validateRcChallanRequest(input);
    if (error) throw operationError(error);
    return this.run(normalized, requestedById);
  }

  async listHistory(filters: { page?: unknown; limit?: unknown; search?: unknown }) {
    const parsedPage = Number.parseInt(String(filters.page ?? '1'), 10);
    const parsedLimit = Number.parseInt(String(filters.limit ?? '20'), 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10_000) : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 50) : '';
    const where = search ? { maskedRcNumber: { contains: search, mode: 'insensitive' } } : {};
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
    if (!record) throw new RcChallanVerificationError('RC Challan verification record not found.', 404, 'record_not_found');

    let result: RcChallanProviderResult | null = null;
    if (record.status === RC_CHALLAN_STATUS.SUCCESS && record.encryptedResult) {
      try {
        const runtime = this.dataSecret ? null : await getPanVerificationRuntimeConfig();
        const secret = this.dataSecret || runtime?.dataSecret;
        if (!secret) throw new Error('Missing data secret');
        result = JSON.parse(decryptPanData(record.encryptedResult, secret)) as RcChallanProviderResult;
      } catch {
        throw new RcChallanVerificationError('The stored RC Challan result is unavailable.', 500, 'stored_result_unavailable');
      }
    }
    return { record: recordSummary(record), result };
  }
}

export const rcChallanVerificationService = new RcChallanVerificationService();
