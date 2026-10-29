import {
  PanVerificationOperation,
  PanVerificationStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import prisma from '../lib/prisma';
import {
  buildPanContactPayload,
  buildPanVerifyPayload,
  maskPan,
  normalizeMaskedAadhaar,
  normalizeFullName,
  normalizePan,
  sanitizeContactResults,
  validateDateOfBirth,
  validateFullName,
  validatePan,
} from './panVerification.validation';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import {
  createSurepassClient,
  SurepassProviderError,
  type SurepassErrorKind,
} from './surepassClient';
import {
  getPanVerificationRuntimeConfig,
  resolveSurepassEnvironment,
  type PanVerificationRuntimeConfig,
} from './panVerificationSettings.service';
import { createVerificationFingerprint } from './verificationCache';
import { deleteFileFromDrive, uploadFileToDrive } from './googleDrive.service';
import {
  apiWalletBillingService,
  isApiWalletBillingError,
  type ApiBillingGateway,
} from './apiWalletBilling.service';

type PanRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  updateMany?: (args: any) => Promise<{ count: number }>;
};

type PanTemplateRepository = {
  findUnique: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  delete?: (args: any) => Promise<any>;
};

type PanTemplateUploader = (
  buffer: Buffer,
  mimeType: string,
  filename: string,
) => Promise<{ fileId: string }>;

type PanVerificationDependencies = {
  record?: PanRecordRepository;
  template?: PanTemplateRepository;
  provider?: ReturnType<typeof createSurepassClient>;
  dataSecret?: string;
  billing?: ApiBillingGateway;
  uploadTemplateFile?: PanTemplateUploader;
  deleteTemplateFile?: (fileId: string) => Promise<void>;
};

type SafeResult = Record<string, unknown>;

export const PAN_RAW_DATA_TTL_MS = 5 * 60 * 1000;
export const MAX_PAN_TEMPLATE_SIZE = 1 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const getPanRawDataExpiresAt = (completedAt = new Date()) =>
  new Date(completedAt.getTime() + PAN_RAW_DATA_TTL_MS);

export const isPanRawDataAvailable = (
  record: { encryptedResult?: unknown; rawDataExpiresAt?: unknown },
  now = Date.now(),
) => {
  if (typeof record.encryptedResult !== 'string' || !record.encryptedResult) return false;
  const expiresAt = record.rawDataExpiresAt instanceof Date
    ? record.rawDataExpiresAt.getTime()
    : new Date(String(record.rawDataExpiresAt ?? '')).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
};

const panTemplateSummary = (template: any) => template ? {
  id: template.id,
  fileName: template.fileName,
  mimeType: template.mimeType,
  fileSize: template.fileSize,
  sha256: template.sha256,
  createdAt: template.createdAt instanceof Date ? template.createdAt.toISOString() : template.createdAt,
} : null;

export class PanVerificationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'PanVerificationError';
  }
}

const safeString = (value: unknown, maxLength = 200) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

const objectValue = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const providerClientIdFrom = (value: unknown) => {
  const data = objectValue(value);
  return safeString(data?.client_id ?? data?.clientId, 150);
};

export const sanitizePanVerifyResult = (pan: string, value: unknown): SafeResult => {
  const data = objectValue(value) || {};
  const result: SafeResult = { pan: maskPan(pan) };
  const fullName = normalizeFullName(data.full_name ?? data.fullName);
  const dob = safeString(data.dob, 10);
  const status = safeString(data.status, 50);
  const providerClientId = providerClientIdFrom(data);

  if (fullName) result.fullName = fullName;
  if (dob) result.dob = dob;
  if (status) result.status = status;
  if (providerClientId) result.providerClientId = providerClientId;
  return result;
};

export const sanitizeAadhaarResult = (pan: string, value: unknown): SafeResult => {
  const data = objectValue(value) || {};
  return {
    pan: maskPan(pan),
    aadhaarNumber: normalizeMaskedAadhaar(data.aadhaar_number ?? data.aadhaarNumber),
  };
};

const stringList = (value: unknown) => {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
};

