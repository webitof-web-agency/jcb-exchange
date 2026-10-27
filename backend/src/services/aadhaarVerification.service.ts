import {
  AadhaarVerificationSide,
  AadhaarVerificationStatus,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import {
  createSurepassClient,
  SurepassProviderError,
} from './surepassClient';
import {
  getPanVerificationRuntimeConfig,
  resolveSurepassEnvironment,
  type PanVerificationRuntimeConfig,
} from './panVerificationSettings.service';
import { createVerificationFingerprint, isFreshVerificationResult } from './verificationCache';
import {
  apiWalletBillingService,
  isApiWalletBillingError,
  type ApiBillingGateway,
} from './apiWalletBilling.service';

type SafeResult = {
  clientId: string;
  fullName: string | null;
  fatherName: string | null;
  careOf: string | null;
  dob: string | null;
  yob: string | null;
  gender: string | null;
  mobileNumber: string | null;
  maskedAadhaar: string | null;
  fullAddress: string | null;
  address: {
    country: string | null;
    district: string | null;
    state: string | null;
    postOffice: string | null;
    house: string | null;
    locality: string | null;
    vtc: string | null;
    subDistrict: string | null;
    street: string | null;
    landmark: string | null;
    pincode: string | null;
  };
  profileImage: string | null;
  xmlUrl: string | null;
};

type AadhaarRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

type AadhaarVerificationDependencies = {
  record?: AadhaarRecordRepository;
  provider?: ReturnType<typeof createSurepassClient>;
  dataSecret?: string;
  billing?: ApiBillingGateway;
};

export class AadhaarVerificationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AadhaarVerificationError';
  }
}

const safeString = (value: unknown, maxLength = 500) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

const objectValue = (value: unknown) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const normalizeDigits = (value: unknown) => typeof value === 'string' ? value.replace(/\D/g, '') : '';

const D_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV_TABLE = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

const isVerhoeffValid = (value: string) => {
  let checksum = 0;
  const digits = value.split('').reverse().map(Number);
  digits.forEach((digit, index) => {
    const permutation = P_TABLE[index % 8]?.[digit];
    const nextChecksum = permutation === undefined ? undefined : D_TABLE[checksum]?.[permutation];
    if (nextChecksum !== undefined) checksum = nextChecksum;
  });
  return checksum === 0;
};

export const validateAadhaarNumber = (value: unknown) => {
  const normalized = normalizeDigits(value);
  if (normalized.length !== 12 || normalized[0] === '0' || normalized[0] === '1' || !isVerhoeffValid(normalized)) {
    return 'Enter a valid 12-digit Aadhaar number.';
  }
  return null;
};

export const maskAadhaar = (value: unknown) => {
  const digits = normalizeDigits(value);
  return digits.length >= 4 ? `XXXXXXXX${digits.slice(-4)}` : 'XXXXXXXX';
};

export const aadhaarMatchesMasked = (enteredValue: unknown, returnedMaskedValue: unknown) => {
  const enteredDigits = normalizeDigits(enteredValue);
  const returnedDigits = normalizeDigits(returnedMaskedValue);
  return enteredDigits.length >= 4
    && returnedDigits.length >= 4
    && enteredDigits.slice(-4) === returnedDigits.slice(-4);
};

const imageDataUrl = (value: unknown) => {
  const raw = safeString(value, 2_000_000);
  if (!raw) return null;
  if (/^data:image\//i.test(raw)) return raw;
  const mime = raw.startsWith('/9j/') ? 'image/jpeg' : raw.startsWith('iVBOR') ? 'image/png' : raw.startsWith('R0lGOD') ? 'image/gif' : 'image/jpeg';
  return `data:${mime};base64,${raw}`;
};

const addressValue = (address: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = safeString(address[key], 200);
    if (value) return value;
  }
  return null;
};

