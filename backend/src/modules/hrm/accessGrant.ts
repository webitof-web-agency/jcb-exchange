import type { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { getActiveScopes, getHrmPermissions } from './access';
import { HrmAuthorizationError, HrmHttpError } from './errors';
import type { ScopeType } from './joiningRules';
import { HRM_PERMISSIONS, hasAllIndiaScope, hasHrmPermission } from './security';

/**
 * Who may hand out HRM access, shared by Confirm joining, the Access card, appointments and additional charges.
 * Kept apart from those services so they can all use it without importing each other.
 */

type Actor = { userId: string; role: string };
type Db = Prisma.TransactionClient | typeof prisma;

export const abilitiesOf = async (actor: Actor) => {
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  const scopes = await getActiveScopes(actor.userId);
  return {
    permissions,
    canConfirm: hasHrmPermission(permissions, HRM_PERMISSIONS.ONBOARDING_MANAGE) && hasHrmPermission(permissions, HRM_PERMISSIONS.EMPLOYEES_MANAGE),
    canCreateLogin: hasHrmPermission(permissions, 'users.create'),
    canLinkLogin: hasHrmPermission(permissions, 'users.read'),
    canUpdateLogin: hasHrmPermission(permissions, 'users.update'),
    canManageEmployees: hasHrmPermission(permissions, HRM_PERMISSIONS.EMPLOYEES_MANAGE),
    canManageScopes: hasHrmPermission(permissions, HRM_PERMISSIONS.SCOPE_MANAGE),
    allIndia: actor.role === 'SUPER_ADMIN' || hasHrmPermission(permissions, HRM_PERMISSIONS.SCOPE_ALL) || hasAllIndiaScope(scopes),
    ownStates: new Set(scopes.flatMap((scope) => (scope.scopeType === 'STATE' && scope.stateId ? [scope.stateId] : []))),
  };
};
export type Abilities = Awaited<ReturnType<typeof abilitiesOf>>;

/** Nobody can hand out wider access than they have themselves. */
export const assertCanGrant = (abilities: Abilities, scope: { scopeType: ScopeType; stateId?: number | null | undefined }) => {
  if (!abilities.canManageScopes) throw new HrmAuthorizationError('Giving HRM access needs the hrm.scope.manage permission.');
  if (abilities.allIndia) return;
  if (scope.scopeType === 'STATE' && scope.stateId && abilities.ownStates.has(scope.stateId)) return;
  if (scope.scopeType === 'DIRECT_REPORTS' || scope.scopeType === 'OWN') return;
  throw new HrmAuthorizationError('You can only give access you have yourself (your own state, or direct reports).');
};

/** A charge is given, changed or ended only by somebody whose own HR access covers that state. */
export const mayManageState = (abilities: Pick<Abilities, 'allIndia' | 'ownStates'>, stateId: number | null) =>
  abilities.allIndia || (stateId !== null && abilities.ownStates.has(stateId));

export const checkScopeShape = async (db: Db, scope: { scopeType: ScopeType; stateId?: number | null | undefined; orgUnitId?: string | null | undefined; source?: 'PLACEMENT' | 'MANUAL' | undefined }) => {
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
