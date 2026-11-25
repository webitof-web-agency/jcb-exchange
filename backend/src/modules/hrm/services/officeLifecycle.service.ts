import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { assertAssignmentTargetAccess, assertEmployeeAccess, getAccessibleEmployeeIds, getHrmPermissions } from '../access';
import { assertNotOwnRecord } from '../employeeGuards';
import { writeHrmAudit } from '../audit';
import { designationKey, resolveDesignationForWrite } from './designation.service';
import { HrmAuthorizationError, HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import {
  addDays, applyAssignmentChange, assertEligibleManager, assertNoReportingCycle, currentAssignmentWhere, findNationalOperationsManagers,
  getPivotAssignment, lockEmployeeAssignments, MAX_BACKDATE_DAYS, openAssignmentWhere, parseDay, STATE_MANAGER_DESIGNATION,
  syncOfficePrimaryManager, toDay, utcToday, WORKING_STATUSES, type Actor, type AssignmentChanges, type PivotAssignment, type Tx,
} from '../officeAssignments';
import { deriveOfficeUnitId, ensureStateOffice, findActiveHeadOffice, resolveHeadOffice } from '../officeUnits';
import { endScopesOnExit, syncPlacementScopes } from '../accessProvisioning';
import { kindOfUnit } from '../organisationCodes';
import { HRM_PERMISSIONS, hasHrmPermission } from '../security';
import { parseHrmInput, schemas } from '../validation';

/**
 * The people moves behind the State Manager lifecycle: transfer, appoint, replace and deactivate. Every move is a
 * new assignment on the employee's timeline (the old one is closed, never edited), runs in one transaction under a
 * per-employee lock, keeps reporting lines intact and writes an audit row, so the history of "who managed which
 * state from when" can always be rebuilt.
 */

const LEFT_COMPANY = ['EXITED', 'TERMINATED'] as const;
type Db = Tx | typeof prisma;

const requirePermissions = async (actor: Actor, needed: Array<[string, string]>, what: string) => {
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  const missing = needed.filter(([permission]) => !hasHrmPermission(permissions, permission)).map(([, label]) => label);
  if (missing.length) throw new HrmAuthorizationError(`${what} needs these permissions: ${missing.join(', ')}.`);
};

const audit = (actor: Actor, entityType: 'HRM_EMPLOYEE' | 'HRM_ORG_UNIT', entityId: string, action: string, after: unknown, before: unknown, tx: Tx) =>
  writeHrmAudit({
    actorUserId: actor.userId,
    entityType,
    entityId,
    action,
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
    ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
  }, tx);

const loadWorkingEmployee = async (tx: Tx, employeeId: string) => {
  const employee = await tx.hrmEmployee.findUnique({
    where: { id: employeeId },
    select: { id: true, employeeCode: true, legalName: true, status: true, userId: true, archivedAt: true },
  });
  if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');
  if ((LEFT_COMPANY as readonly string[]).includes(employee.status)) {
    throw new HrmConflictError(`${employee.legalName} (${employee.employeeCode}) has left the company, so their assignment cannot be changed.`);
  }
  return employee;
};

/** A destination office: the active head office, or the active office of a state, with the place the person works. */
const resolveDestination = async (
  tx: Db,
  input: { toOfficeUnitId: string; cityId?: number | null | undefined },
  options: { requireCity?: boolean; sameOffice?: { stateId: number | null; cityId: number | null } } = {},
) => {
  const office = await tx.hrmOrgUnit.findUnique({
    where: { id: input.toOfficeUnitId },
    select: { id: true, name: true, type: true, isActive: true, stateId: true, cityId: true },
  });
  if (!office || !office.isActive) throw new HrmHttpError(400, 'OFFICE_NOT_FOUND', 'The selected office was not found or is switched off.');
  const kind = kindOfUnit(office);
  if (kind === 'HEAD_OFFICE') {
    // Somebody at the head office may work from another place (chosen when they were added): a chosen city sets the
    // place, otherwise a person already at the head office keeps theirs. Only a new arrival gets the head office's own.
    if (input.cityId) {
      const chosen = await tx.city.findFirst({ where: { id: input.cityId, state: { country: { iso2: 'IN' } } }, select: { id: true, stateId: true } });
      if (!chosen) throw new HrmHttpError(400, 'LOCATION_INVALID', 'The selected city was not found.');
      return { office, kind, stateId: chosen.stateId, cityId: chosen.id as number | null };
    }
    if (options.sameOffice?.stateId && options.sameOffice.cityId) {
      return { office, kind, stateId: options.sameOffice.stateId, cityId: options.sameOffice.cityId as number | null };
    }
    const fallback = office.stateId && office.cityId ? null : await resolveHeadOffice();
    const stateId = office.stateId ?? fallback?.stateId;
    const cityId = office.cityId ?? fallback?.cityId;
    if (!stateId || !cityId) throw new HrmHttpError(409, 'HEAD_OFFICE_LOCATION_MISSING', 'The head office has no location. Set it up on the Organisation page first.');
    return { office, kind, stateId, cityId: cityId as number | null };
  }
  if (kind !== 'STATE') throw new HrmHttpError(400, 'OFFICE_NOT_FOUND', 'Only the head office or a state office can be chosen here.');
  // Somebody who already works in this office keeps their city unless a new one is chosen.
  if (!input.cityId && options.sameOffice) return { office, kind, stateId: office.stateId!, cityId: options.sameOffice.cityId };
  if (!input.cityId) {
    if (options.requireCity === false) return { office, kind, stateId: office.stateId!, cityId: null as number | null };
    throw new HrmHttpError(400, 'CITY_REQUIRED', 'Select the city the person will work from.');
  }
  const city = await tx.city.findFirst({ where: { id: input.cityId, stateId: office.stateId! }, select: { id: true } });
  if (!city) throw new HrmHttpError(400, 'LOCATION_INVALID', 'The selected city does not belong to the state of that office.');
  return { office, kind, stateId: office.stateId!, cityId: city.id as number | null };
};

const resolveDepartment = async (tx: Tx, orgUnitId: string | undefined, fallback: string) => {
  const target = orgUnitId ?? fallback;
  if (orgUnitId) {
    const department = await tx.hrmOrgUnit.findFirst({ where: { id: orgUnitId, type: 'DEPARTMENT', isActive: true }, select: { id: true } });
    if (!department) throw new HrmHttpError(400, 'DEPARTMENT_NOT_FOUND', 'The selected department was not found or is inactive.');
  }
  return target;
};

/** The designation on the list (an unknown name is only added for somebody who may manage the organisation). */
const designationOf = async (tx: Tx, actor: Actor, value: string) => {
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  return resolveDesignationForWrite(tx, actor, value, { canCreate: hasHrmPermission(permissions, HRM_PERMISSIONS.ORG_MANAGE) });
};

/** Reporting managers named in a request must be working employees, and must not create a loop. */
const checkManager = async (tx: Tx, employeeId: string, managerEmployeeId: string | null | undefined) => {
  if (!managerEmployeeId) return;
  await assertEligibleManager(tx, managerEmployeeId, employeeId);
  await assertNoReportingCycle(tx, employeeId, managerEmployeeId);
};

/** True when the office has no working manager left today. */
const officeIsVacant = async (tx: Tx, officeUnitId: string | null | undefined) => {
  if (!officeUnitId) return false;
  const office = await tx.hrmOrgUnit.findUnique({ where: { id: officeUnitId }, select: { type: true, stateId: true, isActive: true } });
  if (!office || !office.isActive || kindOfUnit(office) !== 'STATE') return false;
  const managers = await tx.hrmEmploymentAssignment.count({
    where: {
      officeUnitId, isOfficeManager: true, ...currentAssignmentWhere(utcToday()),
      employee: { status: { in: [...WORKING_STATUSES] }, archivedAt: null },
    },
  });
  return managers === 0;
};

type MoveInput = {
  employeeId: string;
  toOfficeUnitId: string;
  cityId?: number | null | undefined;
  orgUnitId?: string | undefined;
  effectiveFrom: string;
  managerEmployeeId?: string | null | undefined;
  isOfficeManager?: boolean | undefined;
  designation?: string | undefined;
  /** The title is copied from somebody's existing assignment: it keeps working even if the list switched it off since. */
  designationInherited?: boolean | undefined;
  reason?: string | null | undefined;
  action: string;
};

/**
 * Moves one employee to an office inside an open transaction. The caller holds no lock yet; this takes the
 * employee lock first. Returns what was left behind so the caller can report a vacated state.
 */
const moveEmployee = async (tx: Tx, actor: Actor, input: MoveInput) => {
  await lockEmployeeAssignments(tx, input.employeeId);
  const employee = await loadWorkingEmployee(tx, input.employeeId);
  const pivot = await getPivotAssignment(tx, input.employeeId);
  const destination = await resolveDestination(tx, input, pivot.officeUnitId === input.toOfficeUnitId ? { sameOffice: { stateId: pivot.stateId, cityId: pivot.cityId } } : {});
  const orgUnitId = await resolveDepartment(tx, input.orgUnitId, pivot.orgUnitId);

  // Only a state office has a manager; the head office never does.
  const isOfficeManager = destination.kind === 'STATE' ? (input.isOfficeManager ?? pivot.isOfficeManager) : false;
  // Working people, and people still joining (a State Manager from an accepted offer can be moved before joining;
  // the office only counts them once they work).
  if (isOfficeManager && ![...WORKING_STATUSES, 'PRE_ONBOARDING', 'DRAFT'].includes(employee.status)) {
    throw new HrmConflictError(`${employee.legalName} (${employee.employeeCode}) is not active, so they cannot be made a manager.`);
  }
  const designation = input.designation
    ? (input.designationInherited ? input.designation : await designationOf(tx, actor, input.designation))
    : pivot.designation;
  if (pivot.isOfficeManager && !isOfficeManager && designationKey(designation) === designationKey(STATE_MANAGER_DESIGNATION)) {
    throw new HrmHttpError(400, 'DESIGNATION_REQUIRED', `Choose a new designation for ${employee.legalName}: they stop being a State Manager, so the title cannot stay.`);
  }
  const managerEmployeeId = input.managerEmployeeId !== undefined ? input.managerEmployeeId : pivot.managerEmployeeId;
  await checkManager(tx, input.employeeId, managerEmployeeId);

  const changes: AssignmentChanges = {
    orgUnitId, officeUnitId: destination.office.id, isOfficeManager, designation,
    stateId: destination.stateId, cityId: destination.cityId, managerEmployeeId,
  };
  const { created, previous } = await applyAssignmentChange(tx, actor, {
    pivot, newFrom: parseDay(input.effectiveFrom), changes, reason: input.reason ?? null, action: input.action,
  });

  await syncOfficePrimaryManager(tx, previous.officeUnitId);
  if (destination.office.id !== previous.officeUnitId) await syncOfficePrimaryManager(tx, destination.office.id);
  // A State Manager's own-state access (placement scope) follows them to the new office / role.
  await syncPlacementScopes(tx, input.employeeId, parseDay(input.effectiveFrom), actor.userId);
  const vacatedOfficeId = previous.isOfficeManager && (previous.officeUnitId !== destination.office.id || !isOfficeManager) && (await officeIsVacant(tx, previous.officeUnitId))
    ? previous.officeUnitId : null;

  await audit(actor, 'HRM_EMPLOYEE', input.employeeId, input.action, {
    from: { officeUnitId: previous.officeUnitId, isOfficeManager: previous.isOfficeManager, designation: previous.designation },
    to: { officeUnitId: destination.office.id, isOfficeManager, designation },
    effectiveFrom: input.effectiveFrom, reason: input.reason ?? null,
  }, undefined, tx);
  return { employee, assignment: created, previous, vacatedOfficeId, destination };
};

/** The employee's newest assignment, for the checks that run before the transaction. */
const latestAssignment = async (employeeId: string) => {
  const row = await prisma.hrmEmploymentAssignment.findFirst({
    where: { employeeId, status: 'ACTIVE' }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    select: { orgUnitId: true, officeUnitId: true, managerEmployeeId: true },
  });
  if (!row) throw new HrmHttpError(409, 'NO_OPEN_ASSIGNMENT', 'This employee has no assignment yet. Use “Add assignment” on their profile first.');
  return row;
};

/** The scope check for the place a person is moved to (the caller's own scope must still cover it). */
const assertDestinationInScope = (actor: Actor, destination: { stateId: number; office: { id: string } }, orgUnitId: string, managerEmployeeId: string | null | undefined) =>
  assertAssignmentTargetAccess({ userId: actor.userId, role: actor.role, target: { orgUnitId, officeUnitId: destination.office.id, stateId: destination.stateId, managerEmployeeId: managerEmployeeId ?? null } });

/** Transfer: a person (a State Manager or anyone else) moves to another office on a given date. */
export const transferEmployee = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.transferEmployee, rawInput);
  await requirePermissions(actor, [[HRM_PERMISSIONS.ASSIGNMENTS_MANAGE, 'hrm.assignments.manage']], 'Transferring an employee');
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertNotOwnRecord(actor, employeeId, 'Transferring');

  // Check the destination against the caller's own scope before changing anything.
  const probe = await resolveDestination(prisma, input, { requireCity: false });
  const current = await latestAssignment(employeeId);
  await assertDestinationInScope(actor, probe, input.orgUnitId ?? current.orgUnitId, input.managerEmployeeId);

  const result = await prisma.$transaction((tx) => moveEmployee(tx, actor, {
    employeeId,
    toOfficeUnitId: input.toOfficeUnitId,
    cityId: input.cityId,
    orgUnitId: input.orgUnitId,
    effectiveFrom: input.effectiveFrom,
    managerEmployeeId: input.managerEmployeeId,
    isOfficeManager: input.isOfficeManager,
    designation: input.designation,
    reason: input.reason,
    action: 'TRANSFERRED',
  }), { timeout: 20000, maxWait: 5000 });
  return { assignment: result.assignment, vacatedOfficeId: result.vacatedOfficeId };
};

