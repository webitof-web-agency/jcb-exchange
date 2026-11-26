import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { abilitiesOf, assertCanGrant, mayManageState } from '../accessGrant';
import { syncPlacementScopes } from '../accessProvisioning';
import { assertEmployeeAccess } from '../access';
import { openChargeWhere } from '../additionalChargeRules';
import { utcToday } from '../assignmentTimeline';
import { writeHrmAudit } from '../audit';
import { assertCanGiveRole, rolesActorCanGive } from '../employeeGuards';
import { HrmAuthorizationError, HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';

/**
 * "Login role & access" given in the same step as an appointment, a replacement, a transfer to manager or an
 * additional charge. Everything is checked before anything is written, and applied inside the caller's transaction,
 * so the appointment and the access happen together or not at all.
 */

type Tx = Prisma.TransactionClient;
type Actor = { userId: string; role: string; ipAddress?: string | null };

export type ManagerAccessInput = {
  /** Give the access for the office's state (it follows the posting). */
  grantStateAccess?: boolean | undefined;
  /** The login's permission role; omit to keep it, null to remove it. */
  customRoleId?: string | null | undefined;
};

export type ManagerAccessPlan = {
  employeeId: string;
  userId: string;
  stateId: number;
  grantAccess: boolean;
  roleChange: { from: string | null; to: string | null } | null;
};

/** Changing the role needs the same permissions as the Access card, and only roles the actor holds. */
const planRoleChange = async (actor: Actor, abilities: Awaited<ReturnType<typeof abilitiesOf>>, user: { role: string; customRoleId: string | null }, next: string | null) => {
  if (next === user.customRoleId) return null;
  if (!abilities.canUpdateLogin || !abilities.canManageEmployees) throw new HrmAuthorizationError('Changing a login role needs the users.update and hrm.employees.manage permissions.');
  if (user.role !== 'EMPLOYEE') throw new HrmConflictError('Only an employee login role is changed here. Use the Users screen for other accounts.');
  if (next) {
    const role = await prisma.customRole.findUnique({ where: { id: next }, select: { id: true } });
    if (!role) throw new HrmHttpError(400, 'ROLE_NOT_FOUND', 'Selected role was not found.');
    await assertCanGiveRole(actor, next);
  }
  return { from: user.customRoleId, to: next };
};

/** Null when nothing was asked for. */
export const planManagerAccess = async (
  actor: Actor,
  employeeId: string,
  stateId: number,
  input: ManagerAccessInput | null | undefined,
): Promise<ManagerAccessPlan | null> => {
  const wantsRole = input?.customRoleId !== undefined;
  const wantsAccess = input?.grantStateAccess === true;
  if (!wantsRole && !wantsAccess) return null;
  const employee = await prisma.hrmEmployee.findUnique({
    where: { id: employeeId },
    select: { userId: true, user: { select: { role: true, customRoleId: true } } },
  });
  if (!employee?.userId || !employee.user) {
    throw new HrmConflictError('This person has no login, so a role or access cannot be given. Link a login first, or leave "Login role & access" unchanged.');
  }
  if (employee.userId === actor.userId && actor.role !== 'SUPER_ADMIN') throw new HrmAuthorizationError('Your own role and access are changed by somebody else.');
  const abilities = await abilitiesOf(actor);
  if (wantsAccess) assertCanGrant(abilities, { scopeType: 'STATE', stateId });
  const roleChange = wantsRole ? await planRoleChange(actor, abilities, employee.user, input!.customRoleId ?? null) : null;
  return { employeeId, userId: employee.userId, stateId, grantAccess: wantsAccess, roleChange };
};

/** A role change on its own (the outgoing manager in a replacement). */
export const planOutgoingRole = async (actor: Actor, employeeId: string, customRoleId: string | null | undefined) => {
  if (customRoleId === undefined) return null;
  const employee = await prisma.hrmEmployee.findUnique({
    where: { id: employeeId },
    select: { userId: true, user: { select: { role: true, customRoleId: true } } },
  });
  if (!employee?.userId || !employee.user) throw new HrmConflictError('The person you are replacing has no login, so their role cannot be changed.');
  if (employee.userId === actor.userId && actor.role !== 'SUPER_ADMIN') throw new HrmAuthorizationError('Your own role is changed by somebody else.');
  const roleChange = await planRoleChange(actor, await abilitiesOf(actor), employee.user, customRoleId);
  return roleChange ? { userId: employee.userId, roleChange } : null;
};

/** The new role takes effect at once: the person signs in again. */
export const applyRoleChange = async (tx: Tx, actor: Actor, userId: string, change: { from: string | null; to: string | null }, source: string) => {
  await tx.user.update({ where: { id: userId }, data: { customRole: change.to ? { connect: { id: change.to } } : { disconnect: true }, authVersion: { increment: 1 } } });
  await tx.auditLog.create({
    data: { actorUserId: actor.userId, entityType: 'USER', entityId: userId, action: 'ROLE_CHANGED', beforeJson: { customRoleId: change.from }, afterJson: { customRoleId: change.to, source } },
  });
};

export type ManagerAccessResult = { access: 'GRANTED' | 'ALREADY' | 'NOT_ASKED'; roleChanged: boolean };

/** Applies a checked plan: the role at once, the state access from the appointment's date (it follows the posting). */
export const applyManagerAccess = async (tx: Tx, actor: Actor, plan: ManagerAccessPlan | null, from: Date, source: string): Promise<ManagerAccessResult> => {
  if (!plan) return { access: 'NOT_ASKED', roleChanged: false };
  if (plan.roleChange) await applyRoleChange(tx, actor, plan.userId, plan.roleChange, source);
  let access: ManagerAccessResult['access'] = 'NOT_ASKED';
  if (plan.grantAccess) {
    // The same access that is already open (given by hand, or just moved here with the posting) is not doubled.
    const open = await tx.hrmAccessScope.findFirst({
      where: { userId: plan.userId, scopeType: 'STATE', stateId: plan.stateId, source: { in: ['PLACEMENT', 'MANUAL'] }, activeFrom: { lte: from }, activeTo: null },
      select: { id: true },
    });
    if (open) access = 'ALREADY';
    else {
      const scope = await tx.hrmAccessScope.create({
        data: { userId: plan.userId, scopeType: 'STATE', stateId: plan.stateId, includeChildren: true, activeFrom: from, source: 'PLACEMENT', createdById: actor.userId },
        select: { id: true },
      });
      // Anything already scheduled after this date moves it on (or ends it) from its own day.
      const later = await tx.hrmEmploymentAssignment.findMany({ where: { employeeId: plan.employeeId, status: 'ACTIVE', effectiveFrom: { gt: from } }, orderBy: { effectiveFrom: 'asc' }, select: { effectiveFrom: true } });
      for (const row of later) await syncPlacementScopes(tx, plan.employeeId, row.effectiveFrom, actor.userId);
      await writeHrmAudit({ actorUserId: actor.userId, entityType: 'HRM_ACCESS_SCOPE', entityId: scope.id, action: 'GRANTED', after: { employeeId: plan.employeeId, scopeType: 'STATE', stateId: plan.stateId, source: 'PLACEMENT', via: source }, ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}) }, tx);
      access = 'GRANTED';
    }
  }
  return { access, roleChanged: Boolean(plan.roleChange) };
};

