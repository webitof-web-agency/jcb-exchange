import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeVehicleListingVerificationSettings,
  shouldRequireVehicleListingVerification,
} from './listingVerificationPolicy';

test('defaults vehicle listing verification to disabled for existing installations', () => {
  assert.deepEqual(normalizeVehicleListingVerificationSettings(), {
    enabled: false,
    chassisEnabled: false,
    registrationEnabled: false,
    updatedAt: null,
    updatedByUserId: null,
  });
});

test('keeps the legacy setting mapped to chassis verification only', () => {
  assert.deepEqual(normalizeVehicleListingVerificationSettings({ enabled: true }), {
    enabled: true,
    chassisEnabled: true,
    registrationEnabled: false,
    updatedAt: null,
    updatedByUserId: null,
  });
});

test('supports independent chassis and vehicle-number verification switches', () => {
  const settings = normalizeVehicleListingVerificationSettings({
    chassisEnabled: false,
    registrationEnabled: true,
  });

  assert.equal(settings.enabled, true);
  assert.equal(settings.chassisEnabled, false);
  assert.equal(settings.registrationEnabled, true);
  assert.equal(shouldRequireVehicleListingVerification(settings, false, 'CHASSIS'), false);
  assert.equal(shouldRequireVehicleListingVerification(settings, false, 'RC_FULL'), true);
});

test('keeps the existing explicit admin bypass independent of the platform setting', () => {
  assert.equal(shouldRequireVehicleListingVerification({ enabled: true }, true, 'CHASSIS'), false);
  assert.equal(shouldRequireVehicleListingVerification({ registrationEnabled: true }, true, 'RC_FULL'), false);
});