/**
 * Appoint: an existing employee becomes a manager of a state office. A person who already works there only gains
 * the manager role; anybody else is moved there at the same time (so a city is needed). With no reporting manager
 * named, they report to the National Operations Manager when there is exactly one.
 */
export const appointOfficeManager = async (actor: Actor, officeUnitId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.appointOfficeManager, rawInput);
  await requirePermissions(actor, [[HRM_PERMISSIONS.ASSIGNMENTS_MANAGE, 'hrm.assignments.manage']], 'Appointing a State Manager');
  await assertEmployeeAccess({ ...actor, employeeId: input.employeeId });
  await assertNotOwnRecord(actor, input.employeeId, 'Appointing a State Manager');

  const office = await prisma.hrmOrgUnit.findUnique({ where: { id: officeUnitId }, select: { id: true, type: true, stateId: true, isActive: true } });
  if (!office || !office.isActive || kindOfUnit(office) !== 'STATE') throw new HrmNotFoundError('State office not found.');

  const national = await findNationalOperationsManagers();
  const probe = await resolveDestination(prisma, { toOfficeUnitId: officeUnitId, cityId: input.cityId }, { requireCity: false });
  const current = await latestAssignment(input.employeeId);

  const managerEmployeeId = input.managerEmployeeId !== undefined
    ? input.managerEmployeeId
    : (national.length === 1 && national[0]!.id !== input.employeeId ? national[0]!.id : current.managerEmployeeId);
  await assertDestinationInScope(actor, probe, current.orgUnitId, managerEmployeeId);

  const result = await prisma.$transaction((tx) => moveEmployee(tx, actor, {
    employeeId: input.employeeId,
    toOfficeUnitId: officeUnitId,
    cityId: input.cityId,
    effectiveFrom: input.effectiveFrom,
    managerEmployeeId,
    isOfficeManager: true,
    designation: input.designation ?? STATE_MANAGER_DESIGNATION,
    reason: input.reason,
    action: 'APPOINTED_OFFICE_MANAGER',
  }), { timeout: 20000, maxWait: 5000 });
  return { assignment: result.assignment, vacatedOfficeId: result.vacatedOfficeId };
};

