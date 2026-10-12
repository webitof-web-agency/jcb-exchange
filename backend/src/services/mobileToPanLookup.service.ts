import prisma from '../lib/prisma';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import { getPanVerificationRuntimeConfig } from './panVerificationSettings.service';
import { maskPan, normalizePan, validatePan } from './panVerification.validation';
import {
  normalizeMobileNumber,
  normalizeMobileToPanName,
  validateMobileNumber,
  validateMobileToPanName,
} from './mobileToPanLookup.validation';
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

const MOBILE_TO_PAN_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

type MobileToPanRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

type MobileToPanAuditRepository = { create: (args: any) => Promise<any> };

type MobileToPanDependencies = {
  record?: MobileToPanRecordRepository;
  audit?: MobileToPanAuditRepository;
  provider?: ReturnType<typeof createSurepassClient>;
  dataSecret?: string;
  billing?: ApiBillingGateway;
};

export class MobileToPanLookupError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MobileToPanLookupError';
  }
}

const safeText = (value: unknown, maxLength = 500) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001F\u007F]/.test(normalized)) return null;
  return normalized;
};

const objectValue = (value: unknown) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

export const maskMobileToPanName = (value: string) => normalizeMobileToPanName(value)
  .split(' ')
  .filter(Boolean)
  .map((part) => {
    if (part.length <= 2) return `${part.charAt(0)}*`;
    return `${part.charAt(0)}${'*'.repeat(part.length - 2)}${part.slice(-1)}`;
  })
  .join(' ') || '***';

export const normalizeMobileToPanResult = (
  value: unknown,
  fallback: { name: string; mobileNumber: string },
) => {
  const data = objectValue(value) || {};
  const name = normalizeMobileToPanName(data.name ?? data.full_name) || fallback.name;
  const mobileNumber = normalizeMobileNumber(data.mobile_no ?? data.mobile_number) || fallback.mobileNumber;
  const panNumber = normalizePan(data.pan_number ?? data.pan);
  const panValidation = validatePan(panNumber);
  if (!panValidation.valid) {
    throw new MobileToPanLookupError('Mobile To PAN provider returned an invalid PAN.', 502, 'provider_malformed_response');
  }

  const providerClientId = safeText(data.client_id ?? data.clientId, 150);
  return {
    name,
    mobileNumber,
    panNumber: maskPan(panNumber),
    ...(providerClientId ? { providerClientId } : {}),
  };
};

const recordSummary = (record: any) => ({
  id: record.id,
  status: record.status,
  maskedName: record.maskedName,
  maskedMobileNumber: record.maskedMobileNumber,
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
    INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'Mobile To PAN details could not be matched. Please check the name and mobile number.' },
    AUTHENTICATION: { status: 502, code: 'provider_configuration_error', message: 'Mobile To PAN provider configuration is invalid.' },
    FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'Mobile To PAN provider access is not available.' },
    RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many Mobile To PAN requests. Please try again later.' },
    PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'Mobile To PAN is temporarily unavailable. Please try again later.' },
    MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'Mobile To PAN provider returned an invalid response.' },
  };
  const safe = byKind[error.kind];
  return new MobileToPanLookupError(safe.message, safe.status, safe.code);
};

const operationError = (message: string, statusCode = 400, code = 'invalid_mobile_to_pan_request') => (
  new MobileToPanLookupError(message, statusCode, code)
);

const isUniqueConstraintError = (error: unknown) => Boolean(
  error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002',
);

const ensureProviderData = (body: unknown) => {
  const response = objectValue(body);
  const data = objectValue(response?.data);
  if (!response || !data) {
    throw new MobileToPanLookupError('Mobile To PAN provider returned an invalid response.', 502, 'provider_malformed_response');
  }
  return { response, data };
};

export class MobileToPanLookupService {
  private readonly record: MobileToPanRecordRepository;
  private readonly audit: MobileToPanAuditRepository | undefined;
  private readonly provider: ReturnType<typeof createSurepassClient> | undefined;
  private readonly dataSecret: string | undefined;
  private readonly billing: ApiBillingGateway | undefined;