export const sanitizeContactResult = (pan: string, value: unknown): SafeResult => {
  const data = objectValue(value) || {};
  const normalized = sanitizeContactResults({
    email_id: stringList(data.email_id ?? data.email),
    mobile_number: stringList(data.mobile_number ?? data.mobile),
  });

  return {
    pan: maskPan(pan),
    emails: normalized.emails.slice(0, 20),
    mobileNumbers: normalized.mobileNumbers.slice(0, 20),
  };
};

const safeBoolean = (value: unknown) => (typeof value === 'boolean' ? value : null);

const sanitizeComprehensiveAddress = (value: unknown) => {
  const address = objectValue(value) || {};
  return {
    line1: safeString(address.line_1 ?? address.line1, 200),
    line2: safeString(address.line_2 ?? address.line2, 200),
    streetName: safeString(address.street_name ?? address.streetName, 200),
    zip: safeString(address.zip ?? address.pincode ?? address.pinCode, 20),
    city: safeString(address.city, 120),
    state: safeString(address.state, 120),
    country: safeString(address.country, 80),
    full: safeString(address.full, 500),
  };
};

const sanitizeComprehensiveNameParts = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((item) => item.slice(0, 100));
};

const sanitizeCompleteProviderData = (value: unknown, depth = 0, key = ''): unknown => {
  if (depth > 8 || value === undefined) return null;
  if (value === null) return null;
  if (/(^|_)(secret|token|password|authorization|api_key)($|_)/i.test(key)) return null;
  if (typeof value === 'string') {
    if (key === 'pan_number' || key === 'panNumber') {
      const normalized = normalizePan(value);
      return normalized ? maskPan(normalized) : null;
    }
    return value.trim().slice(0, 2_000);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeCompleteProviderData(item, depth + 1, key));
  const object = objectValue(value);
  if (!object) return null;
  return Object.fromEntries(
    Object.entries(object)
      .slice(0, 200)
      .filter(([entryKey]) => !/(^|_)(secret|token|password|authorization|api_key)($|_)/i.test(entryKey))
      .map(([entryKey, entryValue]) => [entryKey.slice(0, 100), sanitizeCompleteProviderData(entryValue, depth + 1, entryKey)])
  );
};

export const sanitizePanComprehensiveV2Result = (pan: string, value: unknown): SafeResult => {
  const data = objectValue(value) || {};
  const details = objectValue(data.pan_details ?? data.panDetails) || data;
  const providerPan = normalizePan(data.pan_number ?? data.panNumber);
  const providerClientId = providerClientIdFrom(data);
  const advancedPanStatus = safeString(data.pan_status ?? data.panStatus, 50);
  const advancedPanStatusDescription = safeString(data.pan_status_desc ?? data.panStatusDesc, 200);
  const advancedAadhaarSeedingStatus = safeString(data.aadhaar_seeding_status ?? data.aadhaarSeedingStatus, 20);
  const advancedAadhaarSeedingDescription = safeString(
    data.aadhaar_seeding_status_desc ?? data.aadhaarSeedingStatusDesc,
    200,
  );
  const advancedAadhaarLinked = advancedAadhaarSeedingStatus === 'Y'
    ? true
    : advancedAadhaarSeedingStatus === 'R'
      ? false
      : safeBoolean(details.aadhaar_linked ?? details.aadhaarLinked);
  const panDetails: SafeResult = {
    fullName: normalizeFullName(data.full_name ?? data.fullName ?? details.full_name ?? details.fullName),
    fullNameSplit: sanitizeComprehensiveNameParts(data.full_name_split ?? data.fullNameSplit ?? details.full_name_split ?? details.fullNameSplit),
    maskedAadhaar: normalizeMaskedAadhaar(data.masked_aadhaar ?? data.maskedAadhaar ?? details.masked_aadhaar ?? details.maskedAadhaar),
    address: sanitizeComprehensiveAddress(data.address ?? details.address),
    email: safeString(data.email ?? details.email, 200),
    phoneNumber: safeString(data.phone_number ?? data.phoneNumber ?? details.phone_number ?? details.phoneNumber, 40),
    gender: safeString(data.gender ?? details.gender, 20),
    dob: safeString(data.dob ?? details.dob, 10),
    inputDob: safeString(data.input_dob ?? data.inputDob ?? details.input_dob ?? details.inputDob, 10),
    aadhaarLinked: advancedAadhaarLinked,
    dobVerified: safeBoolean(data.dob_verified ?? data.dobVerified ?? details.dob_verified ?? details.dobVerified),
    dobCheck: safeBoolean(data.dob_check ?? data.dobCheck ?? details.dob_check ?? details.dobCheck),
    category: safeString(data.category ?? details.category, 50),
    lessInfo: safeBoolean(data.less_info ?? data.lessInfo ?? details.less_info ?? details.lessInfo),
    status: advancedPanStatusDescription || safeString(data.status ?? details.status, 50),
  };
  const rawFather = normalizeFullName(
    data.father_name ??
    data.fatherName ??
    details.father_name ??
    details.fatherName ??
    (objectValue(data.pan_to_father_name))?.father_name ??
    (objectValue(data.pan_to_father_name))?.fatherName ??
    data.care_of ??
    details.care_of
  );
  const optionalPanDetails: Array<[string, unknown]> = [
    ...(rawFather ? [['fatherName', rawFather] as [string, unknown]] : []),
    ['title', safeString(data.title, 20)],
    ['panStatus', advancedPanStatus],
    ['panStatusDescription', advancedPanStatusDescription],
    ['aadhaarSeedingStatus', advancedAadhaarSeedingStatus],
    ['aadhaarSeedingStatusDescription', advancedAadhaarSeedingDescription],
    ['panModifiedDate', safeString(data.pan_modified_date ?? data.panModifiedDate, 30)],
  ];
  for (const [key, optionalValue] of optionalPanDetails) {
    if (optionalValue !== null) panDetails[key] = optionalValue;
  }
  const result: SafeResult = {
    pan: maskPan(providerPan || pan),
    panNumber: maskPan(providerPan || pan),
    panDetails,
    isSoleProprietor: safeBoolean(data.is_sole_proprietor ?? data.isSoleProprietor),
    isDirector: safeBoolean(data.is_director ?? data.isDirector),
    isSalaried: safeBoolean(data.is_salaried ?? data.isSalaried),
    providerData: sanitizeCompleteProviderData(data),
  };

  if (providerClientId) result.providerClientId = providerClientId;
  return result;
};

