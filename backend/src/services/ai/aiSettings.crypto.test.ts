import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptAiApiKey, encryptAiApiKey } from './aiSettings.crypto';

test('encrypts and decrypts an AI provider key with authenticated encryption', () => {
  const secret = 'a'.repeat(64);
  const encrypted = encryptAiApiKey('provider-secret-value', secret);

  assert.notEqual(encrypted, 'provider-secret-value');
  assert.match(encrypted, /^v1\.[^.]+\.[^.]+\.[^.]+$/);
  assert.equal(decryptAiApiKey(encrypted, secret), 'provider-secret-value');
});

test('rejects a key encrypted with the wrong deployment secret', () => {
  const encrypted = encryptAiApiKey('provider-secret-value', 'a'.repeat(64));

  assert.throws(
    () => decryptAiApiKey(encrypted, 'b'.repeat(64)),
    /Unable to decrypt AI provider key\./,
  );
});
