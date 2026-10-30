import { createHash } from 'node:crypto';
import prisma from '../lib/prisma';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import { getPanVerificationRuntimeConfig } from './panVerificationSettings.service';
import {
  normalizeGstin,
  validateGstin,
} from './gstVerification.validation';
import {
  createSurepassClient,
  SurepassProviderError,
  type SurepassErrorKind,
} from './surepassClient';
import { createVerificationFingerprint } from './verificationCache';
import { deleteFileFromDrive, uploadFileToDrive } from './googleDrive.service';
import {
  apiWalletBillingService,
  isApiWalletBillingError,
  type ApiBillingGateway,
} from './apiWalletBilling.service';

const GST_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

type GstRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  updateMany?: (args: any) => Promise<{ count: number }>;
};

type GstTemplateRepository = {
  findUnique: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  delete?: (args: any) => Promise<any>;
};

type GstTemplateUploader = (
  buffer: Buffer,
  mimeType: string,
  filename: string,
) => Promise<{ fileId: string }>;

type GstAuditRepository = {
  create: (args: any) => Promise<any>;
};

type GstVerificationDependencies = {
  record?: GstRecordRepository;
  template?: GstTemplateRepository;
  audit?: GstAuditRepository;
  provider?: ReturnType<typeof createSurepassClient>;
  dataSecret?: string;
  billing?: ApiBillingGateway;
  uploadTemplateFile?: GstTemplateUploader;
  deleteTemplateFile?: (fileId: string) => Promise<void>;
};

export const GST_RAW_DATA_TTL_MS = 5 * 60 * 1000;
export const MAX_GST_TEMPLATE_SIZE = 5 * 1024 * 1024;
const PDF_SIGNATURE = Buffer.from('%PDF-');

export const getGstRawDataExpiresAt = (completedAt = new Date()) =>
  new Date(completedAt.getTime() + GST_RAW_DATA_TTL_MS);

export const isGstRawDataAvailable = (
  record: { encryptedResult?: unknown; rawDataExpiresAt?: unknown },
  now = Date.now(),
) => {
  if (typeof record.encryptedResult !== 'string' || !record.encryptedResult) return false;
  const expiresAt = record.rawDataExpiresAt instanceof Date
    ? record.rawDataExpiresAt.getTime()
    : new Date(String(record.rawDataExpiresAt ?? '')).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
};

const gstTemplateSummary = (template: any) => template ? {
  id: template.id,
  fileName: template.fileName,
  mimeType: template.mimeType,
  fileSize: template.fileSize,
  sha256: template.sha256,
  createdAt: template.createdAt instanceof Date ? template.createdAt.toISOString() : template.createdAt,
} : null;

export class GstVerificationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'GstVerificationError';
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
  if (typeof value === 'string') return value.trim().slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => safeStructuredValue(item, depth + 1)).filter((item) => item !== null);
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

const safeAddressDetails = (value: unknown) => {
  const object = objectValue(value);
  if (!object) return null;
  const allowedKeys = new Set([
    'address', 'building', 'building_name', 'city', 'district', 'door_num',
    'floor', 'landmark', 'locality', 'location', 'pin_code', 'pincode', 'state', 'street',
  ]);
  const result = Object.fromEntries(
    Object.entries(object)
      .filter(([key]) => allowedKeys.has(key))
      .map(([key, item]) => [key, safeStructuredValue(item)])
      .filter(([, item]) => item !== null),
  );
  return Object.keys(result).length ? result : {};
};

const safeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 50)
    : [];

const safeList = (value: unknown) =>
  Array.isArray(value)
    ? value.slice(0, 50).map((item) => safeStructuredValue(item)).filter((item) => item !== null)
    : [];

// Keep the provider's complete `data` object available for the authorized detail view.
// It is still bounded and sanitized before encryption so an unexpected provider payload
// cannot create an unbounded database value or expose executable content to the UI.
const safeProviderData = (value: unknown, depth = 0): unknown => {
  if (depth > 6 || value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'string') return value.trim().slice(0, 2_000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => safeProviderData(item, depth + 1));
  }
  const object = objectValue(value);
  if (!object) return null;
  return Object.fromEntries(
    Object.entries(object)
      .slice(0, 100)
      .map(([key, item]) => [key.slice(0, 100), safeProviderData(item, depth + 1)]),
  );
};

export const maskGstin = (value: string) => {
  const gstin = normalizeGstin(value);
  return gstin.length === 15 ? `${gstin.slice(0, 4)}********${gstin.slice(-3)}` : '****************';
};

