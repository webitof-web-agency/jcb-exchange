import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canChangeHoliday,
  canEndHrmScope,
  canOpenHrmPath,
  canSeeHrmMenu,
  canUseHrmPayroll,
  describeHrmReachProblem,
  getFirstHrmPath,
  getHrmPageKey,
  getHrmProfileAbilities,
  getHrmProfileReads,
  getVisibleHrmPages,
  grantableStates,
  isHrmForbidden,
  meetsHrmRequirement,
  type HrmProfileFacts,
} from './hrmAccess';
import { indiaDay } from './hrmDay';

const employee = (...permissions: string[]) => ({ id: 'u1', role: 'EMPLOYEE', permissions });
const admin = (...permissions: string[]) => ({ id: 'u1', role: 'ADMIN', permissions });
const superAdmin = { id: 'root', role: 'SUPER_ADMIN', permissions: [] as string[] };

test('HRM paths map to one page key on both portals', () => {
  assert.equal(getHrmPageKey('/admin/hrm'), 'directory');
  assert.equal(getHrmPageKey('/employee/hrm'), 'directory');
  assert.equal(getHrmPageKey('/employee/hrm/organisation'), 'organisation');
  assert.equal(getHrmPageKey('/admin/hrm/organisation/offices/abc'), 'organisation');
  assert.equal(getHrmPageKey('/employee/hrm/onboarding'), 'onboarding');
  assert.equal(getHrmPageKey('/employee/hrm/reports'), 'reports');
  assert.equal(getHrmPageKey('/employee/hrm/attendance'), 'attendance');
  assert.equal(getHrmPageKey('/employee/hrm/payroll/payslips'), 'payroll');
  assert.equal(getHrmPageKey('/employee/hrm/emp-123'), 'profile');
  assert.equal(getHrmPageKey('/employee/hrmx'), null);
  assert.equal(getHrmPageKey('/employee/recruitment/offers'), null);
});

test('each HRM page needs the permission its own API needs', () => {
  const orgOnly = employee('hrm.org.read');
  assert.equal(canOpenHrmPath(orgOnly, '/employee/hrm/organisation'), true);
  assert.equal(canOpenHrmPath(orgOnly, '/employee/hrm/organisation/offices/x'), true);
  assert.equal(canOpenHrmPath(orgOnly, '/employee/hrm'), false);
  assert.equal(canOpenHrmPath(orgOnly, '/employee/hrm/reports'), false);
  assert.equal(canOpenHrmPath(orgOnly, '/employee/hrm/onboarding'), false);

  const readOnly = employee('hrm.employees.read');
  assert.equal(canOpenHrmPath(readOnly, '/employee/hrm'), true);
  assert.equal(canOpenHrmPath(readOnly, '/employee/hrm/emp-1'), true);
  assert.equal(canOpenHrmPath(readOnly, '/employee/hrm/reports'), true);
  assert.equal(canOpenHrmPath(readOnly, '/employee/hrm/organisation'), false);
  // A workspace section needs employees.read AND the section's permission.
  assert.equal(canOpenHrmPath(readOnly, '/employee/hrm/attendance'), false);
  assert.equal(canOpenHrmPath(employee('hrm.attendance.read'), '/employee/hrm/attendance'), false);
  assert.equal(canOpenHrmPath(employee('hrm.employees.read', 'hrm.attendance.read'), '/employee/hrm/attendance'), true);
  assert.equal(canOpenHrmPath(employee('hrm.employees.read', 'hrm.leave.approve'), '/employee/hrm/leave'), true);
  assert.equal(canOpenHrmPath(employee('hrm.employees.read', 'hrm.compensation.approve'), '/employee/hrm/compensation'), true);
  assert.equal(canOpenHrmPath(employee('hrm.onboarding.manage'), '/employee/hrm/onboarding'), true);
  // Managing the structure implies seeing it (GET /hrm/organisation accepts org.read or org.manage).
  assert.equal(canOpenHrmPath(employee('hrm.org.manage'), '/employee/hrm/organisation'), true);
  // Paths outside HRM are left to the other guards.
  assert.equal(canOpenHrmPath(employee(), '/employee/listings'), true);
});

