import crypto from 'node:crypto';
import prisma from '../lib/prisma';
import { decryptPanSetting, encryptPanSetting } from './panVerificationSettings.crypto';

const SETTINGS_ID = 'default';
const DEFAULT_APP_MASTER_SECRET = 'jcbexchange_super_secret_key_123';

export type SurepassEnvironment = 'SANDBOX' | 'PRODUCTION';

type PanSettingsRecord = {
  id: string;
  enabled: boolean;
  activeEnvironment?: SurepassEnvironment | null;
  baseUrl: string | null;
  encryptedToken: string | null;
  encryptedCustomerId?: string | null;
  sandboxBaseUrl?: string | null;
  encryptedSandboxToken?: string | null;
  encryptedSandboxCustomerId?: string | null;
  productionBaseUrl?: string | null;
  encryptedProductionToken?: string | null;
  encryptedProductionCustomerId?: string | null;
  encryptedDataSecret: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SurepassProfile = {
  baseUrl: string;
  token: string;
  customerId: string | null;
};

export type PanVerificationRuntimeConfig = {
  enabled: boolean;
  environment: SurepassEnvironment;
  baseUrl: string;
  token: string;
  dataSecret: string;
  customerId: string | null;
};

const appMasterSecret = () => process.env.JWT_SECRET?.trim() || DEFAULT_APP_MASTER_SECRET;

// Surepass's current documentation uses the .io hosts. Older project
// settings used the legacy .app aliases, so keep those values compatible while
// ensuring outbound requests use the documented canonical host.
const SUREPASS_HOST_ALIASES: Record<string, string> = {
  'sandbox.surepass.app': 'sandbox.surepass.io',
  'kyc-api.surepass.app': 'kyc-api.surepass.io',
};

const canonicalizeSurepassHost = (value: string) => {
  const parsed = new URL(value);
  const canonicalHost = SUREPASS_HOST_ALIASES[parsed.hostname.toLowerCase()];
  if (canonicalHost) parsed.hostname = canonicalHost;
  return parsed.toString().replace(/\/+$/, '');
};

const displayBaseUrl = (value: string | null | undefined) => {
  if (!value) return '';
  return value.trim().replace(/\/+$/, '');
};

export const resolveSurepassEnvironment = (value: unknown): SurepassEnvironment => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!normalized || normalized === 'SANDBOX') return 'SANDBOX';
  if (normalized === 'PRODUCTION' || normalized === 'PROD') return 'PRODUCTION';
  throw new Error('Surepass environment must be SANDBOX or PRODUCTION.');
};

export const resolveSurepassRuntimeEnvironment = (
  storedEnvironment: unknown,
  environmentOverride: unknown,
): SurepassEnvironment => resolveSurepassEnvironment(storedEnvironment || environmentOverride || 'SANDBOX');

export const normalizePanVerificationBaseUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Surepass base URL is required.');
  }

  const normalized = value.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Surepass base URL is invalid.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Surepass base URL must use HTTPS.');
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Surepass base URL must not contain credentials or query parameters.');
  }

  return normalized;
};

/**
 * Resolves legacy Surepass hosts only at the outbound-request boundary.
 * The value stored and shown in settings remains the administrator's input.
 */
export const normalizeSurepassRuntimeBaseUrl = (value: unknown) => (
  canonicalizeSurepassHost(normalizePanVerificationBaseUrl(value))
);

export const selectSurepassProfile = (
  environment: SurepassEnvironment,
  profiles: Record<SurepassEnvironment, SurepassProfile | null>,
) => profiles[environment] || null;

const profileSummary = (baseUrl: string | null | undefined, token: string | null | undefined, customerId: string | null | undefined) => ({
  baseUrl: displayBaseUrl(baseUrl),
  tokenConfigured: Boolean(token),
  customerIdConfigured: Boolean(customerId),
});

export const serializePanVerificationSettings = (record: PanSettingsRecord | null) => {
  const legacyBaseUrl = record?.baseUrl || '';
  const legacyToken = record?.encryptedToken || null;
  const legacyCustomerId = record?.encryptedCustomerId || null;
  const activeEnvironment = resolveSurepassEnvironment(record?.activeEnvironment || 'SANDBOX');
  const sandboxBaseUrl = record?.sandboxBaseUrl || legacyBaseUrl;
  const sandboxToken = record?.encryptedSandboxToken || legacyToken;
  const sandboxCustomerId = record?.encryptedSandboxCustomerId || legacyCustomerId;

  return {
    enabled: record?.enabled === true,
    activeEnvironment,
    sandbox: profileSummary(sandboxBaseUrl, sandboxToken, sandboxCustomerId),
    production: profileSummary(record?.productionBaseUrl, record?.encryptedProductionToken, record?.encryptedProductionCustomerId),
    dataEncryptionConfigured: Boolean(record?.encryptedDataSecret),
    updatedAt: record?.updatedAt instanceof Date ? record.updatedAt.toISOString() : record?.updatedAt || null,
    updatedByUserId: record?.updatedByUserId || null,
  };
};

