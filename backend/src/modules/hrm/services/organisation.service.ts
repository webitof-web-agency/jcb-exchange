import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { getActiveScopes, getEmployeeScopeWhere, getHrmPermissions, hasAllIndiaAccess } from '../access';
import { writeHrmAudit } from '../audit';
import { activeChargeWhere, openChargeWhere } from '../additionalChargeRules';
import { HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import {
  currentAssignmentWhere, findNationalOperationsManagers, listCurrentOfficeManagers, NOT_STAFF_STATUSES, openAssignmentWhere, utcToday, WORKING_STATUSES,
} from '../officeAssignments';
import { createStateOfficeUnit, findDefaultHeadOffice, lockOrgUnitCodes, resolveHeadOffice, takenUnitCodes } from '../officeUnits';
import { buildUnitCode, defaultStateOfficeName, kindOfUnit, normaliseNames, UNIT_CODE_PREFIX, type OrganisationKind } from '../organisationCodes';
import { HRM_PERMISSIONS, hasAllIndiaScope, hasHrmPermission } from '../security';
import { parseHrmInput, schemas } from '../validation';

type Actor = { userId: string; role: string; ipAddress?: string | null };
type Tx = Prisma.TransactionClient;

const LEFT_COMPANY = ['EXITED', 'TERMINATED'] as const;

const audit = (actor: Actor, entityId: string, action: string, after?: unknown, before?: unknown, client?: Tx) => writeHrmAudit({
  actorUserId: actor.userId,
  entityType: 'HRM_ORG_UNIT',
  entityId,
  action,
  ...(before !== undefined ? { before } : {}),
  ...(after !== undefined ? { after } : {}),
  ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
}, client);

const unitSelect = {
  id: true, code: true, name: true, type: true, isActive: true, parentId: true, stateId: true, cityId: true,
  parent: { select: { id: true, name: true } },
  state: { select: { id: true, name: true } },
  city: { select: { id: true, name: true } },
  _count: { select: { children: true } },
} as const;

const personName = (employee: { legalName: string; preferredName: string | null }) => employee.preferredName || employee.legalName;

/**
 * Everything the Organisation page shows: head office, departments and state offices with how many employees work
 * there (inside the caller's scope), who manages each state office, and the India-wide coverage numbers.
 */
export const getOrganisation = async (actor: Actor) => {
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  const canManage = hasHrmPermission(permissions, HRM_PERMISSIONS.ORG_MANAGE);
  const canManageAssignments = hasHrmPermission(permissions, HRM_PERMISSIONS.ASSIGNMENTS_MANAGE);
  const scopes = await getActiveScopes(actor.userId);
  const allIndia = actor.role === 'SUPER_ADMIN' || hasHrmPermission(permissions, HRM_PERMISSIONS.SCOPE_ALL) || hasAllIndiaScope(scopes);
  // All-India users see every employee; only narrower scopes need the per-employee check.
  const scopeWhere = allIndia ? null : await getEmployeeScopeWhere(actor);
  const today = utcToday();

  const [units, assignmentRows, managerRows, indiaStates, headOfficeLocation, nationalOperationsManagers, upcomingRows, chargeRows] = await Promise.all([
    prisma.hrmOrgUnit.findMany({ where: canManage ? {} : { isActive: true }, select: unitSelect, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
    prisma.hrmEmploymentAssignment.findMany({
      where: {
        ...currentAssignmentWhere(today),
        employee: { status: { notIn: [...NOT_STAFF_STATUSES] }, archivedAt: null, ...(scopeWhere ? { AND: [scopeWhere] } : {}) },
      },
      select: { employeeId: true, orgUnitId: true, officeUnitId: true },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    }),
    // Who manages each office is organisation structure, not employee data, so it is not narrowed by the caller's scope.
    prisma.hrmEmploymentAssignment.findMany({
      where: {
        isOfficeManager: true,
        officeUnitId: { not: null },
        ...currentAssignmentWhere(today),
        employee: { status: { in: [...WORKING_STATUSES] }, archivedAt: null },
      },
      select: { officeUnitId: true, employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true } } },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.state.findMany({ where: { country: { iso2: 'IN' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    resolveHeadOffice(),
    findNationalOperationsManagers(),
    // Managers who are joining (pre-joining, or their assignment starts later): an office with only these is
    // still vacant today, but HR sees who is coming and when instead of appointing somebody else.
    prisma.hrmEmploymentAssignment.findMany({
      where: {
        isOfficeManager: true,
        officeUnitId: { not: null },
        status: 'ACTIVE',
        effectiveTo: null,
        employee: { archivedAt: null, status: { in: ['PRE_ONBOARDING', 'ONBOARDING', 'ACTIVE'] } },
        OR: [{ effectiveFrom: { gt: today } }, { employee: { status: 'PRE_ONBOARDING' } }],
      },
      select: { officeUnitId: true, effectiveFrom: true, employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true } } },
      orderBy: { effectiveFrom: 'asc' },
    }),
    // Offices looked after through an additional charge today (organisation structure, like managers).
    prisma.hrmAdditionalCharge.findMany({
      where: { ...activeChargeWhere(today), employee: { status: { in: [...WORKING_STATUSES] }, archivedAt: null } },
      select: { officeUnitId: true, effectiveTo: true, employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true } } },
      orderBy: { effectiveFrom: 'asc' },
    }),
  ]);
  const chargeHoldersByOffice = new Map<string, Array<{ id: string; employeeCode: string; name: string; until: Date | null }>>();
  for (const row of chargeRows) {
    const list = chargeHoldersByOffice.get(row.officeUnitId) ?? [];
    if (!list.some((entry) => entry.id === row.employee.id)) list.push({ id: row.employee.id, employeeCode: row.employee.employeeCode, name: personName(row.employee), until: row.effectiveTo });
    chargeHoldersByOffice.set(row.officeUnitId, list);
  }
  const upcomingByOffice = new Map<string, Array<{ id: string; employeeCode: string; name: string; joiningDate: Date }>>();
  for (const row of upcomingRows) {
    const list = upcomingByOffice.get(row.officeUnitId!) ?? [];
    if (!list.some((entry) => entry.id === row.employee.id)) list.push({ id: row.employee.id, employeeCode: row.employee.employeeCode, name: personName(row.employee), joiningDate: row.effectiveFrom });
    upcomingByOffice.set(row.officeUnitId!, list);
  }

  // One row per employee: their most recent current assignment.
  const byDepartment = new Map<string, number>();
  const byOffice = new Map<string, number>();
  const counted = new Set<string>();
  let unplacedStaff = 0;
  const bump = <K,>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const row of assignmentRows) {
    if (counted.has(row.employeeId)) continue;
    counted.add(row.employeeId);
    bump(byDepartment, row.orgUnitId);
    if (row.officeUnitId) bump(byOffice, row.officeUnitId);
    else unplacedStaff += 1;
  }

  const managersByOffice = new Map<string, Array<{ id: string; employeeCode: string; name: string }>>();
  for (const row of managerRows) {
    const list = managersByOffice.get(row.officeUnitId!) ?? [];
    if (!list.some((entry) => entry.id === row.employee.id)) list.push({ id: row.employee.id, employeeCode: row.employee.employeeCode, name: personName(row.employee) });
    managersByOffice.set(row.officeUnitId!, list);
  }

  const mapped = units.map((unit) => {
    const kind: OrganisationKind = kindOfUnit(unit);
    const isOffice = kind === 'STATE' || kind === 'HEAD_OFFICE';
    const managers = isOffice ? managersByOffice.get(unit.id) ?? [] : [];
    const chargeHolders = isOffice ? chargeHoldersByOffice.get(unit.id) ?? [] : [];
    return {
      id: unit.id,
      code: unit.code,
      name: unit.name,
      type: unit.type,
      kind,
      isActive: unit.isActive,
      parent: unit.parent,
      state: unit.state,
      city: unit.city,
      managers,
      chargeHolders,
      upcomingManagers: isOffice ? upcomingByOffice.get(unit.id) ?? [] : [],
      childCount: unit._count.children,
      employeeCount: isOffice ? byOffice.get(unit.id) ?? 0 : byDepartment.get(unit.id) ?? 0,
      // A state office nobody manages (posted there or holding an additional charge) is "vacant".
      coverage: kind === 'STATE' && unit.isActive ? (managers.length || chargeHolders.length ? 'COVERED' as const : 'VACANT' as const) : null,
    };
  });

  const activeStates = mapped.filter((unit) => unit.kind === 'STATE' && unit.isActive);
  const activeStateIds = new Set(activeStates.map((unit) => unit.state?.id));
  const headOfficeUnits = mapped.filter((unit) => unit.kind === 'HEAD_OFFICE' && unit.isActive);
  // The same answer every form and server rule uses (an older database may have none marked yet).
  const defaultHeadOfficeId = (await findDefaultHeadOffice(prisma))?.id ?? null;
  return {
    scope: { allIndia },
    // Offices, departments and designations are head office masters (all-India access, see routes.ts).
    abilities: { canManage: canManage && allIndia, canManageAssignments },
    headOfficeLocation,
    indiaStateCount: indiaStates.length,
    states: indiaStates,
    availableStates: indiaStates.filter((state) => !activeStateIds.has(state.id)),
    units: mapped.map((unit) => ({ ...unit, isDefault: unit.id === defaultHeadOfficeId })),
    nationalOperationsManagers,
    coverage: {
      totalStates: indiaStates.length,
      officesSetUp: activeStates.length,
      covered: activeStates.filter((unit) => unit.coverage === 'COVERED').length,
      vacant: activeStates.filter((unit) => unit.coverage === 'VACANT').length,
      // Covered only through an additional charge: no manager of their own yet.
      coveredByCharge: activeStates.filter((unit) => !unit.managers.length && unit.chargeHolders.length).length,
      notSetUp: indiaStates.filter((state) => !activeStateIds.has(state.id)).length,
      staffInStates: activeStates.reduce((sum, unit) => sum + unit.employeeCount, 0),
      staffInHeadOffice: headOfficeUnits.reduce((sum, unit) => sum + unit.employeeCount, 0),
      unplacedStaff,
    },
  };
};

const tidyName = (value: string) => value.replace(/\s+/g, ' ').trim();
const nameKey = (value: string) => tidyName(value).toLowerCase();

/** Same name, ignoring case and spacing. Compared in code: a database ILIKE would treat "_" and "%" as wildcards. */
const findNamed = async (tx: Tx, where: Prisma.HrmOrgUnitWhereInput, name: string, excludeId?: string) => {
  const key = nameKey(name);
  const candidates = await tx.hrmOrgUnit.findMany({
    where: { ...where, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true, name: true, isActive: true },
    orderBy: { isActive: 'desc' },
  });
  return candidates.find((unit) => nameKey(unit.name) === key) ?? null;
};

const duplicateError = (what: string, existing: { isActive: boolean }) =>
  new HrmConflictError(existing.isActive ? `${what} already exists.` : `${what} already exists but is inactive. Reactivate it instead of adding it again.`);

/** An Indian state with one of its cities, from the location master. */
const findIndianPlace = async (stateId: number, cityId: number) => {
  const city = await prisma.city.findFirst({
    where: { id: cityId, stateId, state: { country: { iso2: 'IN' } } },
    select: { id: true, name: true, state: { select: { id: true, name: true } } },
  });
  if (!city?.state) throw new HrmHttpError(400, 'LOCATION_INVALID', 'The selected city does not belong to the selected state.');
  return { stateId: city.state.id, stateName: city.state.name, cityId: city.id, cityName: city.name };
};

/**
 * Marks one head office as the default and takes the mark off every other one. The callers hold the unit lock, so two
 * administrators cannot leave two defaults behind.
 */
const makeDefaultHeadOffice = async (tx: Tx, actor: Actor, unitId: string) => {
  const previous = await tx.hrmOrgUnit.findMany({ where: { type: 'HEAD_OFFICE', isDefault: true, NOT: { id: unitId } }, select: { id: true, name: true } });
  if (previous.length) await tx.hrmOrgUnit.updateMany({ where: { id: { in: previous.map((unit) => unit.id) } }, data: { isDefault: false } });
  const marked = await tx.hrmOrgUnit.updateMany({ where: { id: unitId, isDefault: false }, data: { isDefault: true } });
  if (marked.count || previous.length) await audit(actor, unitId, 'DEFAULT_HEAD_OFFICE_SET', { isDefault: true }, { previousDefault: previous.map((unit) => unit.name) }, tx);
};

/** After any change: whenever there is an active head office, exactly one of them is the default. */
const ensureDefaultHeadOffice = async (tx: Tx, actor: Actor) => {
  const current = await findDefaultHeadOffice(tx);
  if (current) await makeDefaultHeadOffice(tx, actor, current.id);
  else await tx.hrmOrgUnit.updateMany({ where: { type: 'HEAD_OFFICE', isDefault: true }, data: { isDefault: false } });
};

/** The default head office is not switched off or deleted while there are others: HR first chooses the new default. */
const defaultHeadOfficeBlock = async (db: Tx | typeof prisma, unit: { id: string }) => {
  const current = await findDefaultHeadOffice(db);
  if (current?.id !== unit.id) return null;
  const others = await db.hrmOrgUnit.count({ where: { type: 'HEAD_OFFICE', isActive: true, NOT: { id: unit.id } } });
  return others ? 'It is the default head office. Make another head office the default first.' : null;
};

/** The departments of a head office that goes away move to the default one (to none when it was the last). */
const moveDepartmentsToDefault = async (tx: Tx, actor: Actor, fromId: string) => {
  const departments = await tx.hrmOrgUnit.findMany({ where: { parentId: fromId, type: 'DEPARTMENT' }, select: { id: true, name: true } });
  if (!departments.length) return;
  const fallback = await findDefaultHeadOffice(tx);
  const parentId = fallback && fallback.id !== fromId ? fallback.id : null;
  for (const department of departments) {
    await tx.hrmOrgUnit.update({ where: { id: department.id }, data: { parentId } });
    await audit(actor, department.id, parentId ? 'PARENT_SET' : 'PARENT_REMOVED', { parentId }, { parentId: fromId }, tx);
  }
};

export const createOrganisationUnit = async (actor: Actor, rawInput: unknown) => {
  const input = parseHrmInput(schemas.createOrganisationUnit, rawInput);

  const state = input.stateId
    ? await prisma.state.findFirst({ where: { id: input.stateId, country: { iso2: 'IN' } }, select: { id: true, name: true, stateCode: true } })
    : null;
  if (input.stateId && !state) throw new HrmHttpError(400, 'STATE_NOT_FOUND', 'The selected state was not found.');
  const city = input.cityId
    ? await prisma.city.findFirst({ where: { id: input.cityId, stateId: input.stateId ?? -1 }, select: { id: true, name: true } })
    : null;
  if (input.cityId && !city) throw new HrmHttpError(400, 'LOCATION_INVALID', 'The selected city does not belong to the selected state.');

  const name = input.kind === 'STATE' ? (tidyName(input.name ?? '') || defaultStateOfficeName(state!.name)) : tidyName(input.name!);
  if (name.length < 2) throw new HrmHttpError(400, 'NAME_TOO_SHORT', 'Enter the name (at least 2 characters).');

  const unit = await prisma.$transaction(async (tx) => {
    await lockOrgUnitCodes(tx);

    if (input.kind === 'STATE') {
      const existing = await tx.hrmOrgUnit.findFirst({ where: { type: 'REGION', stateId: state!.id }, select: { id: true, isActive: true }, orderBy: { isActive: 'desc' } });
      if (existing) throw duplicateError(`A state office for ${state!.name}`, existing);
      return createStateOfficeUnit(tx, actor, state!, name);
    }

    let parentId: string | null = null;
    if (input.kind === 'DEPARTMENT') {
      if (input.parentId) {
        const parent = await tx.hrmOrgUnit.findFirst({ where: { id: input.parentId, type: 'HEAD_OFFICE', isActive: true }, select: { id: true } });
        if (!parent) throw new HrmHttpError(400, 'PARENT_NOT_FOUND', 'The selected head office was not found or is inactive.');
        parentId = parent.id;
      } else {
        // No head office chosen: a new department belongs to the default one.
        parentId = (await findDefaultHeadOffice(tx))?.id ?? null;
      }
      const existing = await findNamed(tx, { type: 'DEPARTMENT' }, name);
      if (existing) throw duplicateError(`The department “${name}”`, existing);
    } else {
      const existing = await findNamed(tx, { type: 'HEAD_OFFICE' }, name);
      if (existing) throw duplicateError(`The head office “${name}”`, existing);
    }

    const prefix = UNIT_CODE_PREFIX[input.kind];
    const code = buildUnitCode(prefix, name, await takenUnitCodes(tx, prefix));
    const created = await tx.hrmOrgUnit.create({
      data: { code, name, type: input.kind, parentId, stateId: state?.id ?? null, cityId: city?.id ?? null, createdById: actor.userId },
      select: { id: true, code: true, name: true, type: true, isActive: true, parentId: true, stateId: true, cityId: true },
    });
    await audit(actor, created.id, 'CREATED', created, undefined, tx);
    if (input.kind === 'HEAD_OFFICE') {
      if (input.isDefault) await makeDefaultHeadOffice(tx, actor, created.id);
      else await ensureDefaultHeadOffice(tx, actor);
    }
    return created;
  });
  return { unit };
};

/**
 * Adds the state office of several states in one go (the "select the states" flow). States that already have an
 * office are skipped and reported, so running it twice is harmless.
 */
export const createStateOffices = async (actor: Actor, rawInput: unknown) => {
  const input = parseHrmInput(schemas.createStateOffices, rawInput);
  const stateIds = [...new Set(input.stateIds)];
  const states = await prisma.state.findMany({
    where: { id: { in: stateIds }, country: { iso2: 'IN' } },
    select: { id: true, name: true, stateCode: true },
    orderBy: { name: 'asc' },
  });
  if (states.length !== stateIds.length) throw new HrmHttpError(400, 'STATE_NOT_FOUND', 'One of the selected states was not found.');

  return prisma.$transaction(async (tx) => {
    await lockOrgUnitCodes(tx);
    const existing = await tx.hrmOrgUnit.findMany({ where: { type: 'REGION', stateId: { in: stateIds } }, select: { stateId: true, isActive: true } });
    const existingByState = new Map(existing.map((unit) => [unit.stateId!, unit.isActive]));
    const created: Array<{ id: string; name: string; stateId: number }> = [];
    const skipped: Array<{ stateId: number; name: string; reason: 'EXISTS' | 'SWITCHED_OFF' }> = [];
    for (const state of states) {
      if (existingByState.has(state.id)) {
        skipped.push({ stateId: state.id, name: state.name, reason: existingByState.get(state.id) ? 'EXISTS' : 'SWITCHED_OFF' });
        continue;
      }
      const unit = await createStateOfficeUnit(tx, actor, state);
      created.push({ id: unit.id, name: unit.name, stateId: state.id });
    }
    return { created, skipped };
  }, { timeout: 20000, maxWait: 5000 });
};

/** People still placed in a unit: current or upcoming assignments of employees who have not left. */
const placedEmployees = async (where: Prisma.HrmEmploymentAssignmentWhereInput) => {
  const rows = await prisma.hrmEmploymentAssignment.findMany({
    where: { ...where, ...openAssignmentWhere(), employee: { status: { notIn: [...LEFT_COMPANY] }, archivedAt: null } },
    select: { employeeId: true },
    distinct: ['employeeId'],
  });
  return rows.length;
};

/** Renames a unit or switches it on/off. A unit that still has people or active sub-units cannot be switched off. */
export const updateOrganisationUnit = async (actor: Actor, unitId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.updateOrganisationUnit, rawInput);
  const before = await prisma.hrmOrgUnit.findUnique({ where: { id: unitId }, select: { id: true, code: true, name: true, type: true, isActive: true, parentId: true, stateId: true, cityId: true } });
  if (!before) throw new HrmNotFoundError('Organisation unit not found.');
  const kind = kindOfUnit(before);
  const isOffice = kind === 'STATE' || kind === 'HEAD_OFFICE';
  const newName = input.name !== undefined ? tidyName(input.name) : undefined;
  if (newName !== undefined && newName.length < 2) throw new HrmHttpError(400, 'NAME_TOO_SHORT', 'Enter the name (at least 2 characters).');
  const renamed = newName !== undefined && newName !== before.name;
  const toggled = input.isActive !== undefined && input.isActive !== before.isActive;
  const moved = input.stateId !== undefined && (input.stateId !== before.stateId || input.cityId !== before.cityId);
  if (moved) {
    if (kind !== 'HEAD_OFFICE') throw new HrmHttpError(400, 'LOCATION_NOT_EDITABLE', 'Only a head office can be moved to another state or city.');
    // Existing assignments keep the place they recorded; new head office placements use the new one.
    await findIndianPlace(input.stateId!, input.cityId!);
  }
  if (input.isDefault) {
    if (kind !== 'HEAD_OFFICE') throw new HrmHttpError(400, 'NOT_A_HEAD_OFFICE', 'Only a head office can be the default.');
    if (!(input.isActive ?? before.isActive)) throw new HrmConflictError(`“${before.name}” is switched off. Switch it on before making it the default.`);
    const place = moved ? input : before;
    if (!place.stateId || !place.cityId) throw new HrmConflictError(`Set the state and city of “${before.name}” before making it the default.`);
  }
  if (!renamed && !toggled && !moved && !input.isDefault) return { unit: before };

  if (input.isActive === false && before.isActive) {
    const isDefault = kind === 'HEAD_OFFICE' ? await defaultHeadOfficeBlock(prisma, before) : null;
    if (isDefault) throw new HrmConflictError(`“${before.name}” cannot be switched off. ${isDefault}`);
    const activeChildren = await prisma.hrmOrgUnit.count({ where: { parentId: unitId, isActive: true, ...(kind === 'HEAD_OFFICE' ? { NOT: { type: 'DEPARTMENT' } } : {}) } });
    if (activeChildren) throw new HrmConflictError(`${activeChildren} active unit${activeChildren === 1 ? '' : 's'} belong to ${before.name}. Switch them off or move them first.`);

    // Offices are matched by the explicit office marker on assignments, departments by the department.
    const people = await placedEmployees(isOffice ? { officeUnitId: unitId } : { orgUnitId: unitId });
    if (people) {
      throw new HrmConflictError(isOffice
        ? `${people} employee${people === 1 ? ' works' : 's work'} from ${before.name}. Transfer them first.`
        : `${people} employee${people === 1 ? ' is' : 's are'} placed in ${before.name}. Move them to another department first.`);
    }
    if (kind === 'STATE') {
      const charges = await prisma.hrmAdditionalCharge.count({ where: { officeUnitId: unitId, ...openChargeWhere(utcToday()), employee: { status: { notIn: [...LEFT_COMPANY] } } } });
      if (charges) throw new HrmConflictError(`${charges} additional charge${charges === 1 ? ' of this office is' : 's of this office are'} running or scheduled. End ${charges === 1 ? 'it' : 'them'} first.`);
    }
    const offerBlock = await officeOfferBlock(prisma, before, kind);
    if (offerBlock) throw new HrmConflictError(`“${before.name}” cannot be switched off. ${offerBlock}`);
    // An offer on its way to HRM would hand the candidate into a switched-off department.
    if (kind === 'DEPARTMENT') {
      const blocked = departmentSwitchOffBlock({ placed: 0, openOffers: await prisma.offer.count({ where: openOffersWhere([unitId]) }) });
      if (blocked) throw new HrmConflictError(`“${before.name}” cannot be switched off. ${blocked}`);
    }
  }

  const unit = await prisma.$transaction(async (tx) => {
    if (kind === 'HEAD_OFFICE') {
      await lockOrgUnitCodes(tx);
      // Read again under the lock: somebody may have switched this office off or made it the default meanwhile.
      const fresh = await tx.hrmOrgUnit.findUnique({ where: { id: unitId }, select: { isActive: true } });
      if (!fresh) throw new HrmNotFoundError('Organisation unit not found.');
      if (input.isDefault && !(input.isActive ?? fresh.isActive)) throw new HrmConflictError(`“${before.name}” is switched off. Switch it on before making it the default.`);
      const block = input.isActive === false && fresh.isActive ? await defaultHeadOfficeBlock(tx, before) : null;
      if (block) throw new HrmConflictError(`“${before.name}” cannot be switched off. ${block}`);
    }
    if (renamed) {
      const where: Prisma.HrmOrgUnitWhereInput = kind === 'STATE' ? { type: 'REGION', stateId: { not: null } } : { type: before.type };
      const existing = await findNamed(tx, where, newName!, unitId);
      if (existing) throw duplicateError(`A unit named “${newName}”`, existing);
    }
    if (input.isActive === true && !before.isActive) {
      if (kind === 'STATE') {
        const other = await tx.hrmOrgUnit.findFirst({ where: { type: 'REGION', stateId: before.stateId, isActive: true, NOT: { id: unitId } }, select: { id: true } });
        if (other) throw new HrmConflictError('Another active state office already exists for this state.');
      } else if (kind === 'DEPARTMENT' || kind === 'HEAD_OFFICE') {
        if (kind === 'DEPARTMENT' && before.parentId) {
          const parent = await tx.hrmOrgUnit.findUnique({ where: { id: before.parentId }, select: { name: true, isActive: true } });
          if (parent && !parent.isActive) throw new HrmConflictError(`${parent.name} is switched off. Switch it on first.`);
        }
        const other = await findNamed(tx, { type: before.type, isActive: true }, before.name, unitId);
        if (other) throw new HrmConflictError(`An active unit named “${before.name}” already exists.`);
      }
    }
    const updated = await tx.hrmOrgUnit.update({
      where: { id: unitId },
      data: { ...(renamed ? { name: newName! } : {}), ...(toggled ? { isActive: input.isActive! } : {}), ...(moved ? { stateId: input.stateId!, cityId: input.cityId! } : {}) },
      select: { id: true, code: true, name: true, type: true, isActive: true, parentId: true, stateId: true, cityId: true },
    });
    if (kind === 'HEAD_OFFICE' && toggled) {
      if (input.isActive === false) {
        await moveDepartmentsToDefault(tx, actor, unitId);
      } else if ((await tx.hrmOrgUnit.count({ where: { type: 'HEAD_OFFICE', isActive: true } })) === 1) {
        await tx.hrmOrgUnit.updateMany({ where: { parentId: null, type: 'DEPARTMENT' }, data: { parentId: unitId } });
      }
    }
    if (toggled || moved || renamed) await audit(actor, unitId, toggled ? (input.isActive ? 'REACTIVATED' : 'DEACTIVATED') : moved ? 'MOVED' : 'RENAMED', updated, before, tx);
    if (kind === 'HEAD_OFFICE') {
      if (input.isDefault) await makeDefaultHeadOffice(tx, actor, unitId);
      else await ensureDefaultHeadOffice(tx, actor);
    }
    return updated;
  });
  return { unit };
};

/**
 * One-time setup of the head office (at the chosen place) and its departments. Safe to run again: an existing head
 * office is reused and departments that already exist are skipped.
 */
export const setupHeadOffice = async (actor: Actor, rawInput: unknown) => {
  const input = parseHrmInput(schemas.headOfficeSetup, rawInput);
  const location = await findIndianPlace(input.stateId, input.cityId);
  const headOfficeName = tidyName(input.name ?? '') || `${location.cityName} Head Office`;
  const names = normaliseNames(input.departments);

  return prisma.$transaction(async (tx) => {
    await lockOrgUnitCodes(tx);

    let headOffice: { id: string; code: string; name: string; stateId: number | null; cityId: number | null } | null = await findDefaultHeadOffice(tx);
    let createdHeadOffice = false;
    if (!headOffice) {
      const switchedOff = await findNamed(tx, { type: 'HEAD_OFFICE' }, headOfficeName);
      if (switchedOff) throw new HrmConflictError(`${headOfficeName} exists but is switched off. Switch it on from the Organisation page instead of setting it up again.`);
      const code = buildUnitCode(UNIT_CODE_PREFIX.HEAD_OFFICE, location.cityName, await takenUnitCodes(tx, UNIT_CODE_PREFIX.HEAD_OFFICE));
      headOffice = await tx.hrmOrgUnit.create({
        data: { code, name: headOfficeName, type: 'HEAD_OFFICE', stateId: location.stateId, cityId: location.cityId, createdById: actor.userId },
        select: { id: true, code: true, name: true, stateId: true, cityId: true },
      });
      createdHeadOffice = true;
      await audit(actor, headOffice.id, 'CREATED', { ...headOffice, type: 'HEAD_OFFICE' }, undefined, tx);
    }
    await ensureDefaultHeadOffice(tx, actor);

    const existing = await tx.hrmOrgUnit.findMany({ where: { type: 'DEPARTMENT' }, select: { id: true, name: true, parentId: true } });
    const existingNames = new Set(existing.map((unit) => nameKey(unit.name)));

    // Departments added before the head office existed have no parent; with one active head office they belong to it.
    const adopted: string[] = [];
    if ((await tx.hrmOrgUnit.count({ where: { type: 'HEAD_OFFICE', isActive: true } })) === 1) {
      for (const unit of existing.filter((candidate) => !candidate.parentId)) {
        await tx.hrmOrgUnit.update({ where: { id: unit.id }, data: { parentId: headOffice.id } });
        await audit(actor, unit.id, 'PARENT_SET', { parentId: headOffice.id }, { parentId: null }, tx);
        adopted.push(unit.name);
      }
      // People placed in the head office city before the head office unit existed now get their office marker.
      // Matched on the office's own place: an office that already existed may be elsewhere than the one just typed.
      const placed = await tx.hrmEmploymentAssignment.updateMany({
        where: { officeUnitId: null, stateId: headOffice.stateId ?? location.stateId, cityId: headOffice.cityId ?? location.cityId },
        data: { officeUnitId: headOffice.id },
      });
      if (placed.count) await audit(actor, headOffice.id, 'STAFF_PLACED', { assignments: placed.count }, undefined, tx);
    }
    const taken = await takenUnitCodes(tx, UNIT_CODE_PREFIX.DEPARTMENT);
    const created: string[] = [];
    const skipped: string[] = [];
    for (const name of names) {
      if (existingNames.has(nameKey(name))) { skipped.push(name); continue; }
      const code = buildUnitCode(UNIT_CODE_PREFIX.DEPARTMENT, name, taken);
      taken.add(code);
      const unit = await tx.hrmOrgUnit.create({
        data: { code, name, type: 'DEPARTMENT', parentId: headOffice.id, createdById: actor.userId },
        select: { id: true, code: true, name: true, type: true, parentId: true },
      });
      await audit(actor, unit.id, 'CREATED', unit, undefined, tx);
      created.push(name);
    }
    return { headOffice: { id: headOffice.id, name: headOffice.name }, createdHeadOffice, createdDepartments: created, skippedDepartments: skipped, adoptedDepartments: adopted };
  }, { timeout: 20000, maxWait: 5000 });
};

/**
 * One office (the head office or a state office): who manages it, who works there and whether it is vacant.
 * The team list is limited to employees inside the caller's scope; the managers are shown to everybody who may
 * read the organisation, because who runs an office is structure, not private employee data.
 */
export const getOfficeDetail = async (actor: Actor, unitId: string, rawQuery: unknown = {}) => {
  const query = parseHrmInput(schemas.officeTeamQuery, rawQuery);
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const unit = await prisma.hrmOrgUnit.findUnique({ where: { id: unitId }, select: unitSelect });
  if (!unit) throw new HrmNotFoundError('Office not found.');
  const kind = kindOfUnit(unit);
  if (kind !== 'STATE' && kind !== 'HEAD_OFFICE') throw new HrmNotFoundError('Office not found.');

  const permissions = await getHrmPermissions(actor.userId, actor.role);
  const canManage = hasHrmPermission(permissions, HRM_PERMISSIONS.ORG_MANAGE);
  if (!unit.isActive && !canManage) throw new HrmNotFoundError('Office not found.');
  const allIndia = await hasAllIndiaAccess(actor);
  // Who the managers are is organisation structure (org.read); the people in the office are employee data (employees.read).
  const canReadEmployees = hasHrmPermission(permissions, HRM_PERMISSIONS.EMPLOYEES_READ);
  // Without employees.read nobody in the office is listed; otherwise the caller's scope applies.
  const scopeWhere: Prisma.HrmEmployeeWhereInput | null = canReadEmployees ? await getEmployeeScopeWhere(actor) : { id: { in: [] } };
  const today = utcToday();

  // Everyone working from the office today (within the caller's scope). Counts come from the database, the list
  // pages through it, so an office of any size is shown completely.
  const teamWhere = {
    officeUnitId: unitId,
    ...currentAssignmentWhere(today),
    employee: { status: { notIn: [...LEFT_COMPANY] }, archivedAt: null, ...(scopeWhere ? { AND: [scopeWhere] } : {}) },
  } satisfies Prisma.HrmEmploymentAssignmentWhereInput;
  const search = query.search?.trim();
  const listWhere: Prisma.HrmEmploymentAssignmentWhereInput = search
    ? {
      ...teamWhere,
      employee: {
        ...teamWhere.employee,
        OR: [
          { legalName: { contains: search, mode: 'insensitive' } },
          { preferredName: { contains: search, mode: 'insensitive' } },
          { employeeCode: { contains: search, mode: 'insensitive' } },
        ],
      },
    }
    : teamWhere;

  const [managerRows, teamRows, nationalOperationsManagers, teamTotal, staffCount, onLeaveCount, chargeRows] = await Promise.all([
    listCurrentOfficeManagers(prisma, unitId, today),
    prisma.hrmEmploymentAssignment.findMany({
      where: listWhere,
      select: {
        id: true, designation: true, isOfficeManager: true, effectiveFrom: true, employmentType: true,
        orgUnit: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
        managerEmployee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true } },
        employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true, status: true, mobile: true, workEmail: true, joinedOn: true } },
      },
      orderBy: [{ isOfficeManager: 'desc' }, { employee: { legalName: 'asc' } }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    findNationalOperationsManagers(),
    prisma.hrmEmploymentAssignment.count({ where: listWhere }),
    prisma.hrmEmploymentAssignment.count({ where: { ...teamWhere, employee: { ...teamWhere.employee, status: { in: [...WORKING_STATUSES] } } } }),
    prisma.hrmEmploymentAssignment.count({ where: { ...teamWhere, employee: { ...teamWhere.employee, status: 'ON_LEAVE' } } }),
    prisma.hrmAdditionalCharge.findMany({
      where: { officeUnitId: unitId, ...activeChargeWhere(today), employee: { status: { in: [...WORKING_STATUSES] }, archivedAt: null } },
      select: { effectiveTo: true, employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true } } },
      orderBy: { effectiveFrom: 'asc' },
    }),
  ]);
  const chargeHolders = chargeRows.map((row) => ({ id: row.employee.id, employeeCode: row.employee.employeeCode, name: personName(row.employee), until: row.effectiveTo }));

  const seen = new Set<string>();
  const team = teamRows.filter((row) => (seen.has(row.employee.id) ? false : (seen.add(row.employee.id), true))).map((row) => ({
    assignmentId: row.id,
    employee: { id: row.employee.id, employeeCode: row.employee.employeeCode, name: personName(row.employee), status: row.employee.status, mobile: row.employee.mobile, email: row.employee.workEmail, joinedOn: row.employee.joinedOn },
    designation: row.designation,
    isOfficeManager: row.isOfficeManager,
    employmentType: row.employmentType,
    department: row.orgUnit,
    city: row.city,
    reportsTo: row.managerEmployee ? { id: row.managerEmployee.id, employeeCode: row.managerEmployee.employeeCode, name: personName(row.managerEmployee) } : null,
    since: row.effectiveFrom,
  }));
  const managers = managerRows.map((row) => ({
    id: row.employee.id, employeeCode: row.employee.employeeCode, name: personName(row.employee), designation: row.designation, since: row.effectiveFrom,
  }));

  return {
    office: {
      id: unit.id, code: unit.code, name: unit.name, kind, isActive: unit.isActive,
      state: unit.state, city: unit.city,
    },
    managers,
    chargeHolders,
    teamHidden: !canReadEmployees,
    // The team list is one page; teamPage says how many there are in total (for the search, if any).
    teamPage: { page, limit, total: teamTotal, totalPages: Math.max(1, Math.ceil(teamTotal / limit)), search: search ?? '' },
    vacant: kind === 'STATE' && unit.isActive && managers.length === 0 && chargeHolders.length === 0,
    team,
    counts: {
      staff: staffCount,
      managers: managers.length,
      onLeave: onLeaveCount,
    },
    nationalOperationsManagers,
    abilities: {
      // Offices, departments and designations are head office masters (all-India access, see routes.ts).
      canManage: canManage && allIndia,
      allIndia,
      canManageAssignments: hasHrmPermission(permissions, HRM_PERMISSIONS.ASSIGNMENTS_MANAGE),
      canManageEmployees: hasHrmPermission(permissions, HRM_PERMISSIONS.EMPLOYEES_MANAGE),
    },
  };
};

