import prisma from '../../../lib/prisma';
import { abilitiesOf, assertCanGrant, mayManageState, type Abilities } from '../accessGrant';
import { assertEmployeeAccess, getEmployeeScopeWhere } from '../access';
import { chargeDateProblem, chargeEndChangeProblem, chargeState, openChargeWhere, periodsOverlap } from '../additionalChargeRules';
import { addDays, MAX_BACKDATE_DAYS, parseDay, toDay, utcToday } from '../assignmentTimeline';
import { writeHrmAudit } from '../audit';
import { createChargeAccess, endChargesInTx, lockOfficeCharges } from '../chargeLifecycle';
import { assertNotOwnRecord } from '../employeeGuards';
import { HrmAuthorizationError, HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import { openAssignmentWhere, WORKING_STATUSES } from '../officeAssignments';
import { kindOfUnit } from '../organisationCodes';
import { HRM_PERMISSIONS, hasHrmPermission } from '../security';
import { parseHrmInput, schemas } from '../validation';
import { applyRoleChange, planManagerAccess } from './managerAccess.service';

/**
 * Additional charge: a state office looked after on top of the person's own posting, so one manager can handle two or
 * more states. The posting, salary and reporting line do not change. While a charge runs the office counts as covered
 * and, when HR ticked it, the person sees that state; both stop together on the last day. History is never deleted.
 */

type Actor = { userId: string; role: string; ipAddress?: string | null };
type ChargeRecord = Awaited<ReturnType<typeof loadCharge>>;

const personName = (employee: { legalName: string; preferredName: string | null }) => employee.preferredName || employee.legalName;

const requireAssignments = (abilities: Abilities, what: string) => {
  if (!hasHrmPermission(abilities.permissions, HRM_PERMISSIONS.ASSIGNMENTS_MANAGE)) throw new HrmAuthorizationError(`${what} needs the hrm.assignments.manage permission.`);
};

const assertOfficeInReach = (abilities: Abilities, stateId: number | null) => {
  if (!mayManageState(abilities, stateId)) throw new HrmAuthorizationError('That state office is outside your HRM access.');
};

const loadStateOffice = async (officeUnitId: string) => {
  const office = await prisma.hrmOrgUnit.findUnique({
    where: { id: officeUnitId },
    select: { id: true, name: true, type: true, stateId: true, isActive: true, state: { select: { name: true } } },
  });
  if (!office || kindOfUnit(office) !== 'STATE') throw new HrmNotFoundError('State office not found.');
  if (!office.isActive) throw new HrmConflictError(`${office.name} is switched off. Switch it on first.`);
  return office;
};

const loadCharge = async (chargeId: string) => {
  const charge = await prisma.hrmAdditionalCharge.findUnique({
    where: { id: chargeId },
    select: {
      id: true, employeeId: true, officeUnitId: true, effectiveFrom: true, effectiveTo: true, status: true, grantAccess: true, accessScopeId: true,
      officeUnit: { select: { id: true, name: true, stateId: true } },
      employee: { select: { employeeCode: true, legalName: true, preferredName: true } },
    },
  });
  if (!charge) throw new HrmNotFoundError('Additional charge not found.');
  return charge;
};

const guardExisting = async (actor: Actor, charge: ChargeRecord, what: string) => {
  const abilities = await abilitiesOf(actor);
  requireAssignments(abilities, what);
  assertOfficeInReach(abilities, charge.officeUnit.stateId);
  await assertEmployeeAccess({ ...actor, employeeId: charge.employeeId });
  await assertNotOwnRecord(actor, charge.employeeId, what);
  return abilities;
};

/** The charges of one employee or of one office: current ones first, then the history. */
export const listCharges = async (actor: Actor, rawQuery: unknown) => {
  const query = parseHrmInput(schemas.chargeQuery, rawQuery);
  if (!query.employeeId && !query.officeUnitId) throw new HrmHttpError(400, 'CHARGE_FILTER_REQUIRED', 'Choose an employee or an office.');
  if (query.employeeId) await assertEmployeeAccess({ ...actor, employeeId: query.employeeId });
  const abilities = await abilitiesOf(actor);
  const today = utcToday();
  const office = query.officeUnitId
    ? await prisma.hrmOrgUnit.findUnique({ where: { id: query.officeUnitId }, select: { stateId: true } })
    : null;
  const officeInReach = Boolean(query.officeUnitId) && mayManageState(abilities, office?.stateId ?? null);
  // The people the caller may see: an office outside their states lists only those.
  const scopeWhere = await getEmployeeScopeWhere(actor);
  const rows = await prisma.hrmAdditionalCharge.findMany({
    where: {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.officeUnitId ? { officeUnitId: query.officeUnitId } : {}),
      ...(query.officeUnitId && !officeInReach && scopeWhere ? { employee: scopeWhere } : {}),
    },
    select: {
      id: true, effectiveFrom: true, effectiveTo: true, status: true, grantAccess: true, accessScopeId: true, reason: true, createdAt: true,
      employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true, status: true, userId: true } },
      officeUnit: { select: { id: true, name: true, stateId: true, state: { select: { name: true } } } },
    },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  const me = await prisma.hrmEmployee.findUnique({ where: { userId: actor.userId }, select: { id: true } });
  // Changing a charge also needs access to its holder (the same rule the change itself applies).
  const visible = scopeWhere
    ? new Set((await prisma.hrmEmployee.findMany({ where: { AND: [{ id: { in: rows.map((row) => row.employee.id) } }, scopeWhere] }, select: { id: true } })).map((row) => row.id))
    : null;
  const canAssign = hasHrmPermission(abilities.permissions, HRM_PERMISSIONS.ASSIGNMENTS_MANAGE);
  const order = { ACTIVE: 0, UPCOMING: 1, ENDED: 2, CANCELLED: 3 } as const;
  const charges = rows.map((row) => {
    const state = chargeState(row, today);
    const own = actor.role !== 'SUPER_ADMIN' && me?.id === row.employee.id;
    return {
      id: row.id,
      state,
      effectiveFrom: toDay(row.effectiveFrom),
      effectiveTo: row.effectiveTo ? toDay(row.effectiveTo) : null,
      reason: row.reason,
      grantAccess: row.grantAccess,
      hasAccess: Boolean(row.accessScopeId),
      employee: { id: row.employee.id, employeeCode: row.employee.employeeCode, name: personName(row.employee), status: row.employee.status, hasLogin: Boolean(row.employee.userId) },
      office: { id: row.officeUnit.id, name: row.officeUnit.name, stateId: row.officeUnit.stateId, stateName: row.officeUnit.state?.name ?? null },
      canManage: canAssign && !own && (state === 'ACTIVE' || state === 'UPCOMING') && mayManageState(abilities, row.officeUnit.stateId) && (!visible || visible.has(row.employee.id)),
    };
  }).sort((a, b) => order[a.state] - order[b.state]);
  return { charges, today: toDay(today), abilities: { canGive: canAssign && (!query.officeUnitId || officeInReach), canGrantAccess: abilities.canManageScopes } };
};