const recordSummary = (record: any) => ({
  id: record.id,
  operation: record.operation,
  status: record.status,
  maskedPan: record.maskedPan,
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
  template: panTemplateSummary(record.template),
});

const providerFailure = (error: SurepassProviderError) => {
  const byKind: Record<SurepassErrorKind, { status: number; code: string; message: string }> = {
    INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'The PAN details could not be verified.' },
    AUTHENTICATION: {
      status: 502,
      code: 'provider_authentication_failed',
      message: 'Surepass rejected the configured credentials. Check that the API token belongs to the selected environment and that the Surepass base URL is correct.',
    },
    FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'PAN verification provider access is not available.' },
    RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many verification requests. Please try again later.' },
    PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'PAN verification is temporarily unavailable. Please try again later.' },
    MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'PAN verification provider returned an invalid response.' },
  };
  const safe = byKind[error.kind];
  return new PanVerificationError(safe.message, safe.status, safe.code);
};

const operationError = (message: string, statusCode = 400, code = 'invalid_pan_request') =>
  new PanVerificationError(message, statusCode, code);

const extractInputPan = (input: Record<string, unknown>) => input.id_number ?? input.pan ?? input.pan_number;

const ensurePan = (input: Record<string, unknown>) => {
  const pan = normalizePan(extractInputPan(input));
  const validation = validatePan(pan);
  if (!validation.valid) throw operationError(validation.message || 'Enter a valid PAN number.');
  return pan;
};

const ensureProviderData = (body: unknown) => {
  const response = objectValue(body);
  const data = objectValue(response?.data);
  if (!response || !data) {
    throw new PanVerificationError('PAN verification provider returned an invalid response.', 502, 'provider_malformed_response');
  }
  return { response, data };
};

export class PanVerificationService {
  private readonly record: PanRecordRepository;
  private readonly template: PanTemplateRepository;
  private readonly provider: ReturnType<typeof createSurepassClient> | undefined;
  private readonly dataSecret: string | undefined;
  private readonly billing: ApiBillingGateway | undefined;
  private readonly uploadTemplateFile: PanTemplateUploader;
  private readonly deleteTemplateFile: (fileId: string) => Promise<void>;

