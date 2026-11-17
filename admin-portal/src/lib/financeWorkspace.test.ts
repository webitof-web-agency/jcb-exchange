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
  matchFinanceAiPagePath,
  matchFinanceAiPageContext,
  matchAiPageContext,
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

test('AI page context includes Sales & Revenue legacy routes without changing their navigation', () => {
  assert.equal(matchFinanceAiPagePath('/admin/invoices')?.module.key, 'vehicle-sale-invoices');
  assert.equal(matchFinanceAiPagePath('/employee/recurrence')?.module.key, 'customer-prime-payments');
  assert.equal(matchFinanceAiPagePath('/admin/finance/expenses')?.module.key, 'expenses-transactions');
  assert.equal(matchFinanceAiPagePath('/admin/finance/vehicle-finance/stock-valuation')?.module.key, 'stock-valuation');
  assert.equal(matchFinanceAiPagePath('/admin/dashboard'), null);
});

test('AI page context identifies the legacy Sold Vehicles module route', () => {
  assert.deepEqual(matchFinanceAiPageContext('/employee/accounts/sell-accounts'), {
    groupKey: 'accounts',
    moduleKey: 'sold-vehicles',
    moduleLabel: 'Sold Vehicles',
  });
  assert.equal(matchFinanceAiPageContext('/employee/accounts/sell-accounts/vehicle-id'), null);
});

test('AI page context identifies Analytics and every Recruitment page route', () => {
  assert.deepEqual(matchAiPageContext('/admin/analytics'), {
    groupKey: 'reports',
    moduleKey: 'analytics-overview',
    moduleLabel: 'Analytics',
  });
  assert.deepEqual(matchAiPageContext('/employee/analytics/vehicle-1'), {
    groupKey: 'reports',
    moduleKey: 'analytics-listing-detail',
    moduleLabel: 'Analytics listing detail',
  });
  assert.deepEqual(matchAiPageContext('/admin/recruitment/jobs'), {
    groupKey: 'recruitment',
    moduleKey: 'jobs',
    moduleLabel: 'Jobs',
  });
  assert.deepEqual(matchAiPageContext('/employee/recruitment/pipeline'), {
    groupKey: 'recruitment',
    moduleKey: 'pipeline',
    moduleLabel: 'Pipeline Stages',
  });
  assert.deepEqual(matchAiPageContext('/admin/recruitment/applications/application-123'), {
    groupKey: 'recruitment',
    moduleKey: 'application-detail',
    moduleLabel: 'Applications detail',
    recordId: 'application-123',
  });
});

test('AI page context identifies Administration routes', () => {
  assert.deepEqual(matchAiPageContext('/admin/users'), {
    groupKey: 'administration',
    moduleKey: 'users',
    moduleLabel: 'Users',
  });
  assert.deepEqual(matchAiPageContext('/employee/users/roles'), {
    groupKey: 'administration',
    moduleKey: 'roles',
    moduleLabel: 'Roles & permissions',
  });
  assert.deepEqual(matchAiPageContext('/admin/settings'), {
    groupKey: 'administration',
    moduleKey: 'settings',
    moduleLabel: 'Settings',
  });
  assert.deepEqual(matchAiPageContext('/admin/whatsapp'), {
    groupKey: 'administration',
    moduleKey: 'whatsapp',
    moduleLabel: 'WhatsApp',
  });
  assert.deepEqual(matchAiPageContext('/employee/sms'), {
    groupKey: 'administration',
    moduleKey: 'sms',
    moduleLabel: 'SMS Notifications',
  });
});
