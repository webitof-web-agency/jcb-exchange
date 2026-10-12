import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decryptPanSetting,
  encryptPanSetting,
} from './panVerificationSettings.crypto';

test('encrypts PAN settings without storing the plaintext and decrypts them with the app master secret', () => {
  const masterSecret = 'jcb-app-master-secret-for-test';
  const plaintext = 'surepass-token-value';
  const encrypted = encryptPanSetting(plaintext, masterSecret);

  assert.notEqual(encrypted, plaintext);
  assert.equal(encrypted.includes(plaintext), false);
  assert.equal(decryptPanSetting(encrypted, masterSecret), plaintext);
});

test('rejects tampered PAN settings ciphertext', () => {
  const encrypted = encryptPanSetting('secret', 'jcb-app-master-secret-for-test');
  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('a') ? 'b' : 'a'}`;

  assert.throws(
    () => decryptPanSetting(tampered, 'jcb-app-master-secret-for-test'),
    /Unable to decrypt PAN setting/,
  );
});