test('only Super Admin (or ALL_ACCESS) is all-access in HRM: the ADMIN role is checked like an employee', () => {
  assert.equal(canOpenHrmPath(superAdmin, '/admin/hrm/organisation'), true);
  assert.equal(canOpenHrmPath(employee('ALL_ACCESS'), '/employee/hrm/exit'), true);
  assert.equal(canOpenHrmPath(admin(), '/employee/hrm/organisation'), false);
  assert.equal(canOpenHrmPath(admin('hrm.employees.read'), '/employee/hrm/organisation'), false);
  assert.equal(meetsHrmRequirement(admin('hrm.employees.read'), [['hrm.employees.read'], ['hrm.exit.read']]), false);
  assert.deepEqual(getVisibleHrmPages(admin('hrm.employees.read'), 'employee').map((page) => page.key), ['directory', 'reports']);
});

test('payroll follows Finance Hub, which does treat the ADMIN role as all-access', () => {
  assert.equal(canUseHrmPayroll(admin()), true);
  assert.equal(canUseHrmPayroll(employee()), false);
  assert.equal(canUseHrmPayroll(employee('fh.payroll.read')), true);
  assert.equal(canOpenHrmPath(admin(), '/employee/hrm/payroll/payslips'), true);
  // The menu itself is not shown to an ADMIN for payroll alone (only with a payroll grant or an HRM page).
  assert.equal(canSeeHrmMenu(admin()), false);
  assert.equal(canSeeHrmMenu(employee('fh.payroll.manage')), true);
});

test('the HRM menu shows when any child can be opened, and the first child is the landing page', () => {
  assert.equal(canSeeHrmMenu(employee('hrm.documents.read')), false);
  assert.equal(canSeeHrmMenu(employee('hrm.onboarding.manage')), true);
  assert.equal(getFirstHrmPath(employee('hrm.onboarding.read'), 'employee'), '/employee/hrm/onboarding');
  assert.equal(getFirstHrmPath(employee('hrm.org.read', 'hrm.onboarding.read'), 'employee'), '/employee/hrm/organisation');
  assert.equal(getFirstHrmPath(employee('hrm.employees.read'), 'employee'), '/employee/hrm');
  assert.equal(getFirstHrmPath(employee('hrm.attendance.read'), 'employee'), null);
  assert.deepEqual(getVisibleHrmPages(superAdmin, 'admin').map((page) => page.href), [
    '/admin/hrm', '/admin/hrm/organisation', '/admin/hrm/onboarding', '/admin/hrm/reports',
    '/admin/hrm/attendance', '/admin/hrm/leave', '/admin/hrm/compensation', '/admin/hrm/performance', '/admin/hrm/exit',
  ]);
});

const facts = (overrides: Partial<HrmProfileFacts> = {}): HrmProfileFacts => ({
  archived: false, status: 'ACTIVE', ownLogin: false, hasLogin: true, loginRole: 'EMPLOYEE', documentsVisible: true,
  openCase: false, hasOpenAssignment: true, ...overrides,
});
const hr = employee(
  'hrm.employees.read', 'hrm.employees.manage', 'hrm.assignments.manage', 'hrm.org.read', 'hrm.onboarding.manage',
  'hrm.documents.read', 'hrm.documents.manage', 'hrm.documents.verify', 'hrm.attendance.read', 'hrm.attendance.manage',
  'hrm.leave.read', 'hrm.leave.manage', 'hrm.compensation.read', 'hrm.compensation.manage', 'hrm.compensation.approve',
  'users.read', 'users.update',
);