/** The state offices this person can still be given: inside the caller's reach, not their own, not already held. */
export const getChargeOptions = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  const abilities = await abilitiesOf(actor);
  requireAssignments(abilities, 'Giving an additional charge');
  const today = utcToday();
  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { status: true, archivedAt: true, userId: true } });
  if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');
  const [posted, held, offices] = await Promise.all([
    prisma.hrmEmploymentAssignment.findMany({ where: { employeeId, ...openAssignmentWhere(today), officeUnitId: { not: null } }, select: { officeUnitId: true } }),
    prisma.hrmAdditionalCharge.findMany({ where: { employeeId, ...openChargeWhere(today) }, select: { officeUnitId: true } }),
    prisma.hrmOrgUnit.findMany({
      where: { type: 'REGION', isActive: true, stateId: abilities.allIndia ? { not: null } : { in: [...abilities.ownStates] } },
      select: { id: true, name: true, stateId: true, state: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);
  const taken = new Set([...posted, ...held].map((row) => row.officeUnitId));
  return {
    eligible: (WORKING_STATUSES as readonly string[]).includes(employee.status),
    hasLogin: Boolean(employee.userId),
    today: toDay(today),
    offices: offices.filter((office) => !taken.has(office.id)).map((office) => ({ id: office.id, name: office.name, stateName: office.state?.name ?? null })),
  };
};

/** Gives an additional charge of a state office, with its state access and (optionally) a new login role. */
export const createCharge = async (actor: Actor, officeUnitId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.createCharge, rawInput);
  const abilities = await abilitiesOf(actor);
  requireAssignments(abilities, 'Giving an additional charge');
  const office = await loadStateOffice(officeUnitId);
  assertOfficeInReach(abilities, office.stateId);
  await assertEmployeeAccess({ ...actor, employeeId: input.employeeId });
  await assertNotOwnRecord(actor, input.employeeId, 'Giving an additional charge');

  const today = utcToday();
  const from = parseDay(input.effectiveFrom);
  const to = input.effectiveTo ? parseDay(input.effectiveTo) : null;
  const dateProblem = chargeDateProblem({ from, to, today });
  if (dateProblem) throw new HrmHttpError(400, 'CHARGE_DATES_INVALID', dateProblem.message, [{ path: [dateProblem.path], message: dateProblem.message }]);

  const grantAccess = input.access?.grantStateAccess === true;
  if (grantAccess) assertCanGrant(abilities, { scopeType: 'STATE', stateId: office.stateId });
  // The role part is checked like an appointment's; the access of a charge is its own (it lasts as long as the charge).
  const rolePlan = await planManagerAccess(actor, input.employeeId, office.stateId!, input.access?.customRoleId !== undefined ? { customRoleId: input.access.customRoleId } : null);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-assignment:${input.employeeId}`}))`;
    await lockOfficeCharges(tx, office.id);
    const employee = await tx.hrmEmployee.findUnique({ where: { id: input.employeeId }, select: { employeeCode: true, legalName: true, preferredName: true, status: true, userId: true, archivedAt: true } });
    if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');
    if (!(WORKING_STATUSES as readonly string[]).includes(employee.status)) {
      throw new HrmConflictError(`${personName(employee)} (${employee.employeeCode}) is not working yet or any more, so they cannot hold a charge.`);
    }
    const posted = await tx.hrmEmploymentAssignment.findFirst({
      where: { employeeId: input.employeeId, officeUnitId: office.id, ...openAssignmentWhere(today) },
      select: { isOfficeManager: true },
    });
    if (posted) {
      throw new HrmConflictError(posted.isOfficeManager
        ? `${personName(employee)} already manages ${office.name}.`
        : `${personName(employee)} is posted at ${office.name}. Appoint them as its manager instead.`);
    }
    const existing = await tx.hrmAdditionalCharge.findMany({
      where: { employeeId: input.employeeId, officeUnitId: office.id, status: 'ACTIVE' },
      select: { effectiveFrom: true, effectiveTo: true },
    });
    if (existing.some((row) => periodsOverlap({ from, to }, { from: row.effectiveFrom, to: row.effectiveTo }))) {
      throw new HrmConflictError(`${personName(employee)} already holds a charge of ${office.name} for these days. Change its last day instead.`);
    }
    const charge = await tx.hrmAdditionalCharge.create({
      data: { employeeId: input.employeeId, officeUnitId: office.id, effectiveFrom: from, effectiveTo: to, grantAccess, reason: input.reason ?? null, createdById: actor.userId },
      select: { id: true },
    });
    let accessGiven = false;
    if (grantAccess && employee.userId) {
      await createChargeAccess(tx, actor, { id: charge.id, stateId: office.stateId!, effectiveFrom: from, effectiveTo: to }, employee.userId);
      accessGiven = true;
    }
    if (rolePlan?.roleChange) await applyRoleChange(tx, actor, rolePlan.userId, rolePlan.roleChange, 'HRM_ADDITIONAL_CHARGE');
    const after = { chargeId: charge.id, employeeId: input.employeeId, officeUnitId: office.id, office: office.name, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null, grantAccess, reason: input.reason ?? null };
    const ip = actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {};
    await writeHrmAudit({ actorUserId: actor.userId, entityType: 'HRM_EMPLOYEE', entityId: input.employeeId, action: 'ADDITIONAL_CHARGE_GIVEN', after, ...ip }, tx);
    await writeHrmAudit({ actorUserId: actor.userId, entityType: 'HRM_ORG_UNIT', entityId: office.id, action: 'ADDITIONAL_CHARGE_GIVEN', after, ...ip }, tx);
    return {
      chargeId: charge.id,
      accessGiven,
      // Access was wanted but there is no login yet: it is created when one is linked.
      accessPending: grantAccess && !employee.userId,
      roleChanged: Boolean(rolePlan?.roleChange),
    };
  }, { timeout: 20000, maxWait: 5000 });
};

