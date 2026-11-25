import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { writeHrmAudit } from '../audit';
import { collapseSpaces } from '../designations';
import { HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import { NATIONAL_OPERATIONS_MANAGER_DESIGNATION, STATE_MANAGER_DESIGNATION, utcToday } from '../officeAssignments';
import { parseHrmInput, schemas } from '../validation';

type Actor = { userId: string; role: string; ipAddress?: string | null };
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The designation list HR picks from. Assignments keep the designation as text, so history stays readable even
 * after a designation is renamed or switched off; this service keeps the list and the text in step:
 *  - create: a new entry (case/space-insensitive unique);
 *  - rename: the entry and every assignment (and linked login title) that used the old spelling;
 *  - switch off / on: hidden from the pickers, existing assignments keep it;
 *  - delete: only when no assignment ever used it.
 * State Manager and National Operations Manager are built in (the HRM rules rely on them) and cannot be changed.
 */

export const SYSTEM_DESIGNATIONS = [STATE_MANAGER_DESIGNATION, NATIONAL_OPERATIONS_MANAGER_DESIGNATION] as const;

export const designationKey = (value: string) => collapseSpaces(value).toLowerCase();

const audit = (actor: Actor, entityId: string, action: string, after: unknown, before: unknown, tx: Db) => writeHrmAudit({
  actorUserId: actor.userId,
  // The designation list is part of the organisation set-up, so its changes are audited with the organisation.
  entityType: 'HRM_ORG_UNIT',
  entityId,
  action: `DESIGNATION_${action}`,
  ...(before !== undefined ? { before } : {}),
  ...(after !== undefined ? { after } : {}),
  ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
}, tx as never);

/** Makes sure the two built-in designations exist (migrations add them; this covers a database that skipped that). */
export const ensureSystemDesignations = async (db: Db = prisma) => {
  const existing = await db.hrmDesignation.findMany({ where: { nameKey: { in: SYSTEM_DESIGNATIONS.map(designationKey) } }, select: { nameKey: true, isSystem: true } });
  for (const name of SYSTEM_DESIGNATIONS) {
    const key = designationKey(name);
    const row = existing.find((entry) => entry.nameKey === key);
    if (!row) await db.hrmDesignation.upsert({ where: { nameKey: key }, update: {}, create: { name, nameKey: key, isSystem: true } });
    else if (!row.isSystem) await db.hrmDesignation.update({ where: { nameKey: key }, data: { isSystem: true, isActive: true } });
  }
};

type UsageRow = { key: string; total: bigint | number; current: bigint | number };

/** How many assignments (ever) and employees (today) use each designation, by case/space-insensitive spelling. */
const usageByKey = async (db: Db = prisma) => {
  const today = utcToday();
  const rows = await db.$queryRaw<UsageRow[]>`
    SELECT lower(regexp_replace(trim("designation"), '\\s+', ' ', 'g')) AS "key",
           COUNT(*) AS "total",
           COUNT(DISTINCT "employeeId") FILTER (WHERE "status" = 'ACTIVE' AND "effectiveFrom" <= ${today} AND ("effectiveTo" IS NULL OR "effectiveTo" >= ${today})) AS "current"
    FROM "HrmEmploymentAssignment"
    GROUP BY 1
  `;
  return new Map(rows.map((row) => [row.key, { total: Number(row.total), current: Number(row.current) }]));
};

const describeDeleteBlock = (row: { isSystem: boolean }, usage: { total: number; current: number }) => {
  if (row.isSystem) return 'This is a built-in designation that the HRM rules rely on.';
  const assignments = `${usage.total} assignment${usage.total === 1 ? '' : 's'}`;
  if (usage.current) return `${usage.current} employee${usage.current === 1 ? ' is' : 's are'} using it today (${assignments} in total). Switch it off instead.`;
  if (usage.total) return `It appears on ${assignments} from the past. Switch it off instead.`;
  return null;
};

/** The whole list with usage, for the manage screen. Switched-off entries are included. */
export const listDesignations = async () => {
  await ensureSystemDesignations();
  const [rows, usage] = await Promise.all([
    prisma.hrmDesignation.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
    usageByKey(),
  ]);
  return {
    designations: rows.map((row) => {
      const used = usage.get(row.nameKey) ?? { total: 0, current: 0 };
      const blocked = describeDeleteBlock(row, used);
      return {
        id: row.id,
        name: row.name,
        isActive: row.isActive,
        isSystem: row.isSystem,
        currentEmployees: used.current,
        totalAssignments: used.total,
        canDelete: blocked === null,
        deleteBlockedReason: blocked,
      };
    }),
  };
};

/** The active entries the pickers offer. */
export const listActiveDesignations = async (db: Db = prisma) => {
  await ensureSystemDesignations(db);
  const rows = await db.hrmDesignation.findMany({ where: { isActive: true }, select: { id: true, name: true, isSystem: true }, orderBy: { name: 'asc' } });
  return rows;
};

export const createDesignation = async (actor: Actor, rawInput: unknown) => {
  const input = parseHrmInput(schemas.createDesignation, rawInput);
  const name = collapseSpaces(input.name);
  const key = designationKey(name);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.hrmDesignation.findUnique({ where: { nameKey: key }, select: { id: true, isActive: true, name: true } });
    if (existing) {
      throw new HrmConflictError(existing.isActive
        ? `The designation “${existing.name}” already exists.`
        : `The designation “${existing.name}” already exists but is switched off. Switch it on instead of adding it again.`);
    }
    const created = await tx.hrmDesignation.create({ data: { name, nameKey: key, createdById: actor.userId }, select: { id: true, name: true, isActive: true, isSystem: true } });
    await audit(actor, created.id, 'CREATED', created, undefined, tx);
    return { designation: created };
  });
};