/** People (current or upcoming) who report to this employee, by the assignment that names them. */
const directReportAssignments = (tx: Tx, managerId: string, extra: Prisma.HrmEmploymentAssignmentWhereInput = {}) =>
  tx.hrmEmploymentAssignment.findMany({
    where: {
      managerEmployeeId: managerId, ...openAssignmentWhere(), ...extra,
      employee: { status: { notIn: [...LEFT_COMPANY] }, archivedAt: null },
    },
    select: { id: true, employeeId: true, officeUnitId: true },
  });

/** Points the given assignments at a new reporting manager (their own history stays on the assignment rows). */
const repointReports = async (tx: Tx, actor: Actor, rows: Array<{ id: string; employeeId: string }>, newManagerId: string | null) => {
  if (!rows.length) return 0;
  await tx.hrmEmploymentAssignment.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { managerEmployeeId: newManagerId } });
  for (const row of rows) {
    await audit(actor, 'HRM_EMPLOYEE', row.employeeId, 'REPORTING_MANAGER_CHANGED', { managerEmployeeId: newManagerId }, undefined, tx);
  }
  return rows.length;
};

type DeactivateInput = { outcome: 'EXITED' | 'SUSPENDED'; effectiveDate: string; reason: string; reassignReportsToEmployeeId?: string | null | undefined; disableLogin?: boolean | undefined };

