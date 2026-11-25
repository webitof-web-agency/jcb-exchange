import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { insertManagedEmployeeUser, ManagedUserError, prepareManagedEmployeeUser, type PreparedManagedEmployeeUser } from '../../../services/managedEmployeeUser.service';
import { normalizeProfileMobile } from '../../../utils/profileMobile';
import { assertEmployeeAccess, getActiveScopes, getHrmPermissions } from '../access';
import { assertCanGiveRole, assertNotOwnRecord, rolesActorCanGive } from '../employeeGuards';
import { writeHrmAudit } from '../audit';
import { HrmAuthorizationError, HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import { istToday } from '../istDate';
import { describeJoiningDateProblem, suggestScopes, type ScopeType } from '../joiningRules';
import { syncOfficePrimaryManager } from '../officeAssignments';
import { buildChecklist, checklistProgress } from '../onboardingChecklist';
import { kindOfUnit } from '../organisationCodes';
import { syncPlacementScopes } from '../accessProvisioning';
import { HRM_PERMISSIONS, hasAllIndiaScope, hasHrmPermission } from '../security';
import { parseHrmInput, schemas } from '../validation';
import { loadLinkableUser } from './employeeOnboarding.service';
import { sendJoiningWelcome } from './joiningWelcome.service';
import { loadChecklistFacts } from './onboarding.service';

type Actor = { userId: string; role: string; ipAddress?: string | null };
type Tx = Prisma.TransactionClient;

/**
 * Confirm joining: the person turned up. HR records the actual date, makes the login by hand (new, an existing
 * one, or the re-hire's own login switched back on - or none, with a reason), confirms the HRM access suggested by
 * the placement, and the person becomes ACTIVE. The onboarding case is completed and the recruitment application is
 * marked HIRED. Nothing is granted without HR ticking it.
 */

const DAY = 86_400_000;
const JOINABLE = ['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING'];
const dayString = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : null);
const dayFrom = (value: string) => new Date(`${value}T00:00:00.000Z`);

export const abilitiesOf = async (actor: Actor) => {
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  const scopes = await getActiveScopes(actor.userId);
  return {
    permissions,
    canConfirm: hasHrmPermission(permissions, HRM_PERMISSIONS.ONBOARDING_MANAGE) && hasHrmPermission(permissions, HRM_PERMISSIONS.EMPLOYEES_MANAGE),
    canCreateLogin: hasHrmPermission(permissions, 'users.create'),
    canLinkLogin: hasHrmPermission(permissions, 'users.read'),
    canUpdateLogin: hasHrmPermission(permissions, 'users.update'),
    canManageScopes: hasHrmPermission(permissions, HRM_PERMISSIONS.SCOPE_MANAGE),
    allIndia: actor.role === 'SUPER_ADMIN' || hasHrmPermission(permissions, HRM_PERMISSIONS.SCOPE_ALL) || hasAllIndiaScope(scopes),
    ownStates: new Set(scopes.flatMap((scope) => (scope.scopeType === 'STATE' && scope.stateId ? [scope.stateId] : []))),
  };
};
type Abilities = Awaited<ReturnType<typeof abilitiesOf>>;

/** Nobody can hand out wider access than they have themselves. */
export const assertCanGrant = (abilities: Abilities, scope: { scopeType: ScopeType; stateId?: number | null | undefined }) => {
  if (!abilities.canManageScopes) throw new HrmAuthorizationError('Giving HRM access needs the hrm.scope.manage permission.');
  if (abilities.allIndia) return;
  if (scope.scopeType === 'STATE' && scope.stateId && abilities.ownStates.has(scope.stateId)) return;
  if (scope.scopeType === 'DIRECT_REPORTS' || scope.scopeType === 'OWN') return;
  throw new HrmAuthorizationError('You can only give access you have yourself (your own state, or direct reports).');
};

