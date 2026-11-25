import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { getActiveScopes, getEmployeeScopeWhere, getHrmPermissions, hasAllIndiaAccess } from '../access';
import { writeHrmAudit } from '../audit';
import { HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import {
  currentAssignmentWhere, findNationalOperationsManagers, listCurrentOfficeManagers, NOT_STAFF_STATUSES, openAssignmentWhere, utcToday, WORKING_STATUSES,
} from '../officeAssignments';
import { createStateOfficeUnit, lockOrgUnitCodes, resolveHeadOffice, takenUnitCodes } from '../officeUnits';
import { buildUnitCode, defaultStateOfficeName, kindOfUnit, normaliseNames, UNIT_CODE_PREFIX, type OrganisationKind } from '../organisationCodes';
import { HRM_PERMISSIONS, hasAllIndiaScope, hasHrmPermission } from '../security';
import { parseHrmInput, schemas } from '../validation';

type Actor = { userId: string; role: string; ipAddress?: string | null };
type Tx = Prisma.TransactionClient;

const HEAD_OFFICE_NAME = 'Raipur Head Office';
const HEAD_OFFICE_CODE_BASE = 'RAIPUR';
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

  const [units, assignmentRows, managerRows, indiaStates, headOfficeLocation, nationalOperationsManagers, upcomingRows] = await Promise.all([
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
  ]);
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
      upcomingManagers: isOffice ? upcomingByOffice.get(unit.id) ?? [] : [],
      childCount: unit._count.children,
      employeeCount: isOffice ? byOffice.get(unit.id) ?? 0 : byDepartment.get(unit.id) ?? 0,
      // A state office with nobody managing it is "vacant" and needs a State Manager.
      coverage: kind === 'STATE' && unit.isActive ? (managers.length ? 'COVERED' as const : 'VACANT' as const) : null,
    };
  });

  const activeStates = mapped.filter((unit) => unit.kind === 'STATE' && unit.isActive);
  const activeStateIds = new Set(activeStates.map((unit) => unit.state?.id));
  const headOfficeUnits = mapped.filter((unit) => unit.kind === 'HEAD_OFFICE' && unit.isActive);
  return {
    scope: { allIndia },
    // Offices, departments and designations are head office masters (all-India access, see routes.ts).
    abilities: { canManage: canManage && allIndia, canManageAssignments },
    headOfficeLocation,
    indiaStateCount: indiaStates.length,
    states: indiaStates,
    availableStates: indiaStates.filter((state) => !activeStateIds.has(state.id)),
    units: mapped,
    nationalOperationsManagers,
    coverage: {
      totalStates: indiaStates.length,
      officesSetUp: activeStates.length,
      covered: activeStates.filter((unit) => unit.coverage === 'COVERED').length,
      vacant: activeStates.filter((unit) => unit.coverage === 'VACANT').length,
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
        // With exactly one head office, a new department belongs to it.
        const offices = await tx.hrmOrgUnit.findMany({ where: { type: 'HEAD_OFFICE', isActive: true }, select: { id: true }, take: 2 });
        parentId = offices.length === 1 ? offices[0]!.id : null;
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
  if (!renamed && !toggled) return { unit: before };

  if (input.isActive === false && before.isActive) {
    const activeChildren = await prisma.hrmOrgUnit.count({ where: { parentId: unitId, isActive: true } });
    if (activeChildren) throw new HrmConflictError(`${activeChildren} active unit${activeChildren === 1 ? '' : 's'} belong to ${before.name}. Switch them off or move them first.`);

    // Offices are matched by the explicit office marker on assignments, departments by the department.
    const people = await placedEmployees(isOffice ? { officeUnitId: unitId } : { orgUnitId: unitId });
    if (people) {
      throw new HrmConflictError(isOffice
        ? `${people} employee${people === 1 ? ' works' : 's work'} from ${before.name}. Transfer them first.`
        : `${people} employee${people === 1 ? ' is' : 's are'} placed in ${before.name}. Move them to another department first.`);
    }
  }

  const unit = await prisma.$transaction(async (tx) => {
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
      data: { ...(renamed ? { name: newName! } : {}), ...(toggled ? { isActive: input.isActive! } : {}) },
      select: { id: true, code: true, name: true, type: true, isActive: true, parentId: true, stateId: true, cityId: true },
    });
    await audit(actor, unitId, toggled ? (input.isActive ? 'REACTIVATED' : 'DEACTIVATED') : 'RENAMED', updated, before, tx);
    return updated;
  });
  return { unit };
};

