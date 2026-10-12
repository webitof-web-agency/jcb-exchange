import prisma from '../lib/prisma';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import { getPanVerificationRuntimeConfig } from './panVerificationSettings.service';
import {
  normalizeDateOfBirth,
  normalizeDrivingLicenseNumber,
  validateDateOfBirth,
  validateDrivingLicenseNumber,
} from './drivingLicenseVerification.validation';
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

const DL_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

type DrivingLicenseRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

type DrivingLicenseAuditRepository = { create: (args: any) => Promise<any> };

type DrivingLicenseVerificationDependencies = {
  record?: DrivingLicenseRecordRepository;
  audit?: DrivingLicenseAuditRepository;
  provider?: ReturnType<typeof createSurepassClient>;
  dataSecret?: string;
  billing?: ApiBillingGateway;
};

export class DrivingLicenseVerificationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'DrivingLicenseVerificationError';
  }
}

const safeText = (value: unknown, maxLength = 500) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

const objectValue = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const safeStructuredValue = (value: unknown, depth = 0): unknown => {
  if (depth > 3 || value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const normalized = value.trim().slice(0, 500);
    return normalized || null;
  }
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

const safeStringArray = (value: unknown) => Array.isArray(value)
  ? value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 50)
  : [];

const safeStructuredArray = (value: unknown) => Array.isArray(value)
  ? value.map((item) => safeStructuredValue(item)).filter((item) => item !== null).slice(0, 50)
  : [];

const safeProviderDate = (value: unknown, transport = false) => {
  const date = safeText(value, 30);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (transport && date === '1800-01-01') return null;
  return date;
};

export const maskDrivingLicenseNumber = (value: string) => {
  const normalized = normalizeDrivingLicenseNumber(value);
  if (normalized.length < 8) return '********';
  return `${normalized.slice(0, 4)}********${normalized.slice(-4)}`;
};

export type DrivingLicenseVerificationResult = Record<string, unknown>;

export const normalizeDrivingLicenseVerificationResult = (value: unknown): DrivingLicenseVerificationResult => {
  const data = objectValue(value) || {};
  const result: DrivingLicenseVerificationResult = {};
  const textFields: Array<[string, unknown, number?]> = [
    ['licenseNumber', data.license_number ?? data.licenseNumber, 80],
    ['providerClientId', data.client_id ?? data.clientId, 150],
    ['state', data.state, 150],
    ['name', data.name, 250],
    ['permanentAddress', data.permanent_address ?? data.permanentAddress, 1000],
    ['permanentZip', data.permanent_zip ?? data.permanentZip, 20],
    ['cityName', data.city_name ?? data.cityName, 150],
    ['temporaryAddress', data.temporary_address ?? data.temporaryAddress, 1000],
    ['temporaryZip', data.temporary_zip ?? data.temporaryZip, 20],
    ['citizenship', data.citizenship, 100],
    ['issuingAuthority', data.ola_name ?? data.issuingAuthority, 250],
    ['issuingAuthorityCode', data.ola_code ?? data.issuingAuthorityCode, 80],
    ['gender', data.gender, 50],
    ['fatherOrHusbandName', data.father_or_husband_name ?? data.fatherOrHusbandName, 250],
    ['bloodGroup', data.blood_group ?? data.bloodGroup, 30],
  ];
  for (const [key, rawValue, maxLength] of textFields) {
    const normalized = safeText(rawValue, maxLength);
    if (normalized) result[key] = normalized;
  }

  const dateFields: Array<[string, unknown, boolean?]> = [
    ['dob', data.dob, false],
    ['originalIssueDate', data.initial_doi ?? data.initialDoi, false],
    ['issueDate', data.doi ?? data.issueDate, false],
    ['expiryDate', data.doe ?? data.expiryDate, false],
    ['transportIssueDate', data.transport_doi ?? data.transportDoi, true],
    ['transportExpiryDate', data.transport_doe ?? data.transportDoe, true],
  ];
  for (const [key, rawValue, transport] of dateFields) {
    const normalized = safeProviderDate(rawValue, transport);
    if (normalized) result[key] = normalized;
  }

  if ('current_status' in data || 'currentStatus' in data) {
    result.currentStatus = safeText(data.current_status ?? data.currentStatus, 100);
  }
  if (typeof data.less_info === 'boolean' || typeof data.lessInfo === 'boolean') {
    result.lessInfo = data.less_info ?? data.lessInfo;
  }
  if ('has_image' in data || 'hasImage' in data) {
    result.hasImage = data.has_image === true || data.hasImage === true;
  }

  const arrays: Array<[string, unknown]> = [
    ['vehicleClasses', data.vehicle_classes ?? data.vehicleClasses],
    ['vehicleClassDescriptions', data.vehicle_class_description ?? data.vehicleClassDescriptions],
    ['badgeNumbers', data.badge_number ?? data.badgeNumbers],
    ['additionalChecks', data.additional_check ?? data.additionalChecks],
  ];
  for (const [key, rawValue] of arrays) {
    if (!Array.isArray(rawValue)) continue;
    result[key] = key === 'vehicleClasses' || key === 'badgeNumbers'
      ? safeStringArray(rawValue)
      : safeStructuredArray(rawValue);
  }

  return result;
};

