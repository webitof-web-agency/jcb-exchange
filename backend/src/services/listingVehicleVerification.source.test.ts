import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRcFullVerificationFingerprint,
  chooseVerificationRecordForIdentity,
  getVehicleVerificationIdentityMismatch,
  resolveListingRegistrationNumber,
} from './listingVehicleVerification';

test('builds a stable RC Full fingerprint from a normalized registration number', () => {
  assert.equal(
    buildRcFullVerificationFingerprint(' dl 01-ab 1234 '),
    buildRcFullVerificationFingerprint('DL01AB1234'),
  );
});

test('falls back to the current identity record when a saved verification id is stale', () => {
  const currentRecord = {
    id: 'current-record',
    status: 'SUCCESS',
    requestFingerprint: buildRcFullVerificationFingerprint('DL01AB1234'),
  };
  const staleRecord = {
    id: 'stale-record',
    status: 'SUCCESS',
    requestFingerprint: buildRcFullVerificationFingerprint('DL02AB1234'),
  };

  assert.equal(
    chooseVerificationRecordForIdentity({
      source: 'RC_FULL',
      identity: 'DL01AB1234',
      preferredRecord: staleRecord,
      fallbackRecord: currentRecord,
    }),
    currentRecord,
  );
});

test('detects provider identity mismatches before listing save', () => {
  assert.equal(
    getVehicleVerificationIdentityMismatch('RC_FULL', 'DL01AB1234', '', {
      registrationNumber: 'DL02ZZ9999',
    }),
    'The verified registration number does not match the entered registration number.',
  );
  assert.equal(
    getVehicleVerificationIdentityMismatch('CHASSIS', 'DL01AB1234', 'CHASSIS123', {
      registrationNumber: 'DL01AB1234',
      chassisNumber: 'OTHER',
    }),
    'The verified chassis number does not match the entered chassis number.',
  );
});

test('uses the current top-level registration before stale saved RTO data', () => {
  assert.equal(
    resolveListingRegistrationNumber(
      ' dl 01-ab 1234 ',
      'DL02AB5678',
      'DL03AB9012',
    ),
    'DL01AB1234',
  );
  assert.equal(resolveListingRegistrationNumber('', 'DL02AB5678', 'DL03AB9012'), 'DL02AB5678');
});