/**
 * Deactivates an employee inside an open transaction: status, assignments, direct reports, login and office
 * manager bookkeeping together, so nothing is left pointing at a person who is no longer working.
 */
const deactivateInTx = async (tx: Tx, actor: Actor, employeeId: string, input: DeactivateInput, accessible: string[] | null) => {
  await lockEmployeeAssignments(tx, employeeId);
  const employee = await loadWorkingEmployee(tx, employeeId);
  if (employee.status === 'SUSPENDED' && input.outcome === 'SUSPENDED') throw new HrmConflictError(`${employee.employeeCode} is already suspended.`);
  if (['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING'].includes(employee.status)) {
    const openCase = await tx.hrmOnboardingCase.count({ where: { employeeId, status: { in: ['PENDING', 'NEEDS_REVIEW', 'IN_PROGRESS', 'READY_FOR_APPROVAL'] } } });
    if (openCase) throw new HrmConflictError(`${employee.employeeCode} has not joined yet. Use "Cancel joining" on the Onboarding page instead.`);
  }
  const today = utcToday();
  const effective = parseDay(input.effectiveDate);
  if (effective.getTime() > today.getTime()) throw new HrmHttpError(400, 'DATE_IN_FUTURE', 'Deactivation takes effect today at the latest. For a planned exit use the exit process.');
  if (effective.getTime() < addDays(today, -MAX_BACKDATE_DAYS).getTime()) throw new HrmHttpError(400, 'DATE_TOO_OLD', `The date cannot be more than ${MAX_BACKDATE_DAYS} days in the past.`);

  if (employee.userId) {
    const user = await tx.user.findUnique({ where: { id: employee.userId }, select: { role: true } });
    if (user?.role === 'SUPER_ADMIN') throw new HrmConflictError('A Super Admin cannot be deactivated from HRM.');
    if (employee.userId === actor.userId) throw new HrmConflictError('You cannot deactivate your own account.');
  }

  if (input.reassignReportsToEmployeeId === employeeId) throw new HrmHttpError(400, 'MANAGER_IS_SELF', 'Choose someone else to take over the reporting line.');

  // Reporting lines: nobody may keep reporting to a person who is leaving or on hold.
  const reports = await directReportAssignments(tx, employeeId);
  const reportEmployees = new Set(reports.map((row) => row.employeeId));
  if (reportEmployees.size) {
    if (!input.reassignReportsToEmployeeId) {
      throw new HrmHttpError(409, 'DIRECT_REPORTS_EXIST', `${reportEmployees.size} employee${reportEmployees.size === 1 ? ' reports' : 's report'} to ${employee.legalName}. Choose who they report to from now on.`);
    }
    if (input.reassignReportsToEmployeeId === employeeId) throw new HrmHttpError(400, 'MANAGER_IS_SELF', 'Choose someone else to take over the reporting line.');
    // Moving other people's reporting line is only for somebody whose scope covers all of them (and the successor).
    if (accessible) {
      const outside = [...reportEmployees].filter((reportId) => !accessible.includes(reportId));
      if (outside.length) throw new HrmAuthorizationError(`${outside.length} of the people who report to ${employee.legalName} are outside your HRM access scope, so you cannot move their reporting line. Ask somebody with wider access.`);
      if (!accessible.includes(input.reassignReportsToEmployeeId)) throw new HrmAuthorizationError('The person you chose to take over is outside your HRM access scope.');
    }
    await assertEligibleManager(tx, input.reassignReportsToEmployeeId);
    // The new manager must not themselves report (directly or indirectly) to one of the people being moved.
    for (const reportEmployeeId of reportEmployees) {
      if (reportEmployeeId !== input.reassignReportsToEmployeeId) await assertNoReportingCycle(tx, reportEmployeeId, input.reassignReportsToEmployeeId);
    }
    // If the person taking over is themselves one of the reports, their own line goes up to the leaver's manager.
    const leaverPivot = await tx.hrmEmploymentAssignment.findFirst({ where: { employeeId, status: 'ACTIVE' }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }], select: { managerEmployeeId: true } });
    const successorRows = reports.filter((row) => row.employeeId === input.reassignReportsToEmployeeId);
    await repointReports(tx, actor, successorRows, leaverPivot?.managerEmployeeId && leaverPivot.managerEmployeeId !== input.reassignReportsToEmployeeId ? leaverPivot.managerEmployeeId : null);
    await repointReports(tx, actor, reports.filter((row) => row.employeeId !== input.reassignReportsToEmployeeId), input.reassignReportsToEmployeeId);
  }
  const approvals = await tx.hrmEmploymentAssignment.updateMany({
    where: { approvalManagerId: employeeId, ...openAssignmentWhere() },
    data: { approvalManagerId: input.reassignReportsToEmployeeId ?? null },
  });

  const open = await tx.hrmEmploymentAssignment.findMany({
    where: { employeeId, ...openAssignmentWhere() },
    select: { id: true, officeUnitId: true, isOfficeManager: true, effectiveFrom: true },
  });
  const officeIds = [...new Set(open.map((row) => row.officeUnitId).filter((value): value is string => Boolean(value)))];
  const wasManagerOf = open.filter((row) => row.isOfficeManager && row.officeUnitId).map((row) => row.officeUnitId!);

  if (input.outcome === 'EXITED') {
    // Leaving: assignments that had started end on the last day, those that never started are cancelled.
    for (const row of open) {
      if (row.effectiveFrom.getTime() > effective.getTime()) await tx.hrmEmploymentAssignment.update({ where: { id: row.id }, data: { status: 'CANCELLED' } });
      else await tx.hrmEmploymentAssignment.update({ where: { id: row.id }, data: { effectiveTo: effective, status: 'ENDED' } });
    }
    // The shift ends on the last day as well.
    const shifts = await tx.hrmShiftAssignment.findMany({ where: { employeeId, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gt: effective } }] }, select: { id: true, effectiveFrom: true } });
    for (const row of shifts) {
      await tx.hrmShiftAssignment.update({ where: { id: row.id }, data: row.effectiveFrom.getTime() > effective.getTime() ? { status: 'CANCELLED' } : { effectiveTo: effective } });
    }
  }
  // Suspended: assignments stay (the person is expected back); they drop out of staff counts and manager lists by status.

  await tx.hrmEmployee.update({
    where: { id: employeeId },
    data: { status: input.outcome, ...(input.outcome === 'EXITED' ? { exitDate: effective } : {}), version: { increment: 1 } },
  });

  let loginDisabled = false;
  if (employee.userId && input.disableLogin !== false) {
    const login = await tx.user.findUnique({ where: { id: employee.userId }, select: { role: true, status: true } });
    const status = input.outcome === 'EXITED' ? 'INACTIVE' : 'SUSPENDED';
    // Only a usable employee login is switched off. One an administrator blocked or closed stays exactly as it is.
    if (login && login.role === 'EMPLOYEE' && login.status === 'ACTIVE') {
      await tx.user.update({ where: { id: employee.userId }, data: { status } });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId, entityType: 'USER', entityId: employee.userId, action: 'ACCOUNT_STATUS_CHANGED',
          beforeJson: { status: login.status }, afterJson: { status, reason: input.reason, source: 'HRM_DEACTIVATION' },
        },
      });
      loginDisabled = true;
    } else if (login && login.role === 'EMPLOYEE' && login.status !== 'ACTIVE') {
      loginDisabled = true; // already not usable
    }
  }

  // Leaving: every HRM access scope of their login ends on the last day.
  if (input.outcome === 'EXITED' && employee.userId) await endScopesOnExit(tx, employee.userId, effective);
  if (input.outcome === 'EXITED') {
    // Salary proposals still waiting for approval are closed: nobody approves a raise for somebody who left.
    await tx.hrmCompensationRevision.updateMany({ where: { employeeId, status: { in: ['DRAFT', 'PENDING_APPROVAL'] } }, data: { status: 'REJECTED' } });
  }

  // A manager stops being one of their offices' managers.
  for (const officeId of officeIds) await syncOfficePrimaryManager(tx, officeId);
  const vacatedOfficeIds: string[] = [];
  for (const officeId of new Set(wasManagerOf)) if (await officeIsVacant(tx, officeId)) vacatedOfficeIds.push(officeId);

  await audit(actor, 'HRM_EMPLOYEE', employeeId, input.outcome === 'EXITED' ? 'DEACTIVATED_EXITED' : 'DEACTIVATED_SUSPENDED', {
    outcome: input.outcome, effectiveDate: input.effectiveDate, reason: input.reason,
    reportsMoved: reportEmployees.size, approvalsMoved: approvals.count, loginDisabled,
  }, { status: employee.status }, tx);
  return { employeeCode: employee.employeeCode, reportsMoved: reportEmployees.size, loginDisabled, vacatedOfficeIds };
};

