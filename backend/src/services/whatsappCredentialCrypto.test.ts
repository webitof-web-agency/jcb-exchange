import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptWhatsAppCredential,
  encryptWhatsAppCredential,
} from './whatsappCredentialCrypto';

const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('round-trips a WhatsApp credential without exposing the original value in storage', () => {
  const encrypted = encryptWhatsAppCredential('EAA-test-access-token', encryptionKey);

  assert.notEqual(encrypted, 'EAA-test-access-token');
  assert.equal(decryptWhatsAppCredential(encrypted, encryptionKey), 'EAA-test-access-token');
});

test('rejects a credential encrypted with a different key', () => {
  const encrypted = encryptWhatsAppCredential('webhook-secret', encryptionKey);

  assert.throws(
    () => decryptWhatsAppCredential(encrypted, 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'),
    /Unable to decrypt WhatsApp credential/,
  );
});

test('rejects an invalid encryption key before credentials are stored', () => {
  assert.throws(
    () => encryptWhatsAppCredential('token', 'short-key'),
    /WHATSAPP_SETTINGS_SECRET must be a 64-character hexadecimal value/,
  );
});