  constructor(dependencies: PanVerificationDependencies = {}) {
    this.record = dependencies.record || (prisma as any).panVerificationRecord;
    this.template = dependencies.template || (prisma as any).panVerificationTemplate;
    this.provider = dependencies.provider;
    // Production resolves the active encrypted settings secret at request time.
    // Only isolated tests/custom runtimes may inject a direct secret.
    this.dataSecret = dependencies.dataSecret?.trim() || undefined;
    this.billing = dependencies.billing ?? (!dependencies.record ? apiWalletBillingService : undefined);
    this.uploadTemplateFile = dependencies.uploadTemplateFile || (async (buffer, mimeType, filename) => {
      const result = await uploadFileToDrive(buffer, mimeType, filename, undefined, { access: 'private' });
      return { fileId: result.fileId };
    });
    this.deleteTemplateFile = dependencies.deleteTemplateFile || deleteFileFromDrive;
  }

  private async getRuntime() {
    if (this.provider && this.dataSecret) {
      return {
        provider: this.provider,
        dataSecret: this.dataSecret,
        environment: resolveSurepassEnvironment(process.env.SUREPASS_ENVIRONMENT || 'SANDBOX'),
        baseUrl: '',
        token: '',
        customerId: null,
        enabled: true,
      } satisfies PanVerificationRuntimeConfig & { provider: ReturnType<typeof createSurepassClient> };
    }

    try {
      const config = await getPanVerificationRuntimeConfig();
      if (!config || !config.enabled || !config.baseUrl || !config.token || !config.dataSecret) {
        throw new Error('PAN Verification is not configured.');
      }

      return {
        provider: createSurepassClient({
          baseUrl: config.baseUrl,
          token: config.token,
          ...(config.customerId ? { customerId: config.customerId } : {}),
        }),
        dataSecret: config.dataSecret,
        environment: config.environment,
        baseUrl: config.baseUrl,
        token: config.token,
        customerId: config.customerId,
        enabled: config.enabled,
      };
    } catch {
      throw new PanVerificationError('PAN verification provider is not configured.', 503, 'provider_not_configured');
    }
  }

  private async getDataSecret() {
    if (this.dataSecret) return this.dataSecret;

    const config = await getPanVerificationRuntimeConfig();
    if (!config?.dataSecret) {
      throw new PanVerificationError('PAN verification data encryption is not configured.', 503, 'data_encryption_not_configured');
    }
    return config.dataSecret;
  }

  private async ensureNoRecentDuplicate(operation: PanVerificationOperation, requestFingerprint: string) {
    const recentSince = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await this.record.findFirst({
      where: {
        operation,
        requestFingerprint,
        status: PanVerificationStatus.PENDING,
        createdAt: { gte: recentSince },
      },
      select: { id: true },
    });
    if (existing) {
      throw operationError('This verification is already in progress. Please wait a moment.', 409, 'verification_in_progress');
    }
  }

  private async findFreshCachedResult(operation: PanVerificationOperation, requestFingerprint: string, dataSecret: string) {
    const cached = await this.record.findFirst({
      where: {
        operation,
        requestFingerprint,
        status: PanVerificationStatus.SUCCESS,
        rawDataExpiresAt: { gt: new Date() },
        encryptedResult: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        template: true,
      },
    });
    if (!cached || !isPanRawDataAvailable(cached)) return null;
    try {
      return {
        record: recordSummary(cached),
        result: JSON.parse(decryptPanData(cached.encryptedResult, dataSecret)) as SafeResult,
        template: panTemplateSummary(cached.template),
        cacheHit: true,
      };
    } catch {
      return null;
    }
  }
  private async markFailed(id: string, error: PanVerificationError, messageCode: string | null = null) {
    try {
      await this.record.update({
        where: { id },
        data: {
          status: PanVerificationStatus.FAILED,
          safeMessage: error.message,
          messageCode,
          completedAt: new Date(),
        },
      });
    } catch {
      // Do not replace the safe provider error with a persistence error.
    }
  }