export const checkScopeShape = async (db: Tx | typeof prisma, scope: { scopeType: ScopeType; stateId?: number | null | undefined; orgUnitId?: string | null | undefined; source?: 'PLACEMENT' | 'MANUAL' | undefined }) => {
  if (scope.scopeType === 'STATE') {
    if (!scope.stateId) throw new HrmHttpError(400, 'SCOPE_STATE_REQUIRED', 'Choose the state for a state access.');
    const state = await db.state.findFirst({ where: { id: scope.stateId, country: { iso2: 'IN' } }, select: { id: true } });
    if (!state) throw new HrmHttpError(400, 'STATE_NOT_FOUND', 'The selected state was not found.');
  }
  if (scope.scopeType === 'HEAD_OFFICE' || scope.scopeType === 'DEPARTMENT' || scope.scopeType === 'TEAM') {
    if (!scope.orgUnitId) throw new HrmHttpError(400, 'SCOPE_UNIT_REQUIRED', 'Choose the office or department for this access.');
    const unit = await db.hrmOrgUnit.findUnique({ where: { id: scope.orgUnitId }, select: { type: true } });
    if (!unit) throw new HrmHttpError(400, 'SCOPE_UNIT_NOT_FOUND', 'The selected office or department was not found.');
    if (scope.scopeType === 'HEAD_OFFICE' && unit.type !== 'HEAD_OFFICE') throw new HrmHttpError(400, 'SCOPE_UNIT_INVALID', 'Choose the head office.');
  }
  if (scope.source === 'PLACEMENT' && scope.scopeType !== 'STATE') throw new HrmHttpError(400, 'SCOPE_SOURCE_INVALID', 'Only a state access can follow the placement.');
};

/** The assignment that decides the placement: in force on the joining day (or the next one). */
const placementOf = async (employeeId: string, onDay: Date) => {
  const rows = await prisma.hrmEmploymentAssignment.findMany({
    where: { employeeId, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDay } }] },
    orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
    select: {
      designation: true, isOfficeManager: true, effectiveFrom: true, stateId: true,
      officeUnit: { select: { id: true, name: true, type: true, stateId: true } },
      orgUnit: { select: { id: true, name: true } },
      state: { select: { id: true, name: true } },
    },
  });
  return rows.filter((row) => row.effectiveFrom <= onDay).pop() ?? rows[0] ?? null;
};

