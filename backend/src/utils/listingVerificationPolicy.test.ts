import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeVehicleListingVerificationSettings,
  shouldRequireVehicleListingVerification,
} from './listingVerificationPolicy';

test('defaults vehicle listing verification to disabled for existing installations', () => {
  assert.deepEqual(normalizeVehicleListingVerificationSettings(), {
    enabled: false,
    updatedAt: null,
    updatedByUserId: null,
  });
});

test('requires a verified chassis only when vehicle listing verification is enabled', () => {
  assert.equal(shouldRequireVehicleListingVerification({ enabled: false }), false);
  assert.equal(shouldRequireVehicleListingVerification({ enabled: true }), true);
});

test('keeps the existing explicit admin bypass independent of the platform setting', () => {
  assert.equal(shouldRequireVehicleListingVerification({ enabled: true }, true), false);
  assert.equal(shouldRequireVehicleListingVerification({ enabled: false }, true), false);
});