  private async run<T extends SafeResult>(params: {
    operation: PanVerificationOperation;
    pan: string;
    requestedById: string;
    requestFingerprint: string;
      providerCall: (
        provider: ReturnType<typeof createSurepassClient>,
        runtime: PanVerificationRuntimeConfig,
      ) => Promise<unknown>;
    sanitize: (data: unknown) => T;
  }) {
    const runtime = await this.getRuntime();
    const maskedPan = maskPan(params.pan);
    const cached = await this.findFreshCachedResult(params.operation, params.requestFingerprint, runtime.dataSecret);
    if (cached) return cached;
    await this.ensureNoRecentDuplicate(params.operation, params.requestFingerprint);

    const existing = await this.record.findFirst({
      where: { operation: params.operation, requestFingerprint: params.requestFingerprint },
      orderBy: { completedAt: 'desc' },
      include: { template: true },
    });
    const pending = existing && !existing.template
      ? await this.record.update({
          where: { id: existing.id },
          data: {
            operation: params.operation,
            status: PanVerificationStatus.PENDING,
            maskedPan,
            requestFingerprint: params.requestFingerprint,
            requestedById: params.requestedById,
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
            operation: params.operation,
            status: PanVerificationStatus.PENDING,
            maskedPan,
            requestFingerprint: params.requestFingerprint,
            requestedById: params.requestedById,
          },
        });

    try {
      const billing = this.billing
        ? await this.billing.chargeForProviderCall({
            serviceKey: 'PAN_VERIFICATION',
            verificationRecordId: pending.id,
            requestedById: params.requestedById,
          })
        : undefined;
      const body = await params.providerCall(runtime.provider, runtime);
      const { response, data } = ensureProviderData(body);
      const result = params.sanitize(data);
      const completedAt = new Date();
      const rawDataExpiresAt = getPanRawDataExpiresAt(completedAt);
      const encryptedResult = encryptPanData(JSON.stringify(result), runtime.dataSecret);
      const completed = await this.record.update({
        where: { id: pending.id },
        data: {
          status: PanVerificationStatus.SUCCESS,
          providerClientId: providerClientIdFrom(data),
          messageCode: safeString(response.message_code, 100),
          encryptedResult,
          completedAt,
          rawDataExpiresAt,
        },
      });

      return { record: recordSummary(completed), result, template: null, cacheHit: false, ...(billing ? { billing } : {}) };
    } catch (error) {
      const normalized = isApiWalletBillingError(error)
        ? new PanVerificationError(error.message, error.statusCode, error.code)
        : error instanceof SurepassProviderError
        ? providerFailure(error)
        : error instanceof PanVerificationError
          ? error
          : new PanVerificationError('PAN verification could not be completed.', 502, 'verification_failed');
      await this.markFailed(
        pending.id,
        normalized,
        error instanceof SurepassProviderError ? error.messageCode : null,
      );
      throw normalized;
    }
  }

  async verifyPan(input: Record<string, unknown>, requestedById: string) {
    const pan = ensurePan(input);
    const fullName = normalizeFullName(input.full_name ?? input.fullName ?? input.name);
    const nameValidation = validateFullName(fullName);
    if (!nameValidation.valid) throw operationError(nameValidation.message || 'Full name is required.');
    const dob = typeof input.dob === 'string' ? input.dob.trim() : '';
    const dobValidation = validateDateOfBirth(dob);
    if (!dobValidation.valid) throw operationError(dobValidation.message || 'Enter a valid date of birth.');
    const payload = buildPanVerifyPayload({ id_number: pan, full_name: fullName, dob });

    return this.run({
      operation: PanVerificationOperation.PAN_VERIFY,
      pan,
      requestedById,
      requestFingerprint: createVerificationFingerprint('PAN_VERIFY', payload),
      providerCall: (provider) => provider.verifyPan(payload),
      sanitize: (data) => sanitizePanVerifyResult(pan, data),
    });
  }

  async getPanToAadhaar(input: Record<string, unknown>, requestedById: string) {
    const pan = ensurePan(input);
    const payload = { pan_number: pan };
    return this.run({
      operation: PanVerificationOperation.PAN_TO_AADHAAR,
      pan,
      requestedById,
      requestFingerprint: createVerificationFingerprint('PAN_TO_AADHAAR', payload),
      providerCall: (provider) => provider.getPanLinkedAadhaar(payload),
      sanitize: (data) => sanitizeAadhaarResult(pan, data),
    });
  }

