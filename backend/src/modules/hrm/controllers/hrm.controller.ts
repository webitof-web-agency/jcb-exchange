import type { NextFunction, Request, Response } from 'express';
import { pipeline } from 'node:stream';
import { HrmHttpError } from '../errors';
import { hasAllIndiaAccess } from '../access';
import * as service from '../services/hrm.service';
import * as onboarding from '../services/employeeOnboarding.service';
import * as organisation from '../services/organisation.service';
import * as lifecycle from '../services/officeLifecycle.service';
import * as designations from '../services/designation.service';
import * as employeeLogin from '../services/employeeLogin.service';
import * as onboardingCases from '../services/onboarding.service';
import * as employeeDocuments from '../services/employeeDocument.service';
import * as compensation from '../services/compensation.service';
import * as shifts from '../services/shift.service';
import * as joining from '../services/joining.service';
import * as reports from '../services/reports.service';
import { requestIp } from '../audit';
import { streamFileFromDrive } from '../../../services/googleDrive.service';

const actor = (req: Request) => {
  if (!req.user) throw new HrmHttpError(401, 'AUTH_REQUIRED', 'Authentication required.');
  return { userId: req.user.id, role: req.user.role, ipAddress: requestIp(req) };
};

const param = (req: Request, name: string): string => {
  const value = req.params[name];
  if (typeof value !== 'string' || !value.trim()) throw new HrmHttpError(400, 'INVALID_ROUTE_PARAMETER', `Invalid ${name}.`);
  return value;
};

const handle = (operation: (req: Request) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await operation(req);
    return res.status(200).json({ success: true, ...(result && typeof result === 'object' && !Array.isArray(result) ? result : { data: result }) });
  } catch (error) {
    if (error instanceof HrmHttpError) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) });
    }
    return next(error);
  }
};

const DIRECTORY_QUERY_KEYS = ['status', 'search', 'page', 'limit', 'sort', 'order', 'orgUnitId', 'designation', 'employmentType', 'kyc', 'archived'] as const;

/** Only plain string query values are forwarded; the service validates them. Empty values are ignored. */
export const listEmployees = handle(async (req) => service.listEmployees(actor(req), Object.fromEntries(
  DIRECTORY_QUERY_KEYS.flatMap((key) => {
    const value = req.query[key];
    return typeof value === 'string' && value.trim() ? [[key, key === 'search' ? value.slice(0, 120) : value]] : [];
  }),
)));

export const getPayrollReadiness = handle(async (req) => ({ payrollReadiness: await service.getPayrollReadiness(actor(req)) }));

export const getEmployee = handle(async (req) => ({ employee: await service.getEmployee(actor(req), param(req, 'id')) }));
export const getEmployeeFormOptions = handle(async (req) => ({ options: await onboarding.getEmployeeFormOptions(actor(req)) }));
export const onboardEmployee = handle(async (req) => onboarding.onboardEmployeeWithLogin(actor(req), req.body));
export const onboardExistingLogin = handle(async (req) => onboarding.onboardExistingLogin(actor(req), req.body));
export const linkLoginToEmployee = handle(async (req) => onboarding.linkLoginToEmployee(actor(req), param(req, 'id'), req.body));
export const listLinkableUsers = handle(async (req) => onboarding.listLinkableUsers(actor(req), Object.fromEntries(
  (['search', 'limit'] as const).flatMap((key) => {
    const value = req.query[key];
    return typeof value === 'string' && value.trim() ? [[key, key === 'search' ? value.slice(0, 120) : value]] : [];
  }),
)));
export const transferEmployee = handle(async (req) => lifecycle.transferEmployee(actor(req), param(req, 'id'), req.body));
export const deactivateEmployee = handle(async (req) => lifecycle.deactivateEmployee(actor(req), param(req, 'id'), req.body));
export const reactivateEmployee = handle(async (req) => lifecycle.reactivateEmployee(actor(req), param(req, 'id')));
export const getLifecycleContext = handle(async (req) => ({ context: await lifecycle.getLifecycleContext(actor(req), param(req, 'id')) }));
export const updateEmployee = handle(async (req) => ({ employee: await service.updateEmployee(actor(req), param(req, 'id'), req.body) }));
export const getOrganisation = handle(async (req) => ({ organisation: await organisation.getOrganisation(actor(req)) }));
export const createOrganisationUnit = handle(async (req) => organisation.createOrganisationUnit(actor(req), req.body));
export const updateOrganisationUnit = handle(async (req) => organisation.updateOrganisationUnit(actor(req), param(req, 'id'), req.body));
export const setupHeadOffice = handle(async (req) => organisation.setupHeadOffice(actor(req), req.body));
export const listDepartmentsForManagement = handle(async (req) => organisation.listDepartmentsForManagement(actor(req)));
export const deleteOrganisationUnit = handle(async (req) => organisation.deleteOrganisationUnit(actor(req), param(req, 'id')));
export const listDesignations = handle(async () => designations.listDesignations());
export const createDesignation = handle(async (req) => designations.createDesignation(actor(req), req.body));
export const updateDesignation = handle(async (req) => designations.updateDesignation(actor(req), param(req, 'id'), req.body));
export const deleteDesignation = handle(async (req) => designations.deleteDesignation(actor(req), param(req, 'id')));
export const resetEmployeeLoginPassword = handle(async (req) => employeeLogin.resetEmployeeLoginPassword(actor(req), param(req, 'id'), req.body));
export const createStateOffices = handle(async (req) => organisation.createStateOffices(actor(req), req.body));
export const getOfficeDetail = handle(async (req) => ({ office: await organisation.getOfficeDetail(actor(req), param(req, 'id'), req.query) }));
export const appointOfficeManager = handle(async (req) => lifecycle.appointOfficeManager(actor(req), param(req, 'id'), req.body));
export const replaceOfficeManager = handle(async (req) => lifecycle.replaceOfficeManager(actor(req), param(req, 'id'), req.body));
export const listOrgUnits = handle(async (req) => ({ orgUnits: await service.listOrgUnits(actor(req)) }));
export const createOrgUnit = handle(async (req) => ({ orgUnit: await service.createOrgUnit(actor(req), req.body) }));
export const createAssignment = handle(async (req) => lifecycle.addAssignment(actor(req), param(req, 'id'), req.body));
export const createOnboardingFromOffer = handle(async (req) => ({ onboarding: await service.createOnboardingFromOffer(actor(req), param(req, 'offerId'), req.body) }));
export const listOnboarding = handle(async (req) => ({ onboarding: await service.listOnboarding(actor(req)) }));
export const addDocument = handle(async (req) => ({ document: await service.addDocument(actor(req), param(req, 'id'), req.body) }));
export const linkKycVerification = handle(async (req) => ({ document: await service.linkKycVerification(actor(req), param(req, 'id'), req.body) }));
export const createBankAccount = handle(async (req) => ({ bankAccount: await service.createBankAccount(actor(req), param(req, 'id'), req.body) }));
export const setPrimaryBankAccount = handle(async (req) => ({ bankAccount: await service.setPrimaryBankAccount(actor(req), param(req, 'id'), param(req, 'accountId')) }));
export const removeBankAccount = handle(async (req) => service.removeBankAccount(actor(req), param(req, 'id'), param(req, 'accountId')));

