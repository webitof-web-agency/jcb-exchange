import prisma from '../lib/prisma';
import { allowedAdminPermissions } from './adminPermissions';
import { permissionsNotHeld } from './permissionGrantRules';

export { permissionsNotHeld };

/**
 * "Nobody hands out more than they hold." Used wherever a permission list or a role is given to somebody: creating or
 * editing a role, creating or editing a login, and the HRM joining / access screens. A Super Admin holds everything;
 * everybody else can only give permissions they hold themselves (ALL_ACCESS only if they hold ALL_ACCESS).
 */

type Operator = { userId: string; role: string };
type RoleReader = { customRole: { findUnique: (args: { where: { id: string }; select: { permissions: true } }) => Promise<{ permissions: unknown } | null> } };

export class PermissionGrantError extends Error {
  readonly statusCode = 403;
}

const onlyKnown = (permissions: unknown): string[] => (Array.isArray(permissions)
  ? permissions.filter((permission): permission is string => typeof permission === 'string' && allowedAdminPermissions.has(permission))
  : []);

/**
 * The permissions an operator holds, read the same way as every route guard and the signed-in session: the custom
 * role's list when the login has a role, otherwise the login's direct grants.
 */
export const loadOperatorPermissions = async (operator: Operator): Promise<Set<string>> => {
  if (operator.role === 'SUPER_ADMIN') return new Set(['ALL_ACCESS']);
  const user = await prisma.user.findUnique({
    where: { id: operator.userId },
    select: { customRole: { select: { permissions: true } }, adminPermissions: { select: { permission: true } } },
  });
  if (user?.customRole) return new Set(onlyKnown(user.customRole.permissions));
  return new Set(onlyKnown((user?.adminPermissions ?? []).map((item) => item.permission)));
};

const describe = (missing: string[]) => `${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}`;

export const assertCanGrantPermissions = async (operator: Operator, wanted: Iterable<string>, what: string) => {
  if (operator.role === 'SUPER_ADMIN') return;
  const missing = permissionsNotHeld(await loadOperatorPermissions(operator), onlyKnown([...wanted]));
  if (missing.length) {
    throw new PermissionGrantError(`${what} would give access you do not have yourself (${describe(missing)}). Ask a Super Admin to do it.`);
  }
};

/** A role can be given to somebody only by an operator who holds every permission in it. */
export const assertCanAssignCustomRole = async (operator: Operator, customRoleId: string | null | undefined, db: RoleReader = prisma as unknown as RoleReader) => {
  if (!customRoleId || operator.role === 'SUPER_ADMIN') return;
  const role = await db.customRole.findUnique({ where: { id: customRoleId }, select: { permissions: true } });
  if (!role) return; // the caller reports an unknown role
  await assertCanGrantPermissions(operator, onlyKnown(role.permissions), 'Giving this role');
};
