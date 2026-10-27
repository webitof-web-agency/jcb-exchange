import assert from 'node:assert/strict';
import test from 'node:test';

import { FINANCE_WORKSPACE_PERMISSION_IDS } from './adminPermissionCatalog';
import {
  FINANCE_WORKSPACE_VIEW_PERMISSIONS,
  financeLegacyLinks,
  financeModulePath,
  financeWorkspaceGroups,
  financeWorkspaceModules,
  getVisibleFinanceWorkspaceGroups,
  matchFinanceModulePath,
} from './financeWorkspace';

test('workspace menu has the 14 requested groups with unique module keys', () => {
  assert.equal(financeWorkspaceGroups.length, 14);
  const keys = financeWorkspaceModules.map((module) => module.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('every group is gated by finance workspace permissions known to the role editor', () => {
  financeWorkspaceGroups.forEach((group) => {
    assert.ok(group.permissions.length > 0, `${group.key} needs permissions`);
    group.permissions.forEach((permission) => {
      assert.ok(FINANCE_WORKSPACE_PERMISSION_IDS.includes(permission), `${permission} missing from catalog`);
    });
  });
  FINANCE_WORKSPACE_VIEW_PERMISSIONS.forEach((permission) => {
    assert.ok(FINANCE_WORKSPACE_PERMISSION_IDS.includes(permission), `${permission} missing from catalog`);
  });
});

test('legacy finance permissions do not open the workspace', () => {
  assert.equal(FINANCE_WORKSPACE_VIEW_PERMISSIONS.includes('finance.read'), false);
  assert.deepEqual(getVisibleFinanceWorkspaceGroups(['finance.read', 'finance.manage'], false), []);
});

test('visible groups follow the granted keys; payroll stays hidden from an accountant', () => {
  const accountant = getVisibleFinanceWorkspaceGroups(['fh.books.read', 'fh.reports.read'], false).map((group) => group.key);
  assert.deepEqual(accountant, ['accounting-books', 'financial-reports']);
  assert.equal(accountant.includes('payroll'), false);
  assert.equal(getVisibleFinanceWorkspaceGroups([], true).length, 14);
  assert.equal(getVisibleFinanceWorkspaceGroups(['ALL_ACCESS'], false).length, 14);
});

test('every module has its own page path that resolves back to the module', () => {
  financeWorkspaceModules.forEach((module) => {
    const path = financeModulePath('/employee', module.key);
    assert.equal(path, `/employee/finance/${module.groupKey}/${module.key}`);
    assert.equal(matchFinanceModulePath(path)?.module.key, module.key);
  });
  assert.equal(financeModulePath('/admin', 'master-general-ledger', { accountId: 'a1', from: '2026-04-01', to: undefined }), '/admin/finance/accounting-books/master-general-ledger?accountId=a1&from=2026-04-01');
  assert.equal(financeModulePath('/admin', 'unknown-key'), '/admin/finance/workspace');
});

test('module paths do not shadow the older finance pages or cross groups', () => {
  assert.equal(matchFinanceModulePath('/admin/finance/expenses/abc'), null);
  assert.equal(matchFinanceModulePath('/admin/finance/workspace'), null);
  assert.equal(matchFinanceModulePath('/admin/finance/payroll/day-book'), null);
  financeLegacyLinks.forEach((link) => assert.ok(financeWorkspaceGroups.some((group) => group.key === link.groupKey)));
});
