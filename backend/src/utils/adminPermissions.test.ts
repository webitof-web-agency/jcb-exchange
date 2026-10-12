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

test('allowedAdminPermissions includes all blog permissions', () => {
  ['blog.read', 'blog.create', 'blog.update', 'blog.delete'].forEach((permission) => {
    assert.equal(allowedAdminPermissions.has(permission), true, `${permission} should be allowed`);
  });
});

test('allowedAdminPermissions exposes one view permission per vehicle service', () => {
  [
    'driving-license.verification.read',
    'rc.owner-history.read',
    'rc.challan.verification.read',
    'rc.chassis-to-rc.read',
    'rc.to-mobile.read',
    'rc.mobile-to-rc.read',
    'rc.mobile-number-check.read',
  ].forEach((permission) => {
    assert.equal(allowedAdminPermissions.has(permission), true, `${permission} should be allowed`);
  });

  [
    'driving-license.verification.verify',
    'driving-license.verification.history',
    'rc.owner-history.verify',
    'rc.owner-history.history',
    'rc.challan.verification.verify',
    'rc.challan.verification.history',
    'rc.chassis-to-rc.verify',
    'rc.chassis-to-rc.history',
    'rc.to-mobile.verify',
    'rc.to-mobile.history',
    'rc.mobile-to-rc.lookup',
    'rc.mobile-to-rc.history',
    'rc.mobile-number-check.check',
    'rc.mobile-number-check.history',
  ].forEach((permission) => {
    assert.equal(allowedAdminPermissions.has(permission), false, `${permission} should not be exposed`);
  });
});

test('allowedAdminPermissions exposes only the Mobile To PAN view permission', () => {
  ['pan.mobile-to-pan.read'].forEach((permission) => {
    assert.equal(allowedAdminPermissions.has(permission), true, `${permission} should be allowed`);
  });

  ['pan.mobile-to-pan.lookup', 'pan.mobile-to-pan.history'].forEach((permission) => {
    assert.equal(allowedAdminPermissions.has(permission), false, `${permission} should not be exposed`);
  });
});