export const getJoiningContext = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  const abilities = await abilitiesOf(actor);
  const employee = await prisma.hrmEmployee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, employeeCode: true, legalName: true, preferredName: true, status: true, joinedOn: true, version: true, archivedAt: true,
      personalEmail: true, workEmail: true, mobile: true, userId: true,
      user: { select: { id: true, email: true, mobile: true, status: true, role: true, customRole: { select: { id: true, name: true } } } },
    },
  });
  if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');
  const today = istToday();
  const plannedDay = employee.joinedOn ?? today;
  // A late joiner is confirmed with today's date: anything scheduled in between (a transfer before joining) is what
  // they actually join into, so the dialog shows and suggests that placement.
  const placement = await placementOf(employeeId, plannedDay.getTime() > today.getTime() ? plannedDay : today);
  const facts = (await loadChecklistFacts([employeeId])).get(employeeId);
  const checklist = facts ? buildChecklist(facts) : [];
  const onboardingCase = await prisma.hrmOnboardingCase.findFirst({ where: { employeeId, status: { in: ['PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL', 'NEEDS_REVIEW'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true } });
  const officeKind = placement?.officeUnit ? kindOfUnit(placement.officeUnit) : null;
  const roles = abilities.canCreateLogin || abilities.canUpdateLogin ? await rolesActorCanGive(actor, { description: true }) : [];
  const designation = placement?.designation?.trim().toLowerCase() ?? '';
  return {
    employee: {
      id: employee.id, employeeCode: employee.employeeCode, name: employee.preferredName || employee.legalName, legalName: employee.legalName,
      status: employee.status, plannedJoiningDate: dayString(employee.joinedOn), version: employee.version,
      personalEmail: employee.personalEmail, mobile: employee.mobile,
    },
    canBeConfirmed: JOINABLE.includes(employee.status),
    case: onboardingCase,
    checklist,
    progress: checklistProgress(checklist),
    placement: placement ? {
      designation: placement.designation, department: placement.orgUnit?.name ?? null,
      office: placement.officeUnit ? { id: placement.officeUnit.id, name: placement.officeUnit.name, kind: officeKind } : null,
      state: placement.state, isOfficeManager: placement.isOfficeManager, effectiveFrom: dayString(placement.effectiveFrom),
    } : null,
    suggestedScopes: suggestScopes({
      officeKind: officeKind === 'HEAD_OFFICE' || officeKind === 'STATE' ? officeKind : null,
      officeUnitId: placement?.officeUnit?.id ?? null,
      stateId: placement?.officeUnit?.stateId ?? placement?.stateId ?? null,
      stateName: placement?.state?.name ?? null,
      isOfficeManager: Boolean(placement?.isOfficeManager),
      designation: placement?.designation ?? null,
    }),
    login: employee.user ? {
      id: employee.user.id, email: employee.user.email, mobile: employee.user.mobile, status: employee.user.status, role: employee.user.role,
      customRole: employee.user.customRole,
    } : null,
    roles,
    // A role whose name matches the designation (for example "State Manager") is offered first.
    suggestedRoleId: roles.find((role) => role.name.trim().toLowerCase() === designation)?.id ?? null,
    today: dayString(today),
    abilities: {
      canConfirm: abilities.canConfirm, canCreateLogin: abilities.canCreateLogin, canLinkLogin: abilities.canLinkLogin,
      canUpdateLogin: abilities.canUpdateLogin, canManageScopes: abilities.canManageScopes, allIndia: abilities.allIndia,
    },
  };
};

/** Moves the first-day records made for this joining from the planned day to the actual day. */
const shiftFirstDay = async (tx: Tx, employeeId: string, planned: Date, actual: Date) => {
  if (planned.getTime() === actual.getTime()) return;
  if (actual.getTime() > planned.getTime()) {
    // Joining later than planned: whatever was scheduled to start between the two dates never took effect (the
    // person was not working). The latest of those starts on the actual day; the earlier ones are cancelled.
    type Row = { id: string; effectiveFrom: Date; effectiveTo: Date | null; createdAt: Date };
    // The row that is in force on the actual day is kept (it starts that day); earlier ones in the gap never took
    // effect. Rows starting the same day are ordered by when they were recorded, so the result never depends on
    // the database's return order.
    const absorb = async <T extends Row>(
      rows: T[], cancel: (ids: string[]) => Promise<unknown>, startOnActual: (row: T, effectiveTo: Date | null) => Promise<unknown>,
    ) => {
      if (!rows.length) return;
      const ordered = [...rows].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
      const keep = ordered[ordered.length - 1]!;
      const dropped = ordered.slice(0, -1).map((row) => row.id);
      if (dropped.length) await cancel(dropped);
      await startOnActual(keep, keep.effectiveTo && keep.effectiveTo < actual ? null : keep.effectiveTo);
    };
    const window = { gte: planned, lte: actual };
    // ENDED rows count too: a pre-joining transfer recorded after its own date has already ended the first placement.
    const assignmentRows = await tx.hrmEmploymentAssignment.findMany({ where: { employeeId, status: { in: ['ACTIVE', 'ENDED'] }, effectiveFrom: window }, select: { id: true, effectiveFrom: true, effectiveTo: true, createdAt: true, officeUnitId: true } });
    await absorb(assignmentRows,
      (ids) => tx.hrmEmploymentAssignment.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELLED' } }),
      (row, effectiveTo) => tx.hrmEmploymentAssignment.update({ where: { id: row.id }, data: { effectiveFrom: actual, effectiveTo, ...(effectiveTo === null ? { status: 'ACTIVE' } : {}) } }));
    const salaryRows = await tx.hrmCompensationRevision.findMany({ where: { employeeId, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] }, effectiveFrom: window }, select: { id: true, effectiveFrom: true, effectiveTo: true, createdAt: true, status: true } });
    // Approved salaries: the latest starts on the actual day, earlier approved ones never took effect.
    await absorb(salaryRows.filter((row) => row.status === 'APPROVED'),
      (ids) => tx.hrmCompensationRevision.updateMany({ where: { id: { in: ids } }, data: { status: 'SUPERSEDED' } }),
      (row, effectiveTo) => tx.hrmCompensationRevision.update({ where: { id: row.id }, data: { effectiveFrom: actual, effectiveTo } }));
    // Proposals still waiting for a decision never displace an approved salary: they move to the actual day and keep
    // waiting (approving one later replaces the approved salary from that day, as any approval does).
    const waiting = salaryRows.filter((row) => row.status !== 'APPROVED').map((row) => row.id);
    if (waiting.length) await tx.hrmCompensationRevision.updateMany({ where: { id: { in: waiting } }, data: { effectiveFrom: actual } });
    const shiftRows = await tx.hrmShiftAssignment.findMany({ where: { employeeId, status: { in: ['ACTIVE', 'ENDED'] }, effectiveFrom: window }, select: { id: true, effectiveFrom: true, effectiveTo: true, createdAt: true } });
    await absorb(shiftRows,
      (ids) => tx.hrmShiftAssignment.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELLED' } }),
      (row, effectiveTo) => tx.hrmShiftAssignment.update({ where: { id: row.id }, data: { effectiveFrom: actual, effectiveTo, ...(effectiveTo === null ? { status: 'ACTIVE' } : {}) } }));
    for (const officeUnitId of new Set(assignmentRows.map((row) => row.officeUnitId).filter((value): value is string => Boolean(value)))) {
      await syncOfficePrimaryManager(tx, officeUnitId);
    }
    return;
  }
  await tx.hrmEmploymentAssignment.updateMany({ where: { employeeId, status: 'ACTIVE', effectiveFrom: planned }, data: { effectiveFrom: actual } });
  await tx.hrmCompensationRevision.updateMany({ where: { employeeId, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] }, effectiveFrom: planned }, data: { effectiveFrom: actual } });
  await tx.hrmShiftAssignment.updateMany({ where: { employeeId, status: 'ACTIVE', effectiveFrom: planned }, data: { effectiveFrom: actual } });
  // A record that ended the day before the planned day (a re-hire's earlier employment) ends the day before the actual one.
  if (actual.getTime() < planned.getTime()) {
    const before = new Date(planned.getTime() - DAY);
    const newBefore = new Date(actual.getTime() - DAY);
    await tx.hrmEmploymentAssignment.updateMany({ where: { employeeId, effectiveTo: before, effectiveFrom: { lte: newBefore } }, data: { effectiveTo: newBefore } });
    await tx.hrmCompensationRevision.updateMany({ where: { employeeId, effectiveTo: before, effectiveFrom: { lte: newBefore } }, data: { effectiveTo: newBefore } });
    await tx.hrmShiftAssignment.updateMany({ where: { employeeId, effectiveTo: before, effectiveFrom: { lte: newBefore } }, data: { effectiveTo: newBefore } });
  }
};

