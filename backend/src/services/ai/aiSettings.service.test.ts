import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptAiApiKey } from './aiSettings.crypto';
import {
  buildAiSettingsPayload,
  getAiRuntimeConfig,
  saveAiSettings,
  summarizeAiSettingsPayload,
  testAiConnection,
  type AiSettingsPayload,
  type AiSettingsStore,
} from './aiSettings.service';
import { AiProviderError } from './aiProvider.service';

const secret = 'a'.repeat(64);

test('builds a safe AI settings payload and stores only the encrypted provider key', () => {
  const payload = buildAiSettingsPayload(null, {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: 'provider-secret-value',
    enabled: true,
  }, secret);

  assert.equal(payload.enabled, true);
  assert.equal(payload.provider, 'openai');
  assert.equal(payload.model, 'gpt-4o-mini');
  assert.notEqual(payload.encryptedApiKey, 'provider-secret-value');
  assert.equal(decryptAiApiKey(payload.encryptedApiKey || '', secret), 'provider-secret-value');
  assert.equal(summarizeAiSettingsPayload(payload).keyConfigured, true);
});

test('requires key rotation when changing provider and disables cleanly on key removal', () => {
  const current: AiSettingsPayload = {
    enabled: true,
    provider: 'openai',
    model: 'gpt-4o-mini',
    encryptedApiKey: 'v1.existing.encrypted.value',
    keyHint: '****alue',
    updatedAt: new Date().toISOString(),
    updatedByUserId: 'admin-1',
  };

  assert.throws(
    () => buildAiSettingsPayload(current, { provider: 'anthropic' }, secret),
    /new API key is required when the provider changes/i,
  );

  const removed = buildAiSettingsPayload(current, { removeKey: true }, secret);
  assert.equal(removed.enabled, false);
  assert.equal(removed.encryptedApiKey, null);
  assert.equal(summarizeAiSettingsPayload(removed).keyConfigured, false);
});

test('rejects invalid provider keys before any encrypted payload is created', () => {
  assert.throws(
    () => buildAiSettingsPayload(null, { apiKey: 'provider key with spaces', enabled: true }, secret),
    /AI API key is invalid/i,
  );
  assert.throws(
    () => buildAiSettingsPayload(null, { apiKey: 123 as unknown as string, enabled: true }, secret),
    /AI API key must be a string/i,
  );
});

test('tests the saved provider key without exposing it in the request or audit metadata', async () => {
  const payload = buildAiSettingsPayload(null, {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: 'provider-secret-value',
    enabled: true,
  }, secret);
  const auditEntries: Array<Record<string, unknown>> = [];
  const store: AiSettingsStore = {
    read: async () => ({ payload, updatedAt: new Date(payload.updatedAt) }),
    write: async () => undefined,
    audit: async (audit) => {
      auditEntries.push(audit.after);
    },
  };
  const previousSecret = process.env.AI_SETTINGS_ENCRYPTION_KEY;
  process.env.AI_SETTINGS_ENCRYPTION_KEY = secret;

  try {
    const result = await testAiConnection('superadmin-1', store, (_provider, apiKey) => ({
      complete: async (request) => {
        assert.equal(apiKey, 'provider-secret-value');
        assert.equal(request.userMessage, 'Reply with exactly: connection-ok');
        assert.match(request.systemPrompt, /Do not disclose secrets/);
        return { text: 'connection-ok' };
      },
    }));

    assert.deepEqual(result, { provider: 'openai', model: 'gpt-4o-mini' });
    assert.deepEqual(auditEntries, [{ provider: 'openai', model: 'gpt-4o-mini', status: 'SUCCEEDED' }]);
    assert.equal(JSON.stringify(auditEntries).includes('provider-secret-value'), false);
  } finally {
    if (previousSecret === undefined) delete process.env.AI_SETTINGS_ENCRYPTION_KEY;
    else process.env.AI_SETTINGS_ENCRYPTION_KEY = previousSecret;
  }
});

