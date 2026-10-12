import prisma from '../lib/prisma';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import { getPanVerificationRuntimeConfig } from './panVerificationSettings.service';
import { normalizeRcOwnerHistoryResult } from './rcOwnerHistory.service';
import { normalizeChassisNumber, validateChassisNumber } from './chassisToRcVerification.validation';
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

const CHASSIS_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

type ChassisToRcRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

type ChassisToRcAuditRepository = { create: (args: any) => Promise<any> };

type ChassisToRcDependencies = {
  record?: ChassisToRcRecordRepository;
  audit?: ChassisToRcAuditRepository;
  provider?: ReturnType<typeof createSurepassClient>;
  dataSecret?: string;
  billing?: ApiBillingGateway;
};

export class ChassisToRcVerificationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ChassisToRcVerificationError';
  }
}

const safeText = (value: unknown, maxLength = 500) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

const objectValue = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export const maskChassisNumber = (value: string) => {
  const normalized = normalizeChassisNumber(value);
  if (normalized.length < 8) return '********';
  return `${normalized.slice(0, 4)}********${normalized.slice(-4)}`;
};

const recordSummary = (record: any) => ({
  id: record.id,
  status: record.status,
  maskedChassisNumber: record.maskedChassisNumber,
  rcNumber: record.rcNumber ?? null,
  ownerName: record.ownerName ?? null,
  rcStatus: record.rcStatus ?? null,
  vehicleCategory: record.vehicleCategory ?? null,
  registrationDate: record.registrationDate ?? null,
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
    INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'We could not find RC details for this chassis number. Please check it and try again.' },
    AUTHENTICATION: { status: 502, code: 'provider_configuration_error', message: 'Vehicle verification provider configuration is invalid.' },
    FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'Vehicle verification provider access is not available.' },
    RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many vehicle verification requests. Please try again later.' },
    PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'Vehicle verification is temporarily unavailable. Please try again later.' },
    MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'Vehicle verification provider returned an invalid response.' },
  };
  const safe = byKind[error.kind];
  return new ChassisToRcVerificationError(safe.message, safe.status, safe.code);
};

const operationError = (message: string, statusCode = 400, code = 'invalid_chassis_request') =>
  new ChassisToRcVerificationError(message, statusCode, code);

const isUniqueConstraintError = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002');

const ensureProviderData = (body: unknown) => {
  const response = objectValue(body);
  const data = objectValue(response?.data);
  const details = objectValue(data?.details);
  if (!response || !data || !details) {
    throw new ChassisToRcVerificationError(
      'Vehicle verification provider returned an invalid response.',
      502,
      'provider_malformed_response',
    );
  }
  return { response, data, details };
};

export class ChassisToRcVerificationService {
  private readonly record: ChassisToRcRecordRepository;
  private readonly audit: ChassisToRcAuditRepository | undefined;
  private readonly provider: ReturnType<typeof createSurepassClient> | undefined;
  private readonly dataSecret: string | undefined;
  private readonly billing: ApiBillingGateway | undefined;

