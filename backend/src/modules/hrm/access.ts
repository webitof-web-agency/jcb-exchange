import type { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { getRequestPermissions, hasAnyOf } from '../finance-hub/http';
import { FH_PERMISSIONS } from '../finance-hub/permissions';
import { allowedAdminPermissions } from '../../utils/adminPermissions';
import { pickScopeAssignments } from './assignmentTimeline';
import { buildEmployeeScopeDuringWhere, buildEmployeeScopeEverWhere, buildEmployeeScopeWhere, buildScopeMatchers } from './scopeWhere';
import { istToday } from './istDate';
import { HrmAuthorizationError, HrmNotFoundError } from './errors';
import {
  canAccessHrmAssignment,
  hasAllIndiaScope,
  hasHrmPermission,
  resolveHrmPermissions,
  HRM_PERMISSIONS,
  type HrmAssignmentDescriptor,
  type HrmPermission,
  type HrmScopeDescriptor,
} from './security';

/** Today in India (the same day assignments, scopes and reports use). */
const today = () => istToday();

export const getHrmPermissions = async (userId: string, role: string): Promise<Set<string>> => {
  if (role === 'SUPER_ADMIN') return new Set(['ALL_ACCESS']);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      customRole: { select: { permissions: true } },
      adminPermissions: { select: { permission: true } },
    },
  });

  const custom = user?.customRole ? (Array.isArray(user.customRole.permissions) ? user.customRole.permissions : []) : null;
  const direct = (user?.adminPermissions ?? []).map((item) => item.permission);
  return resolveHrmPermissions(
    role,
    custom ? custom.filter((permission) => allowedAdminPermissions.has(permission)) : null,
    direct.filter((permission) => allowedAdminPermissions.has(permission)),
  );
};