export type GstVerificationResult = Record<string, unknown>;

const hasCompleteProviderData = (value: unknown) => {
  const result = objectValue(value);
  return Boolean(result && objectValue(result.providerData));
};

export const normalizeGstVerificationResult = (value: unknown): GstVerificationResult => {
  const data = objectValue(value) || {};
  const gstin = normalizeGstin(data.gstin ?? data.gstin_number ?? data.id_number);
  const result: GstVerificationResult = {
    gstin,
    maskedGstin: maskGstin(gstin),
    providerData: safeProviderData(data),
  };
  const fields: Array<[string, unknown, number?]> = [
    ['providerClientId', data.client_id ?? data.clientId, 150],
    ['panNumber', data.pan_number ?? data.panNumber, 20],
    ['businessName', data.business_name ?? data.businessName, 500],
    ['legalName', data.legal_name ?? data.legalName, 500],
    ['centerJurisdiction', data.center_jurisdiction ?? data.centerJurisdiction, 500],
    ['stateJurisdiction', data.state_jurisdiction ?? data.stateJurisdiction, 500],
    ['dateOfRegistration', data.date_of_registration ?? data.dateOfRegistration, 30],
    ['constitutionOfBusiness', data.constitution_of_business ?? data.constitutionOfBusiness, 200],
    ['taxpayerType', data.taxpayer_type ?? data.taxpayerType, 100],
    ['gstinStatus', data.gstin_status ?? data.gstinStatus, 100],
    ['dateOfCancellation', data.date_of_cancellation ?? data.dateOfCancellation, 30],
    ['fieldVisitConducted', data.field_visit_conducted ?? data.fieldVisitConducted, 50],
    ['natureOfCoreBusinessActivityCode', data.nature_of_core_business_activity_code ?? data.natureOfCoreBusinessActivityCode, 100],
    ['natureOfCoreBusinessActivityDescription', data.nature_of_core_business_activity_description ?? data.natureOfCoreBusinessActivityDescription, 500],
    ['aadhaarValidation', data.aadhaar_validation ?? data.aadhaarValidation, 50],
    ['aadhaarValidationDate', data.aadhaar_validation_date ?? data.aadhaarValidationDate, 30],
    ['address', data.address, 1000],
    ['annualTurnover', data.annual_turnover ?? data.annualTurnover, 200],
    ['annualTurnoverFy', data.annual_turnover_fy ?? data.annualTurnoverFy, 30],
    ['percentageInCash', data.percentage_in_cash ?? data.percentageInCash, 100],
    ['percentageInCashFy', data.percentage_in_cash_fy ?? data.percentageInCashFy, 30],
  ];
  for (const [key, valueToAdd, maxLength] of fields) {
    const normalized = safeText(valueToAdd, maxLength);
    if (normalized) result[key] = normalized;
  }

  const addressDetails = safeAddressDetails(data.address_details ?? data.addressDetails);
  if (addressDetails) result.addressDetails = addressDetails;
  const contactDetails = safeStructuredValue(data.contact_details ?? data.contactDetails);
  if (contactDetails !== null) result.contactDetails = contactDetails;
  result.promoters = safeStringArray(data.promoters);
  if (typeof data.einvoice_status === 'boolean' || typeof data.einvoiceStatus === 'boolean') {
    result.einvoiceStatus = data.einvoice_status ?? data.einvoiceStatus;
  }
  const liabilityPercentageDetails = safeStructuredValue(data.liability_percentage_details ?? data.liabilityPercentageDetails);
  if (liabilityPercentageDetails !== null) result.liabilityPercentageDetails = liabilityPercentageDetails;
  result.natureOfBusinessActivities = safeStringArray(data.nature_bus_activities ?? data.natureOfBusinessActivities);
  if (data.filing_status !== undefined || data.filingStatus !== undefined) {
    result.filingStatus = safeList(data.filing_status ?? data.filingStatus);
  }
  if (data.filing_frequency !== undefined || data.filingFrequency !== undefined) {
    result.filingFrequency = safeList(data.filing_frequency ?? data.filingFrequency);
  }
  const hsnInfo = safeStructuredValue(data.hsn_info ?? data.hsnInfo);
  if (hsnInfo !== null) result.hsnInfo = hsnInfo;

  return result;
};