const normalizeProfileImage = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 5_000_000) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=_-]+$/i.test(normalized)) return normalized;
  if (/^[A-Za-z0-9+/=_-]+$/.test(normalized)) return `data:image/jpeg;base64,${normalized}`;
  return null;
};

const recordSummary = (record: any) => ({
  id: record.id,
  status: record.status,
  maskedLicenseNumber: record.maskedLicenseNumber,
  currentStatus: record.currentStatus ?? null,
  state: record.state ?? null,
  holderName: record.holderName ?? null,
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
    INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'We could not verify this driving license. Please check the license number and date of birth.' },
    AUTHENTICATION: { status: 502, code: 'provider_configuration_error', message: 'Driving license verification provider configuration is invalid.' },
    FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'Driving license verification provider access is not available.' },
    RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many driving license verification requests. Please try again later.' },
    PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'Driving license verification is temporarily unavailable. Please try again later.' },
    MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'Driving license verification provider returned an invalid response.' },
  };
  const safe = byKind[error.kind];
  return new DrivingLicenseVerificationError(safe.message, safe.status, safe.code);
};

const operationError = (message: string, statusCode = 400, code = 'invalid_driving_license_request') =>
  new DrivingLicenseVerificationError(message, statusCode, code);

const ensureProviderData = (body: unknown) => {
  const response = objectValue(body);
  const data = objectValue(response?.data);
  if (!response || !data) {
    throw new DrivingLicenseVerificationError('Driving license verification provider returned an invalid response.', 502, 'provider_malformed_response');
  }
  return { response, data };
};

export class DrivingLicenseVerificationService {
  private readonly record: DrivingLicenseRecordRepository;
  private readonly audit: DrivingLicenseAuditRepository | undefined;
  private readonly provider: ReturnType<typeof createSurepassClient> | undefined;
  private readonly dataSecret: string | undefined;
  private readonly billing: ApiBillingGateway | undefined;

  constructor(dependencies: DrivingLicenseVerificationDependencies = {}) {
    this.record = dependencies.record || (prisma as any).drivingLicenseVerificationRecord;
    this.audit = dependencies.audit || (!dependencies.record ? (prisma as any).auditLog : undefined);
    this.provider = dependencies.provider;
    this.dataSecret = dependencies.dataSecret?.trim() || undefined;
    this.billing = dependencies.billing ?? (!dependencies.record ? apiWalletBillingService : undefined);
  }