/** Streams a stored employee document (for example a verified PAN / Aadhaar template) from Google Drive. */
export const getDocumentFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const documentId = param(req, 'id');
    const file = await service.getDocumentFile(actor(req), documentId);
    let stream: Awaited<ReturnType<typeof streamFileFromDrive>>;
    try {
      stream = await streamFileFromDrive(file.driveFileId);
    } catch (error) {
      const status = Number((error as { code?: unknown; response?: { status?: unknown } })?.response?.status ?? (error as { code?: unknown })?.code);
      if (status === 404 || status === 403) throw new HrmHttpError(404, 'HRM_DOCUMENT_FILE_MISSING', 'The stored file could not be found. Re-verify to generate it again.');
      console.error('[hrm] Drive download failed', { documentId, message: (error as Error)?.message });
      throw new HrmHttpError(502, 'HRM_DOCUMENT_FILE_UNAVAILABLE', 'The stored file is temporarily unavailable. Please try again.');
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // pipeline destroys the Drive stream if the client disconnects or either side fails.
    pipeline(stream, res, (error) => {
      if (error && !res.writableEnded) console.error('[hrm] Document stream interrupted', { documentId, message: error.message });
    });
  } catch (error) {
    if (error instanceof HrmHttpError) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    }
    return next(error);
  }
};
export const getDocument = handle(async (req) => ({ document: await service.getDocument(actor(req), param(req, 'id')) }));
export const decideDocument = handle(async (req) => ({ document: await service.decideDocument(actor(req), param(req, 'id'), req.body) }));
export const upsertAttendance = handle(async (req) => ({ attendance: await service.upsertAttendance(actor(req), param(req, 'id'), req.body) }));
export const listAttendance = handle(async (req) => ({ attendance: await service.listAttendance(actor(req), param(req, 'id')) }));
export const createLeaveRequest = handle(async (req) => ({ leave: await service.createLeaveRequest(actor(req), param(req, 'id'), req.body) }));
export const listLeave = handle(async (req) => ({ leave: await service.listLeave(actor(req), param(req, 'id')) }));
export const decideLeave = handle(async (req) => ({ leave: await service.decideLeave(actor(req), param(req, 'id'), req.body) }));
export const createCompensation = handle(async (req) => ({ compensation: await service.createCompensation(actor(req), param(req, 'id'), req.body) }));
export const listCompensation = handle(async (req) => ({ compensation: await service.listCompensation(actor(req), param(req, 'id')) }));
export const createPerformanceReview = handle(async (req) => ({ performance: await service.createPerformanceReview(actor(req), param(req, 'id'), req.body) }));
export const listPerformance = handle(async (req) => ({ performance: await service.listPerformance(actor(req), param(req, 'id')) }));
export const createIncentive = handle(async (req) => ({ incentive: await service.createIncentive(actor(req), param(req, 'id'), req.body) }));
export const listIncentives = handle(async (req) => ({ incentives: await service.listIncentives(actor(req), param(req, 'id')) }));
export const createExitCase = handle(async (req) => ({ exit: await service.createExitCase(actor(req), param(req, 'id'), req.body) }));
export const listExitCases = handle(async (req) => ({ exit: await service.listExitCases(actor(req), param(req, 'id')) }));
export const createAccessScope = handle(async (req) => ({ scope: await service.createAccessScope(actor(req), req.body) }));
export const listAuditLogs = handle(async (req) => ({ auditLogs: await service.listAuditLogs(actor(req), typeof req.query.entityType === 'string' ? req.query.entityType : undefined, typeof req.query.entityId === 'string' ? req.query.entityId : undefined) }));