const safeHttpsUrl = (value: unknown) => {
  const raw = safeString(value, 2_000);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export const normalizeAadhaarDownloadResult = (value: unknown): SafeResult => {
  const data = objectValue(value) || {};
  const metadata = objectValue(data.digilocker_metadata) || {};
  const xml = objectValue(data.aadhaar_xml_data) || {};
  const address = objectValue(xml.address) || {};
  const careOf = safeString(xml.care_of, 200);
  const fatherName = safeString(xml.father_name, 200) || careOf;

  return {
    clientId: safeString(data.client_id, 200) || '',
    fullName: safeString(xml.full_name, 200) || safeString(metadata.name, 200),
    fatherName,
    careOf,
    dob: safeString(xml.dob, 20) || safeString(metadata.dob, 20),
    yob: safeString(xml.yob, 10),
    gender: safeString(xml.gender, 20) || safeString(metadata.gender, 20),
    mobileNumber: safeString(metadata.mobile_number, 20),
    maskedAadhaar: safeString(xml.masked_aadhaar, 32),
    fullAddress: safeString(xml.full_address, 800),
    address: {
      country: addressValue(address, 'country'),
      district: addressValue(address, 'dist', 'district'),
      state: addressValue(address, 'state'),
      postOffice: addressValue(address, 'po', 'postOffice', 'post_office'),
      house: addressValue(address, 'house'),
      locality: addressValue(address, 'loc', 'locality'),
      vtc: addressValue(address, 'vtc'),
      subDistrict: addressValue(address, 'subdist', 'subDistrict', 'sub_district'),
      street: addressValue(address, 'street', 'streetName', 'street_name'),
      landmark: addressValue(address, 'landmark'),
      pincode: safeString(xml.zip, 12) || addressValue(address, 'zip', 'pincode', 'pinCode'),
    },
    profileImage: imageDataUrl(xml.profile_image),
    xmlUrl: safeHttpsUrl(data.xml_url),
  };
};

const providerClientIdFrom = (value: unknown) => {
  const data = objectValue(value);
  return safeString(data?.client_id ?? data?.clientId, 200);
};

const providerTokenFrom = (value: unknown) => {
  const data = objectValue(value);
  return safeString(data?.token, 4_096);
};

const responseData = (body: unknown) => {
  const response = objectValue(body);
  const data = objectValue(response?.data);
  if (!response || !data) throw new AadhaarVerificationError('Surepass returned an invalid Aadhaar response.', 502, 'provider_malformed_response');
  return { response, data };
};

const recordSummary = (record: any) => ({
  id: record.id,
  side: record.side,
  status: record.status,
  maskedAadhaar: record.maskedAadhaar,
  provider: record.provider,
  providerClientId: record.providerClientId || null,
  messageCode: record.messageCode || null,
  safeMessage: record.safeMessage || null,
  createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
  completedAt: record.completedAt instanceof Date ? record.completedAt.toISOString() : record.completedAt,
});

const providerFailure = (error: SurepassProviderError) => {
  const byKind: Record<string, { status: number; code: string; message: string }> = {
    INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'Aadhaar verification request could not be processed.' },
    AUTHENTICATION: { status: 502, code: 'provider_authentication_failed', message: 'Surepass rejected the configured credentials.' },
    FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'DigiLocker verification provider access is not available.' },
    RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many Aadhaar verification requests. Please try again later.' },
    PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'DigiLocker verification is temporarily unavailable.' },
    MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'Surepass returned an invalid Aadhaar response.' },
  };
  const safe = byKind[error.kind] || byKind.MALFORMED_RESPONSE;
  if (!safe) return new AadhaarVerificationError('Aadhaar verification provider returned an error.', 502, 'provider_malformed_response');
  return new AadhaarVerificationError(safe.message, safe.status, safe.code);
};

export class AadhaarVerificationService {
  private readonly record: AadhaarRecordRepository;
  private readonly provider: ReturnType<typeof createSurepassClient> | undefined;
  private readonly dataSecret: string | undefined;
  private readonly billing: ApiBillingGateway | undefined;

  constructor(dependencies: AadhaarVerificationDependencies = {}) {
    this.record = dependencies.record || (prisma as any).aadhaarVerificationRecord;
    this.provider = dependencies.provider;
    this.dataSecret = dependencies.dataSecret?.trim() || undefined;
    this.billing = dependencies.billing ?? (!dependencies.record ? apiWalletBillingService : undefined);
  }

  private async getRuntime() {
    if (this.provider && this.dataSecret) {
      return {
        provider: this.provider,
        dataSecret: this.dataSecret,
        environment: resolveSurepassEnvironment(process.env.SUREPASS_ENVIRONMENT || 'SANDBOX'),
      };
    }
    try {
      const config = await getPanVerificationRuntimeConfig();
      if (!config || !config.enabled || !config.baseUrl || !config.token || !config.dataSecret) throw new Error('Aadhaar verification is not configured.');
      return {
        provider: createSurepassClient({ baseUrl: config.baseUrl, token: config.token, ...(config.customerId ? { customerId: config.customerId } : {}) }),
        dataSecret: config.dataSecret,
        environment: config.environment,
      } satisfies { provider: ReturnType<typeof createSurepassClient>; dataSecret: string; environment: PanVerificationRuntimeConfig['environment'] };
    } catch {
      throw new AadhaarVerificationError('Aadhaar verification provider is not configured.', 503, 'provider_not_configured');
    }
  }

