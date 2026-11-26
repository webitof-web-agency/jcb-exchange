import type { Prisma } from '@prisma/client';
import { activeChargeWhere, openChargeWhere, planChargeEnd } from './additionalChargeRules';
import { writeHrmAudit } from './audit';
import { utcToday } from './assignmentTimeline';

/**
 * The database side of ending additional charges and of the state access that comes with them, used inside the
 * transaction of whatever caused it (a transfer, an appointment, an exit, a new login). A charge and its access
 * always start and stop on the same days.
 */

type Tx = Prisma.TransactionClient;
type Actor = { userId: string; role: string; ipAddress?: string | null };

/** Charges of one office are changed one at a time (so two administrators cannot create overlapping ones). */
export const lockOfficeCharges = (tx: Tx, officeUnitId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-charge:${officeUnitId}`}))`;

export const chargeSelect = {
  id: true, employeeId: true, officeUnitId: true, effectiveFrom: true, effectiveTo: true, status: true,
  grantAccess: true, accessScopeId: true,
  officeUnit: { select: { id: true, name: true, stateId: true } },
} as const;

const audit = (tx: Tx, actor: Actor, employeeId: string, action: string, after: unknown) => writeHrmAudit({
  actorUserId: actor.userId,
  entityType: 'HRM_EMPLOYEE',
  entityId: employeeId,
  action,
  after,
  ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
}, tx);

export type EndedCharge = { id: string; employeeId: string; officeUnitId: string; officeName: string; cancelled: boolean };

/**
 * Ends (or cancels, when it had not started yet) every charge matching `where` that would still run after `lastDay`,
 * together with its state access. Returns what was ended.
 */
export const endChargesInTx = async (
  tx: Tx,
  actor: Actor,
  input: { where: Prisma.HrmAdditionalChargeWhereInput; lastDay: Date; reason: string },
): Promise<EndedCharge[]> => {
  const rows = await tx.hrmAdditionalCharge.findMany({
    where: { AND: [input.where, { status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.lastDay } }] }] },
    select: chargeSelect,
  });
  const ended: EndedCharge[] = [];
  for (const row of rows) {
    const plan = planChargeEnd(row, input.lastDay);
    if (plan.kind === 'NONE') continue;
    await tx.hrmAdditionalCharge.update({
      where: { id: row.id },
      data: { ...(plan.kind === 'CANCEL' ? { status: 'CANCELLED' } : { effectiveTo: plan.effectiveTo }), endedById: actor.userId },
    });
    if (row.accessScopeId) {
      // Never longer than it already was: an access somebody ended earlier stays ended.
      await tx.hrmAccessScope.updateMany({
        where: { id: row.accessScopeId, OR: [{ activeTo: null }, { activeTo: { gt: plan.scopeEnd } }] },
        data: { activeTo: plan.scopeEnd },
      });
    }
    await audit(tx, actor, row.employeeId, plan.kind === 'CANCEL' ? 'ADDITIONAL_CHARGE_CANCELLED' : 'ADDITIONAL_CHARGE_ENDED', {
      chargeId: row.id, officeUnitId: row.officeUnitId, office: row.officeUnit.name, reason: input.reason,
    });
    ended.push({ id: row.id, employeeId: row.employeeId, officeUnitId: row.officeUnitId, officeName: row.officeUnit.name, cancelled: plan.kind === 'CANCEL' });
  }
  return ended;
};

/** The state access of one charge: exactly the charge's own days. */
export const createChargeAccess = async (
  tx: Tx,
  actor: Actor,
  charge: { id: string; stateId: number; effectiveFrom: Date; effectiveTo: Date | null },
  userId: string,
) => {
  const scope = await tx.hrmAccessScope.create({
    data: {
      userId, scopeType: 'STATE', stateId: charge.stateId, includeChildren: true,
      activeFrom: charge.effectiveFrom, activeTo: charge.effectiveTo, source: 'CHARGE', createdById: actor.userId,
    },
    select: { id: true },
  });
  await tx.hrmAdditionalCharge.update({ where: { id: charge.id }, data: { accessScopeId: scope.id } });
  return scope.id;
};

/**
 * A login was just linked to somebody who holds charges that were meant to come with access: give it now, but only
 * for the states the person linking may give themselves (the rest shows on the access review).
 */
export const createMissingChargeAccess = async (
  tx: Tx,
  actor: Actor,
  employeeId: string,
  userId: string,
  mayGive: (stateId: number) => boolean,
) => {
  const rows = await tx.hrmAdditionalCharge.findMany({
    where: { employeeId, grantAccess: true, accessScopeId: null, ...openChargeWhere(utcToday()) },
    select: chargeSelect,
  });
  let created = 0;
  for (const row of rows) {
    if (!row.officeUnit.stateId || !mayGive(row.officeUnit.stateId)) continue;
    await createChargeAccess(tx, actor, { id: row.id, stateId: row.officeUnit.stateId, effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo }, userId);
    created += 1;
  }
  return created;
};

/** Working people holding a charge for this office today (a suspended or departed holder does not cover it). */
export const countActiveChargeHolders = (tx: Tx, officeUnitId: string, workingStatuses: readonly string[], today = utcToday()) =>
  tx.hrmAdditionalCharge.count({
    where: {
      officeUnitId,
      ...activeChargeWhere(today),
      employee: { status: { in: workingStatuses as never }, archivedAt: null },
    },
  });