  constructor(dependencies: ChassisToRcDependencies = {}) {
    this.record = dependencies.record || (prisma as any).chassisToRcVerificationRecord;
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
        throw new Error('Chassis-to-RC verification is not configured.');
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
      throw new ChassisToRcVerificationError('Vehicle verification provider is not configured.', 503, 'provider_not_configured');
    }
  }

  private async ensureNoRecentDuplicate(requestFingerprint: string) {
    const existing = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: CHASSIS_STATUS.PENDING,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (existing) {
      throw operationError('This chassis verification is already in progress. Please wait a moment.', 409, 'verification_in_progress');
    }
  }

  private async findFreshCachedResult(requestFingerprint: string, dataSecret: string, requestedById?: string) {
    const cached = await this.record.findFirst({
      where: {
        requestFingerprint,
        ...(requestedById ? { requestedById } : {}),
        status: CHASSIS_STATUS.SUCCESS,
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

  private async markFailed(id: string, error: ChassisToRcVerificationError, messageCode: string | null = null) {
    try {
      await this.record.update({
        where: { id },
        data: { status: CHASSIS_STATUS.FAILED, safeMessage: error.message, messageCode, completedAt: new Date() },
      });
    } catch {
      // Keep the safe provider error when history persistence itself fails.
    }
  }

  private async writeAudit(actorUserId: string, action: string, entityId: string, afterJson: Record<string, unknown>) {
    if (!this.audit) return;
    try {
      await this.audit.create({ data: { actorUserId, entityType: 'CHASSIS_TO_RC_VERIFICATION', entityId, action, afterJson } });
    } catch {
      // Audit failure must not expose provider data or block a successful lookup.
    }
  }

  private async run(chassisNumber: string, requestedById: string, requestFingerprint: string) {
    const runtime = await this.getRuntime();
    const maskedChassisNumber = maskChassisNumber(chassisNumber);
    const cached = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret, requestedById);
    if (cached) return cached;
    await this.ensureNoRecentDuplicate(requestFingerprint);

    const existing = await this.record.findFirst({ where: { requestFingerprint }, orderBy: { completedAt: 'desc' } });
    const pendingData = {
      status: CHASSIS_STATUS.PENDING,
      maskedChassisNumber,
      requestFingerprint,
      requestedById,
      createdAt: new Date(),
      safeMessage: null,
      messageCode: null,
      encryptedResult: null,
      completedAt: null,
    };
    let pending: any;
    if (existing) {
      pending = await this.record.update({ where: { id: existing.id }, data: pendingData });
    } else {
      try {
        pending = await this.record.create({ data: { status: CHASSIS_STATUS.PENDING, maskedChassisNumber, requestFingerprint, requestedById } });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const raceWinner = await this.record.findFirst({ where: { requestFingerprint }, orderBy: { completedAt: 'desc' } });
        if (!raceWinner) throw error;
        if (raceWinner.status === CHASSIS_STATUS.SUCCESS) {
          const racedCache = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret, requestedById);
          if (racedCache) return racedCache;
        }
        if (raceWinner.status === CHASSIS_STATUS.PENDING) {
          throw operationError('This chassis verification is already in progress. Please wait a moment.', 409, 'verification_in_progress');
        }
        pending = await this.record.update({ where: { id: raceWinner.id }, data: pendingData });
      }
    }
    await this.writeAudit(requestedById, 'CHASSIS_TO_RC_REQUESTED', pending.id, { maskedChassisNumber, status: CHASSIS_STATUS.PENDING });

    try {
      const billing = this.billing
        ? await this.billing.chargeForProviderCall({
            serviceKey: 'CHASSIS_TO_RC',
            verificationRecordId: pending.id,
            requestedById,
          })
        : undefined;
      const body = await runtime.provider.verifyChassisToRc({ chassis_number: chassisNumber });
      const { response, data, details } = ensureProviderData(body);
      const normalized = normalizeRcOwnerHistoryResult({
        ...details,
        client_id: data.client_id,
        rc_number: data.rc_number ?? details.rc_number,
        vehicle_chasi_number: data.vehicle_chasi_number ?? details.vehicle_chasi_number,
      });
      if (!Object.keys(normalized).length) {
        throw new ChassisToRcVerificationError('Vehicle verification provider returned no usable RC details.', 502, 'provider_malformed_response');
      }
      const encryptedResult = encryptPanData(JSON.stringify(normalized), runtime.dataSecret);
      const completed = await this.record.update({
        where: { id: pending.id },
        data: {
          status: CHASSIS_STATUS.SUCCESS,
          rcNumber: typeof normalized.rcNumber === 'string' ? normalized.rcNumber : null,
          ownerName: typeof normalized.ownerName === 'string' ? normalized.ownerName : null,
          rcStatus: typeof normalized.rcStatus === 'string' ? normalized.rcStatus : null,
          vehicleCategory: typeof normalized.vehicleCategory === 'string' ? normalized.vehicleCategory : null,
          registrationDate: typeof normalized.registrationDate === 'string' ? normalized.registrationDate : null,
          providerClientId: typeof normalized.providerClientId === 'string' ? normalized.providerClientId : null,
          messageCode: typeof response.message_code === 'string' ? response.message_code : null,
          encryptedResult,
          completedAt: new Date(),
        },
        include: { requestedBy: { select: { id: true, name: true, email: true } } },
      });
      await this.writeAudit(requestedById, 'CHASSIS_TO_RC_SUCCEEDED', pending.id, {
        maskedChassisNumber,
        status: CHASSIS_STATUS.SUCCESS,
        rcNumber: completed.rcNumber ?? null,
      });
      return { record: recordSummary(completed), result: normalized, cacheHit: false, ...(billing ? { billing } : {}) };
    } catch (error) {
      const normalizedError = isApiWalletBillingError(error)
        ? new ChassisToRcVerificationError(error.message, error.statusCode, error.code)
        : error instanceof SurepassProviderError
        ? providerFailure(error)
        : error instanceof ChassisToRcVerificationError
          ? error
          : new ChassisToRcVerificationError('Vehicle verification could not be completed.', 502, 'verification_failed');
      await this.markFailed(pending.id, normalizedError, error instanceof SurepassProviderError ? error.messageCode : null);
      await this.writeAudit(requestedById, 'CHASSIS_TO_RC_FAILED', pending.id, {
        maskedChassisNumber,
        status: CHASSIS_STATUS.FAILED,
        code: normalizedError.code,
      });
      throw normalizedError;
    }
  }

  async verifyChassisToRc(input: Record<string, unknown>, requestedById: string) {
    const chassisNumber = normalizeChassisNumber(input.chassis_number ?? input.chassisNumber);
    const chassisError = validateChassisNumber(chassisNumber);
    if (chassisError) throw operationError(chassisError);
    return this.run(
      chassisNumber,
      requestedById,
      createVerificationFingerprint('CHASSIS_TO_RC', { chassis_number: chassisNumber }),
    );
  }

  async listHistory(filters: { page?: unknown; limit?: unknown; status?: unknown; search?: unknown }) {
    const parsedPage = Number.parseInt(String(filters.page ?? '1'), 10);
    const parsedLimit = Number.parseInt(String(filters.limit ?? '20'), 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10_000) : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const status = typeof filters.status === 'string' && Object.values(CHASSIS_STATUS).includes(filters.status as typeof CHASSIS_STATUS[keyof typeof CHASSIS_STATUS])
      ? filters.status as typeof CHASSIS_STATUS[keyof typeof CHASSIS_STATUS]
      : undefined;
    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 50) : '';
    const where = {
      ...(status ? { status } : {}),
      ...(search ? { OR: [{ maskedChassisNumber: { contains: search, mode: 'insensitive' } }, { rcNumber: { contains: search, mode: 'insensitive' } }] } : {}),
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
    if (!record) throw new ChassisToRcVerificationError('Vehicle verification record not found.', 404, 'record_not_found');
    let result: unknown = null;
    if (record.status === CHASSIS_STATUS.SUCCESS && record.encryptedResult) {
      try {
        const runtime = this.dataSecret ? null : await getPanVerificationRuntimeConfig();
        const secret = this.dataSecret || runtime?.dataSecret;
        if (!secret) throw new Error('Missing data secret');
        result = JSON.parse(decryptPanData(record.encryptedResult, secret));
      } catch {
        throw new ChassisToRcVerificationError('The stored vehicle verification result is unavailable.', 500, 'stored_result_unavailable');
      }
    }
    return { record: recordSummary(record), result };
  }
}

export const chassisToRcVerificationService = new ChassisToRcVerificationService();