  async getPanToContacts(input: Record<string, unknown>, requestedById: string) {
    const pan = ensurePan(input);
    const fetchEmail = input.fetch_email === true || input.fetchEmail === true;
    const payload = buildPanContactPayload(pan, fetchEmail);
    return this.run({
      operation: PanVerificationOperation.PAN_CONTACT_LOOKUP,
      pan,
      requestedById,
      requestFingerprint: createVerificationFingerprint('PAN_CONTACT_LOOKUP', payload),
      providerCall: (provider) => provider.getPanLinkedContacts(payload),
      sanitize: (data) => sanitizeContactResult(pan, data),
    });
  }

  async getPanComprehensiveV2(input: Record<string, unknown>, requestedById: string) {
    const pan = ensurePan(input);
    const payload = { id_number: pan };
    return this.run({
      operation: PanVerificationOperation.PAN_COMPREHENSIVE_V2,
      pan,
      requestedById,
      requestFingerprint: createVerificationFingerprint('PAN_COMPREHENSIVE_V2', payload),
      providerCall: async (provider, runtime) => {
        // Concurrently query PAN Comprehensive and PAN to Father Name
        const compPromise = provider.getPanComprehensiveV2(payload, runtime.environment);
        const fatherPromise = typeof provider.getPanFatherName === 'function'
          ? provider.getPanFatherName(payload).catch(() => null)
          : Promise.resolve(null);

        const [compBody, fatherBody] = await Promise.all([compPromise, fatherPromise]);
        const compData = objectValue(compBody?.data);

        if (compData && fatherBody) {
          const fatherData = objectValue(fatherBody.data);
          if (fatherData) {
            const fetchedFather = normalizeFullName(
              fatherData.father_name ??
              fatherData.fatherName
            );
            if (fetchedFather) {
              compData.father_name = fetchedFather;
              compData.fatherName = fetchedFather;
              const details = objectValue(compData.pan_details ?? compData.panDetails);
              if (details) {
                details.father_name = fetchedFather;
                details.fatherName = fetchedFather;
              }
            }
            compData.pan_to_father_name = fatherData;
          }
        }

        return compBody;
      },
      sanitize: (data) => sanitizePanComprehensiveV2Result(pan, data),
    });
  }

  async listHistory(
    filters: { page?: unknown; limit?: unknown; operation?: unknown; status?: unknown; search?: unknown },
    requestedById?: string,
    role?: string,
  ) {
    const pageValue = Number.parseInt(String(filters.page ?? '1'), 10);
    const limitValue = Number.parseInt(String(filters.limit ?? '20'), 10);
    const page = Number.isFinite(pageValue) && pageValue > 0 ? Math.min(pageValue, 10_000) : 1;
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 20;
    const operation = typeof filters.operation === 'string' && Object.values(PanVerificationOperation).includes(filters.operation as PanVerificationOperation)
      ? filters.operation as PanVerificationOperation
      : undefined;
    const status = typeof filters.status === 'string' && Object.values(PanVerificationStatus).includes(filters.status as PanVerificationStatus)
      ? filters.status as PanVerificationStatus
      : undefined;
    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 20) : '';
    const where = {
      ...(role === 'EMPLOYEE' && requestedById ? { requestedById } : {}),
      ...(operation ? { operation } : {}),
      ...(status ? { status } : {}),
      ...(search ? { maskedPan: { contains: search, mode: 'insensitive' } } : {}),
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

  private async canViewContactResult(requestedById: string, role: string) {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;
    const user = await prisma.user.findUnique({
      where: { id: requestedById },
      select: { customRole: { select: { permissions: true } }, adminPermissions: { select: { permission: true } } },
    });
    const permissions = Array.isArray(user?.customRole?.permissions)
      ? user.customRole.permissions
      : (user?.adminPermissions || []).map((item) => item.permission);
    return permissions.includes('ALL_ACCESS') || permissions.includes('pan.verification.contact');
  }

  private async clearExpiredRawData(record: any) {
    if (record.status !== PanVerificationStatus.SUCCESS || !record.encryptedResult || isPanRawDataAvailable(record)) {
      return record;
    }

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
        status: PanVerificationStatus.SUCCESS,
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
      throw new PanVerificationError('A PAN template file is required.', 400, 'template_file_required');
    }
    if (buffer.length > MAX_PAN_TEMPLATE_SIZE) {
      throw new PanVerificationError('The PAN template must be 1 MB or smaller.', 413, 'template_file_too_large');
    }
    if (mimeType !== 'image/png') {
      throw new PanVerificationError('Only PNG PAN templates are allowed.', 400, 'template_file_type_invalid');
    }
    if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new PanVerificationError('The PAN template file is invalid.', 400, 'template_file_signature_invalid');
    }