const recordSummary = (record: any) => ({
  id: record.id,
  status: record.status,
  maskedGstin: record.maskedGstin,
  gstinStatus: record.gstinStatus ?? null,
  businessName: record.businessName ?? null,
  legalName: record.legalName ?? null,
  provider: record.provider,
  providerClientId: record.providerClientId ?? null,
  messageCode: record.messageCode ?? null,
  safeMessage: record.safeMessage ?? null,
  requestedBy: record.requestedBy
    ? {
        id: record.requestedBy.id,
        name: record.requestedBy.name ?? null,
        email: record.requestedBy.email ?? null,
      }
    : null,
  createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
  completedAt: record.completedAt instanceof Date ? record.completedAt.toISOString() : record.completedAt,
  rawDataExpiresAt: record.rawDataExpiresAt instanceof Date ? record.rawDataExpiresAt.toISOString() : record.rawDataExpiresAt ?? null,
  template: gstTemplateSummary(record.template),
});

const providerFailure = (error: SurepassProviderError) => {
  const byKind: Record<SurepassErrorKind, { status: number; code: string; message: string }> = {
    INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'The GSTIN details could not be verified.' },
    AUTHENTICATION: { status: 502, code: 'provider_configuration_error', message: 'GST verification provider configuration is invalid.' },
    FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'GST verification provider access is not available.' },
    RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many GST verification requests. Please try again later.' },
    PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'GST verification is temporarily unavailable. Please try again later.' },
    MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'GST verification provider returned an invalid response.' },
  };
  const safe = byKind[error.kind];
  return new GstVerificationError(safe.message, safe.status, safe.code);
};

const operationError = (message: string, statusCode = 400, code = 'invalid_gstin_request') =>
  new GstVerificationError(message, statusCode, code);

const ensureProviderData = (body: unknown) => {
  const response = objectValue(body);
  const data = objectValue(response?.data);
  if (!response || !data) {
    throw new GstVerificationError('GST verification provider returned an invalid response.', 502, 'provider_malformed_response');
  }
  return { response, data };
};

export class GstVerificationService {
  private readonly record: GstRecordRepository;
  private readonly template: GstTemplateRepository;
  private readonly audit: GstAuditRepository | undefined;
  private readonly provider: ReturnType<typeof createSurepassClient> | undefined;
  private readonly dataSecret: string | undefined;
  private readonly billing: ApiBillingGateway | undefined;
  private readonly uploadTemplateFile: GstTemplateUploader;
  private readonly deleteTemplateFile: (fileId: string) => Promise<void>;

  constructor(dependencies: GstVerificationDependencies = {}) {
    this.record = dependencies.record || (prisma as any).gstVerificationRecord;
    this.template = dependencies.template || (prisma as any).gstVerificationTemplate;
    this.audit = dependencies.audit || (!dependencies.record ? (prisma as any).auditLog : undefined);
    this.provider = dependencies.provider;
    // An explicitly injected secret is used only by tests/isolated runtimes. In production,
    // always resolve the active secret from the encrypted settings record so verification
    // and detail retrieval use the same key after settings are changed.
    this.dataSecret = dependencies.dataSecret?.trim() || undefined;
    this.billing = dependencies.billing ?? (!dependencies.record ? apiWalletBillingService : undefined);
    this.uploadTemplateFile = dependencies.uploadTemplateFile || (async (buffer, mimeType, filename) => {
      const result = await uploadFileToDrive(buffer, mimeType, filename, undefined, { access: 'private' });
      return { fileId: result.fileId };
    });
    this.deleteTemplateFile = dependencies.deleteTemplateFile || deleteFileFromDrive;
  }

  private async getDataSecret() {
    if (this.dataSecret) return this.dataSecret;
    const runtime = await getPanVerificationRuntimeConfig();
    if (!runtime?.dataSecret) throw new Error('Missing data secret');
    return runtime.dataSecret;
  }