/** Deactivate: the person leaves the company or is put on hold, with their reports and login taken care of. */
export const deactivateEmployee = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.deactivateEmployee, rawInput);
  await requirePermissions(actor, [
    [HRM_PERMISSIONS.EMPLOYEES_MANAGE, 'hrm.employees.manage'],
    [HRM_PERMISSIONS.ASSIGNMENTS_MANAGE, 'hrm.assignments.manage'],
  ], 'Deactivating an employee');
  await assertEmployeeAccess({ ...actor, employeeId });
  const accessible = await getAccessibleEmployeeIds(actor);
  return prisma.$transaction((tx) => deactivateInTx(tx, actor, employeeId, input, accessible), { timeout: 20000, maxWait: 5000 });
};

/** Brings a suspended employee back to work and re-enables their login. */
export const reactivateEmployee = async (actor: Actor, employeeId: string) => {
  await requirePermissions(actor, [[HRM_PERMISSIONS.EMPLOYEES_MANAGE, 'hrm.employees.manage']], 'Reactivating an employee');
  await assertEmployeeAccess({ ...actor, employeeId });
  return prisma.$transaction(async (tx) => {
    await lockEmployeeAssignments(tx, employeeId);
    const employee = await tx.hrmEmployee.findUnique({ where: { id: employeeId }, select: { id: true, employeeCode: true, status: true, userId: true } });
    if (!employee) throw new HrmNotFoundError('Employee not found.');
    if (employee.status !== 'SUSPENDED') throw new HrmConflictError('Only a suspended employee can be reactivated here. Someone who left needs to be re-hired.');
    await tx.hrmEmployee.update({ where: { id: employeeId }, data: { status: 'ACTIVE', version: { increment: 1 } } });
    let loginEnabled = false;
    if (employee.userId) {
      const user = await tx.user.findUnique({ where: { id: employee.userId }, select: { status: true } });
      // Only a login that HRM itself suspended is re-opened; a login an administrator suspended or blocked stays as it is.
      const lastChange = await tx.auditLog.findFirst({
        where: { entityType: 'USER', entityId: employee.userId, action: 'ACCOUNT_STATUS_CHANGED' },
        orderBy: { createdAt: 'desc' },
        select: { afterJson: true },
      });
      const lastAfter = (lastChange?.afterJson ?? null) as { source?: string; status?: string } | null;
      if (user && user.status === 'SUSPENDED' && lastAfter?.source === 'HRM_DEACTIVATION' && lastAfter.status === 'SUSPENDED') {
        await tx.user.update({ where: { id: employee.userId }, data: { status: 'ACTIVE' } });
        await tx.auditLog.create({ data: { actorUserId: actor.userId, entityType: 'USER', entityId: employee.userId, action: 'ACCOUNT_STATUS_CHANGED', beforeJson: { status: 'SUSPENDED' }, afterJson: { status: 'ACTIVE', source: 'HRM_REACTIVATION' } } });
        loginEnabled = true;
      }
    }
    const open = await tx.hrmEmploymentAssignment.findMany({ where: { employeeId, ...openAssignmentWhere() }, select: { officeUnitId: true } });
    for (const officeId of new Set(open.map((row) => row.officeUnitId))) await syncOfficePrimaryManager(tx, officeId);
    await audit(actor, 'HRM_EMPLOYEE', employeeId, 'REACTIVATED', { status: 'ACTIVE' }, { status: 'SUSPENDED' }, tx);
    return { employeeCode: employee.employeeCode, loginEnabled };
  }, { timeout: 20000, maxWait: 5000 });
};