test('profile tabs and list requests follow their read permissions', () => {
  const viewer = employee('hrm.employees.read', 'hrm.attendance.manage', 'hrm.exit.read');
  const abilities = getHrmProfileAbilities(viewer, facts());
  assert.deepEqual(abilities.tabs, { kyc: false, attendance: true, leave: false, compensation: false, performance: false, exit: true });
  // GET attendance accepts only attendance.read: the tab shows (for the form) but the list is not requested.
  assert.equal(getHrmProfileReads(viewer).attendance, false);
  assert.equal(getHrmProfileReads(viewer).exit, true);
  assert.equal(getHrmProfileReads(employee('hrm.compensation.approve')).salary, true);
});

test('documents and bank are hidden when the server says they are not visible', () => {
  assert.equal(getHrmProfileAbilities(hr, facts({ documentsVisible: false })).documentsVisible, false);
  assert.equal(getHrmProfileAbilities(hr, facts({ documentsVisible: false })).tabs.kyc, false);
  assert.equal(getHrmProfileAbilities(employee('hrm.employees.read'), facts()).documentsVisible, false);
  assert.equal(getHrmProfileAbilities(employee('hrm.documents.verify'), facts()).documentsVisible, true);
});

test('own record (Super Admin excepted): HR actions are done by another HR user', () => {
  const own = getHrmProfileAbilities(hr, facts({ ownLogin: true }));
  assert.equal(own.own, true);
  for (const key of ['editProfile', 'markAttendance', 'manageKyc', 'verifyDocuments', 'proposeSalary', 'approveSalary', 'assignShift', 'transfer', 'resetPassword', 'editLoginIdentity', 'confirmJoining', 'deactivate'] as const) {
    assert.equal(own[key], false, key);
  }
  // Still allowed on your own record: personal details (not date of birth), a leave request, document uploads.
  assert.equal(own.editPersonal, true);
  assert.equal(own.lockDateOfBirth, true);
  assert.equal(own.submitLeave, true);
  assert.equal(own.uploadDocuments, true);
  const root = getHrmProfileAbilities(superAdmin, facts({ ownLogin: true }));
  assert.equal(root.approveSalary, true);
  // ...but nobody deactivates their own account, not even a Super Admin.
  assert.equal(root.deactivate, false);
});

test('leavers: the controls the server refuses are hidden, documents and leave decisions stay', () => {
  const left = getHrmProfileAbilities(hr, facts({ status: 'EXITED' }));
  for (const key of ['markAttendance', 'submitLeave', 'proposeSalary', 'approveSalary', 'manageKyc', 'assignShift', 'transfer', 'addAssignment', 'deactivate'] as const) {
    assert.equal(left[key], false, key);
  }
  assert.equal(left.uploadDocuments, true);
  assert.equal(left.verifyDocuments, true);
  const archived = getHrmProfileAbilities(hr, facts({ archived: true }));
  assert.equal(archived.uploadDocuments, false);
  assert.equal(archived.editPersonal, false);
});

test('a joiner with an open onboarding case gets Cancel joining instead of Deactivate', () => {
  const joiner = getHrmProfileAbilities(hr, facts({ status: 'PRE_ONBOARDING', openCase: true }));
  assert.equal(joiner.deactivate, false);
  assert.equal(joiner.useCancelJoining, true);
  assert.equal(joiner.confirmJoining, true);
  assert.equal(getHrmProfileAbilities(hr, facts({ status: 'PRE_ONBOARDING', openCase: false })).deactivate, true);
  assert.equal(getHrmProfileAbilities(hr, facts({ status: 'ACTIVE' })).confirmJoining, false);
});

test('login email / mobile / password: users.update, an EMPLOYEE login, never ADMIN or SUPER_ADMIN accounts', () => {
  assert.equal(getHrmProfileAbilities(hr, facts()).resetPassword, true);
  assert.equal(getHrmProfileAbilities(hr, facts({ loginRole: 'ADMIN' })).resetPassword, false);
  assert.equal(getHrmProfileAbilities(hr, facts({ loginRole: 'SUPER_ADMIN' })).editLoginIdentity, false);
  assert.equal(getHrmProfileAbilities(hr, facts({ loginRole: undefined })).resetPassword, false);
  assert.equal(getHrmProfileAbilities(employee('hrm.employees.manage'), facts()).resetPassword, false);
  assert.equal(getHrmProfileAbilities(admin('hrm.employees.manage'), facts()).resetPassword, false);
});