/** Extends or shortens a running / upcoming charge (null = until further notice). Its access moves with it. */
export const changeChargeEnd = async (actor: Actor, chargeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.changeChargeEnd, rawInput);
  const charge = await loadCharge(chargeId);
  const abilities = await guardExisting(actor, charge, 'Changing an additional charge');
  const today = utcToday();
  const to = input.effectiveTo ? parseDay(input.effectiveTo) : null;
  const problem = chargeEndChangeProblem(charge, to, today);
  if (problem) throw new HrmHttpError(400, 'CHARGE_DATES_INVALID', problem, [{ path: ['effectiveTo'], message: problem }]);
  const longer = charge.effectiveTo !== null && (to === null || to.getTime() > charge.effectiveTo.getTime());
  // Making the access last longer is giving access.
  if (longer && charge.accessScopeId) assertCanGrant(abilities, { scopeType: 'STATE', stateId: charge.officeUnit.stateId });

  return prisma.$transaction(async (tx) => {
    // The holder first, then the office: the same order as appointments and exits, so they cannot cross.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-assignment:${charge.employeeId}`}))`;
    await lockOfficeCharges(tx, charge.officeUnitId);
    const fresh = await tx.hrmAdditionalCharge.findUniqueOrThrow({ where: { id: chargeId }, select: { effectiveFrom: true, effectiveTo: true, status: true } });
    if (chargeEndChangeProblem(fresh, to, today)) throw new HrmConflictError('This charge was changed a moment ago. Refresh and try again.');
    const extends_ = fresh.effectiveTo !== null && (to === null || to.getTime() > fresh.effectiveTo.getTime());
    if (extends_) {
      // Somebody who left or is on hold gets nothing back (their charge and access ended with the exit).
      const holder = await tx.hrmEmployee.findUniqueOrThrow({ where: { id: charge.employeeId }, select: { status: true, archivedAt: true } });
      if (holder.archivedAt || !(WORKING_STATUSES as readonly string[]).includes(holder.status)) {
        throw new HrmConflictError('This person is not working now, so the charge cannot be made longer.');
      }
    }
    const others = await tx.hrmAdditionalCharge.findMany({
      where: { employeeId: charge.employeeId, officeUnitId: charge.officeUnitId, status: 'ACTIVE', NOT: { id: chargeId } },
      select: { effectiveFrom: true, effectiveTo: true },
    });
    if (others.some((row) => periodsOverlap({ from: fresh.effectiveFrom, to }, { from: row.effectiveFrom, to: row.effectiveTo }))) {
      throw new HrmConflictError('Another charge of this office starts before that day.');
    }
    await tx.hrmAdditionalCharge.update({ where: { id: chargeId }, data: { effectiveTo: to } });
    if (charge.accessScopeId) await tx.hrmAccessScope.updateMany({ where: { id: charge.accessScopeId }, data: { activeTo: to } });
    await writeHrmAudit({
      actorUserId: actor.userId, entityType: 'HRM_EMPLOYEE', entityId: charge.employeeId, action: 'ADDITIONAL_CHARGE_CHANGED',
      before: { chargeId, effectiveTo: fresh.effectiveTo }, after: { chargeId, effectiveTo: to, office: charge.officeUnit.name },
      ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
    }, tx);
    return { chargeId, effectiveTo: to ? toDay(to) : null };
  }, { timeout: 20000, maxWait: 5000 });
};