/**
 * Replace: a new manager takes over a state office and the outgoing manager is kept as a member, moved elsewhere
 * or deactivated. Everything happens in one transaction, so the office is never left without a manager halfway.
 * People in that office who reported to the outgoing manager now report to the replacement.
 */
export const replaceOfficeManager = async (actor: Actor, officeUnitId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.replaceOfficeManager, rawInput);
  await requirePermissions(actor, [
    [HRM_PERMISSIONS.ASSIGNMENTS_MANAGE, 'hrm.assignments.manage'],
    ...(input.outgoing.action === 'DEACTIVATE' ? [[HRM_PERMISSIONS.EMPLOYEES_MANAGE, 'hrm.employees.manage'] as [string, string]] : []),
  ], 'Replacing a State Manager');
  if (input.outgoingEmployeeId === input.incomingEmployeeId) throw new HrmHttpError(400, 'SAME_PERSON', 'Choose a different person as the replacement.');
  // The replacement and the people who now report to them change together, so it cannot be dated ahead: schedule a
  // future change with Transfer / Appoint instead.
  if (parseDay(input.effectiveFrom).getTime() > utcToday().getTime()) {
    throw new HrmHttpError(400, 'DATE_IN_FUTURE', 'Replacing a manager takes effect today (or a past date). For a future change, appoint the new manager and transfer the old one on that date.');
  }
  const accessible = await getAccessibleEmployeeIds(actor);
  await assertEmployeeAccess({ ...actor, employeeId: input.outgoingEmployeeId });
  await assertEmployeeAccess({ ...actor, employeeId: input.incomingEmployeeId });
  await assertNotOwnRecord(actor, input.outgoingEmployeeId, 'Replacing a State Manager');
  await assertNotOwnRecord(actor, input.incomingEmployeeId, 'Replacing a State Manager');

  const office = await prisma.hrmOrgUnit.findUnique({ where: { id: officeUnitId }, select: { id: true, name: true, type: true, stateId: true, isActive: true } });
  if (!office || !office.isActive || kindOfUnit(office) !== 'STATE') throw new HrmNotFoundError('State office not found.');

  const probe = await resolveDestination(prisma, { toOfficeUnitId: officeUnitId, cityId: input.incomingCityId }, { requireCity: false });
  const incomingNow = await latestAssignment(input.incomingEmployeeId);
  await assertDestinationInScope(actor, probe, incomingNow.orgUnitId, input.managerEmployeeId);
  if (input.outgoing.action === 'TRANSFER') {
    const outgoingProbe = await resolveDestination(prisma, input.outgoing, { requireCity: false });
    const outgoingNow = await latestAssignment(input.outgoingEmployeeId);
    await assertDestinationInScope(actor, outgoingProbe, input.outgoing.orgUnitId ?? outgoingNow.orgUnitId, undefined);
  }

  return prisma.$transaction(async (tx) => {
    // Both people are locked in a fixed order, so two replacements touching the same people cannot deadlock.
    for (const employeeId of [input.outgoingEmployeeId, input.incomingEmployeeId].sort()) await lockEmployeeAssignments(tx, employeeId);

    const outgoingPivot: PivotAssignment = await getPivotAssignment(tx, input.outgoingEmployeeId);
    if (outgoingPivot.officeUnitId !== officeUnitId || !outgoingPivot.isOfficeManager) {
      throw new HrmConflictError('The person you are replacing is not a manager of this office (anymore). Refresh and try again.');
    }
    const outgoingEmployee = await loadWorkingEmployee(tx, input.outgoingEmployeeId);
    // The office's people are moved to the replacement today, so the replacement must already be working (somebody
    // who has not joined yet is appointed with a dated transfer instead).
    const incomingEmployee = await loadWorkingEmployee(tx, input.incomingEmployeeId);
    if (!(WORKING_STATUSES as readonly string[]).includes(incomingEmployee.status)) {
      throw new HrmConflictError(`${incomingEmployee.legalName} (${incomingEmployee.employeeCode}) has not joined yet, so the office's people cannot report to them. Appoint them with a transfer dated on their joining day instead.`);
    }

    // The replacement reports to the outgoing manager's own manager unless told otherwise, or to the National Operations Manager.
    const national = await findNationalOperationsManagers(tx);
    const incomingManager = input.managerEmployeeId !== undefined
      ? input.managerEmployeeId
      : (outgoingPivot.managerEmployeeId && outgoingPivot.managerEmployeeId !== input.incomingEmployeeId
        ? outgoingPivot.managerEmployeeId
        : (national.length === 1 && national[0]!.id !== input.incomingEmployeeId ? national[0]!.id : null));

    // People in this office who reported to the outgoing manager move to the replacement.
    const localReports = (await directReportAssignments(tx, input.outgoingEmployeeId, { officeUnitId }))
      .filter((row) => row.employeeId !== input.incomingEmployeeId);
    if (accessible) {
      const outside = new Set(localReports.map((row) => row.employeeId).filter((reportId) => !accessible.includes(reportId)));
      if (outside.size) throw new HrmAuthorizationError(`${outside.size} of the people in this office who report to ${outgoingEmployee.legalName} are outside your HRM access scope, so you cannot move their reporting line. Ask somebody with wider access.`);
    }

    const incoming = await moveEmployee(tx, actor, {
      employeeId: input.incomingEmployeeId,
      toOfficeUnitId: officeUnitId,
      cityId: input.incomingCityId,
      effectiveFrom: input.effectiveFrom,
      managerEmployeeId: incomingManager,
      isOfficeManager: true,
      designation: outgoingPivot.designation,
      designationInherited: true,
      reason: input.reason,
      action: 'APPOINTED_OFFICE_MANAGER',
    });

    for (const row of localReports) await assertNoReportingCycle(tx, row.employeeId, input.incomingEmployeeId);
    const moved = await repointReports(tx, actor, localReports, input.incomingEmployeeId);

    // The outgoing manager's own record. Their pivot is read again: nothing about them changed above.
    let outgoingResult: Record<string, unknown>;
    if (input.outgoing.action === 'KEEP_AS_MEMBER') {
      const kept = await moveEmployee(tx, actor, {
        employeeId: input.outgoingEmployeeId, toOfficeUnitId: officeUnitId, effectiveFrom: input.effectiveFrom,
        isOfficeManager: false, designation: input.outgoing.designation, reason: input.reason, action: 'MANAGER_ROLE_ENDED',
      });
      outgoingResult = { action: 'KEEP_AS_MEMBER', assignmentId: kept.assignment.id };
    } else if (input.outgoing.action === 'TRANSFER') {
      const moved2 = await moveEmployee(tx, actor, {
        employeeId: input.outgoingEmployeeId, toOfficeUnitId: input.outgoing.toOfficeUnitId, cityId: input.outgoing.cityId, orgUnitId: input.outgoing.orgUnitId,
        effectiveFrom: input.effectiveFrom, isOfficeManager: false, designation: input.outgoing.designation, reason: input.reason, action: 'TRANSFERRED',
      });
      outgoingResult = { action: 'TRANSFER', assignmentId: moved2.assignment.id };
    } else {
      // Their other reports (outside this office) go to the replacement as well: the replacement takes the seat.
      const result = await deactivateInTx(tx, actor, input.outgoingEmployeeId, {
        outcome: input.outgoing.outcome ?? 'EXITED', effectiveDate: input.effectiveFrom > toDay(utcToday()) ? toDay(utcToday()) : input.effectiveFrom,
        reason: input.reason?.trim() || `Replaced as manager of ${office.name}`, reassignReportsToEmployeeId: input.incomingEmployeeId,
        disableLogin: input.outgoing.disableLogin,
      }, accessible);
      outgoingResult = { action: 'DEACTIVATE', ...result };
    }

    await audit(actor, 'HRM_ORG_UNIT', officeUnitId, 'MANAGER_REPLACED', {
      outgoingEmployeeId: input.outgoingEmployeeId, outgoingCode: outgoingEmployee.employeeCode, incomingEmployeeId: input.incomingEmployeeId,
      effectiveFrom: input.effectiveFrom, reportsMoved: moved, outgoing: outgoingResult,
    }, undefined, tx);
    await syncOfficePrimaryManager(tx, officeUnitId);
    // If the replacement managed another state until now, that state is reported as vacated too.
    return { assignment: incoming.assignment, reportsMoved: moved, outgoing: outgoingResult, vacatedOfficeId: incoming.vacatedOfficeId };
  }, { timeout: 30000, maxWait: 5000 });
};