/** Passes when the operator holds the permission, or any of the alternatives (for example "manage" also lets you read what you manage). */
export const requireHrmPermission = (permission: HrmPermission, ...alternatives: HrmPermission[]) => async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required.' });
  if (!['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'HRM access is restricted to internal operators.' });
  }

  try {
    const permissions = await getHrmPermissions(req.user.id, req.user.role);
    if (![permission, ...alternatives].some((candidate) => hasHrmPermission(permissions, candidate))) {
      return res.status(403).json({ success: false, error: 'You do not have the required HRM permission.' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Finance payroll data is only exposed when the operator has both HRM compensation and Finance payroll read access. */
export const requireFinancePayrollRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const permissions = await getRequestPermissions(req);
    if (!hasAnyOf(permissions, [FH_PERMISSIONS.payrollRead])) {
      return res.status(403).json({ success: false, error: 'You do not have Finance Hub payroll read permission.' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const getAssignmentDescriptors = async (employeeId: string): Promise<HrmAssignmentDescriptor[]> => {
  const now = today();
  const rows = await prisma.hrmEmploymentAssignment.findMany({
    where: { employeeId, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
    select: { employeeId: true, managerEmployeeId: true, orgUnitId: true, officeUnitId: true, operationalRegionId: true, stateId: true, effectiveFrom: true },
  });
  // Every row in force today, or every upcoming one for somebody who has not started yet (same rule as the lists).
  const picked = pickScopeAssignments(rows, now);
  const descriptors: HrmAssignmentDescriptor[] = [];
  for (const assignment of picked) {
    const { effectiveFrom: _effectiveFrom, ...descriptor } = assignment;
    const office = assignment.officeUnitId ? await prisma.hrmOrgUnit.findUnique({ where: { id: assignment.officeUnitId }, select: { type: true } }) : null;
    descriptors.push({ ...descriptor, officeIsHeadOffice: office?.type === 'HEAD_OFFICE', parentOrgUnitIds: await getParentOrgUnitIds(assignment.orgUnitId) });
  }
  return descriptors;
};

const getParentOrgUnitIds = async (orgUnitId: string): Promise<string[]> => {
  const parentOrgUnitIds: string[] = [];
  let currentOrgUnitId: string | null = orgUnitId;
  for (let depth = 0; depth < 20 && currentOrgUnitId; depth += 1) {
    const unit: { parentId: string | null } | null = await prisma.hrmOrgUnit.findUnique({
      where: { id: currentOrgUnitId },
      select: { parentId: true },
    });
    const parentId: string | null = unit?.parentId ?? null;
    if (!parentId) break;
    parentOrgUnitIds.push(parentId);
    currentOrgUnitId = parentId;
  }
  return parentOrgUnitIds;
};

export const getActiveScopes = async (userId: string): Promise<HrmScopeDescriptor[]> => {
  // Access starts / ends by the Indian calendar day (the same day HR sees on the Access card).
  const now = istToday();
  const scopes = await prisma.hrmAccessScope.findMany({
    where: {
      userId,
      activeFrom: { lte: now },
      OR: [{ activeTo: null }, { activeTo: { gte: now } }],
    },
    select: {
      scopeType: true,
      orgUnitId: true,
      operationalRegionId: true,
      stateId: true,
      includeChildren: true,
    },
  });
  return scopes.map((scope) => ({ ...scope, scopeType: scope.scopeType as HrmScopeDescriptor['scopeType'] }));
};

/** The caller sees every employee: Super Admin, hrm.scope.all or an ALL_INDIA access scope. */
export const hasAllIndiaAccess = async (actor: { userId: string; role: string }) => {
  if (actor.role === 'SUPER_ADMIN') return true;
  if (hasHrmPermission(await getHrmPermissions(actor.userId, actor.role), HRM_PERMISSIONS.SCOPE_ALL)) return true;
  return hasAllIndiaScope(await getActiveScopes(actor.userId));
};

/**
 * Company-wide masters (offices, departments, designations, shifts) are run by head office: on top of the route's
 * permission, the caller needs all-India HRM access. A State Manager manages people, not the company structure.
 */
export const requireAllIndiaHrm = (what: string) => async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required.' });
  try {
    if (await hasAllIndiaAccess({ userId: req.user.id, role: req.user.role })) return next();
    return res.status(403).json({ success: false, code: 'HRM_ALL_INDIA_REQUIRED', error: `${what} is managed by head office, so it needs all-India HRM access (hrm.scope.all or an All-India scope).` });
  } catch (error) {
    return next(error);
  }
};

/** How far the caller reaches, so an empty list can say why (no HR profile / no access scope yet). */
export const describeHrmReach = async (actor: { userId: string; role: string }) => {
  if (await hasAllIndiaAccess(actor)) return { allIndia: true, hasProfile: true, scopeCount: 0 };
  const [scopes, profile] = await Promise.all([
    getActiveScopes(actor.userId),
    prisma.hrmEmployee.findUnique({ where: { userId: actor.userId }, select: { id: true } }),
  ]);
  return { allIndia: false, hasProfile: Boolean(profile), scopeCount: scopes.length };
};

export const assertEmployeeAccess = async (input: {
  userId: string;
  role: string;
  employeeId: string;
  allowOwnWithoutScope?: boolean;
}) => {
  const employee = await prisma.hrmEmployee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, userId: true, archivedAt: true },
  });
  if (!employee) throw new HrmNotFoundError('Employee not found.');
  if (input.role === 'SUPER_ADMIN') return employee;

  const permissions = await getHrmPermissions(input.userId, input.role);
  if (hasHrmPermission(permissions, HRM_PERMISSIONS.SCOPE_ALL)) return employee;

  // An ALL_INDIA scope covers every employee, so it needs no HR profile of its own and no assignment on the
  // employee being opened (a new joiner dated in the future has none that is current yet).
  const scopes = await getActiveScopes(input.userId);
  if (hasAllIndiaScope(scopes)) return employee;

  const actor = await prisma.hrmEmployee.findUnique({ where: { userId: input.userId }, select: { id: true } });
  if (!actor) throw new HrmAuthorizationError('Your account is not linked to an HRM employee profile.');
  if (input.allowOwnWithoutScope !== false && employee.id === actor.id) return employee;

  const descriptors = await getAssignmentDescriptors(employee.id);
  if (descriptors.some((descriptor) => canAccessHrmAssignment(descriptor, actor.id, scopes))) return employee;
  // A never-joined (archived) record keeps only cancelled assignments. Whoever covered its placement sees it in the
  // Archived list and can open it read-only (every write refuses archived records).
  if (employee.archivedAt) {
    const units = scopes.some((scope) => scope.scopeType === 'DEPARTMENT' || scope.scopeType === 'TEAM')
      ? await prisma.hrmOrgUnit.findMany({ select: { id: true, parentId: true } })
      : [];
    const inScope = await prisma.hrmEmployee.count({ where: { AND: [{ id: employee.id }, buildEmployeeScopeEverWhere(buildScopeMatchers(scopes, actor.id, units), actor.id)] } });
    if (inScope) return employee;
  }
  if (!descriptors.length) throw new HrmAuthorizationError('The employee has no active assignment for scope evaluation.');
  throw new HrmAuthorizationError();
};

/**
 * The place an employee is being put into (a new assignment, a transfer) must itself be inside the caller's scope,
 * otherwise a scoped HR user could move or add people somewhere they can no longer see.
 */
export const assertAssignmentTargetAccess = async (input: {
  userId: string;
  role: string;
  target: { orgUnitId: string; officeUnitId?: string | null; stateId?: number | null; managerEmployeeId?: string | null; operationalRegionId?: string | null };
}) => {
  if (input.role === 'SUPER_ADMIN') return;
  const permissions = await getHrmPermissions(input.userId, input.role);
  if (hasHrmPermission(permissions, HRM_PERMISSIONS.SCOPE_ALL)) return;
  const scopes = await getActiveScopes(input.userId);
  if (hasAllIndiaScope(scopes)) return;
  const actor = await prisma.hrmEmployee.findUnique({ where: { userId: input.userId }, select: { id: true } });
  if (!actor) throw new HrmAuthorizationError('Your account is not linked to an HRM employee profile.');
  const descriptor: HrmAssignmentDescriptor = {
    employeeId: '',
    managerEmployeeId: input.target.managerEmployeeId ?? null,
    orgUnitId: input.target.orgUnitId,
    officeUnitId: input.target.officeUnitId ?? null,
    officeIsHeadOffice: input.target.officeUnitId
      ? (await prisma.hrmOrgUnit.findUnique({ where: { id: input.target.officeUnitId }, select: { type: true } }))?.type === 'HEAD_OFFICE'
      : false,
    operationalRegionId: input.target.operationalRegionId ?? null,
    stateId: input.target.stateId ?? null,
    parentOrgUnitIds: await getParentOrgUnitIds(input.target.orgUnitId),
  };
  // Where somebody is placed must be inside a LOCATION scope of the caller (state, head office, department, region).
  // Direct-reports / own scopes describe people, not places: naming yourself as the manager must not open any office.
  const placeScopes = scopes.filter((scope) => scope.scopeType !== 'DIRECT_REPORTS' && scope.scopeType !== 'OWN');
  if (!canAccessHrmAssignment(descriptor, actor.id, placeScopes)) {
    throw new HrmAuthorizationError('That office or department is outside your HRM access scope.');
  }
};

export const assertDocumentAccess = async (input: {
  userId: string;
  role: string;
  documentId: string;
}) => {
  const document = await prisma.hrmEmployeeDocument.findUnique({
    where: { id: input.documentId },
    select: { id: true, employeeId: true },
  });
  if (!document) throw new HrmNotFoundError('Employee document not found.');
  await assertEmployeeAccess({ ...input, employeeId: document.employeeId });
  return document;
};

/**
 * The caller's HRM scope as a database filter on employees (null = everyone). Used by lists, counts and reports so
 * they work for any number of employees; assertEmployeeAccess stays the per-record check.
 */
export const getEmployeeScopeWhere = async (input: { userId: string; role: string }): Promise<Prisma.HrmEmployeeWhereInput | null> => {
  if (input.role === 'SUPER_ADMIN') return null;
  if (hasHrmPermission(await getHrmPermissions(input.userId, input.role), HRM_PERMISSIONS.SCOPE_ALL)) return null;
  const scopes = await getActiveScopes(input.userId);
  if (hasAllIndiaScope(scopes)) return null;
  const actor = await prisma.hrmEmployee.findUnique({ where: { userId: input.userId }, select: { id: true } });
  if (!actor) return { id: { in: [] } };
  const units = scopes.some((scope) => scope.scopeType === 'DEPARTMENT' || scope.scopeType === 'TEAM')
    ? await prisma.hrmOrgUnit.findMany({ select: { id: true, parentId: true } })
    : [];
  return buildEmployeeScopeWhere(scopes, actor.id, units, today());
};

/**
 * The ids of every employee the caller may see (null = everyone), worked out by the database with the same filter
 * as getEmployeeScopeWhere. Prefer getEmployeeScopeWhere for lists and counts; this is for small membership checks.
 */
/** Like getEmployeeScopeWhere, but "inside the scope at any time in [from, to)" (month reports). Null = everyone. */
export const getEmployeeScopeDuringWhere = async (input: { userId: string; role: string }, from: Date, to: Date): Promise<Prisma.HrmEmployeeWhereInput | null> => {
  if (input.role === 'SUPER_ADMIN') return null;
  if (hasHrmPermission(await getHrmPermissions(input.userId, input.role), HRM_PERMISSIONS.SCOPE_ALL)) return null;
  const scopes = await getActiveScopes(input.userId);
  if (hasAllIndiaScope(scopes)) return null;
  const actor = await prisma.hrmEmployee.findUnique({ where: { userId: input.userId }, select: { id: true } });
  if (!actor) return { id: { in: [] } };
  const units = scopes.some((scope) => scope.scopeType === 'DEPARTMENT' || scope.scopeType === 'TEAM')
    ? await prisma.hrmOrgUnit.findMany({ select: { id: true, parentId: true } })
    : [];
  return buildEmployeeScopeDuringWhere(buildScopeMatchers(scopes, actor.id, units), actor.id, from, to);
};

/** "Inside the scope on any assignment ever" (archived records). Null = everyone. */
export const getEmployeeScopeEverWhere = async (input: { userId: string; role: string }): Promise<Prisma.HrmEmployeeWhereInput | null> => {
  if (input.role === 'SUPER_ADMIN') return null;
  if (hasHrmPermission(await getHrmPermissions(input.userId, input.role), HRM_PERMISSIONS.SCOPE_ALL)) return null;
  const scopes = await getActiveScopes(input.userId);
  if (hasAllIndiaScope(scopes)) return null;
  const actor = await prisma.hrmEmployee.findUnique({ where: { userId: input.userId }, select: { id: true } });
  if (!actor) return { id: { in: [] } };
  const units = scopes.some((scope) => scope.scopeType === 'DEPARTMENT' || scope.scopeType === 'TEAM')
    ? await prisma.hrmOrgUnit.findMany({ select: { id: true, parentId: true } })
    : [];
  return buildEmployeeScopeEverWhere(buildScopeMatchers(scopes, actor.id, units), actor.id);
};

export const getAccessibleEmployeeIds = async (input: { userId: string; role: string }): Promise<string[] | null> => {
  const where = await getEmployeeScopeWhere(input);
  if (!where) return null;
  const rows = await prisma.hrmEmployee.findMany({ where, select: { id: true } });
  return rows.map((row) => row.id);
};