const getStoredSettings = async (): Promise<PanSettingsRecord | null> => {
  return (await (prisma as any).panVerificationSettings.findUnique({ where: { id: SETTINGS_ID } })) as PanSettingsRecord | null;
};

export const getPanVerificationSettings = async () => serializePanVerificationSettings(await getStoredSettings());

export type SurepassCredentialField = 'token' | 'customerId';

export const revealSurepassCredential = async (
  environmentValue: unknown,
  field: SurepassCredentialField,
) => {
  const environment = resolveSurepassEnvironment(environmentValue);
  const stored = await getStoredSettings();
  const profile = profileFromStored(stored, environment);
  const encryptedValue = field === 'token' ? profile.encryptedToken : profile.encryptedCustomerId;
  if (!encryptedValue) return null;

  try {
    return decryptPanSetting(encryptedValue, appMasterSecret());
  } catch {
    throw new Error('Surepass credential could not be decrypted.');
  }
};

type ProfileInput = {
  baseUrl?: unknown;
  token?: unknown;
  customerId?: unknown;
};

const objectValue = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const normalizeOptionalBaseUrl = (value: unknown, current: string | null) => {
  if (value === undefined) return current;
  if (value === null || (typeof value === 'string' && !value.trim())) return null;
  return normalizePanVerificationBaseUrl(value);
};

const encryptOptionalSecret = (value: unknown, current: string | null | undefined, maxLength: number, label: string) => {
  if (value === undefined || typeof value !== 'string' || !value.trim() || /^\*+$/.test(value.trim())) {
    return current || null;
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return encryptPanSetting(normalized, appMasterSecret());
};

const profileFromStored = (record: PanSettingsRecord | null, environment: SurepassEnvironment) => {
  if (environment === 'SANDBOX') {
    return {
      baseUrl: record?.sandboxBaseUrl || record?.baseUrl || null,
      encryptedToken: record?.encryptedSandboxToken || record?.encryptedToken || null,
      encryptedCustomerId: record?.encryptedSandboxCustomerId || record?.encryptedCustomerId || null,
    };
  }
  return {
    baseUrl: record?.productionBaseUrl || null,
    encryptedToken: record?.encryptedProductionToken || null,
    encryptedCustomerId: record?.encryptedProductionCustomerId || null,
  };
};

export const updatePanVerificationSettings = async (input: {
  enabled?: unknown;
  activeEnvironment?: unknown;
  environment?: unknown;
  baseUrl?: unknown;
  token?: unknown;
  customerId?: unknown;
  sandbox?: unknown;
  production?: unknown;
  updatedByUserId?: string | null;
}) => {
  const current = await getStoredSettings();
  const enabled = input.enabled === true;
  const activeEnvironment = resolveSurepassEnvironment(input.activeEnvironment ?? input.environment ?? current?.activeEnvironment ?? 'SANDBOX');
  const hasProfilePayload = input.sandbox !== undefined || input.production !== undefined;

  const buildProfile = (environment: SurepassEnvironment): {
    baseUrl: string | null;
    encryptedToken: string | null;
    encryptedCustomerId: string | null;
  } => {
    const stored = profileFromStored(current, environment);
    const nestedInput = objectValue(environment === 'SANDBOX' ? input.sandbox : input.production);
    const legacyInput: ProfileInput = !hasProfilePayload && environment === activeEnvironment
      ? { baseUrl: input.baseUrl, token: input.token, customerId: input.customerId }
      : {};
    const profileInput = nestedInput || legacyInput;
    return {
      baseUrl: normalizeOptionalBaseUrl(profileInput.baseUrl, stored.baseUrl),
      encryptedToken: encryptOptionalSecret(profileInput.token, stored.encryptedToken, 4096, 'Surepass token'),
      encryptedCustomerId: encryptOptionalSecret(profileInput.customerId, stored.encryptedCustomerId, 256, 'Surepass customer ID'),
    };
  };

  const sandbox = buildProfile('SANDBOX');
  const production = buildProfile('PRODUCTION');
  const selected = selectSurepassProfile(activeEnvironment, {
    SANDBOX: sandbox.baseUrl && sandbox.encryptedToken
      ? { baseUrl: sandbox.baseUrl, token: sandbox.encryptedToken, customerId: sandbox.encryptedCustomerId }
      : null,
    PRODUCTION: production.baseUrl && production.encryptedToken
      ? { baseUrl: production.baseUrl, token: production.encryptedToken, customerId: production.encryptedCustomerId }
      : null,
  });
  if (enabled && !selected) {
    throw new Error(`Surepass ${activeEnvironment.toLowerCase()} base URL and API token are required when Surepass credentials are enabled.`);
  }

  const encryptedDataSecret = current?.encryptedDataSecret || encryptPanSetting(
    crypto.randomBytes(32).toString('hex'),
    appMasterSecret(),
  );
  const legacy = activeEnvironment === 'SANDBOX' ? sandbox : production;
  const record = await (prisma as any).panVerificationSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {
      enabled,
      activeEnvironment,
      baseUrl: legacy.baseUrl,
      encryptedToken: legacy.encryptedToken,
      encryptedCustomerId: legacy.encryptedCustomerId,
      sandboxBaseUrl: sandbox.baseUrl,
      encryptedSandboxToken: sandbox.encryptedToken,
      encryptedSandboxCustomerId: sandbox.encryptedCustomerId,
      productionBaseUrl: production.baseUrl,
      encryptedProductionToken: production.encryptedToken,
      encryptedProductionCustomerId: production.encryptedCustomerId,
      encryptedDataSecret,
      updatedByUserId: input.updatedByUserId || null,
    },
    create: {
      id: SETTINGS_ID,
      enabled,
      activeEnvironment,
      baseUrl: legacy.baseUrl,
      encryptedToken: legacy.encryptedToken,
      encryptedCustomerId: legacy.encryptedCustomerId,
      sandboxBaseUrl: sandbox.baseUrl,
      encryptedSandboxToken: sandbox.encryptedToken,
      encryptedSandboxCustomerId: sandbox.encryptedCustomerId,
      productionBaseUrl: production.baseUrl,
      encryptedProductionToken: production.encryptedToken,
      encryptedProductionCustomerId: production.encryptedCustomerId,
      encryptedDataSecret,
      updatedByUserId: input.updatedByUserId || null,
    },
  });

  return serializePanVerificationSettings(record as PanSettingsRecord);
};

