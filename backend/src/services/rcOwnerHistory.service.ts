import { createHash } from 'node:crypto';
import prisma from '../lib/prisma';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import { getPanVerificationRuntimeConfig } from './panVerificationSettings.service';
import { normalizeRcNumber, validateRcNumber } from './rcOwnerHistory.validation';
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
  type ApiBillableServiceKey,
} from './apiWalletBilling.service';
import { cacheDriveFileBuffer, clearCachedDriveFileBuffer, deleteFileFromDrive, uploadFileToDrive } from './googleDrive.service';

const RC_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

export const RC_OWNER_HISTORY_RAW_DATA_TTL_MS = 5 * 60 * 1000;
export const RC_OWNER_HISTORY_EPHEMERAL_SESSION_TTL_MS = 15 * 60 * 1000;
export const MAX_RC_OWNER_HISTORY_TEMPLATE_SIZE = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const getRcOwnerHistoryRawDataExpiresAt = (completedAt = new Date()) =>
  new Date(completedAt.getTime() + RC_OWNER_HISTORY_RAW_DATA_TTL_MS);

export const isRcOwnerHistoryRawDataAvailable = (
  record: { encryptedResult?: unknown; rawDataExpiresAt?: unknown },
  now = Date.now(),
) => {
  if (typeof record.encryptedResult !== 'string' || !record.encryptedResult) return false;
  const expiresAt = record.rawDataExpiresAt instanceof Date
    ? record.rawDataExpiresAt.getTime()
    : new Date(String(record.rawDataExpiresAt ?? '')).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
};

type RcOwnerHistoryRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  groupBy?: (args: any) => Promise<any[]>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  updateMany?: (args: any) => Promise<{ count: number }>;
  deleteMany?: (args: any) => Promise<{ count: number }>;
};

type RcOwnerHistoryTemplateRepository = {
  create: (args: any) => Promise<any>;
  delete?: (args: any) => Promise<any>;
};

type RcOwnerHistoryTemplateUploader = (buffer: Buffer, mimeType: string, fileName: string) => Promise<{ fileId: string }>;

type RcOwnerHistoryAuditRepository = { create: (args: any) => Promise<any> };

type RcOwnerHistoryDependencies = {
  record?: RcOwnerHistoryRecordRepository;
  template?: RcOwnerHistoryTemplateRepository;
  audit?: RcOwnerHistoryAuditRepository;
  provider?: ReturnType<typeof createSurepassClient>;
  dataSecret?: string;
  billing?: ApiBillingGateway;
  serviceKey?: Extract<ApiBillableServiceKey, 'RC_OWNER_HISTORY' | 'RC_FULL'>;
  auditEntityType?: 'RC_OWNER_HISTORY' | 'RC_FULL';
  auditActionPrefix?: 'RC_OWNER_HISTORY' | 'RC_FULL';
  uploadTemplateFile?: RcOwnerHistoryTemplateUploader;
  deleteTemplateFile?: (fileId: string) => Promise<void>;
};

export class RcOwnerHistoryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'RcOwnerHistoryError';
  }
}

const safeText = (value: unknown, maxLength = 500) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

const objectValue = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const normalizeOwnerHistory = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item) => {
    const owner = objectValue(item);
    if (!owner) return null;
    const ownerName = safeText(owner.owner_name ?? owner.ownerName, 250);
    const ownerNumber = safeText(owner.owner_number ?? owner.ownerNumber, 20);
    if (!ownerName && !ownerNumber) return null;
    return {
      ...(ownerName ? { ownerName } : {}),
      ...(ownerNumber ? { ownerNumber } : {}),
    };
  }).filter((item): item is { ownerName?: string; ownerNumber?: string } => item !== null);
};

const dateFromParts = (year: number, month: number, day: number) => {
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
};

const safeProviderDate = (value: unknown) => {
  const date = safeText(value, 30);
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !dateFromParts(Number(match[1]), Number(match[2]), Number(match[3]))) return null;
  return date;
};

const safeProviderMonth = (value: unknown) => {
  const month = safeText(value, 20);
  if (!month) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match || Number(match[1]) < 1900 || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return month;
};

const safeManufacturingDate = (value: unknown) => {
  const date = safeText(value, 20);
  if (!date) return null;
  const match = /^(\d{1,2})\/(\d{4})$/.exec(date);
  if (!match || Number(match[2]) < 1900 || Number(match[1]) < 1 || Number(match[1]) > 12) return null;
  return `${match[1]!.padStart(2, '0')}/${match[2]!}`;
};

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