export const confirmJoining = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.confirmJoining, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  const abilities = await abilitiesOf(actor);
  if (!abilities.canConfirm) throw new HrmAuthorizationError('Confirming a joining needs hrm.onboarding.manage and hrm.employees.manage.');
  await assertNotOwnRecord(actor, employeeId, 'Confirming a joining');
  if (input.login.mode === 'LINK' && input.login.userId === actor.userId && actor.role !== 'SUPER_ADMIN') {
    throw new HrmAuthorizationError('You cannot link your own login to a joining. Ask another HR user.');
  }

  const employee = await prisma.hrmEmployee.findUnique({
    where: { id: employeeId },
    select: { id: true, employeeCode: true, legalName: true, status: true, joinedOn: true, version: true, archivedAt: true, userId: true, mobile: true, applicationId: true },
  });
  if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');
  if (!JOINABLE.includes(employee.status)) throw new HrmConflictError(`${employee.employeeCode} is ${employee.status.toLowerCase().replace(/_/g, ' ')}, so there is no joining to confirm.`);
  if (employee.version !== input.version) throw new HrmConflictError('This employee was changed a moment ago. Refresh and try again.');

  const today = istToday();
  const problem = describeJoiningDateProblem(input.joiningDate, dayString(today)!, dayString(employee.joinedOn));
  if (problem) throw new HrmHttpError(400, 'JOINING_DATE_INVALID', problem, [{ path: ['joiningDate'], message: problem }]);
  const actual = dayFrom(input.joiningDate);

  // Checklist: anything required still open needs a reason (kept in the audit and on the case).
  const facts = (await loadChecklistFacts([employeeId])).get(employeeId);
  const progress = facts ? checklistProgress(buildChecklist(facts)) : null;
  if (progress?.missingRequired.length && !input.overrideReason) {
    const message = `The joining checklist is not complete (${progress.missingRequired.join(', ')}). Complete it or give a reason to confirm anyway.`;
    throw new HrmHttpError(409, 'CHECKLIST_INCOMPLETE', message, [{ path: ['overrideReason'], message }]);
  }

  // ---- the login ----
  const login = input.login;
  let prepared: PreparedManagedEmployeeUser | null = null;
  let linkUser: Awaited<ReturnType<typeof loadLinkableUser>> | null = null;
  const placement = await placementOf(employeeId, actual);
  if (login.mode === 'CREATE') {
    if (employee.userId) throw new HrmConflictError('This person already has a login. Choose "Use their login".');
    if (!abilities.canCreateLogin) throw new HrmAuthorizationError('Creating a login needs the users.create permission.');
    await assertCanGiveRole(actor, login.customRoleId ?? null);
    const mobile = login.mobile?.trim() || employee.mobile || '';
    try {
      prepared = await prepareManagedEmployeeUser(prisma, {
        name: employee.legalName, email: login.email, mobile, password: login.password, role: 'EMPLOYEE',
        title: placement?.designation ?? undefined, customRoleId: login.customRoleId ?? null,
      });
    } catch (error) {
      if (error instanceof ManagedUserError) throw new HrmHttpError(error.statusCode, 'LOGIN_INVALID', error.message);
      throw error;
    }
  } else if (login.mode === 'LINK') {
    if (employee.userId) throw new HrmConflictError('This person already has a login. Choose "Use their login".');
    if (!abilities.canLinkLogin) throw new HrmAuthorizationError('Linking a login needs the users.read permission.');
    linkUser = await loadLinkableUser(login.userId);
  } else if (login.mode === 'KEEP') {
    if (!employee.userId) throw new HrmConflictError('This person has no login yet. Create one or link an existing one.');
    if (employee.userId === actor.userId && actor.role !== 'SUPER_ADMIN') throw new HrmAuthorizationError('Your own joining must be confirmed by somebody else.');
    if ((login.reactivate || login.newPassword || login.customRoleId !== undefined) && !abilities.canUpdateLogin) {
      throw new HrmAuthorizationError('Changing a login (switching it on, a new password or the role) needs the users.update permission.');
    }
    if (login.customRoleId) {
      const role = await prisma.customRole.findUnique({ where: { id: login.customRoleId }, select: { id: true } });
      if (!role) throw new HrmHttpError(400, 'ROLE_NOT_FOUND', 'Selected role was not found.');
      await assertCanGiveRole(actor, login.customRoleId);
    }
  }

  // ---- access ----
  const scopes = input.scopes ?? [];
  if (scopes.length && login.mode === 'NONE') throw new HrmHttpError(400, 'SCOPES_NEED_LOGIN', 'HRM access needs a login. Create or link one, or untick the access.');
  for (const scope of scopes) {
    assertCanGrant(abilities, scope);
    await checkScopeShape(prisma, scope);
  }
  const passwordHash = login.mode === 'KEEP' && login.newPassword ? await bcrypt.hash(login.newPassword, 10) : null;

  try {
    const committed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-assignment:${employeeId}`}))`;
      const fresh = await tx.hrmEmployee.findUniqueOrThrow({ where: { id: employeeId }, select: { version: true, status: true, userId: true, joinedOn: true } });
      if (fresh.version !== input.version || !JOINABLE.includes(fresh.status)) throw new HrmConflictError('This employee was changed a moment ago. Refresh and try again.');

      let userId = fresh.userId;
      let loginEmail: string | null = null;
      let loginMobile: string | null = null;
      if (prepared) {
        const user = await insertManagedEmployeeUser(tx, prepared, { createdById: actor.userId }) as unknown as { id: string; email: string; mobile: string | null };
        userId = user.id;
        loginEmail = user.email;
        loginMobile = user.mobile;
      } else if (linkUser) {
        const taken = await tx.hrmEmployee.findFirst({ where: { userId: linkUser.id }, select: { employeeCode: true } });
        if (taken) throw new HrmConflictError(`That login already belongs to ${taken.employeeCode}.`);
        userId = linkUser.id;
        loginEmail = linkUser.email;
        loginMobile = linkUser.mobile;
      } else if (login.mode === 'KEEP' && userId) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, mobile: true, status: true, role: true, customRoleId: true } });
        if (user.role !== 'EMPLOYEE') throw new HrmConflictError('Only an employee login is changed here. Admin accounts are managed on the Users screen.');
        const data: Prisma.UserUpdateInput = {};
        if (login.reactivate && user.status !== 'ACTIVE') {
          // Only a login HRM switched off (an exit or a hold) is switched back on here; one an administrator
          // suspended, blocked or closed is left for the Users screen.
          const lastChange = await tx.auditLog.findFirst({
            where: { entityType: 'USER', entityId: userId, action: 'ACCOUNT_STATUS_CHANGED' },
            orderBy: { createdAt: 'desc' },
            select: { afterJson: true },
          });
          const lastAfter = (lastChange?.afterJson ?? null) as { source?: string; status?: string } | null;
          if (lastAfter?.source !== 'HRM_DEACTIVATION' || lastAfter.status !== user.status) {
            throw new HrmConflictError('This login was switched off by an administrator, not by HRM. Switch it on from the Users screen.');
          }
          data.status = 'ACTIVE';
        }
        if (passwordHash) data.password = passwordHash;
        if (login.customRoleId !== undefined && (login.customRoleId ?? null) !== user.customRoleId) {
          data.customRole = login.customRoleId ? { connect: { id: login.customRoleId } } : { disconnect: true };
        }
        if (Object.keys(data).length) {
          // New password or role: existing sessions end, the person signs in again.
          await tx.user.update({ where: { id: userId }, data: { ...data, ...(passwordHash || data.customRole ? { authVersion: { increment: 1 } } : {}) } });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.userId, entityType: 'USER', entityId: userId, action: 'ACCOUNT_UPDATED_AT_JOINING',
              beforeJson: { status: user.status, customRoleId: user.customRoleId },
              afterJson: { status: data.status ?? user.status, customRoleChanged: Boolean(data.customRole), passwordReset: Boolean(passwordHash), source: 'HRM_CONFIRM_JOINING' },
            },
          });
        }
        loginEmail = user.email;
        loginMobile = user.mobile;
      }

      const planned = fresh.joinedOn ?? actual;
      await shiftFirstDay(tx, employeeId, planned, actual);

      await tx.hrmEmployee.update({
        where: { id: employeeId },
        data: {
          status: 'ACTIVE',
          joinedOn: actual,
          userId,
          ...(loginEmail ? { workEmail: loginEmail } : {}),
          ...(loginMobile ? { mobile: normalizeProfileMobile(loginMobile) || loginMobile } : {}),
          version: { increment: 1 },
        },
      });

      for (const scope of scopes) {
        await tx.hrmAccessScope.create({
          data: {
            userId: userId!, scopeType: scope.scopeType, stateId: scope.scopeType === 'STATE' ? scope.stateId ?? null : null,
            orgUnitId: scope.orgUnitId ?? null, includeChildren: true, activeFrom: actual, source: scope.source ?? 'MANUAL', createdById: actor.userId,
          },
        });
      }

      if (scopes.some((scope) => scope.source === 'PLACEMENT')) {
        // The state follows the placement the person actually joins into (a transfer scheduled before joining may
        // have changed it), then every change scheduled after the joining day.
        await syncPlacementScopes(tx, employeeId, actual, actor.userId);
        const later = await tx.hrmEmploymentAssignment.findMany({ where: { employeeId, status: 'ACTIVE', effectiveFrom: { gt: actual } }, orderBy: { effectiveFrom: 'asc' }, select: { effectiveFrom: true } });
        for (const row of later) await syncPlacementScopes(tx, employeeId, row.effectiveFrom, actor.userId);
      }

      // The office counts its manager from today.
      const managed = await tx.hrmEmploymentAssignment.findMany({ where: { employeeId, isOfficeManager: true, status: 'ACTIVE', officeUnitId: { not: null } }, select: { officeUnitId: true } });
      for (const officeUnitId of new Set(managed.map((row) => row.officeUnitId!))) await syncOfficePrimaryManager(tx, officeUnitId);

      const onboardingCase = await tx.hrmOnboardingCase.findFirst({ where: { employeeId, status: { in: ['PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL'] } }, orderBy: { createdAt: 'desc' } });
      if (onboardingCase) {
        await tx.hrmOnboardingCase.update({
          where: { id: onboardingCase.id },
          data: { status: 'COMPLETED', approvedById: actor.userId, approvedAt: new Date(), ...(input.overrideReason ? { reviewNote: [onboardingCase.reviewNote, `Joined with an open checklist: ${input.overrideReason}`].filter(Boolean).join('\n') } : {}) },
        });
      }
      const applicationId = onboardingCase?.applicationId ?? employee.applicationId;
      if (applicationId) {
        const application = await tx.jobApplication.findUnique({ where: { id: applicationId }, select: { id: true, currentStage: true, terminalStatus: true, candidateId: true } });
        if (application && application.currentStage !== 'HIRED') {
          await tx.jobApplication.update({ where: { id: application.id }, data: { currentStage: 'HIRED', terminalStatus: null } });
          await tx.applicationStageHistory.create({ data: { applicationId: application.id, fromStage: application.currentStage, toStage: 'HIRED', fromTerminalStatus: application.terminalStatus, toTerminalStatus: null, changedById: actor.userId, notes: `Joined on ${input.joiningDate} (${employee.employeeCode}).` } });
          await tx.recruitmentActivityLog.create({ data: { candidateId: application.candidateId, applicationId: application.id, actorId: actor.userId, action: 'JOINED', title: 'Candidate Joined', details: `Joined on ${input.joiningDate} as ${employee.employeeCode}.` } });
        }
      }

      await writeHrmAudit({
        actorUserId: actor.userId, entityType: 'HRM_EMPLOYEE', entityId: employeeId, action: 'JOINING_CONFIRMED',
        after: {
          joiningDate: input.joiningDate, plannedJoiningDate: dayString(fresh.joinedOn), loginMode: login.mode,
          loginReason: login.mode === 'NONE' ? login.reason : null, scopes: scopes.map((scope) => ({ ...scope })),
          overrideReason: input.overrideReason ?? null, missingAtJoining: progress?.missingRequired ?? [],
        },
        ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
      }, tx);
      return { employeeCode: employee.employeeCode, status: 'ACTIVE' as const, loginEmail, loginMode: login.mode, scopesGranted: scopes.length };
    }, { timeout: 30000, maxWait: 5000 });
    // Only after the commit, and in the background: a message can never undo, fail or slow down the joining.
    if (input.sendWelcome) void sendJoiningWelcome({ employeeId, joiningDate: input.joiningDate, loginEmail: committed.loginEmail });
    return { ...committed, welcome: { requested: Boolean(input.sendWelcome) } };
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'P2002') {
      const target = String((error as { meta?: { target?: unknown } })?.meta?.target ?? '').toLowerCase();
      if (target.includes('userid')) throw new HrmConflictError('That login was just linked to another employee. Choose another login.');
      throw new HrmConflictError('That email or mobile number is already used by another login.');
    }
    throw error;
  }
};