  private async getRuntime() {
    if (this.provider && this.dataSecret) return { provider: this.provider, dataSecret: this.dataSecret };
    try {
      const config = await getPanVerificationRuntimeConfig();
      if (!config || !config.enabled || !config.baseUrl || !config.token || !config.dataSecret) throw new Error('Driving license verification is not configured.');
      return {
        provider: createSurepassClient({
          baseUrl: config.baseUrl,
          token: config.token,
          ...(config.customerId ? { customerId: config.customerId } : {}),
        }),
        dataSecret: config.dataSecret,
      };
    } catch {
      throw new DrivingLicenseVerificationError('Driving license verification provider is not configured.', 503, 'provider_not_configured');
    }
  }

  private async ensureNoRecentDuplicate(requestFingerprint: string) {
    const existing = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: DL_STATUS.PENDING,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (existing) throw operationError('This driving license verification is already in progress. Please wait a moment.', 409, 'verification_in_progress');
  }

  private async findFreshCachedResult(requestFingerprint: string, dataSecret: string) {
    const cached = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: DL_STATUS.SUCCESS,
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

  private async markFailed(id: string, error: DrivingLicenseVerificationError, messageCode: string | null = null) {
    try {
      await this.record.update({
        where: { id },
        data: { status: DL_STATUS.FAILED, safeMessage: error.message, messageCode, completedAt: new Date() },
      });
    } catch {
      // Preserve the safe provider error if history persistence itself fails.
    }
  }

  private async writeAudit(actorUserId: string, action: string, entityId: string, afterJson: Record<string, unknown>) {
    if (!this.audit) return;
    try {
      await this.audit.create({ data: { actorUserId, entityType: 'DRIVING_LICENSE_VERIFICATION', entityId, action, afterJson } });
    } catch {
      // Audit failure must not expose provider data or block the verification result.
    }
  }

  private async run(licenseNumber: string, dob: string, requestedById: string, requestFingerprint: string) {
    const runtime = await this.getRuntime();
    const maskedLicenseNumber = maskDrivingLicenseNumber(licenseNumber);
    const cached = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret);
    if (cached) return cached;
    await this.ensureNoRecentDuplicate(requestFingerprint);
    const existing = await this.record.findFirst({ where: { requestFingerprint }, orderBy: { completedAt: 'desc' } });
    const pending = existing
      ? await this.record.update({
          where: { id: existing.id },
          data: {
            status: DL_STATUS.PENDING,
            maskedLicenseNumber,
            requestFingerprint,
            requestedById,
            createdAt: new Date(),
            safeMessage: null,
            messageCode: null,
            encryptedResult: null,
            completedAt: null,
          },
        })
      : await this.record.create({ data: { status: DL_STATUS.PENDING, maskedLicenseNumber, requestFingerprint, requestedById } });
    await this.writeAudit(requestedById, 'DRIVING_LICENSE_VERIFICATION_REQUESTED', pending.id, { maskedLicenseNumber, status: DL_STATUS.PENDING });

    try {
      const billing = this.billing
        ? await this.billing.chargeForProviderCall({
            serviceKey: 'DRIVING_LICENSE_VERIFICATION',
            verificationRecordId: pending.id,
            requestedById,
          })
        : undefined;
      const body = await runtime.provider.verifyDrivingLicense({ id_number: licenseNumber, dob });
      const { response, data } = ensureProviderData(body);
      const normalized = normalizeDrivingLicenseVerificationResult({ ...data, license_number: data.license_number ?? licenseNumber });
      const encryptedResult = encryptPanData(JSON.stringify(normalized), runtime.dataSecret);
      const completed = await this.record.update({
        where: { id: pending.id },
        data: {
          status: DL_STATUS.SUCCESS,
          currentStatus: typeof normalized.currentStatus === 'string' ? normalized.currentStatus : null,
          state: typeof normalized.state === 'string' ? normalized.state : null,
          holderName: typeof normalized.name === 'string' ? normalized.name : null,
          providerClientId: typeof normalized.providerClientId === 'string' ? normalized.providerClientId : null,
          messageCode: typeof response.message_code === 'string' ? response.message_code : null,
          encryptedResult,
          completedAt: new Date(),
        },
        include: { requestedBy: { select: { id: true, name: true, email: true } } },
      });
      await this.writeAudit(requestedById, 'DRIVING_LICENSE_VERIFICATION_SUCCEEDED', pending.id, {
        maskedLicenseNumber,
        status: DL_STATUS.SUCCESS,
        currentStatus: completed.currentStatus ?? null,
      });
      const profileImage = normalizeProfileImage(data.profile_image ?? data.profileImage);
      return { record: recordSummary(completed), result: profileImage ? { ...normalized, profileImage } : normalized, cacheHit: false, ...(billing ? { billing } : {}) };
    } catch (error) {
      const normalizedError = isApiWalletBillingError(error)
        ? new DrivingLicenseVerificationError(error.message, error.statusCode, error.code)
        : error instanceof SurepassProviderError
        ? providerFailure(error)
        : error instanceof DrivingLicenseVerificationError
          ? error
          : new DrivingLicenseVerificationError('Driving license verification could not be completed.', 502, 'verification_failed');
      await this.markFailed(pending.id, normalizedError, error instanceof SurepassProviderError ? error.messageCode : null);
      await this.writeAudit(requestedById, 'DRIVING_LICENSE_VERIFICATION_FAILED', pending.id, {
        maskedLicenseNumber,
        status: DL_STATUS.FAILED,
        code: normalizedError.code,
      });
      throw normalizedError;
    }
  }

