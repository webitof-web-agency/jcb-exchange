import assert from 'node:assert/strict';
import test from 'node:test';

import { allowedAdminPermissions } from './adminPermissions';

test('allowedAdminPermissions includes accounts read, crud, and export permissions', () => {
  [
    'accounts.rto.read',
    'accounts.rto.crud',
    'accounts.rto.create',
    'accounts.rto.update',
    'accounts.rto.delete',
    'accounts.rto.export',
    'accounts.sell.read',
    'accounts.sell.crud',
    'accounts.sell.create',
    'accounts.sell.update',
    'accounts.sell.delete',
    'accounts.sell.export',
  ].forEach((permission) => {
    assert.equal(allowedAdminPermissions.has(permission), true, `${permission} should be allowed`);
  });
});