export const maskRcNumber = (value: string) => {
  const normalized = normalizeRcNumber(value);
  if (normalized.length < 8) return '********';
  return `${normalized.slice(0, 4)}********${normalized.slice(-4)}`;
};

export type RcOwnerHistoryResult = Record<string, unknown>;

const sellerListingResultFields = new Set([
  'rcNumber',
  'ownerName',
  'registrationDate',
  'registrationUpto',
  'vehicleCategory',
  'vehicleCategoryDescription',
  'vehicleChasiNumber',
  'vehicleEngineNumber',
  'makerDescription',
  'makerModel',
  'fuelType',
  'variant',
  'manufacturingDate',
  'manufacturingDateFormatted',
  'fitUpTo',
  'insuranceUpto',
  'taxUpto',
  'taxPaidUpto',
  'puccUpto',
  'ownerNumber',
  'financer',
  'registeredAt',
  'financed',
]);

export const normalizeRcOwnerHistoryResult = (value: unknown): RcOwnerHistoryResult => {
  const data = objectValue(value) || {};
  const result: RcOwnerHistoryResult = {};
  const textFields: Array<[string, unknown, number?]> = [
    ['providerClientId', data.client_id ?? data.clientId, 150],
    ['rcNumber', data.rc_number ?? data.rcNumber, 40],
    ['ownerName', data.owner_name ?? data.ownerName ?? data.current_owner_name ?? data.currentOwnerName, 250],
    ['fatherName', data.father_name ?? data.fatherName, 250],
    ['presentAddress', data.present_address ?? data.presentAddress, 1200],
    ['permanentAddress', data.permanent_address ?? data.permanentAddress, 1200],
    ['mobileNumber', data.mobile_number ?? data.mobileNumber, 30],
    ['vehicleCategory', data.vehicle_category ?? data.vehicleCategory, 100],
    ['vehicleCategoryDescription', data.vehicle_category_description ?? data.vehicleCategoryDescription, 200],
    ['vehicleChasiNumber', data.vehicle_chasi_number ?? data.vehicleChasiNumber, 100],
    ['vehicleEngineNumber', data.vehicle_engine_number ?? data.vehicleEngineNumber, 100],
    ['makerDescription', data.maker_description ?? data.makerDescription, 250],
    ['makerModel', data.maker_model ?? data.makerModel, 250],
    ['bodyType', data.body_type ?? data.bodyType, 150],
    ['fuelType', data.fuel_type ?? data.fuelType, 80],
    ['color', data.color, 100],
    ['normsType', data.norms_type ?? data.normsType, 150],
    ['financer', data.financer, 250],
    ['insuranceCompany', data.insurance_company ?? data.insuranceCompany, 250],
    ['insurancePolicyNumber', data.insurance_policy_number ?? data.insurancePolicyNumber, 100],
    ['registeredAt', data.registered_at ?? data.registeredAt, 250],
    ['cubicCapacity', data.cubic_capacity ?? data.cubicCapacity, 40],
    ['vehicleGrossWeight', data.vehicle_gross_weight ?? data.vehicleGrossWeight, 40],
    ['noCylinders', data.no_cylinders ?? data.noCylinders, 20],
    ['seatCapacity', data.seat_capacity ?? data.seatCapacity, 20],
    ['sleeperCapacity', data.sleeper_capacity ?? data.sleeperCapacity, 20],
    ['standingCapacity', data.standing_capacity ?? data.standingCapacity, 20],
    ['wheelbase', data.wheelbase, 40],
    ['unladenWeight', data.unladen_weight ?? data.unladenWeight, 40],
    ['vehicleCategoryDescription', data.vehicle_category_description ?? data.vehicleCategoryDescription, 200],
    ['puccNumber', data.pucc_number ?? data.puccNumber, 100],
    ['permitNumber', data.permit_number ?? data.permitNumber, 100],
    ['permitType', data.permit_type ?? data.permitType, 150],
    ['nationalPermitNumber', data.national_permit_number ?? data.nationalPermitNumber, 100],
    ['nationalPermitIssuedBy', data.national_permit_issued_by ?? data.nationalPermitIssuedBy, 250],
    ['nonUseStatus', data.non_use_status ?? data.nonUseStatus, 100],
    ['blacklistStatus', data.blacklist_status ?? data.blacklistStatus, 100],
    ['nocDetails', data.noc_details ?? data.nocDetails, 500],
    ['ownerNumber', data.owner_number ?? data.ownerNumber ?? data.current_owner_number ?? data.currentOwnerNumber, 20],
    ['rcStatus', data.rc_status ?? data.rcStatus, 100],
    ['variant', data.variant, 250],
  ];
  for (const [key, rawValue, maxLength] of textFields) {
    const normalized = safeText(rawValue, maxLength);
    if (normalized) result[key] = normalized;
  }

  const dates: Array<[string, unknown]> = [
    ['registrationDate', data.registration_date ?? data.registrationDate],
    ['registrationUpto', data.registration_upto ?? data.registrationUpto ?? data.registration_valid_upto ?? data.registrationValidUpto ?? data.rc_valid_upto ?? data.rcValidUpto ?? data.rc_expiry_date ?? data.rcExpiryDate],
    ['fitUpTo', data.fit_up_to ?? data.fitUpTo],
    ['insuranceUpto', data.insurance_upto ?? data.insuranceUpto],
    ['latestBy', data.latest_by ?? data.latestBy],
    ['taxUpto', data.tax_upto ?? data.taxUpto],
    ['taxPaidUpto', data.tax_paid_upto ?? data.taxPaidUpto],
    ['puccUpto', data.pucc_upto ?? data.puccUpto],
    ['permitIssueDate', data.permit_issue_date ?? data.permitIssueDate],
    ['permitValidFrom', data.permit_valid_from ?? data.permitValidFrom],
    ['permitValidUpto', data.permit_valid_upto ?? data.permitValidUpto],
    ['nationalPermitUpto', data.national_permit_upto ?? data.nationalPermitUpto],
    ['nonUseFrom', data.non_use_from ?? data.nonUseFrom],
    ['nonUseTo', data.non_use_to ?? data.nonUseTo],
  ];
  for (const [key, rawValue] of dates) {
    const normalized = safeProviderDate(rawValue);
    if (normalized) result[key] = normalized;
  }

  const manufacturingDate = safeManufacturingDate(data.manufacturing_date ?? data.manufacturingDate);
  const manufacturingDateFormatted = safeProviderMonth(data.manufacturing_date_formatted ?? data.manufacturingDateFormatted);
  if (manufacturingDate) result.manufacturingDate = manufacturingDate;
  if (manufacturingDateFormatted) result.manufacturingDateFormatted = manufacturingDateFormatted;

  for (const [key, rawValue] of [
    ['financed', data.financed],
    ['lessInfo', data.less_info ?? data.lessInfo],
    ['maskedName', data.masked_name ?? data.maskedName],
  ] as Array<[string, unknown]>) {
    if (typeof rawValue === 'boolean') result[key] = rawValue;
  }

  for (const [key, rawValue] of [
    ['challanDetails', data.challan_details ?? data.challanDetails],
  ] as Array<[string, unknown]>) {
    const normalized = safeStructuredValue(rawValue);
    if (normalized !== null) result[key] = normalized;
  }

  const ownerHistory = normalizeOwnerHistory(data.owner_history ?? data.ownerHistory);
  if (ownerHistory.length) result.ownerHistory = ownerHistory;

  return result;
};