  private async getRuntime() {
    if (this.provider && this.dataSecret) return { provider: this.provider, dataSecret: this.dataSecret };

    try {
      const config = await getPanVerificationRuntimeConfig();
      if (!config || !config.enabled || !config.baseUrl || !config.token || !config.dataSecret) {
        throw new Error('GST verification is not configured.');
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
      throw new GstVerificationError('GST verification provider is not configured.', 503, 'provider_not_configured');
    }
  }

  private async ensureNoRecentDuplicate(requestFingerprint: string) {
    const existing = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: GST_STATUS.PENDING,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (existing) throw operationError('This GST verification is already in progress. Please wait a moment.', 409, 'verification_in_progress');
  }

  private async findFreshCachedResult(requestFingerprint: string, dataSecret: string) {
    const cached = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: GST_STATUS.SUCCESS,
        rawDataExpiresAt: { gt: new Date() },
        encryptedResult: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        template: true,
      },
    });
    if (!cached || !isGstRawDataAvailable(cached)) return null;
    try {
      const result = JSON.parse(decryptPanData(cached.encryptedResult, dataSecret)) as GstVerificationResult;
      // Records created before full provider data was retained must be refreshed instead
      // of being returned from the 24-hour cache.
      if (!hasCompleteProviderData(result)) return null;
      return {
        record: recordSummary(cached),
        result,
        template: gstTemplateSummary(cached.template),
        cacheHit: true,
      };
    } catch {
      return null;
    }
  }

  private async markFailed(id: string, error: GstVerificationError, messageCode: string | null = null) {
    try {
      await this.record.update({
        where: { id },
        data: {
          status: GST_STATUS.FAILED,
          safeMessage: error.message,
          messageCode,
          completedAt: new Date(),
        },
      });
    } catch {
      // Preserve the safe provider error when history persistence fails.
    }
  }

  private async writeAudit(actorUserId: string, action: string, entityId: string, afterJson: Record<string, unknown>) {
    if (!this.audit) return;
    try {
      await this.audit.create({
        data: {
          actorUserId,
          entityType: 'GST_VERIFICATION',
          entityId,
          action,
          afterJson,
        },
      });
    } catch {
      // Audit logging must not expose provider credentials or block the verification flow.
    }
  }

  private async run(gstin: string, requestedById: string, requestFingerprint: string) {
    const savedTemplateRecord = await this.record.findFirst({
      where: {
        requestFingerprint,
        requestedById,
        status: GST_STATUS.SUCCESS,
        template: { isNot: null },
      },
      orderBy: { completedAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        template: true,
      },
    });
    if (savedTemplateRecord?.template) {
      return {
        record: recordSummary(savedTemplateRecord),
        result: null,
        template: gstTemplateSummary(savedTemplateRecord.template),
        cacheHit: true,
      };
    }

    const runtime = await this.getRuntime();
    const maskedGstin = maskGstin(gstin);
    const cached = await this.findFreshCachedResult(requestFingerprint, runtime.dataSecret);
    if (cached) return cached;
    await this.ensureNoRecentDuplicate(requestFingerprint);
    const existing = await this.record.findFirst({
      where: { requestFingerprint },
      orderBy: { completedAt: 'desc' },
      include: { template: true },
    });
    let reusableExisting = existing;
    if (existing?.template) reusableExisting = null;
    if (existing?.status === GST_STATUS.SUCCESS && existing.encryptedResult) {
      try {
        const previousResult = JSON.parse(decryptPanData(existing.encryptedResult, runtime.dataSecret));
        if (!hasCompleteProviderData(previousResult)) reusableExisting = null;
      } catch {
        reusableExisting = null;
      }
    }
    const pending = reusableExisting
      ? await this.record.update({
          where: { id: reusableExisting.id },
          data: {
            status: GST_STATUS.PENDING,
            maskedGstin,
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
      : await this.record.create({ data: { status: GST_STATUS.PENDING, maskedGstin, requestFingerprint, requestedById } });
    await this.writeAudit(requestedById, 'GST_VERIFICATION_REQUESTED', pending.id, { maskedGstin, status: GST_STATUS.PENDING });

    try {
      const billing = this.billing
        ? await this.billing.chargeForProviderCall({
            serviceKey: 'GST_VERIFICATION',
            verificationRecordId: pending.id,
            requestedById,
          })
        : undefined;
      const body = await runtime.provider.verifyGstin({
        id_number: gstin,
      });
      const { response, data } = ensureProviderData(body);
      const result = normalizeGstVerificationResult({ ...data, gstin: data.gstin || gstin });
      const encryptedResult = encryptPanData(JSON.stringify(result), runtime.dataSecret);
      const completedAt = new Date();
      const completed = await this.record.update({
        where: { id: pending.id },
        data: {
          status: GST_STATUS.SUCCESS,
          gstinStatus: typeof result.gstinStatus === 'string' ? result.gstinStatus : null,
          businessName: typeof result.businessName === 'string' ? result.businessName : null,
          legalName: typeof result.legalName === 'string' ? result.legalName : null,
          providerClientId: typeof result.providerClientId === 'string' ? result.providerClientId : null,
          messageCode: typeof response.message_code === 'string' ? response.message_code : null,
          encryptedResult,
          rawDataExpiresAt: getGstRawDataExpiresAt(completedAt),
          completedAt,
        },
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          template: true,
        },
      });
      await this.writeAudit(requestedById, 'GST_VERIFICATION_SUCCEEDED', pending.id, {
        maskedGstin,
        status: GST_STATUS.SUCCESS,
        gstinStatus: completed.gstinStatus ?? null,
      });
      return { record: recordSummary(completed), result, template: null, cacheHit: false, ...(billing ? { billing } : {}) };
    } catch (error) {
      const normalized = isApiWalletBillingError(error)
        ? new GstVerificationError(error.message, error.statusCode, error.code)
        : error instanceof SurepassProviderError
        ? providerFailure(error)
        : error instanceof GstVerificationError
          ? error
          : new GstVerificationError('GST verification could not be completed.', 502, 'verification_failed');
      await this.markFailed(pending.id, normalized, error instanceof SurepassProviderError ? error.messageCode : null);
      await this.writeAudit(requestedById, 'GST_VERIFICATION_FAILED', pending.id, {
        maskedGstin,
        status: GST_STATUS.FAILED,
        code: normalized.code,
      });
      throw normalized;
    }
  }

  async verifyGstin(input: Record<string, unknown>, requestedById: string) {
    const gstin = normalizeGstin(input.id_number ?? input.gstin);
    const validationError = validateGstin(gstin);
    if (validationError) throw operationError(validationError);
    const payload = {
      id_number: gstin,
    };
    return this.run(gstin, requestedById, createVerificationFingerprint('GST_VERIFY', payload));
  }

  async listHistory(
    filters: { page?: unknown; limit?: unknown; status?: unknown; search?: unknown },
    requestedById?: string,
    role?: string,
  ) {
    const parsedPage = Number.parseInt(String(filters.page ?? '1'), 10);
    const parsedLimit = Number.parseInt(String(filters.limit ?? '20'), 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10_000) : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const status = typeof filters.status === 'string' && Object.values(GST_STATUS).includes(filters.status as typeof GST_STATUS[keyof typeof GST_STATUS])
      ? filters.status as typeof GST_STATUS[keyof typeof GST_STATUS]
      : undefined;
    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 30) : '';
    const where = {
      ...(role === 'EMPLOYEE' && requestedById ? { requestedById } : {}),
      ...(status ? { status } : {}),
      ...(search ? { maskedGstin: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [total, records] = await Promise.all([
      this.record.count({ where }),
      this.record.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          template: true,
        },
      }),
    ]);
    return {
      records: records.map(recordSummary),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async clearExpiredRawData(record: any) {
    if (isGstRawDataAvailable(record)) return record;
    if (record.status !== GST_STATUS.SUCCESS || !record.encryptedResult) return record;
    await this.record.update({
      where: { id: record.id },
      data: { encryptedResult: null, rawDataExpiresAt: null },
    });
    record.encryptedResult = null;
    record.rawDataExpiresAt = null;
    return record;
  }

  async cleanupExpiredRawData(now = new Date()) {
    if (!this.record.updateMany) return 0;
    const result = await this.record.updateMany({
      where: {
        status: GST_STATUS.SUCCESS,
        encryptedResult: { not: null },
        OR: [
          { rawDataExpiresAt: null },
          { rawDataExpiresAt: { lte: now } },
        ],
      },
      data: { encryptedResult: null, rawDataExpiresAt: null },
    });
    return result.count;
  }

  async uploadTemplate(
    recordId: string,
    requestedById: string,
    role: string,
    buffer: Buffer,
    mimeType: string,
  ) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new GstVerificationError('A GST template file is required.', 400, 'template_file_required');
    }
    if (buffer.length > MAX_GST_TEMPLATE_SIZE) {
      throw new GstVerificationError('The GST template must be 5 MB or smaller.', 400, 'template_file_too_large');
    }
    if (mimeType !== 'application/pdf') {
      throw new GstVerificationError('Only PDF GST templates are allowed.', 400, 'template_file_type_invalid');
    }
    if (buffer.length < PDF_SIGNATURE.length || !buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
      throw new GstVerificationError('The GST template file is invalid.', 400, 'template_file_signature_invalid');
    }

    const record = await this.record.findUnique({
      where: { id: recordId },
      include: { template: true },
    });
    if (!record) throw new GstVerificationError('GST verification record not found.', 404, 'record_not_found');
    if (['EMPLOYEE', 'PARTNER', 'CUSTOMER'].includes(role) && record.requestedById !== requestedById) {
      throw new GstVerificationError('You do not have access to this GST template.', 403, 'template_forbidden');
    }
    if (record.template) {
      if (record.encryptedResult) {
        await this.record.update({
          where: { id: record.id },
          data: { encryptedResult: null, rawDataExpiresAt: null },
        });
        record.encryptedResult = null;
        record.rawDataExpiresAt = null;
      }
      return { record: recordSummary(record), result: null, template: gstTemplateSummary(record.template), alreadyUploaded: true };
    }
    if (record.status !== GST_STATUS.SUCCESS || !record.encryptedResult) {
      throw new GstVerificationError('A successful GST result is required before uploading the template.', 409, 'template_result_unavailable');
    }
    if (!isGstRawDataAvailable(record)) {
      await this.clearExpiredRawData(record);
      throw new GstVerificationError('The five-minute GST template window has expired. Run verification again.', 410, 'gst_raw_data_expired');
    }

    const fileName = `gst-template-${record.id}.pdf`;
    let driveFileId: string | null = null;
    let templateId: string | null = null;
    try {
      const stored = await this.uploadTemplateFile(buffer, mimeType, fileName);
      driveFileId = stored.fileId;
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
      await this.record.update({
        where: { id: record.id },
        data: { encryptedResult: null, rawDataExpiresAt: null },
      });
      return {
        record: recordSummary({ ...record, encryptedResult: null, rawDataExpiresAt: null, template }),
        result: null,
        template: gstTemplateSummary(template),
      };
    } catch (error) {
      if (templateId && this.template.delete) await this.template.delete({ where: { id: templateId } });
      if (driveFileId) await this.deleteTemplateFile(driveFileId);
      throw new GstVerificationError(
        error instanceof GstVerificationError ? error.message : 'The GST template could not be stored securely.',
        error instanceof GstVerificationError ? error.statusCode : 502,
        error instanceof GstVerificationError ? error.code : 'template_storage_failed',
      );
    }
  }

  async getTemplateDownload(recordId: string, requestedById: string, role: string) {
    const record = await this.record.findUnique({
      where: { id: recordId },
      include: { template: true },
    });
    if (!record) throw new GstVerificationError('GST verification record not found.', 404, 'record_not_found');
    if (['EMPLOYEE', 'PARTNER', 'CUSTOMER'].includes(role) && record.requestedById !== requestedById) {
      throw new GstVerificationError('You do not have access to this GST template.', 403, 'template_forbidden');
    }
    if (!record.template) throw new GstVerificationError('GST template not found.', 404, 'template_not_found');
    return { ...gstTemplateSummary(record.template), driveFileId: record.template.driveFileId };
  }

  async getHistoryDetail(id: string, requestedById?: string, role?: string) {
    let record = await this.record.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        template: true,
      },
    });
    if (!record) throw new GstVerificationError('GST verification record not found.', 404, 'record_not_found');
    if (typeof role === 'string' && ['EMPLOYEE', 'PARTNER', 'CUSTOMER'].includes(role) && requestedById && record.requestedById !== requestedById) {
      throw new GstVerificationError('You do not have access to this GST history record.', 403, 'history_forbidden');
    }
    if (!record.template && record.requestFingerprint && record.requestedById) {
      const savedTemplateRecord = await this.record.findFirst({
        where: {
          requestFingerprint: record.requestFingerprint,
          requestedById: record.requestedById,
          status: GST_STATUS.SUCCESS,
          template: { isNot: null },
        },
        orderBy: { completedAt: 'desc' },
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          template: true,
        },
      });
      if (savedTemplateRecord?.template) record = savedTemplateRecord;
    }
    record = await this.clearExpiredRawData(record);
    let result: unknown = null;
    if (record.status === GST_STATUS.SUCCESS && isGstRawDataAvailable(record)) {
      try {
        const secret = await this.getDataSecret();
        result = JSON.parse(decryptPanData(record.encryptedResult, secret));
      } catch {
        throw new GstVerificationError('The stored GST verification result is unavailable.', 500, 'stored_result_unavailable');
      }
    }
    return { record: recordSummary(record), result, template: gstTemplateSummary(record.template) };
  }
}

export const gstVerificationService = new GstVerificationService();