  constructor(dependencies: MobileToPanDependencies = {}) {
    this.record = dependencies.record || (prisma as any).mobileToPanLookupRecord;
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
        throw new Error('Mobile To PAN is not configured.');
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
      throw new MobileToPanLookupError('Mobile To PAN provider is not configured.', 503, 'provider_not_configured');
    }
  }

  private async ensureNoRecentDuplicate(requestFingerprint: string) {
    const existing = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: MOBILE_TO_PAN_STATUS.PENDING,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (existing) {
      throw operationError('This Mobile To PAN lookup is already in progress. Please wait a moment.', 409, 'lookup_in_progress');
    }
  }

  private async findFreshCachedResult(requestFingerprint: string, dataSecret: string) {
    const cached = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: MOBILE_TO_PAN_STATUS.SUCCESS,
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
        result: JSON.parse(decryptPanData(cached.encryptedResult, dataSecret)),
        cacheHit: true,
      };
    } catch {
      return null;
    }
  }

  private async markFailed(id: string, error: MobileToPanLookupError, messageCode: string | null = null) {
    try {
      await this.record.update({
        where: { id },
        data: { status: MOBILE_TO_PAN_STATUS.FAILED, safeMessage: error.message, messageCode, completedAt: new Date() },
      });
    } catch {
      // Preserve the safe provider error when history persistence itself fails.
    }
  }

  private async writeAudit(actorUserId: string, action: string, entityId: string, afterJson: Record<string, unknown>) {
    if (!this.audit) return;
    try {
      await this.audit.create({ data: { actorUserId, entityType: 'MOBILE_TO_PAN_LOOKUP', entityId, action, afterJson } });
    } catch {
      // Audit failure must not expose PII or block a successful lookup.
    }
  }

  private async run(input: { name: string; mobileNumber: string }, requestedById: string, requestFingerprint: string) {
    const runtime = await this.getRuntime();
    const maskedName = maskMobileToPanName(input.name);
    const maskedMobileNumber = `${'*'.repeat(6)}${input.mobileNumber.slice(-4)}`;
    const cached = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret);
    if (cached) return cached;
    await this.ensureNoRecentDuplicate(requestFingerprint);

    const existing = await this.record.findFirst({ where: { requestFingerprint }, orderBy: { completedAt: 'desc' } });
    const pendingData = {
      status: MOBILE_TO_PAN_STATUS.PENDING,
      maskedName,
      maskedMobileNumber,
      requestFingerprint,
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
        if (raceWinner.status === MOBILE_TO_PAN_STATUS.SUCCESS) {
          const racedCache = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret);
          if (racedCache) return racedCache;
        }
        if (raceWinner.status === MOBILE_TO_PAN_STATUS.PENDING) {
          throw operationError('This Mobile To PAN lookup is already in progress. Please wait a moment.', 409, 'lookup_in_progress');
        }
        pending = await this.record.update({ where: { id: raceWinner.id }, data: pendingData });
      }
    }

    await this.writeAudit(requestedById, 'MOBILE_TO_PAN_LOOKUP_REQUESTED', pending.id, {
      maskedName,
      maskedMobileNumber,
      status: MOBILE_TO_PAN_STATUS.PENDING,
    });

    try {
      const billing = this.billing
        ? await this.billing.chargeForProviderCall({
            serviceKey: 'MOBILE_TO_PAN',
            verificationRecordId: pending.id,
            requestedById,
          })
        : undefined;
      const body = await runtime.provider.getPanByMobile({ name: input.name, mobile_no: input.mobileNumber });
      const { response, data } = ensureProviderData(body);
      const normalized = normalizeMobileToPanResult(data, input);
      const encryptedResult = encryptPanData(JSON.stringify(normalized), runtime.dataSecret);
      const completed = await this.record.update({
        where: { id: pending.id },
        data: {
          status: MOBILE_TO_PAN_STATUS.SUCCESS,
          providerClientId: typeof normalized.providerClientId === 'string' ? normalized.providerClientId : null,
          messageCode: typeof response.message_code === 'string' ? response.message_code : null,
          encryptedResult,
          completedAt: new Date(),
        },
        include: { requestedBy: { select: { id: true, name: true, email: true } } },
      });
      await this.writeAudit(requestedById, 'MOBILE_TO_PAN_LOOKUP_SUCCEEDED', pending.id, {
        maskedName,
        maskedMobileNumber,
        status: MOBILE_TO_PAN_STATUS.SUCCESS,
      });
      return { record: recordSummary(completed), result: normalized, cacheHit: false, ...(billing ? { billing } : {}) };
    } catch (error) {
      const normalizedError = isApiWalletBillingError(error)
        ? new MobileToPanLookupError(error.message, error.statusCode, error.code)
        : error instanceof SurepassProviderError
        ? providerFailure(error)
        : error instanceof MobileToPanLookupError
          ? error
          : new MobileToPanLookupError('Mobile To PAN lookup could not be completed.', 502, 'lookup_failed');
      await this.markFailed(pending.id, normalizedError, error instanceof SurepassProviderError ? error.messageCode : null);
      await this.writeAudit(requestedById, 'MOBILE_TO_PAN_LOOKUP_FAILED', pending.id, {
        maskedName,
        maskedMobileNumber,
        status: MOBILE_TO_PAN_STATUS.FAILED,
        code: normalizedError.code,
      });
      throw normalizedError;
    }
  }

  async lookupMobileToPan(input: Record<string, unknown>, requestedById: string) {
    const name = normalizeMobileToPanName(input.name ?? input.full_name ?? input.fullName);
    const mobileNumber = normalizeMobileNumber(input.mobile_no ?? input.mobile_number ?? input.mobileNumber);
    const nameError = validateMobileToPanName(name);
    if (nameError) throw operationError(nameError);
    const mobileError = validateMobileNumber(mobileNumber);
    if (mobileError) throw operationError(mobileError);
    return this.run(
      { name, mobileNumber },
      requestedById,
      createVerificationFingerprint('MOBILE_TO_PAN', { name: name.toLowerCase(), mobile_no: mobileNumber }),
    );
  }

  async listHistory(filters: { page?: unknown; limit?: unknown; status?: unknown; search?: unknown }) {
    const parsedPage = Number.parseInt(String(filters.page ?? '1'), 10);
    const parsedLimit = Number.parseInt(String(filters.limit ?? '20'), 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10_000) : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const status = typeof filters.status === 'string' && Object.values(MOBILE_TO_PAN_STATUS).includes(filters.status as typeof MOBILE_TO_PAN_STATUS[keyof typeof MOBILE_TO_PAN_STATUS])
      ? filters.status as typeof MOBILE_TO_PAN_STATUS[keyof typeof MOBILE_TO_PAN_STATUS]
      : undefined;
    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 50) : '';
    const where = {
      ...(status ? { status } : {}),
      ...(search ? { OR: [{ maskedName: { contains: search, mode: 'insensitive' } }, { maskedMobileNumber: { contains: search, mode: 'insensitive' } }] } : {}),
    };
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
    if (!record) throw new MobileToPanLookupError('Mobile To PAN history record not found.', 404, 'record_not_found');
    let result: unknown = null;
    if (record.status === MOBILE_TO_PAN_STATUS.SUCCESS && record.encryptedResult) {
      try {
        const runtime = this.dataSecret ? null : await getPanVerificationRuntimeConfig();
        const secret = this.dataSecret || runtime?.dataSecret;
        if (!secret) throw new Error('Missing data secret');
        result = JSON.parse(decryptPanData(record.encryptedResult, secret));
      } catch {
        throw new MobileToPanLookupError('The stored Mobile To PAN result is unavailable.', 500, 'stored_result_unavailable');
      }
    }
    return { record: recordSummary(record), result };
  }
}

export const mobileToPanLookupService = new MobileToPanLookupService();