// ---- Access card: the login, its role and its HRM access ----

export const getEmployeeAccess = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  const abilities = await abilitiesOf(actor);
  const employee = await prisma.hrmEmployee.findUnique({
    where: { id: employeeId },
    select: { id: true, userId: true, user: { select: { id: true, email: true, mobile: true, status: true, role: true, customRole: { select: { id: true, name: true } } } } },
  });
  if (!employee) throw new HrmNotFoundError('Employee not found.');
  const today = istToday();
  const scopes = employee.userId ? await prisma.hrmAccessScope.findMany({
    where: { userId: employee.userId },
    include: { state: { select: { id: true, name: true } }, orgUnit: { select: { id: true, name: true } } },
    orderBy: [{ activeFrom: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  }) : [];
  const roles = abilities.canUpdateLogin ? await rolesActorCanGive(actor) : [];
  return {
    login: employee.user,
    scopes: scopes.map((scope) => ({
      id: scope.id, scopeType: scope.scopeType, source: scope.source, state: scope.state, orgUnit: scope.orgUnit,
      activeFrom: dayString(scope.activeFrom), activeTo: dayString(scope.activeTo),
      isActive: scope.activeFrom <= today && (!scope.activeTo || scope.activeTo >= today),
      isUpcoming: scope.activeFrom > today,
    })),
    roles,
    // ownStateIds: the states the viewer may give a STATE access for (their own STATE scopes) when not all-India.
    abilities: { canManageScopes: abilities.canManageScopes, canChangeRole: abilities.canUpdateLogin, allIndia: abilities.allIndia, ownStateIds: [...abilities.ownStates] },
  };
};

export const grantEmployeeScope = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.grantScope, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  const abilities = await abilitiesOf(actor);
  assertCanGrant(abilities, input);
  await checkScopeShape(prisma, input);
  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { userId: true, archivedAt: true, status: true } });
  if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');
  if (!employee.userId) throw new HrmConflictError('This person has no login, so HRM access cannot be given yet.');
  if (employee.userId === actor.userId && actor.role !== 'SUPER_ADMIN') throw new HrmAuthorizationError('You cannot give HRM access to yourself. Ask another HR user.');
  if (employee.status === 'EXITED' || employee.status === 'TERMINATED') throw new HrmConflictError('This person has left the company.');
  const activeFrom = input.activeFrom ? dayFrom(input.activeFrom) : istToday();
  const scope = await prisma.$transaction(async (tx) => {
    const created = await tx.hrmAccessScope.create({
      data: {
        userId: employee.userId!, scopeType: input.scopeType, stateId: input.scopeType === 'STATE' ? input.stateId ?? null : null,
        orgUnitId: input.orgUnitId ?? null, includeChildren: true, activeFrom, source: input.source ?? 'MANUAL', createdById: actor.userId,
      },
    });
    if (created.source === 'PLACEMENT') {
      const later = await tx.hrmEmploymentAssignment.findMany({ where: { employeeId, status: 'ACTIVE', effectiveFrom: { gt: activeFrom } }, orderBy: { effectiveFrom: 'asc' }, select: { effectiveFrom: true } });
      for (const row of later) await syncPlacementScopes(tx, employeeId, row.effectiveFrom, actor.userId);
    }
    return created;
  });
  await writeHrmAudit({ actorUserId: actor.userId, entityType: 'HRM_ACCESS_SCOPE', entityId: scope.id, action: 'GRANTED', after: { employeeId, ...input }, ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}) });
  return scope;
};

