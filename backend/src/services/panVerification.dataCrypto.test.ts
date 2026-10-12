import assert from 'node:assert/strict';
import test from 'node:test';

import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';

const secret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('encrypts and decrypts PAN verification result data without storing plaintext', () => {
  const payload = JSON.stringify({ fullName: 'Munna Tripathi', mobileNumbers: ['9876543210'] });
  const encrypted = encryptPanData(payload, secret);

  assert.notEqual(encrypted, payload);
  assert.equal(decryptPanData(encrypted, secret), payload);
});

test('rejects a missing or malformed PAN data encryption secret', () => {
  assert.throws(() => encryptPanData('payload', 'short'), /64-character hexadecimal/);
});
