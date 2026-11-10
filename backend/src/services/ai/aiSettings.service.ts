import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { isAiEnabled } from '../../utils/aiFeatureGate';
import {
  aiKeyHint,
  aiSettingsEncryptionConfigured,
  decryptAiApiKey,
  encryptAiApiKey,
} from './aiSettings.crypto';
import { AiProviderError, createAiProvider, type AiProvider, type AiProviderName } from './aiProvider.service';

export const AI_SETTINGS_KEY = 'ai';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022';
const MAX_MODEL_LENGTH = 100;
const MAX_API_KEY_LENGTH = 4096;

export type AiRuntimeConfig = {
  enabled: boolean;
  provider: AiProviderName;
  model: string;
  apiKey?: string;
  maxInputChars: number;
  maxOutputChars: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  requestTimeoutMs?: number;
  configurationError?: string;
};

export type AiSettingsPayload = {
  enabled: boolean;
  provider: AiProviderName;
  model: string;
  encryptedApiKey: string | null;
  keyHint: string | null;
  updatedAt: string;
  updatedByUserId: string | null;
};

export type AiSettingsSummary = {
  enabled: boolean;
  configuredEnabled: boolean;
  rolloutEnabled: boolean;
  provider: AiProviderName;
  model: string;
  keyConfigured: boolean;
  keyHint: string | null;
  encryptionConfigured: boolean;
  source: 'database' | 'environment';
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type AiSettingsUpdateInput = {
  enabled?: unknown;
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
  removeKey?: unknown;
  updatedByUserId?: string | null;
};

type AiSettingsAudit = {
  actorUserId: string;
  action: string;
  after: Record<string, boolean | number | string | null>;
};

type AiSettingsRow = {
  payload: unknown;
  updatedAt: Date;
};

export type AiSettingsStore = {
  read: () => Promise<AiSettingsRow | null>;
  write: (payload: AiSettingsPayload, audit: AiSettingsAudit) => Promise<void>;
  audit: (audit: AiSettingsAudit) => Promise<void>;
};

export class AiSettingsError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'AI_SETTINGS_ERROR',
  ) {
    super(message);
    this.name = 'AiSettingsError';
  }
}

const defaultModel = (provider: AiProviderName) => provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL;

const isProvider = (value: unknown): value is AiProviderName => value === 'openai' || value === 'anthropic';

const normalizeProvider = (value: unknown, fallback: AiProviderName): AiProviderName => {
  if (value === undefined) return fallback;
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!isProvider(normalized)) throw new AiSettingsError('AI provider must be OpenAI or Anthropic.', 400, 'AI_PROVIDER_INVALID');
  return normalized;
};

const normalizeModel = (value: unknown, provider: AiProviderName, fallback?: string) => {
  if (value === undefined) return fallback || defaultModel(provider);
  if (typeof value !== 'string') throw new AiSettingsError('AI model must be a string.', 400, 'AI_MODEL_INVALID');
  const model = value.trim();
  if (!model || model.length > MAX_MODEL_LENGTH || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(model)) {
    throw new AiSettingsError('AI model contains invalid characters or is too long.', 400, 'AI_MODEL_INVALID');
  }
  const providerModelPattern = provider === 'openai' ? /^(?:gpt-|o\d|chatgpt-)/i : /^claude-/i;
  if (!providerModelPattern.test(model)) {
    throw new AiSettingsError(`The selected model is not valid for ${provider === 'openai' ? 'OpenAI' : 'Anthropic'}.`, 400, 'AI_MODEL_INVALID');
  }
  return model;
};

const normalizeApiKey = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AiSettingsError('AI API key must be a string.', 400, 'AI_KEY_INVALID');
  const apiKey = value.trim();
  if (!apiKey || apiKey.length > MAX_API_KEY_LENGTH || /\s/u.test(apiKey)) {
    throw new AiSettingsError('AI API key is invalid.', 400, 'AI_KEY_INVALID');
  }
  return apiKey;
};

const objectValue = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const stringValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

const normalizePayload = (value: unknown): AiSettingsPayload | null => {
  const object = objectValue(value);
  if (!object) return null;
  const provider = isProvider(object.provider) ? object.provider : 'openai';
  const model = typeof object.model === 'string' && object.model.trim() ? object.model.trim() : defaultModel(provider);
  const updatedAt = stringValue(object.updatedAt) || new Date(0).toISOString();

  return {
    enabled: object.enabled === true,
    provider,
    model,
    encryptedApiKey: stringValue(object.encryptedApiKey),
    keyHint: stringValue(object.keyHint),
    updatedAt,
    updatedByUserId: stringValue(object.updatedByUserId),
  };
};

