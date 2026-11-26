import assert from 'node:assert/strict';
import test from 'node:test';

import { formatHrmStatus, getHrmModulePath, hasHrmPermission } from './hrmUi';

test('HRM visibility uses additive permissions and preserves super-admin access', () => {
  assert.equal(hasHrmPermission(['hrm.employees.read'], ['hrm.employees.read']), true);
  assert.equal(hasHrmPermission(['dashboard.view'], ['hrm.employees.read']), false);
  assert.equal(hasHrmPermission([], ['hrm.employees.read'], true), true);
  // ALL_ACCESS holds everything, as on the server; nothing else does.
  assert.equal(hasHrmPermission(['ALL_ACCESS'], ['hrm.exit.read']), true);
  assert.equal(hasHrmPermission(undefined, ['hrm.exit.read']), false);
});

test('HRM statuses are rendered as readable labels', () => {
  assert.equal(formatHrmStatus('PRE_ONBOARDING'), 'Pre Onboarding');
  assert.equal(formatHrmStatus(null), 'Unknown');
});

test('HRM module links preserve the portal, employee record, and selected workspace', () => {
  assert.equal(getHrmModulePath('employee', 'employee-123', 'attendance'), '/employee/hrm/employee-123?module=attendance');
  assert.equal(getHrmModulePath('admin', 'employee/123', 'performance'), '/admin/hrm/employee%2F123?module=performance');
});
