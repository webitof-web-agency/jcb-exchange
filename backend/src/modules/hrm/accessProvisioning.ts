import type { Prisma } from '@prisma/client';
import { kindOfUnit } from './organisationCodes';

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;

/**
 * Placement scopes follow the person. When HR confirmed a State Manager's "own state" scope (source PLACEMENT),
 * a transfer or replacement moves it to the new state from the change date, and losing the manager role ends it.
 * Scopes HR gave by hand (MANUAL) are never touched here. A person who never had a placement scope gets none
 * automatically: access is only ever granted by HR.
 */
export const syncPlacementScopes = async (tx: Tx, employeeId: string, from: Date, actorUserId: string) => {
  const employee = await tx.hrmEmployee.findUnique({ where: { id: employeeId }, select: { userId: true } });
  if (!employee?.userId) return { moved: false };
  // Only a placement scope that is still open at the change follows the person. One HR ended (or an earlier exit
  // ended) is never brought back by a later move: access is only ever granted by HR.
  const stillOpen = await tx.hrmAccessScope.count({ where: { userId: employee.userId, source: 'PLACEMENT', scopeType: 'STATE', OR: [{ activeTo: null }, { activeTo: { gte: from } }] } });
  if (!stillOpen) return { moved: false };

  const pivot = await tx.hrmEmploymentAssignment.findFirst({
    where: { employeeId, status: 'ACTIVE', effectiveFrom: { lte: from }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    select: { isOfficeManager: true, officeUnit: { select: { type: true, stateId: true, isActive: true } } },
  });
  const desiredState = pivot?.isOfficeManager && pivot.officeUnit && kindOfUnit(pivot.officeUnit) === 'STATE' ? pivot.officeUnit.stateId : null;

  const open = await tx.hrmAccessScope.findMany({
    where: { userId: employee.userId, source: 'PLACEMENT', scopeType: 'STATE', OR: [{ activeTo: null }, { activeTo: { gte: from } }] },
    select: { id: true, stateId: true, activeFrom: true },
  });
  let moved = false;
  for (const scope of open) {
    if (scope.stateId === desiredState) continue;
    // Ends the day before the change; one that would only start on / after it never takes effect.
    const end = scope.activeFrom.getTime() >= from.getTime() ? new Date(scope.activeFrom.getTime() - DAY) : new Date(from.getTime() - DAY);
    await tx.hrmAccessScope.update({ where: { id: scope.id }, data: { activeTo: end } });
    moved = true;
  }
  if (desiredState && !open.some((scope) => scope.stateId === desiredState)) {
    await tx.hrmAccessScope.create({
      data: { userId: employee.userId, scopeType: 'STATE', stateId: desiredState, includeChildren: true, activeFrom: from, source: 'PLACEMENT', createdById: actorUserId },
    });
    moved = true;
  }
  return { moved };
};

/** Leaving the company ends every HRM access scope of the person's login on their last day. */
export const endScopesOnExit = async (tx: Tx, userId: string, lastDay: Date) => {
  await tx.hrmAccessScope.updateMany({
    where: { userId, activeFrom: { lte: lastDay }, OR: [{ activeTo: null }, { activeTo: { gt: lastDay } }] },
    data: { activeTo: lastDay },
  });
  // Scopes that would only start after the last day never take effect.
  await tx.hrmAccessScope.updateMany({
    where: { userId, activeFrom: { gt: lastDay }, OR: [{ activeTo: null }, { activeTo: { gt: lastDay } }] },
    data: { activeTo: lastDay },
  });
};