const envRuntimeConfig = (): AiRuntimeConfig => {
  const rawProvider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const provider: AiProviderName = rawProvider === 'anthropic' ? 'anthropic' : 'openai';
  const configurationError = rawProvider && !isProvider(rawProvider)
    ? 'Unsupported AI provider configuration.'
    : undefined;
  const apiKey = (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY)?.trim() || undefined;

  return {
    enabled: isAiEnabled() && Boolean(apiKey) && !configurationError,
    provider,
    model: process.env.AI_MODEL_SIMPLE?.trim() || process.env.AI_MODEL?.trim() || defaultModel(provider),
    ...(apiKey ? { apiKey } : {}),
    maxInputChars: 4000,
    maxOutputChars: 12000,
    maxInputTokens: 4096,
    maxOutputTokens: 800,
    requestTimeoutMs: 20_000,
    ...(configurationError ? { configurationError } : {}),
  };
};

const defaultStore: AiSettingsStore = {
  read: async () => prisma.platformRuntimeSettings.findUnique({
    where: { key: AI_SETTINGS_KEY },
    select: { payload: true, updatedAt: true },
  }),
  write: async (payload, audit) => {
    const payloadJson = payload as unknown as Prisma.InputJsonObject;
    const auditJson = audit.after as unknown as Prisma.InputJsonObject;
    await prisma.$transaction(async (transaction) => {
      await transaction.platformRuntimeSettings.upsert({
        where: { key: AI_SETTINGS_KEY },
        update: { payload: payloadJson },
        create: { key: AI_SETTINGS_KEY, payload: payloadJson },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          // Reuse the existing enum value so Phase 1 needs no live migration.
          entityType: 'USER',
          entityId: audit.actorUserId,
          action: audit.action,
          afterJson: auditJson,
        },
      });
    });
  },
  audit: async (audit) => {
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        // Reuse the existing enum value so Phase 1 needs no live migration.
        entityType: 'USER',
        entityId: audit.actorUserId,
        action: audit.action,
        afterJson: audit.after as unknown as Prisma.InputJsonObject,
      },
    });
  },
};

const currentPayload = async (store: AiSettingsStore) => {
  const row = await store.read();
  if (!row) return null;
  const payload = normalizePayload(row.payload);
  if (!payload) throw new AiSettingsError('Saved AI settings are unreadable.', 503, 'AI_SETTINGS_CORRUPT');
  return payload;
};

export const summarizeAiSettingsPayload = (payload: AiSettingsPayload): AiSettingsSummary => ({
  enabled: payload.enabled && isAiEnabled(),
  configuredEnabled: payload.enabled,
  rolloutEnabled: isAiEnabled(),
  provider: payload.provider,
  model: payload.model,
  keyConfigured: Boolean(payload.encryptedApiKey),
  keyHint: payload.keyHint,
  encryptionConfigured: aiSettingsEncryptionConfigured(),
  source: 'database',
  updatedAt: payload.updatedAt,
  updatedByUserId: payload.updatedByUserId,
});

export const buildAiSettingsPayload = (
  current: AiSettingsPayload | null,
  input: AiSettingsUpdateInput,
  deploymentSecret: string,
): AiSettingsPayload => {
  const provider = normalizeProvider(input.provider, current?.provider || 'openai');
  const providerChanged = Boolean(current && provider !== current.provider);
  const model = normalizeModel(input.model, provider, providerChanged ? undefined : current?.model);
  const incomingKey = normalizeApiKey(input.apiKey);
  const removeKey = input.removeKey === true;

  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new AiSettingsError('AI enabled must be a boolean.', 400, 'AI_ENABLED_INVALID');
  }
  if (input.removeKey !== undefined && typeof input.removeKey !== 'boolean') {
    throw new AiSettingsError('AI key removal flag must be a boolean.', 400, 'AI_REMOVE_KEY_INVALID');
  }

  if (providerChanged && !incomingKey && !removeKey) {
    throw new AiSettingsError('A new API key is required when the provider changes.', 400, 'AI_KEY_ROTATION_REQUIRED');
  }

  let encryptedApiKey: string | null = removeKey ? null : current?.encryptedApiKey || null;
  if (!removeKey && incomingKey) {
    try {
      encryptedApiKey = encryptAiApiKey(incomingKey, deploymentSecret);
    } catch (error) {
      if (error instanceof Error && error.message.includes('AI_SETTINGS_ENCRYPTION_KEY')) {
        throw new AiSettingsError(
          'Server-side AI settings encryption is not configured.',
          503,
          'AI_ENCRYPTION_NOT_CONFIGURED',
        );
      }
      throw new AiSettingsError('The provider key could not be encrypted.', 503, 'AI_KEY_ENCRYPTION_FAILED');
    }
  }
  const enabled = removeKey ? false : input.enabled !== undefined ? input.enabled === true : current?.enabled === true;

  if (enabled && !encryptedApiKey) {
    throw new AiSettingsError('Configure an API key before enabling AI.', 400, 'AI_KEY_REQUIRED');
  }

  return {
    enabled,
    provider,
    model,
    encryptedApiKey,
    keyHint: incomingKey ? aiKeyHint(incomingKey) : removeKey ? null : current?.keyHint || null,
    updatedAt: new Date().toISOString(),
    updatedByUserId: input.updatedByUserId || null,
  };
};