/** Rename and/or switch on/off. A rename rewrites the designation text on every assignment that used the old name. */
export const updateDesignation = async (actor: Actor, id: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.updateDesignation, rawInput);
  return prisma.$transaction(async (tx) => {
    const before = await tx.hrmDesignation.findUnique({ where: { id } });
    if (!before) throw new HrmNotFoundError('Designation not found.');
    const newName = input.name !== undefined ? collapseSpaces(input.name) : undefined;
    const renamed = newName !== undefined && newName !== before.name;
    const toggled = input.isActive !== undefined && input.isActive !== before.isActive;
    if (!renamed && !toggled) return { designation: { id: before.id, name: before.name, isActive: before.isActive, isSystem: before.isSystem }, assignmentsUpdated: 0 };
    if (before.isSystem && (renamed || input.isActive === false)) {
      throw new HrmConflictError(`“${before.name}” is a built-in designation that the HRM rules rely on, so it cannot be renamed or switched off.`);
    }

    let assignmentsUpdated = 0;
    let data: Prisma.HrmDesignationUpdateInput = {};
    if (renamed) {
      const newKey = designationKey(newName!);
      const clash = await tx.hrmDesignation.findFirst({ where: { nameKey: newKey, NOT: { id } }, select: { name: true } });
      if (clash) throw new HrmConflictError(`The designation “${clash.name}” already exists.`);
      data = { ...data, name: newName!, nameKey: newKey };
      // History keeps reading right: every assignment that used the old spelling now shows the new one.
      assignmentsUpdated = Number(await tx.$executeRaw`
        UPDATE "HrmEmploymentAssignment" SET "designation" = ${newName!}, "updatedAt" = now()
        WHERE lower(regexp_replace(trim("designation"), '\\s+', ' ', 'g')) = ${before.nameKey}
      `);
      // The login title of people linked to an HR record follows, when it was the old designation.
      await tx.$executeRaw`
        UPDATE "AdminProfile" SET "title" = ${newName!}
        WHERE lower(regexp_replace(trim("title"), '\\s+', ' ', 'g')) = ${before.nameKey}
          AND "userId" IN (SELECT "userId" FROM "HrmEmployee" WHERE "userId" IS NOT NULL)
      `;
    }
    if (toggled) data = { ...data, isActive: input.isActive! };
    const updated = await tx.hrmDesignation.update({ where: { id }, data, select: { id: true, name: true, isActive: true, isSystem: true } });
    await audit(actor, id, renamed ? 'RENAMED' : (updated.isActive ? 'REACTIVATED' : 'DEACTIVATED'), { ...updated, assignmentsUpdated }, { name: before.name, isActive: before.isActive }, tx);
    return { designation: updated, assignmentsUpdated };
  }, { timeout: 20000, maxWait: 5000 });
};

/** Deletes a designation nobody ever used. Anything used (even in the past) is switched off instead. */
export const deleteDesignation = async (actor: Actor, id: string) => {
  return prisma.$transaction(async (tx) => {
    const row = await tx.hrmDesignation.findUnique({ where: { id } });
    if (!row) throw new HrmNotFoundError('Designation not found.');
    const usage = (await usageByKey(tx)).get(row.nameKey) ?? { total: 0, current: 0 };
    const blocked = describeDeleteBlock(row, usage);
    if (blocked) throw new HrmConflictError(`“${row.name}” cannot be deleted. ${blocked}`);
    await tx.hrmDesignation.delete({ where: { id } });
    await audit(actor, id, 'DELETED', undefined, { name: row.name }, tx);
    return { deleted: true };
  });
};

/**
 * The designation text to store on an assignment. An existing active entry gives its own spelling; a switched-off
 * entry is refused; a name that is not on the list is added when the caller may manage the organisation (or the
 * caller is a legacy writer that always accepted free text), otherwise the caller is told to ask for it.
 */
export const resolveDesignationForWrite = async (
  db: Db,
  actor: Actor,
  value: string,
  options: { canCreate: boolean },
) => {
  const name = collapseSpaces(value);
  if (!name) throw new HrmHttpError(400, 'DESIGNATION_REQUIRED', 'Select the designation.');
  const key = designationKey(name);
  await ensureSystemDesignations(db);
  const existing = await db.hrmDesignation.findUnique({ where: { nameKey: key }, select: { id: true, name: true, isActive: true } });
  if (existing) {
    if (!existing.isActive) throw new HrmHttpError(409, 'DESIGNATION_INACTIVE', `The designation “${existing.name}” is switched off. Choose another one or ask an administrator to switch it on.`);
    return existing.name;
  }
  if (!options.canCreate) {
    throw new HrmHttpError(400, 'DESIGNATION_NOT_FOUND', `“${name}” is not on the designation list. Choose an existing designation, or ask an administrator to add it.`);
  }
  // INSERT ... ON CONFLICT DO NOTHING: a name somebody added a moment ago is used as theirs, and (unlike a failed
  // INSERT) it does not abort the surrounding transaction.
  const inserted = await db.hrmDesignation.createMany({ data: [{ name, nameKey: key, createdById: actor.userId }], skipDuplicates: true });
  const row = await db.hrmDesignation.findUnique({ where: { nameKey: key }, select: { id: true, name: true, isActive: true } });
  if (!row) throw new HrmHttpError(409, 'DESIGNATION_CONFLICT', 'The designation could not be added. Try again.');
  if (!row.isActive) throw new HrmHttpError(409, 'DESIGNATION_INACTIVE', `The designation “${row.name}” is switched off. Choose another one or ask an administrator to switch it on.`);
  if (inserted.count === 1) await audit(actor, row.id, 'CREATED', { id: row.id, name: row.name, via: 'ASSIGNMENT' }, undefined, db);
  return row.name;
};