/** A suggestion of who the people in an office would report to once a manager steps down (shown by the screens). */
export const getLifecycleContext = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { id: true, employeeCode: true, legalName: true, preferredName: true, status: true, userId: true } });
  if (!employee) throw new HrmNotFoundError('Employee not found.');
  const accessibleIds = await getAccessibleEmployeeIds(actor);
  const hasAssignment = (await prisma.hrmEmploymentAssignment.count({ where: { employeeId, status: 'ACTIVE' } })) > 0;
  const reports = await prisma.hrmEmploymentAssignment.findMany({
    where: { managerEmployeeId: employeeId, ...openAssignmentWhere(), employee: { status: { notIn: [...LEFT_COMPANY] }, archivedAt: null, ...(accessibleIds ? { id: { in: accessibleIds } } : {}) } },
    distinct: ['employeeId'],
    select: { employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true } } },
  });
  const managerOf = await prisma.hrmEmploymentAssignment.findMany({
    where: { employeeId, isOfficeManager: true, ...currentAssignmentWhere(utcToday()) },
    select: { officeUnit: { select: { id: true, name: true } } },
  });
  return {
    employee: { id: employee.id, employeeCode: employee.employeeCode, name: employee.preferredName || employee.legalName, status: employee.status, hasLogin: Boolean(employee.userId), hasAssignment },
    directReports: reports.map((row) => ({ id: row.employee.id, employeeCode: row.employee.employeeCode, name: row.employee.preferredName || row.employee.legalName })),
    managerOf: managerOf.flatMap((row) => (row.officeUnit ? [row.officeUnit] : [])),
  };
};

/**
 * Adds an assignment to an employee. The first one gives a person (for example one created from a recruitment
 * offer) their department, office and designation; any later one is a change on the timeline (the open assignment
 * ends the day before). It is checked against the caller's scope like a transfer, and the state office is created
 * when the state has none and the caller may manage the organisation.
 */