export const sanitizeRcFullResultForListing = (value: unknown): RcOwnerHistoryResult => {
  const result = objectValue(value) || {};
  return Object.fromEntries(
    Object.entries(result).filter(([key]) => sellerListingResultFields.has(key)),
  );
};

const recordSummary = (record: any) => ({
  id: record.id,
  status: record.status,
  maskedRcNumber: record.maskedRcNumber,
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
  rawDataExpiresAt: record.rawDataExpiresAt instanceof Date ? record.rawDataExpiresAt.toISOString() : record.rawDataExpiresAt ?? null,
  template: rcOwnerHistoryTemplateSummary(record.template),
});

const providerFailure = (error: SurepassProviderError) => {
  const byKind: Record<SurepassErrorKind, { status: number; code: string; message: string }> = {
    INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'We could not verify this vehicle registration number. Please check it and try again.' },
    AUTHENTICATION: { status: 502, code: 'provider_configuration_error', message: 'Vehicle verification provider configuration is invalid.' },
    FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'Vehicle verification provider access is not available.' },
    RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many vehicle verification requests. Please try again later.' },
    PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'Vehicle verification is temporarily unavailable. Please try again later.' },
    MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'Vehicle verification provider returned an invalid response.' },
  };
  const safe = byKind[error.kind];
  return new RcOwnerHistoryError(safe.message, safe.status, safe.code);
};

