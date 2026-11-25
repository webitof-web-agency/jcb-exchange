import { Router } from 'express';
import { requireAllIndiaHrm, requireFinancePayrollRead, requireHrmPermission } from './access';

const orgMasters = requireAllIndiaHrm('The organisation structure');
const designationMasters = requireAllIndiaHrm('The designation list');
const shiftMasters = requireAllIndiaHrm('The shift list');
import { HRM_PERMISSIONS } from './security';
import * as controller from './controllers/hrm.controller';
import { hrmMutationRateLimit } from '../../middlewares/rateLimit.middleware';
import { requireAuth } from '../../middlewares/auth.middleware';
import { getDocumentUploadMiddleware } from '../../utils/documentUpload';
import { sanitizeRequestBody } from '../../middlewares/sanitizeRequest.middleware';

// An employee document file: PDF, JPG, PNG or WEBP, content-checked, private storage.
const employeeDocumentUpload = getDocumentUploadMiddleware('secure', 'document');

const router = Router();
router.use(requireAuth);

router.get('/employees', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_READ), controller.listEmployees);
router.get('/payroll/readiness', requireHrmPermission(HRM_PERMISSIONS.COMPENSATION_READ), requireFinancePayrollRead, controller.getPayrollReadiness);
// The old free-form create (any code, any login) is retired: Add employee or an accepted offer create employees.
router.post('/employees', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.retiredCreateEmployee);
router.get('/employees/form-options', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.getEmployeeFormOptions);
router.get('/employees/linkable-users', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.listLinkableUsers);
router.post('/employees/onboard-existing', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.onboardExistingLogin);
router.post('/employees/onboard', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.onboardEmployee);
router.get('/employees/:id', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_READ), controller.getEmployee);
router.patch('/employees/:id', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.updateEmployee);
router.post('/employees/:id/reset-password', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.resetEmployeeLoginPassword);
router.post('/employees/:id/link-login', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.linkLoginToEmployee);
router.get('/employees/:id/lifecycle-context', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_READ), controller.getLifecycleContext);
router.post('/employees/:id/transfer', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ASSIGNMENTS_MANAGE), controller.transferEmployee);
router.post('/employees/:id/deactivate', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.deactivateEmployee);
router.post('/employees/:id/reactivate', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.reactivateEmployee);
router.post('/employees/:id/assignments', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ASSIGNMENTS_MANAGE), controller.createAssignment);
router.post('/employees/:id/documents', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.DOCUMENTS_MANAGE), controller.addDocument);
router.post('/employees/:id/kyc-verifications', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.DOCUMENTS_MANAGE), controller.linkKycVerification);
router.post('/employees/:id/bank-accounts', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.DOCUMENTS_MANAGE), controller.createBankAccount);
router.patch('/employees/:id/bank-accounts/:accountId/primary', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.DOCUMENTS_MANAGE), controller.setPrimaryBankAccount);
router.delete('/employees/:id/bank-accounts/:accountId', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.DOCUMENTS_MANAGE), controller.removeBankAccount);
router.get('/employees/:id/attendance', requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_READ), controller.listAttendance);
router.put('/employees/:id/attendance', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_MANAGE), controller.upsertAttendance);
router.get('/employees/:id/leave', requireHrmPermission(HRM_PERMISSIONS.LEAVE_READ), controller.listLeave);
router.post('/employees/:id/leave', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.LEAVE_MANAGE), controller.createLeaveRequest);
router.get('/employees/:id/compensation', requireHrmPermission(HRM_PERMISSIONS.COMPENSATION_READ), controller.listCompensation);
router.post('/employees/:id/compensation', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.COMPENSATION_MANAGE), controller.createCompensation);
router.get('/employees/:id/performance', requireHrmPermission(HRM_PERMISSIONS.PERFORMANCE_READ), controller.listPerformance);
router.post('/employees/:id/performance', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.PERFORMANCE_MANAGE), controller.createPerformanceReview);
router.get('/employees/:id/incentives', requireHrmPermission(HRM_PERMISSIONS.INCENTIVE_READ), controller.listIncentives);
router.post('/employees/:id/incentives', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.INCENTIVE_MANAGE), controller.createIncentive);
router.get('/employees/:id/exit', requireHrmPermission(HRM_PERMISSIONS.EXIT_READ), controller.listExitCases);
router.post('/employees/:id/exit', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.EXIT_MANAGE), controller.createExitCase);

// Managing the structure implies seeing it: read or manage opens the Organisation page.
router.get('/organisation', requireHrmPermission(HRM_PERMISSIONS.ORG_READ, HRM_PERMISSIONS.ORG_MANAGE), controller.getOrganisation);
router.post('/organisation/units', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ORG_MANAGE), orgMasters, controller.createOrganisationUnit);
router.patch('/organisation/units/:id', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ORG_MANAGE), orgMasters, controller.updateOrganisationUnit);
router.get('/organisation/departments', requireHrmPermission(HRM_PERMISSIONS.ORG_READ, HRM_PERMISSIONS.ORG_MANAGE), controller.listDepartmentsForManagement);
router.delete('/organisation/units/:id', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ORG_MANAGE), orgMasters, controller.deleteOrganisationUnit);
router.get('/designations', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_READ, HRM_PERMISSIONS.ORG_MANAGE), controller.listDesignations);
router.post('/designations', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ORG_MANAGE), designationMasters, controller.createDesignation);
router.patch('/designations/:id', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ORG_MANAGE), designationMasters, controller.updateDesignation);
router.delete('/designations/:id', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ORG_MANAGE), designationMasters, controller.deleteDesignation);
router.post('/organisation/state-offices', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ORG_MANAGE), orgMasters, controller.createStateOffices);
router.get('/organisation/offices/:id', requireHrmPermission(HRM_PERMISSIONS.ORG_READ, HRM_PERMISSIONS.ORG_MANAGE), controller.getOfficeDetail);
router.post('/organisation/offices/:id/managers', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ASSIGNMENTS_MANAGE), controller.appointOfficeManager);
router.post('/organisation/offices/:id/replace-manager', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ASSIGNMENTS_MANAGE), controller.replaceOfficeManager);
router.post('/organisation/head-office-setup', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ORG_MANAGE), orgMasters, controller.setupHeadOffice);
router.get('/org-units', requireHrmPermission(HRM_PERMISSIONS.ORG_READ), controller.listOrgUnits);
router.post('/org-units', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ORG_MANAGE), orgMasters, controller.createOrgUnit);

