import type { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { writeHrmAudit } from './audit';
import { HrmHttpError } from './errors';
import { buildUnitCode, defaultStateOfficeName, UNIT_CODE_PREFIX } from './organisationCodes';

/**
 * Shared building blocks for the head office and state office units. They live apart from the Organisation page
 * service so the employee onboarding and office lifecycle services can use them without importing each other.
 */

export type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
type Actor = { userId: string; role: string; ipAddress?: string | null };

/** Raipur is the head office; the head office location is resolved from the location master by name. */
export const HEAD_OFFICE_LOCATION = { state: 'Chhattisgarh', city: 'Raipur' } as const;

export const resolveHeadOffice = async () => {
  const state = await prisma.state.findFirst({
    where: { name: { equals: HEAD_OFFICE_LOCATION.state, mode: 'insensitive' }, country: { iso2: 'IN' } },
    select: { id: true, name: true },
  });
  if (!state) return null;
  const city = await prisma.city.findFirst({
    where: { stateId: state.id, name: { equals: HEAD_OFFICE_LOCATION.city, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  return city ? { stateId: state.id, stateName: state.name, cityId: city.id, cityName: city.name } : null;
};

/** Serialises code generation so two administrators adding units at once never get the same code. */
export const lockOrgUnitCodes = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'hrm-org-unit-code'}))`;

export const takenUnitCodes = async (tx: Tx, prefix: string) => {
  const rows = await tx.hrmOrgUnit.findMany({ where: { code: { startsWith: `${prefix}-` } }, select: { code: true } });
  return new Set(rows.map((row) => row.code.toUpperCase()));
};

export const findActiveHeadOffice = (db: Db) => db.hrmOrgUnit.findFirst({
  where: { type: 'HEAD_OFFICE', isActive: true },
  select: { id: true, name: true, stateId: true, cityId: true },
  orderBy: { createdAt: 'asc' },
});

export const findActiveStateOffice = (db: Db, stateId: number) => db.hrmOrgUnit.findFirst({
  where: { type: 'REGION', stateId, isActive: true },
  select: { id: true, name: true, stateId: true },
});

/**
 * The office an assignment at this place belongs to, for assignment writers that only know the location: the head
 * office when it is the head office city, otherwise the state's office. Null when the place has no office (yet).
 */
export const deriveOfficeUnitId = async (db: Db, stateId: number | null | undefined, cityId: number | null | undefined) => {
  if (!stateId) return null;
  const headOffice = await findActiveHeadOffice(db);
  if (headOffice && cityId && headOffice.stateId === stateId && headOffice.cityId === cityId) return headOffice.id;
  return (await findActiveStateOffice(db, stateId))?.id ?? null;
};

/** Writes the state office row. The caller already holds the org-unit code lock inside its transaction. */
export const createStateOfficeUnit = async (
  tx: Tx,
  actor: Actor,
  state: { id: number; name: string; stateCode: string | null },
  name?: string,
) => {
  const code = buildUnitCode(UNIT_CODE_PREFIX.STATE, state.stateCode || state.name, await takenUnitCodes(tx, UNIT_CODE_PREFIX.STATE));
  const created = await tx.hrmOrgUnit.create({
    data: { code, name: name?.trim() || defaultStateOfficeName(state.name), type: 'REGION', stateId: state.id, createdById: actor.userId },
    select: { id: true, code: true, name: true, type: true, isActive: true, parentId: true, stateId: true, cityId: true },
  });
  await writeHrmAudit({
    actorUserId: actor.userId,
    entityType: 'HRM_ORG_UNIT',
    entityId: created.id,
    action: 'CREATED',
    after: created,
    ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
  }, tx);
  return created;
};

/**
 * The state office of a state, created on the spot when the state has none yet. Used when an employee is placed
 * in a state nobody has opened an office for: the administrator who may manage the organisation gets it
 * created in the same transaction, anybody else is told to ask for it.
 */
export const ensureStateOffice = async (tx: Tx, actor: Actor, stateId: number, canManageOrg: boolean) => {
  const existing = await findActiveStateOffice(tx, stateId);
  if (existing) return { unit: existing, created: false };

  const state = await tx.state.findFirst({ where: { id: stateId, country: { iso2: 'IN' } }, select: { id: true, name: true, stateCode: true } });
  if (!state) throw new HrmHttpError(400, 'STATE_NOT_FOUND', 'The selected state was not found.');
  const switchedOff = await tx.hrmOrgUnit.findFirst({ where: { type: 'REGION', stateId }, select: { id: true } });
  if (switchedOff) throw new HrmHttpError(409, 'STATE_OFFICE_INACTIVE', `The ${state.name} state office is switched off. Switch it on from the Organisation page first.`);
  if (!canManageOrg) throw new HrmHttpError(409, 'STATE_OFFICE_MISSING', `${state.name} has no state office yet. Ask an administrator to add it from the Organisation page.`);

  await lockOrgUnitCodes(tx);
  // Re-check under the lock: another administrator may have just added it.
  const again = await findActiveStateOffice(tx, stateId);
  if (again) return { unit: again, created: false };
  const created = await createStateOfficeUnit(tx, actor, state);
  return { unit: { id: created.id, name: created.name, stateId: created.stateId }, created: true };
};
