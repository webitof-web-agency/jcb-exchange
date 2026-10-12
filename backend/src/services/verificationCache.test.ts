import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VERIFICATION_CACHE_TTL_MS,
  createVerificationFingerprint,
  isFreshVerificationResult,
} from './verificationCache';

test('creates the same cache fingerprint for equivalent canonical payloads', () => {
  assert.equal(
    createVerificationFingerprint('PAN_VERIFY', { id_number: 'ABCDE1234F', dob: '1990-01-01' }),
    createVerificationFingerprint('PAN_VERIFY', { dob: '1990-01-01', id_number: 'ABCDE1234F' }),
  );
  assert.notEqual(
    createVerificationFingerprint('PAN_VERIFY', { id_number: 'ABCDE1234F' }),
    createVerificationFingerprint('PAN_TO_AADHAAR', { id_number: 'ABCDE1234F' }),
  );
});

test('treats only successful encrypted results within the 24-hour window as fresh', () => {
  const now = Date.now();
  assert.equal(isFreshVerificationResult({ status: 'SUCCESS', encryptedResult: 'cipher', completedAt: new Date(now - VERIFICATION_CACHE_TTL_MS + 1) }, now), true);
  assert.equal(isFreshVerificationResult({ status: 'SUCCESS', encryptedResult: 'cipher', completedAt: new Date(now - VERIFICATION_CACHE_TTL_MS - 1) }, now), false);
  assert.equal(isFreshVerificationResult({ status: 'FAILED', encryptedResult: 'cipher', completedAt: new Date(now) }, now), false);
  assert.equal(isFreshVerificationResult({ status: 'SUCCESS', encryptedResult: null, completedAt: new Date(now) }, now), false);
});
