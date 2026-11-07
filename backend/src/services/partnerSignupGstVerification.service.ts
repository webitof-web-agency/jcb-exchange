import { createHash, createHmac, randomBytes } from 'node:crypto';
import prisma from '../lib/prisma';
import { encryptPanData, decryptPanData } from './panVerification.dataCrypto';
import { getPanVerificationRuntimeConfig } from './panVerificationSettings.service';
import {
  GstVerificationError,
  maskGstin,
  normalizeGstVerificationResult,
} from './gstVerification.service';
import { normalizeGstin, validateGstin } from './gstVerification.validation';
import { createSurepassClient, SurepassProviderError } from './surepassClient';
import { createVerificationFingerprint } from './verificationCache';
import { resolveJwtSecret } from '../utils/jwtSecret';
import { validateBusinessEmail } from '../utils/businessEmail';

const CLAIM_TTL_MS = 10 * 60 * 1000;
const GST_STATUS = { PENDING: 'PENDING', SUCCESS: 'SUCCESS', FAILED: 'FAILED' } as const;

type SignupGstRecordRepository = {
  findFirst: (args: any) => Promise<any>;
  findUnique?: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  updateMany?: (args: any) => Promise<{ count: number }>;
};

type SignupGstProvider = {
  verifyGstin: (payload: { id_number: string }) => Promise<unknown>;
};

type SignupGstDependencies = {
  record?: SignupGstRecordRepository;
  provider?: SignupGstProvider;
  dataSecret?: string;
  claimSecret?: string;
  now?: () => Date;
};

const objectOf = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const safeText = (value: unknown, maxLength = 500) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

const normalizeEmail = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const normalizeMobile = (value: unknown) => typeof value === 'string' ? value.replace(/\D/g, '').slice(-10) : '';
const numberId = (value: unknown) => Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;

export const hashSignupIdentity = (value: string, secret = resolveJwtSecret()) =>
  createHmac('sha256', secret).update(value, 'utf8').digest('hex');

export const hashSignupClaim = (claimToken: string) =>
  createHash('sha256').update(claimToken, 'utf8').digest('hex');

const providerError = (error: unknown) => {
  if (error instanceof SurepassProviderError) {
    const messages: Record<string, { status: number; code: string; message: string }> = {
      INVALID_REQUEST: { status: 422, code: 'provider_invalid_request', message: 'The GSTIN details could not be verified.' },
      AUTHENTICATION: { status: 502, code: 'provider_configuration_error', message: 'GST verification provider configuration is invalid.' },
      FORBIDDEN: { status: 502, code: 'provider_access_denied', message: 'GST verification provider access is not available.' },
      RATE_LIMIT: { status: 429, code: 'provider_rate_limited', message: 'Too many GST verification requests. Please try again later.' },
      PROVIDER_UNAVAILABLE: { status: 503, code: 'provider_unavailable', message: 'GST verification is temporarily unavailable. Please try again later.' },
      MALFORMED_RESPONSE: { status: 502, code: 'provider_malformed_response', message: 'GST verification provider returned an invalid response.' },
    };
    const safe = messages[error.kind] ?? messages.PROVIDER_UNAVAILABLE!;
    return new GstVerificationError(safe.message, safe.status, safe.code);
  }
  if (error instanceof GstVerificationError) return error;
  return new GstVerificationError('GST verification could not be completed.', 502, 'verification_failed');
};

const resultSummary = (record: any, result: Record<string, unknown>, claimToken: string) => ({
  claimToken,
  status: record.status,
  maskedGstin: record.maskedGstin,
  gstinStatus: record.gstinStatus ?? null,
  businessName: record.businessName ?? null,
  legalName: record.legalName ?? null,
  expiresAt: record.expiresAt instanceof Date ? record.expiresAt.toISOString() : record.expiresAt,
  result: {
    gstin: result.gstin,
    businessName: result.businessName ?? null,
    legalName: result.legalName ?? null,
    gstinStatus: result.gstinStatus ?? null,
    address: result.address ?? null,
    addressDetails: result.addressDetails ?? null,
    panNumber: result.panNumber ?? null,
    contactDetails: result.contactDetails ?? null,
  },
});

export class PartnerSignupGstVerificationService {
  private readonly record: SignupGstRecordRepository;
  private readonly provider: SignupGstProvider | undefined;
  private readonly dataSecret: string | undefined;
  private readonly claimSecret: string;
  private readonly now: () => Date;