export const addAssignment = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.createAssignment, rawInput);
  await requirePermissions(actor, [[HRM_PERMISSIONS.ASSIGNMENTS_MANAGE, 'hrm.assignments.manage']], 'Adding an assignment');
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertNotOwnRecord(actor, employeeId, 'Adding an assignment');
  if (input.status && input.status !== 'ACTIVE') throw new HrmHttpError(400, 'ASSIGNMENT_STATUS', 'A new assignment is active from its start date. Use Transfer to change an existing one.');
  if (input.effectiveTo) throw new HrmHttpError(400, 'ASSIGNMENT_END_DATE', 'An assignment ends when the next one starts (transfer or deactivate), not with an end date.');
  if (Boolean(input.stateId) !== Boolean(input.cityId) && input.cityId) throw new HrmHttpError(400, 'LOCATION_INVALID', 'Select the state together with the city.');

  const permissions = await getHrmPermissions(actor.userId, actor.role);
  const canManageOrg = hasHrmPermission(permissions, HRM_PERMISSIONS.ORG_MANAGE);
  await assertAssignmentTargetAccess({
    userId: actor.userId, role: actor.role,
    target: { orgUnitId: input.orgUnitId, officeUnitId: await deriveOfficeUnitId(prisma, input.stateId, input.cityId), stateId: input.stateId ?? null, managerEmployeeId: input.managerEmployeeId ?? null },
  });

  const newFrom = parseDay(input.effectiveFrom);
  const today = utcToday();
  if (newFrom.getTime() > today.getTime() + 365 * 86_400_000) throw new HrmHttpError(400, 'DATE_TOO_FAR', 'The start date cannot be more than a year ahead.');
  if (input.effectiveFrom < '1990-01-01') throw new HrmHttpError(400, 'DATE_TOO_OLD', 'Enter a valid start date.');

  return prisma.$transaction(async (tx) => {
    await lockEmployeeAssignments(tx, employeeId);
    await loadWorkingEmployee(tx, employeeId);
    const department = await tx.hrmOrgUnit.findFirst({ where: { id: input.orgUnitId, type: 'DEPARTMENT', isActive: true }, select: { id: true } });
    if (!department) throw new HrmHttpError(400, 'DEPARTMENT_NOT_FOUND', 'The selected department was not found or is inactive.');
    const designation = await resolveDesignationForWrite(tx, actor, input.designation, { canCreate: canManageOrg });
    await checkManager(tx, employeeId, input.managerEmployeeId);
    if (input.approvalManagerId) await assertEligibleManager(tx, input.approvalManagerId, employeeId);

    let stateId = input.stateId ?? null;
    let cityId = input.cityId ?? null;
    if (stateId && cityId) {
      const city = await tx.city.findFirst({ where: { id: cityId, stateId, state: { country: { iso2: 'IN' } } }, select: { id: true } });
      if (!city) throw new HrmHttpError(400, 'LOCATION_INVALID', 'The selected city does not belong to the selected state.');
    } else if (stateId) {
      const state = await tx.state.findFirst({ where: { id: stateId, country: { iso2: 'IN' } }, select: { id: true } });
      if (!state) throw new HrmHttpError(400, 'STATE_NOT_FOUND', 'The selected state was not found.');
    } else { stateId = null; cityId = null; }

    // The office: the head office when the place is the head office city, otherwise that state's office.
    let officeUnitId: string | null = null;
    if (stateId) {
      const headOffice = await findActiveHeadOffice(tx);
      officeUnitId = headOffice && cityId && headOffice.stateId === stateId && headOffice.cityId === cityId
        ? headOffice.id
        : (await ensureStateOffice(tx, actor, stateId, canManageOrg)).unit.id;
    }

    const pivot = await tx.hrmEmploymentAssignment.findFirst({
      where: { employeeId, status: 'ACTIVE' }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, employeeId: true, orgUnitId: true, officeUnitId: true, isOfficeManager: true, operationalRegionId: true, designation: true, employmentType: true, workMode: true, stateId: true, cityId: true, managerEmployeeId: true, approvalManagerId: true, status: true, effectiveFrom: true, effectiveTo: true },
    });

    // The previous assignment must have ended before the new one starts (one assignment at a time).
    if (pivot && pivot.effectiveTo && pivot.effectiveTo.getTime() >= newFrom.getTime()) {
      throw new HrmConflictError(`The previous assignment runs until ${pivot.effectiveTo.toISOString().slice(0, 10)}. Start the new one after that date, or use Transfer.`);
    }
    let assignment;
    let previousOfficeId: string | null = null;
    if (pivot && !pivot.effectiveTo) {
      previousOfficeId = pivot.officeUnitId;
      ({ created: assignment } = await applyAssignmentChange(tx, actor, {
        pivot, newFrom, reason: input.reason ?? null, action: 'ASSIGNMENT_ADDED',
        changes: {
          orgUnitId: department.id, officeUnitId, isOfficeManager: false, designation, stateId, cityId,
          ...(input.managerEmployeeId !== undefined ? { managerEmployeeId: input.managerEmployeeId } : {}),
          ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
          ...(input.workMode !== undefined ? { workMode: input.workMode } : {}),
          ...(input.approvalManagerId !== undefined ? { approvalManagerId: input.approvalManagerId } : {}),
        },
      }));
    } else {
      assignment = await tx.hrmEmploymentAssignment.create({
        data: {
          employeeId, orgUnitId: department.id, officeUnitId, isOfficeManager: false, designation,
          employmentType: input.employmentType ?? null, workMode: input.workMode ?? null, stateId, cityId,
          operationalRegionId: input.operationalRegionId ?? null,
          managerEmployeeId: input.managerEmployeeId ?? null, approvalManagerId: input.approvalManagerId ?? null,
          status: 'ACTIVE', effectiveFrom: newFrom, reason: input.reason ?? null, createdById: actor.userId,
        },
        select: { id: true, employeeId: true, orgUnitId: true, officeUnitId: true, isOfficeManager: true, operationalRegionId: true, designation: true, employmentType: true, workMode: true, stateId: true, cityId: true, managerEmployeeId: true, approvalManagerId: true, status: true, effectiveFrom: true, effectiveTo: true },
      });
      await audit(actor, 'HRM_EMPLOYEE', employeeId, 'ASSIGNMENT_ADDED', { assignmentId: assignment.id, officeUnitId, designation }, undefined, tx);
    }
    await syncOfficePrimaryManager(tx, previousOfficeId);
    await syncPlacementScopes(tx, employeeId, newFrom, actor.userId);
    return { assignment };
  }, { timeout: 20000, maxWait: 5000 });
};