/**
 * Offers that still place a candidate in one of these departments: drafts, sent ones and accepted ones that have not
 * become an HR record yet. (Closed or already handed-over offers do not hold a department.)
 */
const openOfferStatusWhere: Prisma.OfferWhereInput = {
  OR: [
    { status: { in: ['DRAFT', 'SENT'] } },
    { status: 'ACCEPTED', OR: [{ hrmHandoffStatus: null }, { hrmHandoffStatus: { notIn: ['DONE', 'DISMISSED', 'CANCELLED'] } }] },
  ],
};
const openOffersWhere = (orgUnitIds: string[]): Prisma.OfferWhereInput => ({ AND: [{ hrmOrgUnitId: { in: orgUnitIds } }, openOfferStatusWhere] });

/**
 * Open offers that post a candidate at this office. The head office only matters when it is the last active one
 * (otherwise the candidate joins at another); a state office matters when it is switched off, because a switched-off
 * office is not re-created for the joining (a deleted one is).
 */
const officeOfferBlock = async (db: Tx | typeof prisma, unit: { id: string; stateId: number | null; cityId: number | null }, kind: OrganisationKind) => {
  if (kind !== 'HEAD_OFFICE' && kind !== 'STATE') return null;
  const place: Prisma.OfferWhereInput = kind === 'HEAD_OFFICE' ? { locationType: 'HEAD_OFFICE' } : { locationType: 'STATE_OFFICE', stateId: unit.stateId };
  // With another head office around, only the offers made for this one hold it (the others join elsewhere).
  const others = kind === 'HEAD_OFFICE' ? await db.hrmOrgUnit.count({ where: { type: 'HEAD_OFFICE', isActive: true, NOT: { id: unit.id } } }) : 0;
  // "Made for this one": it names this office, or (older offers, naming none) it is at this office's place.
  const forThis: Prisma.OfferWhereInput = { OR: [{ headOfficeUnitId: unit.id }, ...(unit.stateId && unit.cityId ? [{ headOfficeUnitId: null, stateId: unit.stateId, cityId: unit.cityId }] : [])] };
  const offers = await db.offer.count({ where: { AND: [place, openOfferStatusWhere, ...(others ? [forThis] : [])] } });
  return offers ? `${offers} open offer${offers === 1 ? ' posts' : 's post'} a candidate here. Change the offer's place first.` : null;
};

