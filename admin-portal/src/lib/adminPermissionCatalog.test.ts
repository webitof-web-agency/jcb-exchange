import assert from 'node:assert/strict';
import test from 'node:test';

import { LISTING_PERMISSION_DEFINITIONS } from './adminPermissionCatalog';

test('exposes vehicle verification bypass in the Listings role permissions', () => {
  assert.deepEqual(
    LISTING_PERMISSION_DEFINITIONS.find((permission) => permission.id === 'listings.verification.bypass'),
    {
      id: 'listings.verification.bypass',
      label: 'Bypass Vehicle Verification',
    },
  );
});