// ---- Phase 4: onboarding, documents upload, salary approval, shifts and holidays ----
export const listOnboardingCases = handle(async (req) => onboardingCases.listOnboardingCases(actor(req), req.query));
export const getEmployeeOnboarding = handle(async (req) => ({ onboarding: await onboardingCases.getEmployeeOnboarding(actor(req), param(req, 'id')) }));
export const cancelJoining = handle(async (req) => onboardingCases.cancelJoining(actor(req), param(req, 'id'), req.body));
export const resolveOnboardingReview = handle(async (req) => ({ result: await onboardingCases.resolveOnboardingReview(actor(req), param(req, 'id'), req.body) }));
export const uploadEmployeeDocument = handle(async (req) => ({ document: await employeeDocuments.uploadEmployeeDocument(actor(req), param(req, 'id'), req.file, req.body) }));
export const listSalary = handle(async (req) => compensation.listCompensationHistory(actor(req), param(req, 'id')));
export const proposeSalary = handle(async (req) => ({ revision: await compensation.proposeCompensation(actor(req), param(req, 'id'), req.body) }));
export const decideSalary = handle(async (req) => ({ revision: await compensation.decideCompensation(actor(req), param(req, 'id'), req.body) }));
export const listShifts = handle(async (req) => ({
  shifts: await shifts.listShifts(req.query.includeInactive === 'true'),
  // The shift list is a head-office master: changing it needs all-India HRM access too.
  abilities: { allIndia: await hasAllIndiaAccess(actor(req)) },
}));
export const createShift = handle(async (req) => ({ shift: await shifts.createShift(actor(req), req.body) }));
export const updateShift = handle(async (req) => ({ shift: await shifts.updateShift(actor(req), param(req, 'id'), req.body) }));
export const deleteShift = handle(async (req) => shifts.deleteShift(actor(req), param(req, 'id')));
export const listEmployeeShifts = handle(async (req) => shifts.listEmployeeShifts(actor(req), param(req, 'id')));
export const assignShift = handle(async (req) => ({ assignment: await shifts.assignShift(actor(req), param(req, 'id'), req.body) }));
export const listHolidays = handle(async (req) => shifts.listHolidays(req.query, actor(req)));
export const createHoliday = handle(async (req) => ({ holiday: await shifts.createHoliday(actor(req), req.body) }));
export const updateHoliday = handle(async (req) => ({ holiday: await shifts.updateHoliday(actor(req), param(req, 'id'), req.body) }));
export const deleteHoliday = handle(async (req) => shifts.deleteHoliday(actor(req), param(req, 'id')));

// ---- Phase 5: confirm joining, login role, HRM access ----
export const getJoiningContext = handle(async (req) => ({ context: await joining.getJoiningContext(actor(req), param(req, 'id')) }));
export const confirmJoining = handle(async (req) => ({ result: await joining.confirmJoining(actor(req), param(req, 'id'), req.body) }));
export const getEmployeeAccess = handle(async (req) => ({ access: await joining.getEmployeeAccess(actor(req), param(req, 'id')) }));
export const grantEmployeeScope = handle(async (req) => ({ scope: await joining.grantEmployeeScope(actor(req), param(req, 'id'), req.body) }));
export const endEmployeeScope = handle(async (req) => ({ scope: await joining.endEmployeeScope(actor(req), param(req, 'id'), req.body) }));
export const changeLoginRole = handle(async (req) => joining.changeLoginRole(actor(req), param(req, 'id'), req.body));

// ---- Phase 6: reports; the old free-form create is retired ----
export const getReportSummary = handle(async (req) => ({ report: await reports.getReportSummary(actor(req), req.query) }));
export const getHeadcountCsv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await reports.getHeadcountCsv(actor(req), req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.status(200).send(file.csv);
  } catch (error) {
    if (error instanceof HrmHttpError) return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    return next(error);
  }
};
export const retiredAccessScopes = (_req: Request, res: Response) => res.status(410).json({
  success: false,
  code: 'USE_ACCESS_CARD',
  error: 'HRM access is given from the employee\'s Access card.',
});

export const retiredCreateEmployee = (_req: Request, res: Response) => res.status(410).json({
  success: false,
  code: 'USE_ADD_EMPLOYEE',
  error: 'Employees are added with "Add employee" (with their login and placement) or from an accepted offer.',
});