test('saves, rotates, and removes the encrypted provider key without exposing plaintext', async () => {
  const writes: Array<{ payload: AiSettingsPayload; action: string }> = [];
  let current: { payload: unknown; updatedAt: Date } | null = null;
  const store: AiSettingsStore = {
    read: async () => current,
    write: async (payload, audit) => {
      writes.push({ payload, action: audit.action });
      current = { payload, updatedAt: new Date(payload.updatedAt) };
    },
    audit: async () => undefined,
  };
  const previousSecret = process.env.AI_SETTINGS_ENCRYPTION_KEY;
  process.env.AI_SETTINGS_ENCRYPTION_KEY = secret;

  try {
    const created = await saveAiSettings({
      provider: 'openai', model: 'gpt-4o-mini', apiKey: 'first-provider-key', enabled: true, updatedByUserId: 'superadmin-1',
    }, store);
    assert.equal(created.keyConfigured, true);
    assert.equal(writes.at(-1)?.action, 'AI_SETTINGS_UPDATED');
    assert.equal(JSON.stringify(writes).includes('first-provider-key'), false);

    const rotated = await saveAiSettings({
      apiKey: 'rotated-provider-key', updatedByUserId: 'superadmin-1',
    }, store);
    assert.equal(rotated.keyConfigured, true);
    assert.equal(JSON.stringify(writes).includes('rotated-provider-key'), false);

    const removed = await saveAiSettings({
      removeKey: true, updatedByUserId: 'superadmin-1',
    }, store);
    assert.equal(removed.keyConfigured, false);
    assert.equal(removed.enabled, false);
    assert.equal(writes.at(-1)?.action, 'AI_SETTINGS_KEY_REMOVED');
  } finally {
    if (previousSecret === undefined) delete process.env.AI_SETTINGS_ENCRYPTION_KEY;
    else process.env.AI_SETTINGS_ENCRYPTION_KEY = previousSecret;
  }
});

test('activates the saved provider at runtime without a process restart', async () => {
  let current: { payload: unknown; updatedAt: Date } | null = null;
  const store: AiSettingsStore = {
    read: async () => current,
    write: async (payload) => { current = { payload, updatedAt: new Date(payload.updatedAt) }; },
    audit: async () => undefined,
  };
  const previousEncryptionSecret = process.env.AI_SETTINGS_ENCRYPTION_KEY;
  const previousRolloutFlag = process.env.AI_ENABLED;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.AI_SETTINGS_ENCRYPTION_KEY = secret;
  process.env.AI_ENABLED = 'true';
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const beforeSave = await getAiRuntimeConfig(store);
    assert.equal(beforeSave.enabled, false);
    assert.equal(beforeSave.apiKey, undefined);

    await saveAiSettings({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'runtime-provider-key',
      enabled: true,
      updatedByUserId: 'superadmin-1',
    }, store);

    const afterSave = await getAiRuntimeConfig(store);
    assert.equal(afterSave.enabled, true);
    assert.equal(afterSave.provider, 'openai');
    assert.equal(afterSave.apiKey, 'runtime-provider-key');
    assert.equal(JSON.stringify(current).includes('runtime-provider-key'), false);
  } finally {
    if (previousEncryptionSecret === undefined) delete process.env.AI_SETTINGS_ENCRYPTION_KEY;
    else process.env.AI_SETTINGS_ENCRYPTION_KEY = previousEncryptionSecret;
    if (previousRolloutFlag === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = previousRolloutFlag;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  }
});

test('records a safe failure when the provider connection test fails', async () => {
  const payload = buildAiSettingsPayload(null, {
    provider: 'anthropic', model: 'claude-3-5-haiku-20241022', apiKey: 'provider-secret-value', enabled: true,
  }, secret);
  const auditEntries: Array<Record<string, unknown>> = [];
  const store: AiSettingsStore = {
    read: async () => ({ payload, updatedAt: new Date(payload.updatedAt) }),
    write: async () => undefined,
    audit: async (audit) => { auditEntries.push(audit.after); },
  };
  const previousSecret = process.env.AI_SETTINGS_ENCRYPTION_KEY;
  process.env.AI_SETTINGS_ENCRYPTION_KEY = secret;

  try {
    await assert.rejects(
      () => testAiConnection('superadmin-1', store, () => ({
        complete: async () => { throw new AiProviderError('provider auth failed', 502, 'AI_PROVIDER_AUTH_FAILED'); },
      })),
      /AI provider connection failed/i,
    );
    assert.deepEqual(auditEntries, [{ provider: 'anthropic', model: 'claude-3-5-haiku-20241022', status: 'FAILED', errorCode: 'AI_PROVIDER_AUTH_FAILED' }]);
    assert.equal(JSON.stringify(auditEntries).includes('provider-secret-value'), false);
  } finally {
    if (previousSecret === undefined) delete process.env.AI_SETTINGS_ENCRYPTION_KEY;
    else process.env.AI_SETTINGS_ENCRYPTION_KEY = previousSecret;
  }
});