/** Ends an access on a day (yesterday by default, so it is off from today). History is kept. */
export const endEmployeeScope = async (actor: Actor, scopeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.endScope, rawInput ?? {});
  const abilities = await abilitiesOf(actor);
  if (!abilities.canManageScopes) throw new HrmAuthorizationError('Ending HRM access needs the hrm.scope.manage permission.');
  const scope = await prisma.hrmAccessScope.findUnique({ where: { id: scopeId } });
  if (!scope) throw new HrmNotFoundError('Access not found.');
  const employee = await prisma.hrmEmployee.findUnique({ where: { userId: scope.userId }, select: { id: true } });
  if (employee) await assertEmployeeAccess({ ...actor, employeeId: employee.id });
  else if (!abilities.allIndia) throw new HrmAuthorizationError('Only an all-India HR user can change the access of an account without an HR record.');
  if (!abilities.allIndia && !(scope.scopeType === 'STATE' && scope.stateId && abilities.ownStates.has(scope.stateId)) && scope.scopeType !== 'DIRECT_REPORTS' && scope.scopeType !== 'OWN') {
    throw new HrmAuthorizationError('You can only end access you could give yourself.');
  }
  const yesterday = new Date(istToday().getTime() - DAY);
  let lastDay = input.lastDay ? dayFrom(input.lastDay) : yesterday;
  // Ending never extends: not after the current end, and an ended scope stays ended.
  if (scope.activeTo && lastDay > scope.activeTo) lastDay = scope.activeTo;
  if (lastDay < scope.activeFrom) lastDay = new Date(scope.activeFrom.getTime() - DAY);
  const updated = await prisma.hrmAccessScope.update({ where: { id: scopeId }, data: { activeTo: lastDay } });
  await writeHrmAudit({ actorUserId: actor.userId, entityType: 'HRM_ACCESS_SCOPE', entityId: scopeId, action: 'ENDED', after: { activeTo: dayString(lastDay) }, ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}) });
  return updated;
};

