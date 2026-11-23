import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptTransactionalEmailCredential,
  encryptTransactionalEmailCredential,
} from './transactionalEmailCredentialCrypto';

const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('round-trips an SMTP password without storing the original value', () => {
  const encrypted = encryptTransactionalEmailCredential('smtp-app-password', encryptionKey);

  assert.notEqual(encrypted, 'smtp-app-password');
  assert.equal(decryptTransactionalEmailCredential(encrypted, encryptionKey), 'smtp-app-password');
});

test('rejects a transactional email credential encrypted with another key', () => {
  const encrypted = encryptTransactionalEmailCredential('smtp-app-password', encryptionKey);

  assert.throws(
    () => decryptTransactionalEmailCredential(encrypted, 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'),
    /Unable to decrypt transactional email credential/,
  );
});

test('rejects an invalid transactional email encryption key', () => {
  assert.throws(
    () => encryptTransactionalEmailCredential('smtp-app-password', 'short-key'),
    /EMAIL_SETTINGS_SECRET must be a 64-character hexadecimal value/,
  );
});

