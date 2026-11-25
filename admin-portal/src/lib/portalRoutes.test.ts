import assert from 'node:assert/strict';
import test from 'node:test';

import { getEmployeeLandingPath, resolveEmployeePortalRoute, resolveEmployeeRouteRedirect } from './portalRoutes';
import { getRecruitmentLandingPath, getRecruitmentRoutePermissions, isRecruitmentPath } from './recruitmentPermissions';

test('an HR-only login lands on the first HRM page it can open, not on a dashboard that answers 403', () => {
  assert.equal(getEmployeeLandingPath(['hrm.employees.read']), '/employee/hrm');
  assert.equal(getEmployeeLandingPath(['hrm.onboarding.read']), '/employee/hrm/onboarding');
  assert.equal(getEmployeeLandingPath(['hrm.org.read']), '/employee/hrm/organisation');
  assert.equal(getEmployeeLandingPath(['dashboard.view', 'hrm.employees.read']), '/employee/dashboard');
  // A key that opens no HRM page (payroll is Finance's landing) does not land in HRM.
  assert.equal(getEmployeeLandingPath(['hrm.attendance.read']), '/employee/dashboard');
});

test('a recruitment-only login lands on its first recruitment page (there is no /recruitment index page)', () => {
  assert.equal(getEmployeeLandingPath(['recruitment.offers.read']), '/employee/recruitment/offers');
  assert.equal(getEmployeeLandingPath(['recruitment.settings.update']), '/employee/recruitment/settings');
  assert.equal(resolveEmployeePortalRoute('/employee/recruitment', ['recruitment.jobs.read']), '/employee/recruitment/jobs');
});

test('/admin/hrm/** is mapped onto /employee/hrm/** page by page', () => {
  assert.equal(resolveEmployeeRouteRedirect('/admin/hrm/organisation', ['hrm.org.read']), '/employee/hrm/organisation');
  // Not allowed on that page: the landing page instead.
  assert.equal(resolveEmployeeRouteRedirect('/admin/hrm/organisation', ['hrm.employees.read']), '/employee/hrm');
  assert.equal(resolveEmployeeRouteRedirect('/admin/hrm', ['hrm.onboarding.read']), '/employee/hrm/onboarding');
  assert.equal(resolveEmployeeRouteRedirect('/admin/hrm/emp-1', []), '/employee/dashboard');
  // Payroll is left to the layout (it knows the role; Finance treats ADMIN as all-access).
  assert.equal(resolveEmployeeRouteRedirect('/admin/hrm/payroll/payslips', ['fh.payroll.read']), '/employee/hrm/payroll/payslips');
});

test('/admin/recruitment/** for employees follows the per-page recruitment permissions', () => {
  assert.equal(resolveEmployeeRouteRedirect('/admin/recruitment/offers', ['recruitment.offers.read']), '/employee/recruitment/offers');
  assert.equal(resolveEmployeeRouteRedirect('/admin/recruitment/offers', ['recruitment.jobs.read']), '/employee/recruitment/jobs');
  assert.equal(resolveEmployeePortalRoute('/employee/recruitment/offers', ['recruitment.jobs.read']), '/employee/recruitment/jobs');
  assert.equal(resolveEmployeePortalRoute('/employee/recruitment/applications/a1', ['recruitment.applications.read']), '/employee/recruitment/applications/a1');
});

test('recruitment route permissions cover both portals, settings and candidates', () => {
  assert.equal(isRecruitmentPath('/admin/recruitment/offers'), true);
  assert.equal(isRecruitmentPath('/employee/recruitment'), true);
  assert.equal(isRecruitmentPath('/employee/recruitments'), false);
  assert.deepEqual(getRecruitmentRoutePermissions('/admin/recruitment/offers'), ['recruitment.offers.read']);
  assert.deepEqual(getRecruitmentRoutePermissions('/employee/recruitment/applications/a1'), ['recruitment.applications.read']);
  assert.deepEqual(getRecruitmentRoutePermissions('/employee/recruitment/settings'), ['recruitment.settings.read', 'recruitment.settings.update']);
  assert.deepEqual(getRecruitmentRoutePermissions('/employee/recruitment/candidates'), ['recruitment.candidates.read']);
  assert.ok(getRecruitmentRoutePermissions('/employee/recruitment/unknown')?.includes('recruitment.jobs.read'));
  assert.equal(getRecruitmentRoutePermissions('/employee/hrm'), null);
  assert.equal(getRecruitmentLandingPath(['recruitment.pipeline.read']), '/employee/recruitment/pipeline');
  assert.equal(getRecruitmentLandingPath(['ALL_ACCESS']), '/employee/recruitment/dashboard');
  assert.equal(getRecruitmentLandingPath([]), null);
});