/**
 * Ends a charge. By default it stops from today (yesterday is the last day); a later last day lets it run until then.
 * One that has not started yet is cancelled.
 */
export const endCharge = async (actor: Actor, chargeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.endCharge, rawInput ?? {});
  const charge = await loadCharge(chargeId);
  await guardExisting(actor, charge, 'Ending an additional charge');
  const today = utcToday();
  const lastDay = input.lastDay ? parseDay(input.lastDay) : addDays(today, -1);
  if (lastDay.getTime() < addDays(today, -MAX_BACKDATE_DAYS).getTime()) throw new HrmHttpError(400, 'CHARGE_DATES_INVALID', `The last day cannot be more than ${MAX_BACKDATE_DAYS} days in the past.`);
  const state = chargeState(charge, today);
  if (state === 'ENDED' || state === 'CANCELLED') throw new HrmConflictError('This charge is already over.');

  const ended = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-assignment:${charge.employeeId}`}))`;
    await lockOfficeCharges(tx, charge.officeUnitId);
    return endChargesInTx(tx, actor, { where: { id: chargeId }, lastDay, reason: input.reason?.trim() || 'Ended by HR' });
  }, { timeout: 20000, maxWait: 5000 });
  if (!ended.length) throw new HrmConflictError('This charge already ends on or before that day.');
  return { chargeId, cancelled: ended[0]!.cancelled };
};