const runtimeEnvironment = (stored: PanSettingsRecord | null) => resolveSurepassRuntimeEnvironment(
  stored?.activeEnvironment,
  process.env.SUREPASS_ENVIRONMENT?.trim(),
);

export const getPanVerificationRuntimeConfig = async (): Promise<PanVerificationRuntimeConfig | null> => {
  const stored = await getStoredSettings();
  const environment = runtimeEnvironment(stored);
  const dataSecret = stored?.encryptedDataSecret
    ? decryptPanSetting(stored.encryptedDataSecret, appMasterSecret())
    : process.env.SUREPASS_DATA_SECRET?.trim() || process.env.PAN_VERIFICATION_DATA_SECRET?.trim() || '';
  const storedProfile = profileFromStored(stored, environment);

  if (storedProfile.baseUrl && storedProfile.encryptedToken && dataSecret) {
    try {
      return {
        enabled: stored?.enabled === true,
        environment,
        baseUrl: normalizeSurepassRuntimeBaseUrl(storedProfile.baseUrl),
        token: decryptPanSetting(storedProfile.encryptedToken, appMasterSecret()),
        dataSecret,
        customerId: storedProfile.encryptedCustomerId
          ? decryptPanSetting(storedProfile.encryptedCustomerId, appMasterSecret())
          : process.env.SUREPASS_CUSTOMER_ID?.trim() || null,
      };
    } catch {
      throw new Error('Surepass credentials could not be decrypted.');
    }
  }

  const profilePrefix = environment === 'SANDBOX' ? 'SUREPASS_SANDBOX' : 'SUREPASS_PRODUCTION';
  const baseUrl = process.env[`${profilePrefix}_BASE_URL`]?.trim()
    || (!stored ? process.env.SUREPASS_BASE_URL?.trim() : undefined);
  const token = process.env[`${profilePrefix}_TOKEN`]?.trim()
    || (!stored ? process.env.SUREPASS_TOKEN?.trim() : undefined);
  if (!baseUrl || !token || !dataSecret) return null;

  return {
    enabled: true,
    environment,
    baseUrl: normalizeSurepassRuntimeBaseUrl(baseUrl),
    token,
    dataSecret,
    customerId: process.env[`${profilePrefix}_CUSTOMER_ID`]?.trim()
      || (!stored ? process.env.SUREPASS_CUSTOMER_ID?.trim() : null)
      || null,
  };
};