test('confirm joining also needs employees.read (the dialog loads the joining context)', () => {
  const noRead = employee('hrm.onboarding.manage', 'hrm.employees.manage');
  assert.equal(getHrmProfileAbilities(noRead, facts({ status: 'ONBOARDING' })).confirmJoining, false);
});

test('access scopes: end and give only what the viewer could give', () => {
  const stateHr = { canManageScopes: true, allIndia: false, ownStateIds: [22] };
  assert.equal(canEndHrmScope(stateHr, { scopeType: 'STATE', state: { id: 22 } }), true);
  assert.equal(canEndHrmScope(stateHr, { scopeType: 'STATE', state: { id: 27 } }), false);
  assert.equal(canEndHrmScope(stateHr, { scopeType: 'ALL_INDIA' }), false);
  assert.equal(canEndHrmScope(stateHr, { scopeType: 'HEAD_OFFICE' }), false);
  assert.equal(canEndHrmScope(stateHr, { scopeType: 'DIRECT_REPORTS' }), true);
  assert.equal(canEndHrmScope({ ...stateHr, canManageScopes: false }, { scopeType: 'DIRECT_REPORTS' }), false);
  assert.equal(canEndHrmScope({ canManageScopes: true, allIndia: true }, { scopeType: 'ALL_INDIA' }), true);
  const states = [{ id: 22, name: 'Chhattisgarh' }, { id: 27, name: 'Maharashtra' }];
  assert.deepEqual(grantableStates(states, stateHr).map((state) => state.id), [22]);
  assert.deepEqual(grantableStates(states, { allIndia: true }).map((state) => state.id), [22, 27]);
  assert.deepEqual(grantableStates(states, { allIndia: false }), []);
});

test('holidays: All India ones need all-India access, a state one its own state', () => {
  assert.equal(canChangeHoliday({ allIndia: true, stateIds: [] }, { scope: 'ALL_INDIA' }), true);
  assert.equal(canChangeHoliday({ allIndia: false, stateIds: [22] }, { scope: 'ALL_INDIA' }), false);
  assert.equal(canChangeHoliday({ allIndia: false, stateIds: [22] }, { scope: 'STATE', stateId: 22 }), true);
  assert.equal(canChangeHoliday({ allIndia: false, stateIds: [22] }, { scope: 'STATE', stateId: 27 }), false);
  assert.equal(canChangeHoliday(null, { scope: 'STATE', stateId: 22 }), false);
});

test('an empty directory explains missing access, not missing data', () => {
  assert.equal(describeHrmReachProblem({ allIndia: true, hasProfile: true, scopeCount: 0 }), null);
  assert.equal(describeHrmReachProblem({ allIndia: false, hasProfile: true, scopeCount: 2 }), null);
  assert.match(describeHrmReachProblem({ allIndia: false, hasProfile: false, scopeCount: 0 }) ?? '', /not linked to an HR employee profile.*hrm\.scope\.all/);
  assert.match(describeHrmReachProblem({ allIndia: false, hasProfile: true, scopeCount: 0 }) ?? '', /no HRM access scope.*All-India \/ State/);
  assert.equal(describeHrmReachProblem(undefined), null);
});

test('a 403 is recognised as "no access"', () => {
  assert.equal(isHrmForbidden({ response: { status: 403 } }), true);
  assert.equal(isHrmForbidden({ response: { status: 500 } }), false);
  assert.equal(isHrmForbidden(new Error('x')), false);
});

test('the server day is the Indian calendar day', () => {
  assert.equal(indiaDay(new Date('2026-11-25T18:29:00.000Z')), '2026-11-25');
  assert.equal(indiaDay(new Date('2026-11-25T18:30:00.000Z')), '2026-11-26');
});