export const getAiSettings = async (store: AiSettingsStore = defaultStore): Promise<AiSettingsSummary> => {
  const current = await currentPayload(store);
  if (current) return summarizeAiSettingsPayload(current);

  const fallback = envRuntimeConfig();
  return {
    enabled: fallback.enabled && Boolean(fallback.apiKey) && !fallback.configurationError,
    configuredEnabled: fallback.enabled && Boolean(fallback.apiKey) && !fallback.configurationError,
    rolloutEnabled: isAiEnabled(),
    provider: fallback.provider,
    model: fallback.model,
    keyConfigured: Boolean(fallback.apiKey),
    keyHint: null,
    encryptionConfigured: aiSettingsEncryptionConfigured(),
    source: 'environment',
    updatedAt: null,
    updatedByUserId: null,
  };
};

export const getAiRuntimeConfig = async (store: AiSettingsStore = defaultStore): Promise<AiRuntimeConfig> => {
  const current = await currentPayload(store);
  if (!current) return envRuntimeConfig();

  if (!current.encryptedApiKey) {
    return {
      enabled: current.enabled && isAiEnabled(),
      provider: current.provider,
      model: current.model,
      maxInputChars: 4000,
      maxOutputChars: 12000,
      maxInputTokens: 4096,
      maxOutputTokens: 800,
      requestTimeoutMs: 20_000,
    };
  }

  if (!aiSettingsEncryptionConfigured()) {
    return {
      enabled: false,
      provider: current.provider,
      model: current.model,
      maxInputChars: 4000,
      maxOutputChars: 12000,
      maxInputTokens: 4096,
      maxOutputTokens: 800,
      requestTimeoutMs: 20_000,
      configurationError: 'AI_SETTINGS_ENCRYPTION_KEY is not configured on the server.',
    };
  }

  try {
    const apiKey = decryptAiApiKey(current.encryptedApiKey, process.env.AI_SETTINGS_ENCRYPTION_KEY?.trim() || '');
    return {
      enabled: current.enabled && isAiEnabled(),
      provider: current.provider,
      model: current.model,
      apiKey,
      maxInputChars: 4000,
      maxOutputChars: 12000,
      maxInputTokens: 4096,
      maxOutputTokens: 800,
      requestTimeoutMs: 20_000,
    };
  } catch {
    return {
      enabled: false,
      provider: current.provider,
      model: current.model,
      maxInputChars: 4000,
      maxOutputChars: 12000,
      maxInputTokens: 4096,
      maxOutputTokens: 800,
      requestTimeoutMs: 20_000,
      configurationError: 'Saved AI provider key could not be decrypted.',
    };
  }
};

export const saveAiSettings = async (
  input: AiSettingsUpdateInput,
  store: AiSettingsStore = defaultStore,
) => {
  const current = await currentPayload(store);
  const payload = buildAiSettingsPayload(
    current,
    input,
    process.env.AI_SETTINGS_ENCRYPTION_KEY?.trim() || '',
  );
  await store.write(payload, {
    actorUserId: input.updatedByUserId || 'system',
    action: input.removeKey === true ? 'AI_SETTINGS_KEY_REMOVED' : 'AI_SETTINGS_UPDATED',
    after: {
      enabled: payload.enabled,
      provider: payload.provider,
      model: payload.model,
      keyConfigured: Boolean(payload.encryptedApiKey),
      keyRotated: typeof input.apiKey === 'string' && input.apiKey.trim().length > 0,
    },
  });
  return summarizeAiSettingsPayload(payload);
};

export const testAiConnection = async (
  actorUserId: string,
  store: AiSettingsStore = defaultStore,
  providerFactory: (provider: AiProviderName, apiKey: string) => AiProvider = (provider, apiKey) => createAiProvider(provider, apiKey),
) => {
  const config = await getAiRuntimeConfig(store);
  if (config.configurationError) throw new AiSettingsError('AI provider configuration is invalid.', 503, 'AI_CONFIGURATION_INVALID');
  if (!config.apiKey) throw new AiSettingsError('Configure an API key before testing the connection.', 400, 'AI_KEY_REQUIRED');

  const writeTestAudit = async (after: Record<string, boolean | number | string | null>) => {
    try {
      await store.audit({ actorUserId, action: 'AI_SETTINGS_TEST_CONNECTION', after });
    } catch {
      throw new AiSettingsError('AI settings audit logging is unavailable.', 503, 'AI_AUDIT_UNAVAILABLE');
    }
  };

  try {
    await providerFactory(config.provider, config.apiKey).complete({
      model: config.model,
      systemPrompt: 'You are performing an internal provider connection check. Do not disclose secrets.',
      userMessage: 'Reply with exactly: connection-ok',
      timeoutMs: 10_000,
    });
  } catch (error) {
    const errorCode = error instanceof AiProviderError ? error.code : 'AI_PROVIDER_UNAVAILABLE';
    await writeTestAudit({ provider: config.provider, model: config.model, status: 'FAILED', errorCode });
    throw new AiSettingsError('AI provider connection failed.', 502, errorCode);
  }

  await writeTestAudit({ provider: config.provider, model: config.model, status: 'SUCCEEDED' });
  return { provider: config.provider, model: config.model };
};
