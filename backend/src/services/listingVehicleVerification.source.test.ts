import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRcFullVerificationFingerprint,
  getVehicleVerificationIdentityMismatch,
} from './listingVehicleVerification';

test('builds a stable RC Full fingerprint from a normalized registration number', () => {
  assert.equal(
    buildRcFullVerificationFingerprint(' dl 01-ab 1234 '),
    buildRcFullVerificationFingerprint('DL01AB1234'),
  );
});

test('detects provider identity mismatches before listing save', () => {
  assert.equal(
    getVehicleVerificationIdentityMismatch('RC_FULL', 'DL01AB1234', '', {
      registrationNumber: 'DL02ZZ9999',
    }),
    'The verified vehicle number does not match the entered vehicle number.',
  );
  assert.equal(
    getVehicleVerificationIdentityMismatch('CHASSIS', 'DL01AB1234', 'CHASSIS123', {
      registrationNumber: 'DL01AB1234',
      chassisNumber: 'OTHER',
    }),
    'The verified chassis number does not match the entered chassis number.',
  );
});
