import type { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { writeHrmAudit } from './audit';
import { findDesignationSpellings } from './designations';
import { MAX_BACKDATE_DAYS, MAX_SCHEDULE_DAYS, addDays, parseDay, planAssignmentChange, toDay, utcToday, type ChangePlan } from './assignmentTimeline';
import { HrmConflictError, HrmHttpError } from './errors';

export { MAX_BACKDATE_DAYS, MAX_SCHEDULE_DAYS, addDays, parseDay, planAssignmentChange, toDay, utcToday };
export type { ChangePlan };

/**
 * Assignment history rules shared by the office lifecycle operations (transfer, appoint, replace, deactivate).
 * An employee's assignments form a timeline: the open-ended one is current, a change closes it the day before the
 * next one starts, so the history is never edited, only extended.
 */

export type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type Actor = { userId: string; role: string; ipAddress?: string | null };

/** Employees who can work, manage and be managed. */
export const WORKING_STATUSES = ['ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'NOTICE_PERIOD'] as const;
/** Employees who no longer count as staff of an office. */
export const NOT_STAFF_STATUSES = ['EXITED', 'TERMINATED', 'SUSPENDED'] as const;

export const STATE_MANAGER_DESIGNATION = 'State Manager';
export const NATIONAL_OPERATIONS_MANAGER_DESIGNATION = 'National Operations Manager';

export const currentAssignmentWhere = (today = utcToday()) => ({
  status: 'ACTIVE' as const,
  effectiveFrom: { lte: today },
  OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
});

/** An assignment that is current or still to come (not ended, not cancelled). */
export const openAssignmentWhere = (today = utcToday()) => ({
  status: { in: ['ACTIVE', 'PLANNED'] as Array<'ACTIVE' | 'PLANNED'> },
  OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
});

/** One employee's assignment changes are applied one at a time. */
export const lockEmployeeAssignments = (tx: Tx, employeeId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-assignment:${employeeId}`}))`;

const assignmentSelect = {
  id: true, employeeId: true, orgUnitId: true, officeUnitId: true, isOfficeManager: true, operationalRegionId: true,
  designation: true, employmentType: true, workMode: true, stateId: true, cityId: true,
  managerEmployeeId: true, approvalManagerId: true, status: true, effectiveFrom: true, effectiveTo: true,
} as const;
export type PivotAssignment = Prisma.HrmEmploymentAssignmentGetPayload<{ select: typeof assignmentSelect }>;

/** The newest open-ended assignment: the one a change builds on. */
export const getPivotAssignment = async (tx: Tx, employeeId: string): Promise<PivotAssignment> => {
  const pivot = await tx.hrmEmploymentAssignment.findFirst({
    where: { employeeId, status: 'ACTIVE' },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    select: assignmentSelect,
  });
  if (!pivot || pivot.effectiveTo) {
    throw new HrmHttpError(409, 'NO_OPEN_ASSIGNMENT', 'This employee has no assignment yet. Use “Add assignment” on their profile first.');
  }
  return pivot;
};

export type AssignmentChanges = {
  orgUnitId?: string;
  officeUnitId?: string | null;
  isOfficeManager?: boolean;
  designation?: string;
  stateId?: number | null;
  cityId?: number | null;
  managerEmployeeId?: string | null;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'TEMPORARY' | 'FREELANCE' | null;
  workMode?: 'ON_SITE' | 'REMOTE' | 'HYBRID' | null;
  approvalManagerId?: string | null;
};

const audit = (actor: Actor, entityType: 'HRM_ASSIGNMENT' | 'HRM_EMPLOYEE', entityId: string, action: string, after: unknown, before: unknown, tx: Tx) =>
  writeHrmAudit({
    actorUserId: actor.userId,
    entityType,
    entityId,
    action,
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
    ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
  }, tx);

/** Closes the pivot assignment and opens the next one with the changes applied. The caller holds the employee lock. */
export const applyAssignmentChange = async (
  tx: Tx,
  actor: Actor,
  input: { pivot: PivotAssignment; newFrom: Date; changes: AssignmentChanges; reason?: string | null; action: string },
) => {
  const today = utcToday();
  const { pivot, newFrom, changes } = input;
  const plan = planAssignmentChange({ pivotFrom: pivot.effectiveFrom, newFrom, today });

  if (plan.kind === 'CANCEL') {
    await tx.hrmEmploymentAssignment.update({ where: { id: pivot.id }, data: { status: 'CANCELLED' } });
  } else {
    await tx.hrmEmploymentAssignment.update({
      where: { id: pivot.id },
      // Already over: mark it ended. Ending in the future stays ACTIVE until that day passes.
      data: { effectiveTo: plan.effectiveTo, ...(plan.effectiveTo.getTime() < today.getTime() ? { status: 'ENDED' as const } : {}) },
    });
  }
  await audit(actor, 'HRM_ASSIGNMENT', pivot.id, plan.kind === 'CANCEL' ? 'REPLACED' : 'ENDED', plan.kind === 'CANCEL' ? { status: 'CANCELLED' } : { effectiveTo: toDay(plan.effectiveTo) }, pivot, tx);

  const officeChanged = changes.officeUnitId !== undefined && changes.officeUnitId !== pivot.officeUnitId;
  const created = await tx.hrmEmploymentAssignment.create({
    data: {
      employeeId: pivot.employeeId,
      orgUnitId: changes.orgUnitId ?? pivot.orgUnitId,
      officeUnitId: changes.officeUnitId !== undefined ? changes.officeUnitId : pivot.officeUnitId,
      isOfficeManager: changes.isOfficeManager ?? pivot.isOfficeManager,
      // An operational region belongs to the old place; it is not carried to a different office.
      operationalRegionId: officeChanged ? null : pivot.operationalRegionId,
      designation: changes.designation ?? pivot.designation,
      employmentType: changes.employmentType !== undefined ? changes.employmentType : pivot.employmentType,
      workMode: changes.workMode !== undefined ? changes.workMode : pivot.workMode,
      stateId: changes.stateId !== undefined ? changes.stateId : pivot.stateId,
      cityId: changes.cityId !== undefined ? changes.cityId : pivot.cityId,
      managerEmployeeId: changes.managerEmployeeId !== undefined ? changes.managerEmployeeId : pivot.managerEmployeeId,
      approvalManagerId: changes.approvalManagerId !== undefined ? changes.approvalManagerId : pivot.approvalManagerId,
      status: 'ACTIVE',
      effectiveFrom: newFrom,
      reason: input.reason ?? null,
      createdById: actor.userId,
    },
    select: assignmentSelect,
  });
  await audit(actor, 'HRM_ASSIGNMENT', created.id, input.action, created, undefined, tx);
  return { created, previous: pivot };
};

/** Managers of an office as of today: people with the manager flag whose employee record is in working order. */
export const listCurrentOfficeManagers = (db: Db, officeUnitId: string, today = utcToday()) => db.hrmEmploymentAssignment.findMany({
  where: {
    officeUnitId,
    isOfficeManager: true,
    ...currentAssignmentWhere(today),
    employee: { status: { in: [...WORKING_STATUSES] }, archivedAt: null },
  },
  select: {
    employeeId: true, designation: true, effectiveFrom: true,
    employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true } },
  },
  orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
});

/** Keeps HrmOrgUnit.managerEmployeeId pointing at the longest-serving current manager (or nobody). */
export const syncOfficePrimaryManager = async (tx: Tx, officeUnitId: string | null | undefined) => {
  if (!officeUnitId) return;
  const [first] = await listCurrentOfficeManagers(tx, officeUnitId);
  const next = first?.employeeId ?? null;
  const current = await tx.hrmOrgUnit.findUnique({ where: { id: officeUnitId }, select: { managerEmployeeId: true } });
  if (current && current.managerEmployeeId !== next) await tx.hrmOrgUnit.update({ where: { id: officeUnitId }, data: { managerEmployeeId: next } });
};

/** Employees who may be named as someone's reporting manager (not the person themselves). */
export const assertEligibleManager = async (db: Db, managerId: string, forEmployeeId?: string) => {
  if (forEmployeeId && managerId === forEmployeeId) {
    throw new HrmHttpError(400, 'MANAGER_IS_SELF', 'An employee cannot report to themselves.');
  }
  const manager = await db.hrmEmployee.findFirst({
    where: { id: managerId, status: { in: [...WORKING_STATUSES] }, archivedAt: null },
    select: { id: true },
  });
  if (!manager) throw new HrmHttpError(400, 'MANAGER_NOT_FOUND', 'The selected reporting manager is not available.');
};

/** Refuses a reporting line that loops back to the employee (A reports to B, B reports to A). */
export const assertNoReportingCycle = async (db: Db, employeeId: string, managerId: string) => {
  let current: string | null = managerId;
  const seen = new Set<string>();
  for (let depth = 0; depth < 30 && current; depth += 1) {
    if (current === employeeId) {
      throw new HrmConflictError('That reporting line would loop: the selected manager already reports (directly or indirectly) to this employee.');
    }
    if (seen.has(current)) return;
    seen.add(current);
    const next: { managerEmployeeId: string | null } | null = await db.hrmEmploymentAssignment.findFirst({
      where: { employeeId: current, status: 'ACTIVE' },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { managerEmployeeId: true },
    });
    current = next?.managerEmployeeId ?? null;
  }
};

/**
 * Working employees currently titled National Operations Manager. State Managers report to this person by default;
 * the default is only applied when there is exactly one.
 */
export const findNationalOperationsManagers = async (db: Db = prisma) => {
  const spellings = await findDesignationSpellings(NATIONAL_OPERATIONS_MANAGER_DESIGNATION);
  if (!spellings.length) return [];
  const rows = await db.hrmEmployee.findMany({
    where: {
      status: { in: [...WORKING_STATUSES] },
      archivedAt: null,
      assignments: { some: { ...currentAssignmentWhere(), designation: { in: spellings } } },
    },
    select: { id: true, employeeCode: true, legalName: true, preferredName: true },
    orderBy: { legalName: 'asc' },
  });
  return rows.map((row) => ({ id: row.id, employeeCode: row.employeeCode, name: row.preferredName || row.legalName }));
};