/**
 * What the appointment dialogs need to offer "Login role & access" for a chosen person and office: whether they
 * have a login, what the caller may change, and the charges they already hold.
 */
export const getManagerAccessContext = async (actor: Actor, employeeId: string, officeUnitId: string | null) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  const employee = await prisma.hrmEmployee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, legalName: true, preferredName: true, userId: true, archivedAt: true,
      user: { select: { role: true, status: true, customRole: { select: { id: true, name: true } } } },
    },
  });
  if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');
  const office = officeUnitId
    ? await prisma.hrmOrgUnit.findUnique({ where: { id: officeUnitId }, select: { id: true, name: true, type: true, stateId: true, state: { select: { name: true } } } })
    : null;
  const stateId = office?.type === 'REGION' ? office.stateId : null;
  const abilities = await abilitiesOf(actor);
  const isSelf = employee.userId === actor.userId && actor.role !== 'SUPER_ADMIN';
  const today = utcToday();
  const [scope, placement, charges] = await Promise.all([
    // Access of an additional charge does not count: it ends with the charge, which a new posting here ends.
    employee.userId && stateId
      ? prisma.hrmAccessScope.findFirst({ where: { userId: employee.userId, scopeType: 'STATE', stateId, source: { in: ['PLACEMENT', 'MANUAL'] }, activeFrom: { lte: today }, activeTo: null }, select: { id: true } })
      : Promise.resolve(null),
    // Access that follows the posting is moved to the new state by the move itself.
    employee.userId
      ? prisma.hrmAccessScope.findFirst({ where: { userId: employee.userId, scopeType: 'STATE', source: 'PLACEMENT', OR: [{ activeTo: null }, { activeTo: { gte: today } }] }, select: { id: true } })
      : Promise.resolve(null),
    prisma.hrmAdditionalCharge.findMany({
      where: { employeeId, ...openChargeWhere(today) },
      select: { id: true, officeUnitId: true, effectiveFrom: true, effectiveTo: true, officeUnit: { select: { name: true, stateId: true } } },
      orderBy: { effectiveFrom: 'asc' },
    }),
  ]);
  const mayChangeRole = Boolean(employee.userId) && !isSelf && abilities.canUpdateLogin && abilities.canManageEmployees && employee.user?.role === 'EMPLOYEE';
  const mayGrant = Boolean(employee.userId) && !isSelf && Boolean(stateId) && abilities.canManageScopes && (abilities.allIndia || abilities.ownStates.has(stateId!));
  const reason = !employee.userId ? 'NO_LOGIN' : isSelf ? 'OWN_RECORD' : null;
  return {
    hasLogin: Boolean(employee.userId),
    login: employee.user ? { status: employee.user.status, isEmployee: employee.user.role === 'EMPLOYEE', role: employee.user.customRole } : null,
    state: stateId ? { id: stateId, name: office?.state?.name ?? null } : null,
    alreadyHasStateAccess: Boolean(scope),
    followsPosting: Boolean(placement),
    canChangeRole: mayChangeRole,
    canGrantAccess: mayGrant,
    // The caller's own right to give this state (an additional charge may grant it before the person has a login).
    viewerCanGrant: Boolean(stateId) && !isSelf && abilities.canManageScopes && (abilities.allIndia || abilities.ownStates.has(stateId!)),
    blockedReason: reason,
    roles: mayChangeRole ? await rolesActorCanGive(actor) : [],
    charges: charges.map((charge) => ({
      id: charge.id, officeUnitId: charge.officeUnitId, officeName: charge.officeUnit.name,
      effectiveFrom: charge.effectiveFrom.toISOString().slice(0, 10), effectiveTo: charge.effectiveTo?.toISOString().slice(0, 10) ?? null,
      canEnd: mayManageState(abilities, charge.officeUnit.stateId),
    })),
  };
};