  async verifyDrivingLicense(input: Record<string, unknown>, requestedById: string) {
    const licenseNumber = normalizeDrivingLicenseNumber(input.id_number ?? input.license_number ?? input.licenseNumber);
    const licenseError = validateDrivingLicenseNumber(licenseNumber);
    if (licenseError) throw operationError(licenseError);
    const dob = normalizeDateOfBirth(input.dob);
    const dobError = validateDateOfBirth(input.dob);
    if (dobError || !dob) throw operationError(dobError || 'Enter a valid date of birth.');
    return this.run(licenseNumber, dob, requestedById, createVerificationFingerprint('DRIVING_LICENSE_VERIFY', { id_number: licenseNumber, dob }));
  }

  async listHistory(filters: { page?: unknown; limit?: unknown; status?: unknown; search?: unknown }) {
    const parsedPage = Number.parseInt(String(filters.page ?? '1'), 10);
    const parsedLimit = Number.parseInt(String(filters.limit ?? '20'), 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10_000) : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const status = typeof filters.status === 'string' && Object.values(DL_STATUS).includes(filters.status as typeof DL_STATUS[keyof typeof DL_STATUS])
      ? filters.status as typeof DL_STATUS[keyof typeof DL_STATUS]
      : undefined;
    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 50) : '';
    const where = { ...(status ? { status } : {}), ...(search ? { maskedLicenseNumber: { contains: search, mode: 'insensitive' } } : {}) };
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
    if (!record) throw new DrivingLicenseVerificationError('Driving license verification record not found.', 404, 'record_not_found');
    let result: unknown = null;
    if (record.status === DL_STATUS.SUCCESS && record.encryptedResult) {
      try {
        const runtime = this.dataSecret ? null : await getPanVerificationRuntimeConfig();
        const secret = this.dataSecret || runtime?.dataSecret;
        if (!secret) throw new Error('Missing data secret');
        result = JSON.parse(decryptPanData(record.encryptedResult, secret));
      } catch {
        throw new DrivingLicenseVerificationError('The stored driving license verification result is unavailable.', 500, 'stored_result_unavailable');
      }
    }
    return { record: recordSummary(record), result };
  }
}

export const drivingLicenseVerificationService = new DrivingLicenseVerificationService();