  constructor(dependencies: SignupGstDependencies = {}) {
    this.record = dependencies.record || (prisma as any).partnerSignupGstVerification;
    this.provider = dependencies.provider;
    this.dataSecret = dependencies.dataSecret?.trim() || undefined;
    this.claimSecret = dependencies.claimSecret?.trim() || resolveJwtSecret();
    this.now = dependencies.now || (() => new Date());
  }

  private async runtime() {
    if (this.provider && this.dataSecret) return { provider: this.provider, dataSecret: this.dataSecret };
    const config = await getPanVerificationRuntimeConfig();
    if (!config?.enabled || !config.baseUrl || !config.token || !config.dataSecret) {
      throw new GstVerificationError('GST verification provider is not configured.', 503, 'provider_not_configured');
    }
    return {
      provider: createSurepassClient({
        baseUrl: config.baseUrl,
        token: config.token,
        ...(config.customerId ? { customerId: config.customerId } : {}),
      }),
      dataSecret: config.dataSecret,
    };
  }

  async verifySignupGstin(input: Record<string, unknown>) {
    const gstin = normalizeGstin(input.gstin ?? input.id_number);
    const validationError = validateGstin(gstin);
    if (validationError) throw new GstVerificationError(validationError, 400, 'invalid_gstin_request');

    const emailValidation = validateBusinessEmail(input.email);
    if (!emailValidation.valid) {
      throw new GstVerificationError(
        emailValidation.code === 'consumer_domain'
          ? 'Use your dealership or company email address. Consumer email providers such as Gmail are not accepted.'
          : 'A valid dealership or company email is required.',
        400,
        'invalid_business_email',
      );
    }
    const email = emailValidation.normalized;
    const mobile = normalizeMobile(input.mobile ?? input.whatsappNumber);
    const countryId = numberId(input.countryId);
    const stateId = numberId(input.stateId);
    const cityId = numberId(input.cityId);
    const emailHash = hashSignupIdentity(email, this.claimSecret);
    const mobileHash = mobile ? hashSignupIdentity(mobile, this.claimSecret) : null;
    const requestFingerprint = createVerificationFingerprint('PARTNER_SIGNUP_GST_VERIFY', {
      gstin,
      emailHash,
      mobileHash,
      countryId,
      stateId,
      cityId,
    });

    const pending = await this.record.findFirst({
      where: {
        requestFingerprint,
        status: GST_STATUS.PENDING,
        createdAt: { gte: new Date(this.now().getTime() - 5 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (pending) {
      throw new GstVerificationError('This GST verification is already in progress. Please wait a moment.', 409, 'verification_in_progress');
    }

    const claimToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(this.now().getTime() + CLAIM_TTL_MS);
    const created = await this.record.create({
      data: {
        status: GST_STATUS.PENDING,
        gstin,
        maskedGstin: maskGstin(gstin),
        requestFingerprint,
        claimHash: hashSignupClaim(claimToken),
        signupEmailHash: emailHash,
        signupMobileHash: mobileHash,
        countryId,
        stateId,
        cityId,
        expiresAt,
      },
    });

    try {
      const runtime = await this.runtime();
      const body = objectOf(await runtime.provider.verifyGstin({ id_number: gstin }));
      const data = objectOf(body?.data);
      if (!body || !data) {
        throw new GstVerificationError('GST verification provider returned an invalid response.', 502, 'provider_malformed_response');
      }
      const result = normalizeGstVerificationResult({ ...data, gstin: data.gstin || gstin });
      if (result.gstin && result.gstin !== gstin) {
        throw new GstVerificationError('The provider returned a different GSTIN.', 502, 'provider_gstin_mismatch');
      }
      const completedAt = this.now();
      const completed = await this.record.update({
        where: { id: created.id },
        data: {
          status: GST_STATUS.SUCCESS,
          gstinStatus: safeText(result.gstinStatus, 100),
          businessName: safeText(result.businessName),
          legalName: safeText(result.legalName),
          providerClientId: safeText(result.providerClientId, 150),
          encryptedResult: encryptPanData(JSON.stringify(result), runtime.dataSecret),
          rawDataExpiresAt: expiresAt,
          completedAt,
        },
      });
      return resultSummary(completed, result, claimToken);
    } catch (error) {
      const normalized = providerError(error);
      await this.record.update({
        where: { id: created.id },
        data: { status: GST_STATUS.FAILED, safeMessage: normalized.message, completedAt: this.now() },
      }).catch(() => undefined);
      throw normalized;
    }
  }

  async consumeVerifiedClaim(
    claimToken: string,
    input: Record<string, unknown>,
    consumedByUserId: string,
    repository: SignupGstRecordRepository = this.record,
  ) {
    const normalizedToken = typeof claimToken === 'string' ? claimToken.trim() : '';
    if (!/^[a-f0-9]{64}$/i.test(normalizedToken)) {
      throw new GstVerificationError('A valid GST verification claim is required.', 400, 'invalid_gst_claim');
    }
    const emailValidation = validateBusinessEmail(input.email);
    if (!emailValidation.valid) {
      throw new GstVerificationError('A valid dealership or company email is required.', 400, 'invalid_business_email');
    }
    const email = emailValidation.normalized;
    const mobile = normalizeMobile(input.mobile ?? input.whatsappNumber);
    const emailHash = hashSignupIdentity(email, this.claimSecret);
    const mobileHash = mobile ? hashSignupIdentity(mobile, this.claimSecret) : null;
    const record = await repository.findFirst({ where: { claimHash: hashSignupClaim(normalizedToken) } });
    if (!record || record.status !== GST_STATUS.SUCCESS || record.consumedAt || record.expiresAt <= this.now()) {
      throw new GstVerificationError('GST verification has expired or was already used. Verify GST again.', 409, 'gst_claim_expired');
    }
    if (record.signupEmailHash !== emailHash || record.signupMobileHash !== mobileHash) {
      throw new GstVerificationError('GST verification does not match the signup details.', 409, 'gst_claim_identity_mismatch');
    }
    const requestedLocation = {
      countryId: numberId(input.countryId),
      stateId: numberId(input.stateId),
      cityId: numberId(input.cityId),
    };
    if (
      record.countryId !== requestedLocation.countryId ||
      record.stateId !== requestedLocation.stateId ||
      record.cityId !== requestedLocation.cityId
    ) {
      throw new GstVerificationError('GST verification does not match the selected location.', 409, 'gst_claim_location_mismatch');
    }
    const runtime = await this.runtime();
    if (!record.encryptedResult) throw new GstVerificationError('GST verification data is unavailable. Verify GST again.', 409, 'gst_claim_data_unavailable');
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(decryptPanData(record.encryptedResult, runtime.dataSecret)) as Record<string, unknown>;
    } catch {
      throw new GstVerificationError('GST verification data is unavailable. Verify GST again.', 409, 'gst_claim_data_unavailable');
    }
    const consumed = await repository.updateMany?.({
      where: {
        id: record.id,
        status: GST_STATUS.SUCCESS,
        consumedAt: null,
        expiresAt: { gt: this.now() },
        signupEmailHash: emailHash,
        ...(mobileHash ? { signupMobileHash: mobileHash } : { signupMobileHash: null }),
      },
      data: { consumedAt: this.now(), consumedByUserId },
    });
    if (!consumed || consumed.count !== 1) {
      throw new GstVerificationError('GST verification was already used. Verify GST again.', 409, 'gst_claim_already_used');
    }
    return { record, result };
  }

  async consumeAndPromoteVerifiedClaim(
    claimToken: string,
    input: Record<string, unknown>,
    consumedByUserId: string,
    transactionClient: any,
  ) {
    const claimRepository = transactionClient.partnerSignupGstVerification as SignupGstRecordRepository;
    const consumed = await this.consumeVerifiedClaim(claimToken, input, consumedByUserId, claimRepository);
    const result = consumed.result;
    const verificationRecord = await transactionClient.gstVerificationRecord.create({
      data: {
        status: GST_STATUS.SUCCESS,
        maskedGstin: consumed.record.maskedGstin,
        // The signup claim uses a signup-specific namespace. Once promoted,
        // store the record in the canonical GST namespace so onboarding/KYC
        // completion and future verification lookups recognise it.
        requestFingerprint: createVerificationFingerprint('GST_VERIFY', {
          id_number: normalizeGstin(consumed.record.gstin),
        }),
        gstinStatus: safeText(result.gstinStatus, 100),
        businessName: safeText(result.businessName),
        legalName: safeText(result.legalName),
        provider: consumed.record.provider || 'SUREPASS',
        providerClientId: safeText(result.providerClientId, 150),
        encryptedResult: consumed.record.encryptedResult,
        rawDataExpiresAt: consumed.record.rawDataExpiresAt,
        requestedById: consumedByUserId,
        completedAt: consumed.record.completedAt,
      },
    });
    return { ...consumed, verificationRecord };
  }
}

export const partnerSignupGstVerificationService = new PartnerSignupGstVerificationService();
