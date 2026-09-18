import test from 'node:test';
import assert from 'node:assert/strict';

import {
  accountAnyPermissions,
  accountsNavItems,
  getAccountCreatePermissions,
  getAccountDeletePermissions,
  getAccountExportPermission,
  getAccountReadPermission,
  getAccountUpdatePermissions,
} from './accountsPermissions.js';

test('accounts permission catalog exposes separate read, create, update, delete, and export permissions', () => {
  assert.deepEqual(accountAnyPermissions, ['accounts.rto.read', 'accounts.rto.crud', 'accounts.sell.read', 'accounts.sell.crud']);

  assert.deepEqual(
    accountsNavItems.map((item) => ({
      key: item.key,
      read: getAccountReadPermission(item.key),
      create: getAccountCreatePermissions(item.key),
      update: getAccountUpdatePermissions(item.key),
      delete: getAccountDeletePermissions(item.key),
      export: getAccountExportPermission(item.key),
    })),
    [
      {
        key: 'rto-work-status',
        read: 'accounts.rto.read',
        create: ['accounts.rto.create', 'accounts.rto.crud'],
        update: ['accounts.rto.update', 'accounts.rto.crud'],
        delete: ['accounts.rto.delete', 'accounts.rto.crud'],
        export: 'accounts.rto.export',
      },
      {
        key: 'sell-accounts',
        read: 'accounts.sell.read',
        create: ['accounts.sell.create', 'accounts.sell.crud'],
        update: ['accounts.sell.update', 'accounts.sell.crud'],
        delete: ['accounts.sell.delete', 'accounts.sell.crud'],
        export: 'accounts.sell.export',
      },
    ]
  );
});
