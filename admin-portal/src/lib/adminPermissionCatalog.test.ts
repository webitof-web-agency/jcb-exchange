import assert from 'node:assert/strict';
import test from 'node:test';

import { FINANCE_WORKSPACE_PERMISSION_IDS, KYC_PERMISSION_DEFINITIONS, LISTING_PERMISSION_DEFINITIONS } from './adminPermissionCatalog';

test('exposes vehicle verification bypass in the Listings role permissions', () => {
  assert.deepEqual(
    LISTING_PERMISSION_DEFINITIONS.find((permission) => permission.id === 'listings.verification.bypass'),
    {
      id: 'listings.verification.bypass',
      label: 'Bypass Vehicle Verification',
    },
  );
});

test('exposes KYC edit override in the Verifications role permissions', () => {
  assert.deepEqual(
    KYC_PERMISSION_DEFINITIONS.find((permission) => permission.id === 'kyc.edit.override'),
    {
      id: 'kyc.edit.override',
      label: 'KYC Edit Override',
    },
  );
});

test('finance workspace permissions are unique fh.* keys and never reuse the legacy finance keys', () => {
  assert.equal(FINANCE_WORKSPACE_PERMISSION_IDS.length, 33);
  assert.equal(new Set(FINANCE_WORKSPACE_PERMISSION_IDS).size, FINANCE_WORKSPACE_PERMISSION_IDS.length);
  FINANCE_WORKSPACE_PERMISSION_IDS.forEach((id) => assert.match(id, /^fh\./));
  assert.equal(FINANCE_WORKSPACE_PERMISSION_IDS.includes('finance.read'), false);
});