/** The login's permission role (what screens and actions they get). Needs users.update; the person signs in again. */
export const changeLoginRole = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.changeLoginRole, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  const abilities = await abilitiesOf(actor);
  if (!abilities.canUpdateLogin) throw new HrmAuthorizationError('Changing a login role needs the users.update permission.');
  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { userId: true, user: { select: { role: true, customRoleId: true } } } });
  if (!employee?.userId || !employee.user) throw new HrmConflictError('This person has no login.');
  if (employee.user.role !== 'EMPLOYEE') throw new HrmConflictError('Only an employee login role is changed here. Use the Users screen for other accounts.');
  if (employee.userId === actor.userId) throw new HrmConflictError('You cannot change your own role.');
  const next = input.customRoleId ?? null;
  if (next) {
    const role = await prisma.customRole.findUnique({ where: { id: next }, select: { id: true } });
    if (!role) throw new HrmHttpError(400, 'ROLE_NOT_FOUND', 'Selected role was not found.');
    await assertCanGiveRole(actor, next);
  }
  if (next === employee.user.customRoleId) return { changed: false };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: employee.userId! }, data: { customRole: next ? { connect: { id: next } } : { disconnect: true }, authVersion: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorUserId: actor.userId, entityType: 'USER', entityId: employee.userId!, action: 'ROLE_CHANGED', beforeJson: { customRoleId: employee.user!.customRoleId }, afterJson: { customRoleId: next, source: 'HRM_ACCESS_CARD' } } });
  });
  return { changed: true };
};