router.get('/onboarding', requireHrmPermission(HRM_PERMISSIONS.ONBOARDING_READ), controller.listOnboarding);
router.post('/onboarding/from-offer/:offerId', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ONBOARDING_MANAGE), controller.createOnboardingFromOffer);

router.patch('/documents/:id/decision', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.DOCUMENTS_VERIFY), controller.decideDocument);
router.get('/documents/:id', requireHrmPermission(HRM_PERMISSIONS.DOCUMENTS_READ), controller.getDocument);
router.get('/documents/:id/file', requireHrmPermission(HRM_PERMISSIONS.DOCUMENTS_READ), controller.getDocumentFile);
router.patch('/leave/:id/decision', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.LEAVE_APPROVE), controller.decideLeave);
// Retired: access is given from the employee's Access card (POST /employees/:id/access-scopes), which applies every rule.
router.post('/access-scopes', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.SCOPE_MANAGE), controller.retiredAccessScopes);
router.get('/audit-logs', requireHrmPermission(HRM_PERMISSIONS.AUDIT_READ), controller.listAuditLogs);

// Onboarding (offer accepted -> joined)
router.get('/onboarding/cases', requireHrmPermission(HRM_PERMISSIONS.ONBOARDING_READ, HRM_PERMISSIONS.ONBOARDING_MANAGE), controller.listOnboardingCases);
router.post('/onboarding/cases/:id/cancel', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ONBOARDING_MANAGE), controller.cancelJoining);
router.post('/onboarding/cases/:id/resolve', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ONBOARDING_MANAGE), controller.resolveOnboardingReview);
router.get('/employees/:id/onboarding', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_READ), controller.getEmployeeOnboarding);
// Real document files
router.post('/employees/:id/documents/upload', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.DOCUMENTS_MANAGE), employeeDocumentUpload.single('file'), sanitizeRequestBody, controller.uploadEmployeeDocument);
// Salary: propose (manage) and approve / reject (approve, by somebody else)
router.get('/employees/:id/salary', requireHrmPermission(HRM_PERMISSIONS.COMPENSATION_READ, HRM_PERMISSIONS.COMPENSATION_MANAGE, HRM_PERMISSIONS.COMPENSATION_APPROVE), controller.listSalary);
router.post('/employees/:id/salary', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.COMPENSATION_MANAGE), controller.proposeSalary);
router.post('/salary-revisions/:id/decision', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.COMPENSATION_APPROVE), controller.decideSalary);
// Shifts and holidays (attendance foundation)
router.get('/shifts', requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_READ, HRM_PERMISSIONS.ATTENDANCE_MANAGE, HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.listShifts);
router.post('/shifts', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_MANAGE), shiftMasters, controller.createShift);
router.patch('/shifts/:id', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_MANAGE), shiftMasters, controller.updateShift);
router.delete('/shifts/:id', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_MANAGE), shiftMasters, controller.deleteShift);
router.get('/employees/:id/shifts', requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_READ, HRM_PERMISSIONS.EMPLOYEES_READ), controller.listEmployeeShifts);
router.post('/employees/:id/shifts', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_MANAGE), controller.assignShift);
router.get('/holidays', requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_READ, HRM_PERMISSIONS.ATTENDANCE_MANAGE, HRM_PERMISSIONS.ORG_READ), controller.listHolidays);
router.post('/holidays', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_MANAGE), controller.createHoliday);
router.patch('/holidays/:id', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_MANAGE), controller.updateHoliday);
router.delete('/holidays/:id', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ATTENDANCE_MANAGE), controller.deleteHoliday);

// Confirm joining and access (Phase 5)
router.get('/employees/:id/joining-context', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_READ), controller.getJoiningContext);
router.post('/employees/:id/confirm-joining', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.ONBOARDING_MANAGE), controller.confirmJoining);
router.get('/employees/:id/access', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_READ), controller.getEmployeeAccess);
router.post('/employees/:id/access-scopes', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.SCOPE_MANAGE), controller.grantEmployeeScope);
router.post('/access-scopes/:id/end', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.SCOPE_MANAGE), controller.endEmployeeScope);
router.patch('/employees/:id/login-role', hrmMutationRateLimit, requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_MANAGE), controller.changeLoginRole);

// Reports (Phase 6): scope-limited aggregates for directors / HR
router.get('/reports/summary', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_READ), controller.getReportSummary);
router.get('/reports/headcount.csv', requireHrmPermission(HRM_PERMISSIONS.EMPLOYEES_READ), controller.getHeadcountCsv);

export default router;
