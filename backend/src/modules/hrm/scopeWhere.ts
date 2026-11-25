import type { Prisma } from '@prisma/client';
import type { HrmScopeDescriptor } from './security';

/**
 * The same rules as canAccessHrmAssignment (security.ts), written as a database filter, so lists, counts and reports
 * of any size are narrowed in SQL instead of loading every employee into memory (and without giant "id IN (...)"
 * lists, which Postgres caps at 32 767 values).
 *
 * An employee is covered when their assignment in force today matches a scope, or - for somebody who has not
 * started yet (no assignment in force) - an upcoming one does. The caller always sees their own record.
 */

type UnitTree = ReadonlyArray<{ id: string; parentId: string | null }>;

/** The unit and every unit below it (includeChildren), from the org unit list. */
export const unitWithDescendants = (rootId: string, units: UnitTree) => {
  const children = new Map<string, string[]>();
  for (const unit of units) {
    if (!unit.parentId) continue;
    children.set(unit.parentId, [...(children.get(unit.parentId) ?? []), unit.id]);
  }
  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length && result.size < 10_000) {
    const next = queue.shift()!;
    for (const child of children.get(next) ?? []) {
      if (!result.has(child)) { result.add(child); queue.push(child); }
    }
  }
  return [...result];
};

/** One scope as a filter on an assignment row; null when the scope adds nothing (OWN) or is incomplete. */
export const scopeAssignmentMatcher = (scope: HrmScopeDescriptor, actorEmployeeId: string, units: UnitTree): Prisma.HrmEmploymentAssignmentWhereInput | null => {
  switch (scope.scopeType) {
    case 'DIRECT_REPORTS':
      return { managerEmployeeId: actorEmployeeId };
    case 'TEAM':
    case 'DEPARTMENT':
      if (!scope.orgUnitId) return null;
      return { orgUnitId: { in: scope.includeChildren ? unitWithDescendants(scope.orgUnitId, units) : [scope.orgUnitId] } };
    case 'REGION':
      return scope.operationalRegionId ? { operationalRegionId: scope.operationalRegionId } : null;
    case 'STATE':
      if (scope.stateId === null || scope.stateId === undefined) return null;
      // The state's own staff, not head office people who sit in that state.
      return { stateId: scope.stateId, OR: [{ officeUnitId: null }, { officeUnit: { type: { not: 'HEAD_OFFICE' } } }] };
    case 'HEAD_OFFICE':
      return scope.orgUnitId ? { OR: [{ officeUnitId: scope.orgUnitId }, { orgUnitId: scope.orgUnitId }] } : null;
    default:
      return null;
  }
};

export const buildScopeMatchers = (scopes: readonly HrmScopeDescriptor[], actorEmployeeId: string, units: UnitTree) =>
  scopes.map((scope) => scopeAssignmentMatcher(scope, actorEmployeeId, units)).filter((value): value is Prisma.HrmEmploymentAssignmentWhereInput => value !== null);

/**
 * People who were inside the scope at any time in [from, to): for month reports (joinings, exits), where somebody
 * who has left no longer has an open assignment.
 */
export const buildEmployeeScopeDuringWhere = (
  matchers: readonly Prisma.HrmEmploymentAssignmentWhereInput[],
  actorEmployeeId: string,
  from: Date,
  to: Date,
): Prisma.HrmEmployeeWhereInput => {
  if (!matchers.length) return { id: actorEmployeeId };
  return {
    OR: [
      { id: actorEmployeeId },
      {
        assignments: {
          some: {
            status: { in: ['ACTIVE', 'ENDED'] },
            effectiveFrom: { lt: to },
            AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] }, { OR: [...matchers] }],
          },
        },
      },
    ],
  };
};

/** The employee filter for a caller with these scopes (not all-India). */
export const buildEmployeeScopeWhere = (
  scopes: readonly HrmScopeDescriptor[],
  actorEmployeeId: string,
  units: UnitTree,
  today: Date,
): Prisma.HrmEmployeeWhereInput => {
  const matchers = buildScopeMatchers(scopes, actorEmployeeId, units);
  if (!matchers.length) return { id: actorEmployeeId };
  const current: Prisma.HrmEmploymentAssignmentWhereInput = { status: 'ACTIVE', effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] };
  const upcoming: Prisma.HrmEmploymentAssignmentWhereInput = { status: 'ACTIVE', effectiveFrom: { gt: today } };
  const anyScope: Prisma.HrmEmploymentAssignmentWhereInput = { OR: matchers };
  return {
    OR: [
      { id: actorEmployeeId },
      { assignments: { some: { AND: [current, anyScope] } } },
      { AND: [{ assignments: { none: current } }, { assignments: { some: { AND: [upcoming, anyScope] } } }] },
    ],
  };
};

/** Inside the scope on any assignment the person ever had (archived never-joined records keep only cancelled rows). */
export const buildEmployeeScopeEverWhere = (
  matchers: readonly Prisma.HrmEmploymentAssignmentWhereInput[],
  actorEmployeeId: string,
): Prisma.HrmEmployeeWhereInput => (matchers.length
  ? { OR: [{ id: actorEmployeeId }, { assignments: { some: { OR: [...matchers] } } }] }
  : { id: actorEmployeeId });
