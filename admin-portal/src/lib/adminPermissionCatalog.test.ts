import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_PERMISSION_DEFINITIONS,
  EMAIL_PERMISSION_DEFINITIONS,
  EMAIL_VIEW_PERMISSIONS,
  FINANCE_WORKSPACE_PERMISSION_IDS,
  HRM_PERMISSION_GROUPS,
  KYC_PERMISSION_DEFINITIONS,
  LISTING_PERMISSION_DEFINITIONS,
} from './adminPermissionCatalog';

const hrmLabel = (id: string) => HRM_PERMISSION_GROUPS
  .flatMap((group) => group.permissions)
  .find((permission) => permission.id === id)?.label;

test('HRM labels say what the powerful keys really unlock', () => {
  assert.equal(
    hrmLabel('hrm.onboarding.manage'),
    'Onboarding: start, confirm joining, cancel, resolve review (Confirm joining also needs users.create / users.read / users.update for the login)',
  );
  assert.equal(hrmLabel('hrm.employees.manage'), 'Employees: edit, deactivate, link login, reset password (with users.update)');
  assert.equal(hrmLabel('hrm.scope.all'), 'All-India HRM access: every employee, give any access scope');
  assert.equal(hrmLabel('hrm.compensation.approve'), 'Approve / reject salaries (never your own)');
  assert.equal(hrmLabel('hrm.scope.manage'), 'Give / end HRM access scopes (never wider than your own)');
  assert.match(hrmLabel('hrm.audit.read') ?? '', /all-India HR only/);
  assert.match(HRM_PERMISSION_GROUPS[0].note ?? '', /hrm\.employees\.read/);
});

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

test('exposes separate AI use and shared-provider management permissions', () => {
  assert.deepEqual(AI_PERMISSION_DEFINITIONS, [
    { id: 'ai.use', label: 'Use JCB Intelligence Hub' },
    { id: 'ai.manage', label: 'Manage Shared AI Provider Settings' },
    { id: 'ai.sensitive.read', label: 'View AI-sensitive fields (still masked to providers)' },
    { id: 'identity.sensitive.read', label: 'View identity-sensitive fields (still masked to providers)' },
  ]);
});

test('exposes separate Email view and manage permissions', () => {
  assert.deepEqual(EMAIL_PERMISSION_DEFINITIONS, [
    { id: 'email.read', label: 'View Email Communications' },
    { id: 'email.manage', label: 'Manage SMTP Settings & Email Delivery' },
  ]);
  assert.deepEqual(EMAIL_VIEW_PERMISSIONS, ['email.read', 'email.manage']);
});

test('finance workspace permissions are unique fh.* keys and never reuse the legacy finance keys', () => {
  assert.equal(FINANCE_WORKSPACE_PERMISSION_IDS.length, 33);
  assert.equal(new Set(FINANCE_WORKSPACE_PERMISSION_IDS).size, FINANCE_WORKSPACE_PERMISSION_IDS.length);
  FINANCE_WORKSPACE_PERMISSION_IDS.forEach((id) => assert.match(id, /^fh\./));
  assert.equal(FINANCE_WORKSPACE_PERMISSION_IDS.includes('finance.read'), false);
});