const departmentSwitchOffBlock = (usage: { placed: number; openOffers: number }) => {
  if (usage.placed) return `${usage.placed} employee${usage.placed === 1 ? ' is' : 's are'} placed in it (including upcoming joinings). Move them to another department first.`;
  if (usage.openOffers) return `${usage.openOffers} open offer${usage.openOffers === 1 ? ' places' : 's place'} a candidate in it. Change the offer's department first.`;
  return null;
};

/**
 * Every department with what uses it, for the Departments section (the one place they are edited, switched off or
 * deleted). The reasons are the same ones the server enforces, so the screen can explain before anything is tried.
 */
export const listDepartmentsForManagement = async (actor: Actor) => {
  const today = utcToday();
  // Head counts inside the caller's scope (the same narrowing as the Organisation page).
  const scopeWhere = await getEmployeeScopeWhere(actor);
  const inScope = scopeWhere ? { employee: scopeWhere } : {};
  const departments = await prisma.hrmOrgUnit.findMany({
    where: { type: 'DEPARTMENT' },
    select: { id: true, code: true, name: true, isActive: true, parent: { select: { id: true, name: true } }, _count: { select: { children: true, accessScopes: true } } },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  const ids = departments.map((department) => department.id);
  const [totals, currents, placements, offers] = await Promise.all([
    prisma.hrmEmploymentAssignment.groupBy({ by: ['orgUnitId'], where: inScope, _count: { _all: true } }),
    prisma.hrmEmploymentAssignment.groupBy({
      by: ['orgUnitId'],
      where: { ...currentAssignmentWhere(today), employee: { status: { notIn: [...NOT_STAFF_STATUSES] }, archivedAt: null, ...(scopeWhere ? { AND: [scopeWhere] } : {}) } },
      _count: { _all: true },
    }),
    // People who still count for switching off (current or upcoming), one per person and department.
    prisma.hrmEmploymentAssignment.findMany({
      where: { orgUnitId: { in: ids }, ...openAssignmentWhere(), employee: { status: { notIn: [...LEFT_COMPANY] }, archivedAt: null } },
      select: { orgUnitId: true, employeeId: true },
      distinct: ['orgUnitId', 'employeeId'],
    }),
    prisma.offer.findMany({ where: openOffersWhere(ids), select: { hrmOrgUnitId: true } }),
  ]);
  const total = new Map(totals.map((row) => [row.orgUnitId, row._count._all]));
  const current = new Map(currents.map((row) => [row.orgUnitId, row._count._all]));
  const countBy = (keys: Array<string | null>) => keys.reduce((map, key) => (key ? map.set(key, (map.get(key) ?? 0) + 1) : map), new Map<string, number>());
  const placed = countBy(placements.map((row) => row.orgUnitId));
  const openOffers = countBy(offers.map((row) => row.hrmOrgUnitId));
  return {
    departments: departments.map((department) => {
      const used = total.get(department.id) ?? 0;
      const staff = current.get(department.id) ?? 0;
      const usage = { assignments: used, current: staff, accessScopes: department._count.accessScopes, openOffers: openOffers.get(department.id) ?? 0 };
      const blocked = usageBlock(usage, department._count.children);
      const switchOffBlocked = departmentSwitchOffBlock({ placed: placed.get(department.id) ?? 0, openOffers: usage.openOffers });
      return {
        id: department.id,
        code: department.code,
        name: department.name,
        isActive: department.isActive,
        parent: department.parent,
        currentEmployees: staff,
        totalAssignments: used,
        openOffers: usage.openOffers,
        accessScopes: usage.accessScopes,
        canDelete: blocked === null,
        deleteBlockedReason: blocked,
        canSwitchOff: switchOffBlocked === null,
        switchOffBlockedReason: switchOffBlocked,
      };
    }),
  };
};

const deleteDepartmentBlock = (usage: { assignments: number; current: number; children: number; accessScopes: number }) => {
  if (usage.current) return `${usage.current} employee${usage.current === 1 ? ' is' : 's are'} in it today. Move them to another department, or switch it off.`;
  if (usage.assignments) return `It appears on ${usage.assignments} assignment${usage.assignments === 1 ? '' : 's'} from the past. Switch it off instead.`;
  if (usage.children) return `${usage.children} unit${usage.children === 1 ? '' : 's'} sit under it.`;
  if (usage.accessScopes) return `${usage.accessScopes} access scope${usage.accessScopes === 1 ? '' : 's'} refer to it.`;
  return null;
};

/** What still uses a unit: past / current placements, access scopes and open offers (departments only). */
const unitUsage = async (tx: Tx, unitId: string) => {
  const [assignments, current, accessScopes, openOffers, charges] = await Promise.all([
    tx.hrmEmploymentAssignment.count({ where: { OR: [{ orgUnitId: unitId }, { officeUnitId: unitId }] } }),
    tx.hrmEmploymentAssignment.count({ where: { ...currentAssignmentWhere(utcToday()), OR: [{ orgUnitId: unitId }, { officeUnitId: unitId }] } }),
    tx.hrmAccessScope.count({ where: { orgUnitId: unitId } }),
    tx.offer.count({ where: openOffersWhere([unitId]) }),
    // Cancelled charges never took effect; they go with the unit.
    tx.hrmAdditionalCharge.count({ where: { officeUnitId: unitId, status: { not: 'CANCELLED' } } }),
  ]);
  return { assignments, current, accessScopes, openOffers, charges };
};

const usageBlock = (usage: Omit<Awaited<ReturnType<typeof unitUsage>>, 'charges'> & { charges?: number }, children = 0) => {
  if (usage.charges) return `It appears on ${usage.charges} additional charge${usage.charges === 1 ? '' : 's'}. End any running one and switch it off instead.`;
  const block = deleteDepartmentBlock({ assignments: usage.assignments, current: usage.current, children, accessScopes: usage.accessScopes });
  if (block) return block;
  if (usage.openOffers) return `${usage.openOffers} open offer${usage.openOffers === 1 ? ' places' : 's place'} the candidate in it. Change the offer's department first, or switch it off instead.`;
  return null;
};

/**
 * Deletes a unit that nothing ever used. Anything with history (people placed, access given, open offers) is switched
 * off instead, so old records stay readable. Departments are company-wide and are deleted only one by one: deleting a
 * head office keeps them (they link to the next head office that is set up).
 */
export const deleteOrganisationUnit = async (actor: Actor, unitId: string) => {
  const unit = await prisma.hrmOrgUnit.findUnique({ where: { id: unitId }, select: { id: true, code: true, name: true, type: true, isActive: true, parentId: true, stateId: true, cityId: true } });
  if (!unit) throw new HrmNotFoundError('Organisation unit not found.');

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'hrm-org-unit-delete'}))`;
    // The default mark moves under the same lock as every other change of head offices.
    if (unit.type === 'HEAD_OFFICE') await lockOrgUnitCodes(tx);
    const children = await tx.hrmOrgUnit.findMany({ where: { parentId: unitId }, select: { id: true, name: true, type: true } });
    const departments = unit.type === 'HEAD_OFFICE' ? children.filter((child) => child.type === 'DEPARTMENT') : [];
    const blocking = children.length - departments.length;
    if (blocking) throw new HrmConflictError(`“${unit.name}” cannot be deleted. ${blocking} unit${blocking === 1 ? '' : 's'} sit under it. Delete or move ${blocking === 1 ? 'it' : 'them'} first.`);
    const isDefault = unit.type === 'HEAD_OFFICE' ? await defaultHeadOfficeBlock(tx, unit) : null;
    if (isDefault) throw new HrmConflictError(`“${unit.name}” cannot be deleted. ${isDefault}`);
    const own = usageBlock(await unitUsage(tx, unitId))
      ?? (unit.type === 'HEAD_OFFICE' ? await officeOfferBlock(tx, unit, 'HEAD_OFFICE') : null);
    if (own) throw new HrmConflictError(`“${unit.name}” cannot be deleted. ${own}`);
    if (departments.length) await moveDepartmentsToDefault(tx, actor, unitId);
    // A recruitment department pointing at a removed department simply loses the link (it can be mapped again).
    await tx.jobDepartment.updateMany({ where: { hrmOrgUnitId: unitId }, data: { hrmOrgUnitId: null } });
    await tx.hrmAdditionalCharge.deleteMany({ where: { officeUnitId: unitId, status: 'CANCELLED' } });
    await tx.hrmOrgUnit.delete({ where: { id: unitId } });
    await audit(actor, unitId, 'DELETED', { departmentsKept: departments.map((department) => department.name) }, unit, tx);
    if (unit.type === 'HEAD_OFFICE') await ensureDefaultHeadOffice(tx, actor);
    return { deleted: true, unit: { id: unit.id, name: unit.name }, departmentsKept: departments.map((department) => department.name) };
  }, { timeout: 20000, maxWait: 5000 });
};