    const record = await this.record.findUnique({
      where: { id: recordId },
      include: { template: true },
    });
    if (!record) throw new PanVerificationError('PAN verification record not found.', 404, 'record_not_found');
    if (['EMPLOYEE', 'PARTNER', 'CUSTOMER'].includes(role) && record.requestedById !== requestedById) {
      throw new PanVerificationError('You do not have access to this PAN template.', 403, 'template_forbidden');
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
      return { record: recordSummary(record), result: null, template: panTemplateSummary(record.template), alreadyUploaded: true };
    }
    if (record.status !== PanVerificationStatus.SUCCESS || !record.encryptedResult) {
      throw new PanVerificationError('A successful PAN result is required before uploading the template.', 409, 'template_result_unavailable');
    }
    if (!isPanRawDataAvailable(record)) {
      await this.clearExpiredRawData(record);
      throw new PanVerificationError('The five-minute PAN template window has expired. Run verification again.', 410, 'pan_raw_data_expired');
    }

    const fileName = `pan-template-${record.id}.png`;
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
      return { record: recordSummary({ ...record, encryptedResult: null, rawDataExpiresAt: null }), result: null, template: panTemplateSummary(template) };
    } catch (error) {
      if (templateId && this.template.delete) await this.template.delete({ where: { id: templateId } });
      if (driveFileId) await this.deleteTemplateFile(driveFileId);
      throw new PanVerificationError(
        error instanceof PanVerificationError ? error.message : 'The PAN template could not be stored securely.',
        error instanceof PanVerificationError ? error.statusCode : 502,
        error instanceof PanVerificationError ? error.code : 'template_storage_failed',
      );
    }
  }

  async getTemplateDownload(recordId: string, requestedById: string, role: string) {
    const record = await this.record.findUnique({
      where: { id: recordId },
      include: { template: true },
    });
    if (!record) throw new PanVerificationError('PAN verification record not found.', 404, 'record_not_found');
    if (['EMPLOYEE', 'PARTNER', 'CUSTOMER'].includes(role) && record.requestedById !== requestedById) {
      throw new PanVerificationError('You do not have access to this PAN template.', 403, 'template_forbidden');
    }
    if (!record.template) throw new PanVerificationError('PAN template not found.', 404, 'template_not_found');
    return { ...panTemplateSummary(record.template), driveFileId: record.template.driveFileId };
  }

  async getHistoryDetail(id: string, requestedById: string, role: string) {
    let record = await this.record.findUnique({
      where: { id },
      include: { requestedBy: { select: { id: true, name: true, email: true } }, template: true },
    });
    if (!record) throw new PanVerificationError('PAN verification record not found.', 404, 'record_not_found');
    if (['EMPLOYEE', 'PARTNER', 'CUSTOMER'].includes(role) && record.requestedById !== requestedById) {
      throw new PanVerificationError('You do not have access to this PAN history record.', 403, 'history_forbidden');
    }

    record = await this.clearExpiredRawData(record);
    let result: unknown = null;
    if (record.status === PanVerificationStatus.SUCCESS && isPanRawDataAvailable(record)) {
      if (
        record.operation === PanVerificationOperation.PAN_CONTACT_LOOKUP &&
        !(await this.canViewContactResult(requestedById, role))
      ) {
        throw new PanVerificationError('You do not have permission to view contact results.', 403, 'contact_result_forbidden');
      }
      try {
        result = JSON.parse(decryptPanData(record.encryptedResult, await this.getDataSecret()));
      } catch {
        throw new PanVerificationError('The stored verification result is unavailable.', 500, 'stored_result_unavailable');
      }
    }

    return { record: recordSummary(record), result, template: panTemplateSummary(record.template) };
  }
}

export const panVerificationService = new PanVerificationService();
