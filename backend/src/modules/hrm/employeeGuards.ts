import prisma from '../../lib/prisma';
import { HrmAuthorizationError, HrmConflictError, HrmNotFoundError } from './errors';
import { assertCanAssignCustomRole, loadOperatorPermissions, PermissionGrantError, permissionsNotHeld } from '../../utils/permissionGrant';

type Actor = { userId: string; role: string };

/**
 * A record that may still be changed: not archived (a never-joined record kept for history) and, unless the caller
 * allows it, not somebody who has left the company (leave, documents and the exit itself still are, for the final
 * settlement). Every mutating per-employee route calls this after its scope check, so no route is a side door around
 * the read-only rules.
 */
export const assertEmployeeWritable = async (employeeId: string, options: { allowLeft?: boolean } = {}) => {
  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { employeeCode: true, status: true, archivedAt: true } });
  if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');
  if (!options.allowLeft && (employee.status === 'EXITED' || employee.status === 'TERMINATED')) {
    throw new HrmConflictError(`${employee.employeeCode} has left the company, so this cannot be changed.`);
  }
  return employee;
};

/** A login role is given only by somebody who holds every permission in it (nobody widens access past their own). */
export const assertCanGiveRole = async (actor: Actor, customRoleId: string | null | undefined) => {
  try {
    await assertCanAssignCustomRole(actor, customRoleId);
  } catch (error) {
    if (error instanceof PermissionGrantError) throw new HrmAuthorizationError(error.message);
    throw error;
  }
};

/** The roles this person may give (role pickers only offer these). */
export const rolesActorCanGive = async (actor: Actor, select: { description?: boolean } = {}) => {
  const roles = await prisma.customRole.findMany({ select: { id: true, name: true, permissions: true, ...(select.description ? { description: true } : {}) }, orderBy: { name: 'asc' } });
  const held = await loadOperatorPermissions(actor);
  return roles
    .filter((role) => permissionsNotHeld(held, Array.isArray(role.permissions) ? role.permissions : []).length === 0)
    .map(({ permissions: _permissions, ...role }) => role);
};

/** Maker-checker on approvals: nobody approves or verifies things on their own HR record (Super Admin excepted). */
export const assertNotOwnRecord = async (actor: Actor, employeeId: string, what: string) => {
  if (actor.role === 'SUPER_ADMIN') return;
  const me = await prisma.hrmEmployee.findUnique({ where: { userId: actor.userId }, select: { id: true } });
  if (me?.id === employeeId) throw new HrmAuthorizationError(`${what} on your own record must be done by somebody else.`);
};
