import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSecurePartnerPhotoUrl,
  normalizeAadhaarNumber,
  validatePartnerAuthIdentityPatch,
  validateAadhaarNumber,
} from './partnerAuthIdentity';

test('normalizes and validates Aadhaar input safely', () => {
  assert.equal(normalizeAadhaarNumber('1234 5678 9012'), '123456789012');
  assert.equal(validateAadhaarNumber('1234 5678 9012'), null);
  assert.equal(validateAadhaarNumber('12345'), 'Aadhaar number must contain exactly 12 digits.');
});

test('only accepts private secure document URLs for partner photos', () => {
  assert.equal(isSecurePartnerPhotoUrl('/api/documents/secure/drive-file-123'), true);
  assert.equal(isSecurePartnerPhotoUrl('https://example.com/photo.jpg'), false);
  assert.equal(isSecurePartnerPhotoUrl(''), false);
});

test('keeps Auth Aadhaar verification separate from persisted identity edits', () => {
  assert.equal(
    validatePartnerAuthIdentityPatch({ aadhaarNumber: '311487651231' }),
    'Aadhaar verification is verification-only and cannot be saved from Auth.',
  );
  assert.equal(validatePartnerAuthIdentityPatch({ photoUrl: '/api/documents/secure/photo-1' }), null);
  assert.equal(validatePartnerAuthIdentityPatch({}), 'A partner photo is required.');
});
