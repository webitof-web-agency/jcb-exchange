import assert from 'node:assert/strict';
import test from 'node:test';
import { getListingVerificationDisplay } from './listingVerificationDisplay.mjs';

test('maps API-backed listing verification to a verified badge', () => {
  assert.deepEqual(getListingVerificationDisplay('API_VERIFIED'), {
    label: 'API Verified',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  });
});

test('supports persisted verification aliases without falling back to not verified', () => {
  assert.equal(getListingVerificationDisplay('VERIFIED').label, 'Verified');
  assert.equal(getListingVerificationDisplay('SUCCESS').label, 'Verified');
  assert.equal(getListingVerificationDisplay('VERIFYING').label, 'Verifying');
  assert.equal(getListingVerificationDisplay('FAILED').label, 'Verification Failed');
  assert.equal(getListingVerificationDisplay('CHANGED').label, 'Re-verification Required');
});

test('keeps an empty or unknown status safely unverified', () => {
  assert.equal(getListingVerificationDisplay(null).label, 'Not Verified');
  assert.equal(getListingVerificationDisplay(undefined).label, 'Not Verified');
  assert.equal(getListingVerificationDisplay('unexpected').label, 'Not Verified');
});