const operationError = (message: string, statusCode = 400, code = 'invalid_rc_request') =>
  new RcOwnerHistoryError(message, statusCode, code);

const ensureProviderData = (body: unknown) => {
  const response = objectValue(body);
  const data = objectValue(response?.data);
  if (!response || !data) {
    throw new RcOwnerHistoryError('Vehicle verification provider returned an invalid response.', 502, 'provider_malformed_response');
  }
  return { response, data };
};

const rcOwnerHistoryTemplateSummary = (template: any) => template ? {
  id: template.id,
  fileName: template.fileName,
  mimeType: template.mimeType,
  fileSize: template.fileSize,
  sha256: template.sha256,
  createdAt: template.createdAt instanceof Date ? template.createdAt.toISOString() : template.createdAt,
} : null;

const rcOwnerHistoryTemplateFileName = (maskedRcNumber: string, recordId: string) => {
  const safeNumber = maskedRcNumber.replace(/[^A-Z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toUpperCase();
  return `rc-owner-history-template-${safeNumber || recordId}.png`;
};

export class RcOwnerHistoryService {
  private readonly record: RcOwnerHistoryRecordRepository;
  private readonly template: RcOwnerHistoryTemplateRepository;
  private readonly audit: RcOwnerHistoryAuditRepository | undefined;
  private readonly provider: ReturnType<typeof createSurepassClient> | undefined;
  private readonly dataSecret: string | undefined;
  private readonly billing: ApiBillingGateway | undefined;
  private readonly serviceKey: Extract<ApiBillableServiceKey, 'RC_OWNER_HISTORY' | 'RC_FULL'>;
  private readonly auditEntityType: 'RC_OWNER_HISTORY' | 'RC_FULL';
  private readonly auditActionPrefix: 'RC_OWNER_HISTORY' | 'RC_FULL';
  private readonly uploadTemplateFile: RcOwnerHistoryTemplateUploader;
  private readonly deleteTemplateFile: (fileId: string) => Promise<void>;

  constructor(dependencies: RcOwnerHistoryDependencies = {}) {
    this.record = dependencies.record || (prisma as any).rcOwnerHistoryRecord;
    this.template = dependencies.template || (prisma as any).rcOwnerHistoryTemplate;
    this.audit = dependencies.audit || (!dependencies.record ? (prisma as any).auditLog : undefined);
    this.provider = dependencies.provider;
    this.dataSecret = dependencies.dataSecret?.trim() || undefined;
    this.billing = dependencies.billing ?? (!dependencies.record ? apiWalletBillingService : undefined);
    this.serviceKey = dependencies.serviceKey || 'RC_OWNER_HISTORY';
    this.auditEntityType = dependencies.auditEntityType || this.serviceKey;
    this.auditActionPrefix = dependencies.auditActionPrefix || this.serviceKey;
    this.uploadTemplateFile = dependencies.uploadTemplateFile || (async (buffer, mimeType, fileName) => {
      const result = await uploadFileToDrive(buffer, mimeType, fileName, undefined, { access: 'private' });
      return { fileId: result.fileId };
    });
    this.deleteTemplateFile = dependencies.deleteTemplateFile || deleteFileFromDrive;
  }

  private async getRuntime() {
    if (this.provider && this.dataSecret) return { provider: this.provider, dataSecret: this.dataSecret };
    try {
      const config = await getPanVerificationRuntimeConfig();
      if (!config || !config.enabled || !config.baseUrl || !config.token || !config.dataSecret) throw new Error('RC owner history is not configured.');
      return {
        provider: createSurepassClient({
          baseUrl: config.baseUrl,
          token: config.token,
          ...(config.customerId ? { customerId: config.customerId } : {}),
        }),
        dataSecret: config.dataSecret,
      };
    } catch {
      throw new RcOwnerHistoryError('Vehicle verification provider is not configured.', 503, 'provider_not_configured');
    }
  }

  private async ensureNoRecentDuplicate(requestFingerprint: string) {
    const existing = await this.record.findFirst({
      where: {
        serviceKey: this.serviceKey,
        requestFingerprint,
        status: RC_STATUS.PENDING,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (existing) throw operationError('This vehicle verification is already in progress. Please wait a moment.', 409, 'verification_in_progress');
  }

  private async findFreshCachedResult(requestFingerprint: string, dataSecret: string) {
    if (this.serviceKey === 'RC_OWNER_HISTORY') return null;
    const cached = await this.record.findFirst({
      where: {
        serviceKey: this.serviceKey,
        requestFingerprint,
        status: RC_STATUS.SUCCESS,
        completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        encryptedResult: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        template: true,
      },
    });
    if (!cached || !isFreshVerificationResult(cached)) return null;
    try {
      return {
        record: recordSummary(cached),
        result: JSON.parse(decryptPanData(cached.encryptedResult, dataSecret)),
        template: rcOwnerHistoryTemplateSummary(cached.template),
        cacheHit: true,
      };
    } catch {
      return null;
    }
  }

  private async markFailed(id: string, error: RcOwnerHistoryError, messageCode: string | null = null) {
    try {
      await this.record.update({
        where: { id },
        data: { status: RC_STATUS.FAILED, safeMessage: error.message, messageCode, completedAt: new Date() },
      });
    } catch {
      // Preserve the safe provider error if history persistence itself fails.
    }
  }

  private async writeAudit(actorUserId: string, action: string, entityId: string, afterJson: Record<string, unknown>) {
    if (!this.audit) return;
    try {
      await this.audit.create({ data: { actorUserId, entityType: this.auditEntityType, entityId, action, afterJson } });
    } catch {
      // Audit failure must not expose provider data or block a successful lookup.
    }
  }

  private async run(rcNumber: string, requestedById: string, requestFingerprint: string) {
    const runtime = await this.getRuntime();
    const maskedRcNumber = maskRcNumber(rcNumber);
    const cached = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret);
    if (cached) return cached;
    await this.ensureNoRecentDuplicate(requestFingerprint);
    const existing = await this.record.findFirst({
      where: { serviceKey: this.serviceKey, requestFingerprint },
      orderBy: { completedAt: 'desc' },
      include: { template: true },
    });
    const reusableExisting = existing && this.serviceKey === 'RC_FULL' ? existing : null;
    const pending = reusableExisting
      ? await this.record.update({
          where: { id: reusableExisting.id },
          data: {
            status: RC_STATUS.PENDING,
            serviceKey: this.serviceKey,
            maskedRcNumber,
            requestFingerprint,
            requestedById,
            createdAt: new Date(),
            safeMessage: null,
            messageCode: null,
            encryptedResult: null,
            rawDataExpiresAt: null,
            completedAt: null,
          },
        })
      : await this.record.create({
          data: {
            status: RC_STATUS.PENDING,
            serviceKey: this.serviceKey,
            maskedRcNumber,
            requestFingerprint,
            requestedById,
            rawDataExpiresAt: null,
            ...(this.serviceKey === 'RC_OWNER_HISTORY'
              ? { ephemeralExpiresAt: new Date(Date.now() + RC_OWNER_HISTORY_EPHEMERAL_SESSION_TTL_MS) }
              : {}),
          },
        });
    await this.writeAudit(requestedById, `${this.auditActionPrefix}_REQUESTED`, pending.id, { maskedRcNumber, status: RC_STATUS.PENDING });

    let billing: { charged: boolean; usageId?: string } | undefined;
    try {
      billing = this.billing
        ? await this.billing.chargeForProviderCall({
            serviceKey: this.serviceKey,
            verificationRecordId: pending.id,
            requestedById,
          })
        : undefined;
      let body: unknown;
      if (this.serviceKey === 'RC_OWNER_HISTORY') {
        try {
          body = await runtime.provider.verifyRcOwnerHistory({ id_number: rcNumber });
        } catch (providerErr) {
          if (
            providerErr instanceof SurepassProviderError &&
            (providerErr.kind === 'PROVIDER_UNAVAILABLE' || providerErr.statusCode >= 500) &&
            typeof (runtime.provider as any).verifyRcFull === 'function'
          ) {
            body = await runtime.provider.verifyRcFull({ id_number: rcNumber });
          } else {
            throw providerErr;
          }
        }
      } else {
        body = await runtime.provider.verifyRcFull({ id_number: rcNumber });
      }
      const { response, data } = ensureProviderData(body);
      const normalized = normalizeRcOwnerHistoryResult({
        ...data,
        rc_number: data.rc_number ?? data.rcNumber ?? rcNumber,
      });
      if (
        this.serviceKey === 'RC_FULL'
        && normalizeRcNumber(normalized.rcNumber) !== rcNumber
      ) {
        throw operationError(
          'The verified vehicle number does not match the requested vehicle number.',
          422,
          'provider_identity_mismatch',
        );
      }
      const encryptedResult = encryptPanData(JSON.stringify(normalized), runtime.dataSecret);
      const completedAt = new Date();
      const completed = await this.record.update({
        where: { id: pending.id },
        data: {
          status: RC_STATUS.SUCCESS,
          ownerName: typeof normalized.ownerName === 'string' ? normalized.ownerName : null,
          rcStatus: typeof normalized.rcStatus === 'string' ? normalized.rcStatus : null,
          vehicleCategory: typeof normalized.vehicleCategory === 'string' ? normalized.vehicleCategory : null,
          registrationDate: typeof normalized.registrationDate === 'string' ? normalized.registrationDate : null,
          providerClientId: typeof normalized.providerClientId === 'string' ? normalized.providerClientId : null,
          messageCode: typeof response.message_code === 'string' ? response.message_code : null,
          encryptedResult,
          rawDataExpiresAt: this.serviceKey === 'RC_OWNER_HISTORY' ? getRcOwnerHistoryRawDataExpiresAt(completedAt) : null,
          completedAt,
        },
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          template: true,
        },
      });
      await this.writeAudit(requestedById, `${this.auditActionPrefix}_SUCCEEDED`, pending.id, {
        maskedRcNumber,
        status: RC_STATUS.SUCCESS,
        rcStatus: completed.rcStatus ?? null,
      });
      return { record: recordSummary(completed), result: normalized, template: rcOwnerHistoryTemplateSummary(completed.template), cacheHit: false, ...(billing ? { billing } : {}) };
    } catch (error) {
      const normalizedError = isApiWalletBillingError(error)
        ? new RcOwnerHistoryError(error.message, error.statusCode, error.code)
        : error instanceof SurepassProviderError
          ? providerFailure(error)
          : error instanceof RcOwnerHistoryError
            ? error
            : new RcOwnerHistoryError('Vehicle verification could not be completed.', 502, 'verification_failed');
      let billingReversal: { reversed: boolean } | undefined;
      let billingReversalFailed = false;
      if (billing?.charged && billing.usageId && this.billing?.reverseProviderCharge) {
        try {
          billingReversal = await this.billing.reverseProviderCharge({
            usageId: billing.usageId,
            reason: normalizedError.code,
          });
        } catch {
          billingReversalFailed = true;
        }
      }
      await this.markFailed(pending.id, normalizedError, error instanceof SurepassProviderError ? error.messageCode : null);
      await this.writeAudit(requestedById, `${this.auditActionPrefix}_FAILED`, pending.id, {
        maskedRcNumber,
        status: RC_STATUS.FAILED,
        code: normalizedError.code,
        ...(billingReversal ? { billingReversed: billingReversal.reversed } : {}),
        ...(billingReversalFailed ? { billingReversalFailed: true } : {}),
      });
      throw normalizedError;
    }
  }

  async verifyRc(input: Record<string, unknown>, requestedById: string) {
    const rcNumber = normalizeRcNumber(input.id_number ?? input.rc_number ?? input.rcNumber);
    const rcError = validateRcNumber(rcNumber);
    if (rcError) throw operationError(rcError);
    return this.run(rcNumber, requestedById, createVerificationFingerprint(this.serviceKey, { id_number: rcNumber }));
  }

  async listHistory(filters: { page?: unknown; limit?: unknown; status?: unknown; search?: unknown }) {
    const parsedPage = Number.parseInt(String(filters.page ?? '1'), 10);
    const parsedLimit = Number.parseInt(String(filters.limit ?? '20'), 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10_000) : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const status = typeof filters.status === 'string' && Object.values(RC_STATUS).includes(filters.status as typeof RC_STATUS[keyof typeof RC_STATUS])
      ? filters.status as typeof RC_STATUS[keyof typeof RC_STATUS]
      : undefined;
    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 50) : '';
    const where = {
      serviceKey: this.serviceKey,
      ...(this.serviceKey === 'RC_OWNER_HISTORY' ? { template: { isNot: null } } : {}),
      ...(status ? { status } : {}),
      ...(search ? { maskedRcNumber: { contains: search, mode: 'insensitive' } } : {}),
    };
    const historyOnly = this.serviceKey === 'RC_OWNER_HISTORY';
    const [totalResult, records] = await Promise.all([
      historyOnly && this.record.groupBy
        ? this.record.groupBy({ where, by: ['maskedRcNumber'] })
        : this.record.count({ where }),
      this.record.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        ...(historyOnly ? { distinct: ['maskedRcNumber'] } : {}),
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          template: true,
        },
      }),
    ]);
    const latestByMaskedRc = historyOnly
      ? new Map<string, any>()
      : null;
    if (latestByMaskedRc) {
      for (const record of records) {
        const key = String(record.maskedRcNumber || record.id);
        const current = latestByMaskedRc.get(key);
        if (!current || new Date(record.createdAt).getTime() > new Date(current.createdAt).getTime()) {
          latestByMaskedRc.set(key, record);
        }
      }
    }
    const visibleRecords = latestByMaskedRc ? [...latestByMaskedRc.values()] : records;
    const total = Array.isArray(totalResult) ? totalResult.length : totalResult;
    return { records: visibleRecords.map(recordSummary), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async cleanupExpiredRawData(now = new Date()) {
    if (this.serviceKey !== 'RC_OWNER_HISTORY') return 0;
    const expiredEphemeral = this.record.deleteMany
      ? await this.record.deleteMany({
          where: {
            serviceKey: 'RC_OWNER_HISTORY',
            template: { is: null },
            ephemeralExpiresAt: { lte: now },
          },
        })
      : { count: 0 };
    const result = this.record.updateMany
      ? await this.record.updateMany({
      where: {
        serviceKey: 'RC_OWNER_HISTORY',
        status: RC_STATUS.SUCCESS,
        encryptedResult: { not: null },
        OR: [
          { rawDataExpiresAt: null },
          { rawDataExpiresAt: { lte: now } },
        ],
      },
      data: { encryptedResult: null, rawDataExpiresAt: null },
      })
      : { count: 0 };
    return expiredEphemeral.count + result.count;
  }

  async uploadTemplate(
    recordId: string,
    requestedById: string,
    role: string,
    buffer: Buffer,
    mimeType: string,
  ) {
    if (this.serviceKey !== 'RC_OWNER_HISTORY') {
      throw new RcOwnerHistoryError('RC owner-history templates are not available for this service.', 404, 'template_not_found');
    }
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new RcOwnerHistoryError('An RC owner-history template file is required.', 400, 'template_file_required');
    }
    if (buffer.length > MAX_RC_OWNER_HISTORY_TEMPLATE_SIZE) {
      throw new RcOwnerHistoryError('The RC owner-history template must be 5 MB or smaller.', 413, 'template_file_too_large');
    }
    if (mimeType !== 'image/png') {
      throw new RcOwnerHistoryError('Only PNG RC owner-history templates are allowed.', 400, 'template_file_type_invalid');
    }
    if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new RcOwnerHistoryError('The RC owner-history template file is invalid.', 400, 'template_file_signature_invalid');
    }

    const record = await this.record.findUnique({ where: { id: recordId }, include: { template: true } });
    if (!record || record.serviceKey !== 'RC_OWNER_HISTORY') throw new RcOwnerHistoryError('RC owner-history verification record not found.', 404, 'record_not_found');
    if (role === 'EMPLOYEE' && record.requestedById !== requestedById) {
      throw new RcOwnerHistoryError('You do not have access to this RC owner-history template.', 403, 'template_forbidden');
    }
    if (record.template) {
      if (record.encryptedResult || record.rawDataExpiresAt || record.ephemeralExpiresAt) {
        await this.record.update({ where: { id: record.id }, data: { encryptedResult: null, rawDataExpiresAt: null, ephemeralExpiresAt: null } });
      }
      return { record: recordSummary({ ...record, encryptedResult: null, rawDataExpiresAt: null, ephemeralExpiresAt: null }), result: null, template: rcOwnerHistoryTemplateSummary(record.template), alreadyUploaded: true };
    }

    // A user may verify the same RC again before saving the new result. Reuse
    // the newest saved template for that RC instead of creating another Drive
    // file and another history row.
    const existingSavedTemplate = await this.record.findFirst({
      where: {
        serviceKey: 'RC_OWNER_HISTORY',
        maskedRcNumber: record.maskedRcNumber,
        template: { isNot: null },
        ...(role === 'EMPLOYEE' ? { requestedById } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        template: true,
      },
    });
    if (existingSavedTemplate && existingSavedTemplate.id !== record.id) {
      await this.record.update({
        where: { id: record.id },
        data: { encryptedResult: null, rawDataExpiresAt: null, ephemeralExpiresAt: null },
      });
      return {
        record: recordSummary(existingSavedTemplate),
        result: null,
        template: rcOwnerHistoryTemplateSummary(existingSavedTemplate.template),
        alreadyUploaded: true,
        deduplicated: true,
      };
    }
    if (record.status !== RC_STATUS.SUCCESS || !isRcOwnerHistoryRawDataAvailable(record)) {
      if (record.encryptedResult) {
        await this.record.update({ where: { id: record.id }, data: { encryptedResult: null, rawDataExpiresAt: null, ephemeralExpiresAt: null } });
      }
      throw new RcOwnerHistoryError('The RC owner-history template upload window has expired. Run verification again.', 409, 'template_result_unavailable');
    }

    const fileName = rcOwnerHistoryTemplateFileName(record.maskedRcNumber, record.id);
    let driveFileId: string | null = null;
    let templateId: string | null = null;
    try {
      const stored = await this.uploadTemplateFile(buffer, mimeType, fileName);
      driveFileId = stored.fileId;
      cacheDriveFileBuffer(driveFileId, buffer);
      const template = await this.template.create({
        data: {
          verificationRecordId: record.id,
          requestedById: record.requestedById,
          driveFileId,
          fileName,
          mimeType,
          fileSize: buffer.length,
          sha256: createHash('sha256').update(buffer).digest('hex'),
        },
      });
      templateId = template.id;
      await this.record.update({ where: { id: record.id }, data: { encryptedResult: null, rawDataExpiresAt: null, ephemeralExpiresAt: null } });
      return {
        record: recordSummary({ ...record, encryptedResult: null, rawDataExpiresAt: null, ephemeralExpiresAt: null, template }),
        result: null,
        template: rcOwnerHistoryTemplateSummary(template),
      };
    } catch (error) {
      if (templateId && this.template.delete) await this.template.delete({ where: { id: templateId } });
      if (driveFileId) {
        clearCachedDriveFileBuffer(driveFileId);
        await this.deleteTemplateFile(driveFileId);
      }
      throw new RcOwnerHistoryError(
        error instanceof RcOwnerHistoryError ? error.message : 'The RC owner-history template could not be stored securely.',
        error instanceof RcOwnerHistoryError ? error.statusCode : 502,
        error instanceof RcOwnerHistoryError ? error.code : 'template_storage_failed',
      );
    }
  }

  async getTemplateDownload(recordId: string, requestedById: string, role: string) {
    const record = await this.record.findUnique({ where: { id: recordId }, include: { template: true } });
    if (!record || record.serviceKey !== 'RC_OWNER_HISTORY') throw new RcOwnerHistoryError('RC owner-history verification record not found.', 404, 'record_not_found');
    if (role === 'EMPLOYEE' && record.requestedById !== requestedById) {
      throw new RcOwnerHistoryError('You do not have access to this RC owner-history template.', 403, 'template_forbidden');
    }
    if (!record.template) throw new RcOwnerHistoryError('RC owner-history template not found.', 404, 'template_not_found');
    return { ...rcOwnerHistoryTemplateSummary(record.template), driveFileId: record.template.driveFileId };
  }

  async getHistoryDetail(id: string) {
    const record = await this.record.findUnique({
      where: { id, serviceKey: this.serviceKey },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        template: true,
      },
    });
    if (!record || (this.serviceKey === 'RC_OWNER_HISTORY' && !record.template)) {
      throw new RcOwnerHistoryError('Vehicle verification record not found.', 404, 'record_not_found');
    }
    let result: unknown = null;
    if (record.status === RC_STATUS.SUCCESS && record.encryptedResult) {
      try {
        const runtime = this.dataSecret ? null : await getPanVerificationRuntimeConfig();
        const secret = this.dataSecret || runtime?.dataSecret;
        if (!secret) throw new Error('Missing data secret');
        result = JSON.parse(decryptPanData(record.encryptedResult, secret));
      } catch {
        throw new RcOwnerHistoryError('The stored vehicle verification result is unavailable.', 500, 'stored_result_unavailable');
      }
    }
    return { record: recordSummary(record), result };
  }
}

export const rcOwnerHistoryService = new RcOwnerHistoryService();

export class RcFullService extends RcOwnerHistoryService {
  constructor(dependencies: Omit<RcOwnerHistoryDependencies, 'serviceKey' | 'auditEntityType' | 'auditActionPrefix'> = {}) {
    super({ ...dependencies, serviceKey: 'RC_FULL', auditEntityType: 'RC_FULL', auditActionPrefix: 'RC_FULL' });
  }
}

export const rcFullService = new RcFullService();