/**
 * One-time setup of the Raipur head office and its departments. Safe to run again: an existing head
 * office is reused and departments that already exist are skipped.
 */
export const setupHeadOffice = async (actor: Actor, rawInput: unknown) => {
  const input = parseHrmInput(schemas.headOfficeSetup, rawInput);
  const location = await resolveHeadOffice();
  if (!location) throw new HrmHttpError(409, 'HEAD_OFFICE_LOCATION_MISSING', 'Raipur, Chhattisgarh is missing from the location master, so the head office cannot be set up.');
  const names = normaliseNames(input.departments);

  return prisma.$transaction(async (tx) => {
    await lockOrgUnitCodes(tx);

    let headOffice = await tx.hrmOrgUnit.findFirst({ where: { type: 'HEAD_OFFICE', isActive: true }, select: { id: true, code: true, name: true }, orderBy: { createdAt: 'asc' } });
    let createdHeadOffice = false;
    if (!headOffice) {
      const switchedOff = await findNamed(tx, { type: 'HEAD_OFFICE' }, HEAD_OFFICE_NAME);
      if (switchedOff) throw new HrmConflictError(`${HEAD_OFFICE_NAME} exists but is switched off. Switch it on from the Organisation page instead of setting it up again.`);
      const code = buildUnitCode(UNIT_CODE_PREFIX.HEAD_OFFICE, HEAD_OFFICE_CODE_BASE, await takenUnitCodes(tx, UNIT_CODE_PREFIX.HEAD_OFFICE));
      headOffice = await tx.hrmOrgUnit.create({
        data: { code, name: HEAD_OFFICE_NAME, type: 'HEAD_OFFICE', stateId: location.stateId, cityId: location.cityId, createdById: actor.userId },
        select: { id: true, code: true, name: true },
      });
      createdHeadOffice = true;
      await audit(actor, headOffice.id, 'CREATED', { ...headOffice, type: 'HEAD_OFFICE' }, undefined, tx);
    }

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
      const placed = await tx.hrmEmploymentAssignment.updateMany({
        where: { officeUnitId: null, stateId: location.stateId, cityId: location.cityId },
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

  const [managerRows, teamRows, nationalOperationsManagers, teamTotal, staffCount, onLeaveCount] = await Promise.all([
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
  ]);

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
    teamHidden: !canReadEmployees,
    // The team list is one page; teamPage says how many there are in total (for the search, if any).
    teamPage: { page, limit, total: teamTotal, totalPages: Math.max(1, Math.ceil(teamTotal / limit)), search: search ?? '' },
    vacant: kind === 'STATE' && unit.isActive && managers.length === 0,
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
 * The departments with how many people use each, for the manage screen (rename, switch off, delete). A department
 * can only be deleted when nothing ever referred to it; otherwise it is switched off, which hides it from the pickers
 * and keeps history readable.
 */
export const listDepartmentsForManagement = async (actor: Actor) => {
  const today = utcToday();
  // Head counts inside the caller's scope (the same narrowing as the Organisation page).
  const scopeWhere = await getEmployeeScopeWhere(actor);
  const inScope = scopeWhere ? { employee: scopeWhere } : {};
  const [departments, totals, currents] = await Promise.all([
    prisma.hrmOrgUnit.findMany({
      where: { type: 'DEPARTMENT' },
      select: { id: true, code: true, name: true, isActive: true, parent: { select: { id: true, name: true } }, _count: { select: { children: true, accessScopes: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    }),
    prisma.hrmEmploymentAssignment.groupBy({ by: ['orgUnitId'], where: inScope, _count: { _all: true } }),
    prisma.hrmEmploymentAssignment.groupBy({
      by: ['orgUnitId'],
      where: { ...currentAssignmentWhere(today), employee: { status: { notIn: [...NOT_STAFF_STATUSES] }, archivedAt: null, ...(scopeWhere ? { AND: [scopeWhere] } : {}) } },
      _count: { _all: true },
    }),
  ]);
  const total = new Map(totals.map((row) => [row.orgUnitId, row._count._all]));
  const current = new Map(currents.map((row) => [row.orgUnitId, row._count._all]));
  return {
    departments: departments.map((department) => {
      const used = total.get(department.id) ?? 0;
      const staff = current.get(department.id) ?? 0;
      const blocked = deleteDepartmentBlock({ assignments: used, current: staff, children: department._count.children, accessScopes: department._count.accessScopes });
      return {
        id: department.id,
        code: department.code,
        name: department.name,
        isActive: department.isActive,
        parent: department.parent,
        currentEmployees: staff,
        totalAssignments: used,
        canDelete: blocked === null,
        deleteBlockedReason: blocked,
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
  const [assignments, current, accessScopes, openOffers] = await Promise.all([
    tx.hrmEmploymentAssignment.count({ where: { OR: [{ orgUnitId: unitId }, { officeUnitId: unitId }] } }),
    tx.hrmEmploymentAssignment.count({ where: { ...currentAssignmentWhere(utcToday()), OR: [{ orgUnitId: unitId }, { officeUnitId: unitId }] } }),
    tx.hrmAccessScope.count({ where: { orgUnitId: unitId } }),
    tx.offer.count({ where: { hrmOrgUnitId: unitId, status: { in: ['DRAFT', 'SENT', 'ACCEPTED'] } } }),
  ]);
  return { assignments, current, accessScopes, openOffers };
};

const usageBlock = (usage: Awaited<ReturnType<typeof unitUsage>>, children = 0) => {
  const block = deleteDepartmentBlock({ assignments: usage.assignments, current: usage.current, children, accessScopes: usage.accessScopes });
  if (block) return block;
  if (usage.openOffers) return `${usage.openOffers} open offer${usage.openOffers === 1 ? ' places' : 's place'} the candidate in it. Change the offer's department first, or switch it off instead.`;
  return null;
};

/**
 * Deletes a unit that nothing ever used. A head office goes together with its departments in one step (only when
 * none of them was ever used either). Anything with history (people placed, access given, open offers) is switched
 * off instead, so old records stay readable.
 */
export const deleteOrganisationUnit = async (actor: Actor, unitId: string) => {
  const unit = await prisma.hrmOrgUnit.findUnique({ where: { id: unitId }, select: { id: true, code: true, name: true, type: true, isActive: true, parentId: true, stateId: true, cityId: true } });
  if (!unit) throw new HrmNotFoundError('Organisation unit not found.');

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'hrm-org-unit-delete'}))`;
    const children = await tx.hrmOrgUnit.findMany({ where: { parentId: unitId }, select: { id: true, code: true, name: true, type: true, isActive: true, parentId: true, _count: { select: { children: true } } } });
    // Only a head office takes its departments with it; any other unit with units under it is refused.
    const takesChildren = unit.type === 'HEAD_OFFICE';
    if (children.length && !takesChildren) {
      throw new HrmConflictError(`“${unit.name}” cannot be deleted. ${children.length} unit${children.length === 1 ? '' : 's'} sit under it.`);
    }
    const own = usageBlock(await unitUsage(tx, unitId));
    if (own) throw new HrmConflictError(`“${unit.name}” cannot be deleted. ${own}`);
    for (const child of children) {
      if (child.type !== 'DEPARTMENT') throw new HrmConflictError(`“${unit.name}” cannot be deleted: “${child.name}” (${child.type.toLowerCase().replace(/_/g, ' ')}) sits under it. Delete or move it first.`);
      const childBlock = usageBlock(await unitUsage(tx, child.id), child._count.children);
      if (childBlock) throw new HrmConflictError(`“${unit.name}” cannot be deleted because its department “${child.name}” is in use: ${childBlock}`);
    }
    const removedIds = [...children.map((child) => child.id), unitId];
    // A recruitment department pointing at a removed department simply loses the link (it can be mapped again).
    await tx.jobDepartment.updateMany({ where: { hrmOrgUnitId: { in: removedIds } }, data: { hrmOrgUnitId: null } });
    for (const child of children) {
      await tx.hrmOrgUnit.delete({ where: { id: child.id } });
      await audit(actor, child.id, 'DELETED', { withParent: unitId }, child, tx);
    }
    await tx.hrmOrgUnit.delete({ where: { id: unitId } });
    await audit(actor, unitId, 'DELETED', { departmentsDeleted: children.map((child) => child.name) }, unit, tx);
    return { deleted: true, unit: { id: unit.id, name: unit.name }, departmentsDeleted: children.map((child) => child.name) };
  }, { timeout: 20000, maxWait: 5000 });
};