  private async markFailed(id: string, error: AadhaarVerificationError, messageCode: string | null = null) {
    try {
      await this.record.update({ where: { id }, data: { status: AadhaarVerificationStatus.FAILED, safeMessage: error.message, messageCode, completedAt: new Date() } });
    } catch {
      // Preserve the provider error if history persistence fails.
    }
  }

  async initialize(input: { aadhaarNumber?: unknown; side: unknown }, requestedById: string) {
    const rawNumber = typeof input.aadhaarNumber === 'string' ? input.aadhaarNumber.trim() : '';
    const hasAadhaar = Boolean(rawNumber);
    if (hasAadhaar) {
      const validationError = validateAadhaarNumber(rawNumber);
      if (validationError) throw new AadhaarVerificationError(validationError, 400, 'invalid_aadhaar');
    }
    const side = String(input.side || '').toUpperCase() as AadhaarVerificationSide;
    if (!Object.values(AadhaarVerificationSide).includes(side)) throw new AadhaarVerificationError('Aadhaar verification side is invalid.', 400, 'invalid_side');
    const aadhaarNumber = hasAadhaar ? normalizeDigits(rawNumber) : '';
    const maskedAadhaar = hasAadhaar ? maskAadhaar(aadhaarNumber) : 'PENDING';
    const requestFingerprint = hasAadhaar
      ? createVerificationFingerprint('AADHAAR_DIGILOCKER', { aadhaarNumber, side })
      : createVerificationFingerprint('AADHAAR_DIGILOCKER', { side, requestedById, nonce: Date.now() });
    const runtime = await this.getRuntime();
    if (hasAadhaar) {
      const cached = await this.record.findFirst({ where: { side, requestFingerprint, status: AadhaarVerificationStatus.SUCCESS, encryptedResult: { not: null }, completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, orderBy: { completedAt: 'desc' } });
      if (cached && isFreshVerificationResult(cached)) {
        try {
          return { record: recordSummary(cached), result: JSON.parse(decryptPanData(cached.encryptedResult, runtime.dataSecret)), cacheHit: true as const };
        } catch {
          // A corrupt cache is ignored and a fresh provider session is started.
        }
      }
    }
    const pending = await this.record.create({ data: { status: AadhaarVerificationStatus.PENDING, side, maskedAadhaar, requestFingerprint, requestedById } });
    let billing: Awaited<ReturnType<NonNullable<ApiBillingGateway['chargeForProviderCall']>>> | undefined;
    try {
      billing = this.billing
        ? await this.billing.chargeForProviderCall({ serviceKey: 'AADHAAR_DIGILOCKER', verificationRecordId: pending.id, requestedById, providerAttemptId: pending.id })
        : undefined;
      const body = await runtime.provider.initializeDigilocker({ signup_flow: true, auth_type: 'web', aadhaar_xml: true, skip_main_screen: false });
      const { data } = responseData(body);
      const clientId = providerClientIdFrom(data);
      const sdkToken = providerTokenFrom(data);
      if (!clientId || !sdkToken) throw new AadhaarVerificationError('Surepass did not return a DigiLocker session.', 502, 'provider_malformed_response');
      const updated = await this.record.update({ where: { id: pending.id }, data: { providerClientId: clientId } });
      return {
        record: recordSummary(updated),
        sdkToken,
        gateway: runtime.environment === 'PRODUCTION' ? 'production' : 'sandbox',
        expirySeconds: Number(data.expiry_seconds) || 600,
        billing: billing
          ? {
              charged: billing.charged,
              billingMode: billing.billingMode,
              amountRupees: billing.amountRupees,
              balanceRupees: billing.balanceRupees,
              serviceKey: billing.serviceKey,
            }
          : null,
      };
    } catch (error) {
      const normalized = isApiWalletBillingError(error)
        ? new AadhaarVerificationError(error.message, error.statusCode, error.code)
        : error instanceof SurepassProviderError
          ? providerFailure(error)
          : error instanceof AadhaarVerificationError
            ? error
            : new AadhaarVerificationError('Aadhaar verification could not be started.', 502, 'verification_failed');
      await this.markFailed(pending.id, normalized);
      if (billing?.usageId && this.billing?.reverseProviderCharge) await this.billing.reverseProviderCharge({ usageId: billing.usageId, reason: normalized.code });
      throw normalized;
    }
  }

  async complete(input: { recordId: unknown; clientId: unknown }, requestedById: string) {
    const recordId = safeString(input.recordId, 100);
    const clientId = safeString(input.clientId, 200);
    if (!recordId || !clientId) throw new AadhaarVerificationError('Aadhaar verification session is invalid.', 400, 'invalid_session');
    const record = await this.record.findUnique({ where: { id: recordId } });
    if (!record || record.requestedById !== requestedById) throw new AadhaarVerificationError('Aadhaar verification session was not found.', 404, 'session_not_found');
    if (record.status === AadhaarVerificationStatus.SUCCESS && record.encryptedResult) {
      const runtime = await this.getRuntime();
      return { record: recordSummary(record), result: JSON.parse(decryptPanData(record.encryptedResult, runtime.dataSecret)), cacheHit: true as const };
    }
    if (record.status !== AadhaarVerificationStatus.PENDING || record.providerClientId !== clientId) throw new AadhaarVerificationError('Aadhaar verification session has expired or is invalid.', 409, 'invalid_session');
    const runtime = await this.getRuntime();
    try {
      const body = await runtime.provider.downloadAadhaar(clientId);
      const { response, data } = responseData(body);
      const result = normalizeAadhaarDownloadResult(data);
      if (!result.clientId || !result.fullName || !result.maskedAadhaar) throw new AadhaarVerificationError('Surepass returned incomplete Aadhaar data.', 502, 'provider_malformed_response');
      if (record.maskedAadhaar && record.maskedAadhaar !== 'PENDING' && !aadhaarMatchesMasked(record.maskedAadhaar, result.maskedAadhaar)) {
        throw new AadhaarVerificationError('The DigiLocker Aadhaar does not match the entered Aadhaar number.', 409, 'aadhaar_mismatch');
      }
      const completed = await this.record.update({ where: { id: record.id }, data: { status: AadhaarVerificationStatus.SUCCESS, providerClientId: result.clientId, maskedAadhaar: result.maskedAadhaar, messageCode: safeString(response.message_code, 100), encryptedResult: encryptPanData(JSON.stringify(result), runtime.dataSecret), completedAt: new Date() } });
      return { record: recordSummary(completed), result, cacheHit: false as const };
    } catch (error) {
      const normalized = error instanceof SurepassProviderError
        ? providerFailure(error)
        : error instanceof AadhaarVerificationError
          ? error
          : new AadhaarVerificationError('Aadhaar data could not be downloaded.', 502, 'verification_failed');
      await this.markFailed(record.id, normalized, error instanceof SurepassProviderError ? error.messageCode : null);
      throw normalized;
    }
  }

  async cancel(recordIdValue: unknown, requestedById: string) {
    const recordId = safeString(recordIdValue, 100);
    if (!recordId) throw new AadhaarVerificationError('Aadhaar verification session was not found.', 404, 'session_not_found');
    const record = await this.record.findUnique({ where: { id: recordId } });
    if (!record || record.requestedById !== requestedById) throw new AadhaarVerificationError('Aadhaar verification session was not found.', 404, 'session_not_found');
    if (record.status !== AadhaarVerificationStatus.PENDING) return { record: recordSummary(record), cancelled: false };
    const usage = await (prisma as any).apiUsageRecord.findUnique({ where: { providerAttemptId: record.id }, select: { id: true } }).catch(() => null);
    if (usage?.id && this.billing?.reverseProviderCharge) {
      await this.billing.reverseProviderCharge({ usageId: usage.id, reason: 'user_cancelled' });
    }
    const cancelled = await this.record.update({ where: { id: record.id }, data: { status: AadhaarVerificationStatus.FAILED, safeMessage: 'Aadhaar verification was cancelled.', messageCode: 'cancelled', completedAt: new Date() } });
    return { record: recordSummary(cancelled), cancelled: true };
  }

  async getHistoryDetail(id: string, requestedById: string) {
    const record = await this.record.findUnique({ where: { id } });
    if (!record || record.requestedById !== requestedById) throw new AadhaarVerificationError('Aadhaar verification record not found.', 404, 'record_not_found');
    let result: SafeResult | null = null;
    if (record.status === AadhaarVerificationStatus.SUCCESS && record.encryptedResult) {
      try {
        const runtime = await this.getRuntime();
        result = JSON.parse(decryptPanData(record.encryptedResult, runtime.dataSecret)) as SafeResult;
      } catch {
        throw new AadhaarVerificationError('The stored Aadhaar verification result is unavailable.', 500, 'stored_result_unavailable');
      }
    }
    return { record: recordSummary(record), result };
  }
}

export const aadhaarVerificationService = new AadhaarVerificationService();
