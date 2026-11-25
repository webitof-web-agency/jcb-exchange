import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HRM_PERMISSIONS,
  canAccessHrmAssignment,
  hasAllIndiaScope,
  redactHrmAuditPayload,
  resolveHrmPermissions,
  type HrmScopeDescriptor,
} from './security';

const assignment = {
  employeeId: 'employee-1',
  managerEmployeeId: 'manager-1',
  orgUnitId: 'department-1',
  parentOrgUnitIds: ['company-1'],
  operationalRegionId: 'region-1',
  stateId: 10,
};

test('HRM reads permissions like every other guard: the role when the login has one, else direct grants', () => {
  assert.deepEqual(resolveHrmPermissions('EMPLOYEE', ['hrm.employees.read'], ['hrm.documents.read']), new Set(['hrm.employees.read']));
  assert.deepEqual(resolveHrmPermissions('EMPLOYEE', null, ['hrm.documents.read']), new Set(['hrm.documents.read']));
  assert.deepEqual(resolveHrmPermissions('EMPLOYEE', [], ['hrm.documents.read']), new Set());
  assert.equal(resolveHrmPermissions('SUPER_ADMIN', [], []).has('ALL_ACCESS'), true);
  assert.equal(HRM_PERMISSIONS.EMPLOYEES_READ, 'hrm.employees.read');
});

test('HRM scope evaluator supports own, direct reports, hierarchy and geographic scopes', () => {
  const scopes: HrmScopeDescriptor[] = [
    { scopeType: 'DIRECT_REPORTS', includeChildren: false },
    { scopeType: 'REGION', operationalRegionId: 'region-1', includeChildren: true },
  ];

  assert.equal(canAccessHrmAssignment({ ...assignment, employeeId: 'manager-1', managerEmployeeId: 'manager-2', operationalRegionId: 'region-2' }, 'manager-1', scopes), false);
  assert.equal(canAccessHrmAssignment(assignment, 'manager-1', scopes), true);
  assert.equal(canAccessHrmAssignment({ ...assignment, managerEmployeeId: 'manager-2', operationalRegionId: 'region-2' }, 'manager-1', scopes), false);
  assert.equal(canAccessHrmAssignment({ ...assignment, employeeId: 'manager-1' }, 'manager-1', [{ scopeType: 'OWN', includeChildren: false }]), true);
});

test('HRM audit payload redacts bank, token and document secrets', () => {
  const safe = redactHrmAuditPayload({
    employeeCode: 'EMP-001',
    encryptedAccountNumber: 'secret',
    accountNumber: '123456',
    accessToken: 'token',
    fileRef: 'drive-file-id',
    status: 'ACTIVE',
  });

  assert.deepEqual(safe, {
    employeeCode: 'EMP-001',
    encryptedAccountNumber: '[REDACTED]',
    accountNumber: '[REDACTED]',
    accessToken: '[REDACTED]',
    fileRef: '[REDACTED]',
    status: 'ACTIVE',
  });
});

test('an ALL_INDIA scope is recognised, narrower scopes are not', () => {
  assert.equal(hasAllIndiaScope([{ scopeType: 'STATE' }, { scopeType: 'ALL_INDIA' }]), true);
  assert.equal(hasAllIndiaScope([{ scopeType: 'STATE' }, { scopeType: 'HEAD_OFFICE' }]), false);
  assert.equal(hasAllIndiaScope([]), false);
});

test('a head office scope covers people who work from that office, and audit snapshots keep dates', () => {
  const base = { employeeId: 'e1', orgUnitId: 'dept-1', parentOrgUnitIds: [] as string[] };
  const scope = [{ scopeType: 'HEAD_OFFICE' as const, orgUnitId: 'ho-1', includeChildren: true }];
  assert.equal(canAccessHrmAssignment({ ...base, officeUnitId: 'ho-1' }, 'actor', scope), true);
  assert.equal(canAccessHrmAssignment({ ...base, officeUnitId: 'state-1' }, 'actor', scope), false);
  assert.deepEqual(redactHrmAuditPayload({ effectiveFrom: new Date('2026-11-24T00:00:00.000Z'), accountNumber: '123' }), { effectiveFrom: '2026-11-24T00:00:00.000Z', accountNumber: '[REDACTED]' });
});

test('a state scope covers that state office staff, not head office staff who sit in the same state', () => {
  const scope = [{ scopeType: 'STATE' as const, stateId: 22, includeChildren: true }];
  const stateStaff = { employeeId: 'e1', orgUnitId: 'dept', officeUnitId: 'cg-office', stateId: 22, parentOrgUnitIds: [] as string[] };
  assert.equal(canAccessHrmAssignment(stateStaff, 'actor', scope), true);
  assert.equal(canAccessHrmAssignment({ ...stateStaff, officeUnitId: 'ho', officeIsHeadOffice: true }, 'actor', scope), false);
});
