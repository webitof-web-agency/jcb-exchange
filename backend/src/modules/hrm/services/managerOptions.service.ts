import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { assertEmployeeAccess, getEmployeeScopeWhere } from '../access';
import { abilitiesOf, mayManageState } from '../accessGrant';
import { activeChargeWhere } from '../additionalChargeRules';
import { pickScopeAssignment, utcToday } from '../assignmentTimeline';
import { buildSuggestions, loopReason, managerNote, pickPreselect, type ManagerPurpose, type Suggestion } from '../managerCandidates';
import { WORKING_STATUSES, currentAssignmentWhere, findNationalOperationsManagers, openAssignmentWhere, type Actor } from '../officeAssignments';
import { findActiveStateOffice } from '../officeUnits';
import { parseHrmInput, schemas } from '../validation';

/**
 * The one list behind every "Reporting manager" choice (add assignment, change manager, transfer, appoint, replace,
 * deactivate and the recruitment offer): working employees only, grouped as Suggested / the office's team / Head
 * office / everybody else, with the people who would make a reporting loop shown but not selectable.
 */

/** People listed per group; the rest is found by typing. */
const GROUP_LIMIT = 20;

export type ManagerRequest = {
  employeeId?: string | undefined;
  stateId?: number | undefined;
  headOffice?: boolean | undefined;
  /** The person is, or will be, the manager of the state office. */
  managerRole?: boolean | undefined;
  purpose?: ManagerPurpose | undefined;
  search?: string | undefined;
};

export type ManagerCaller = {
  /** The employees the caller may see (null = everyone). National Operations Managers are always added. */
  visible: Prisma.HrmEmployeeWhereInput | null;
  /** Whoever works for a state may be told who manages or covers it. */
  seesState: (stateId: number) => boolean;
  /** Search also matches mobile and work email (HRM users, not recruiters). */
  searchContacts: boolean;
};

const LEFT: Array<'EXITED' | 'TERMINATED'> = ['EXITED', 'TERMINATED'];

/** Who manages a state office today, and who holds its additional charge. */
export const stateOfficeHolders = async (officeUnitId: string, today = utcToday()) => {
  const employee: Prisma.HrmEmployeeWhereInput = { status: { in: [...WORKING_STATUSES] }, archivedAt: null };
  const [managers, charges] = await Promise.all([
    prisma.hrmEmploymentAssignment.findMany({
      where: { officeUnitId, isOfficeManager: true, ...currentAssignmentWhere(today), employee },
      select: { employeeId: true }, orderBy: { effectiveFrom: 'asc' },
    }),
    prisma.hrmAdditionalCharge.findMany({ where: { officeUnitId, ...activeChargeWhere(today), employee }, select: { employeeId: true } }),
  ]);
  return { managerIds: managers.map((row) => row.employeeId), chargeIds: charges.map((row) => row.employeeId) };
};

/** Everybody under this person with how far down they are (1 = reports to them directly). */
const teamOf = async (employeeId: string, today: Date) => {
  const depths = new Map<string, number>();
  let frontier = [employeeId];
  for (let depth = 1; depth <= 30 && frontier.length; depth += 1) {
    const rows = await prisma.hrmEmploymentAssignment.findMany({
      where: { managerEmployeeId: { in: frontier }, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] },
      select: { employeeId: true },
    });
    frontier = [...new Set(rows.map((row) => row.employeeId))].filter((id) => id !== employeeId && !depths.has(id));
    for (const id of frontier) depths.set(id, depth);
  }
  return depths;
};

/** The person the manager is chosen for: their name and the assignment a change would build on. */
const loadSubject = async (employeeId: string, today: Date) => {
  const row = await prisma.hrmEmployee.findUnique({
    where: { id: employeeId },
    select: {
      legalName: true, preferredName: true,
      assignments: {
        where: openAssignmentWhere(today),
        select: { effectiveFrom: true, isOfficeManager: true, managerEmployeeId: true, officeUnit: { select: { type: true, stateId: true } } },
      },
    },
  });
  if (!row) return null;
  return { name: row.preferredName || row.legalName, assignment: pickScopeAssignment(row.assignments, today) };
};

type Target = { kind: 'HEAD_OFFICE' | 'STATE' | null; stateId: number | null; stateName: string | null };

const resolveTarget = async (request: ManagerRequest, subject: Awaited<ReturnType<typeof loadSubject>>): Promise<Target> => {
  const stateName = async (stateId: number) => (await prisma.state.findUnique({ where: { id: stateId }, select: { name: true } }))?.name ?? null;
  const headOffice: Target = { kind: 'HEAD_OFFICE', stateId: null, stateName: null };
  if (request.headOffice) return headOffice;
  if (request.stateId) return { kind: 'STATE', stateId: request.stateId, stateName: await stateName(request.stateId) };
  const unit = subject?.assignment?.officeUnit;
  if (unit?.type === 'HEAD_OFFICE') return headOffice;
  if (unit?.type === 'REGION' && unit.stateId) return { kind: 'STATE', stateId: unit.stateId, stateName: await stateName(unit.stateId) };
  return { kind: null, stateId: null, stateName: null };
};

export const listManagerCandidates = async (request: ManagerRequest, caller: ManagerCaller) => {
  const today = utcToday();
  const purpose: ManagerPurpose = request.purpose ?? 'manager';
  const search = (request.search ?? '').trim().slice(0, 80);
  const subject = request.employeeId ? await loadSubject(request.employeeId, today) : null;
  const target = await resolveTarget(request, subject);
  // Asked without a place (change manager, successor): the person's own role says who they report to.
  const managerRole = request.managerRole ?? (!request.stateId && !request.headOffice && Boolean(subject?.assignment?.isOfficeManager));
  const stateOffice = target.stateId ? await findActiveStateOffice(prisma, target.stateId) : null;

  const working: Prisma.HrmEmployeeWhereInput = { status: { in: [...WORKING_STATUSES] }, archivedAt: null };
  const [nationals, holders, team] = await Promise.all([
    findNationalOperationsManagers(),
    stateOffice ? stateOfficeHolders(stateOffice.id, today) : Promise.resolve({ managerIds: [] as string[], chargeIds: [] as string[] }),
    request.employeeId ? teamOf(request.employeeId, today) : Promise.resolve(new Map<string, number>()),
  ]);
  const nationalIds = nationals.map((item) => item.id);
  const stateManagerIds = holders.managerIds.filter((id) => id !== request.employeeId);
  const chargeHolderIds = holders.chargeIds.filter((id) => id !== request.employeeId);
  const suggestions = buildSuggestions({
    purpose, managerRole, stateName: target.stateName,
    leaverManagerId: subject?.assignment?.managerEmployeeId ?? null,
    stateManagerIds, chargeHolderIds, nationalIds, excludeId: request.employeeId,
  });

  const alsoVisible = [...nationalIds, ...(target.stateId && caller.seesState(target.stateId) ? [...stateManagerIds, ...chargeHolderIds] : [])];
  const digits = search.replace(/\D/g, '');
  const matches: Prisma.HrmEmployeeWhereInput[] = search ? [{
    OR: [
      { legalName: { contains: search, mode: 'insensitive' } },
      { preferredName: { contains: search, mode: 'insensitive' } },
      { employeeCode: { contains: search, mode: 'insensitive' } },
      ...(caller.searchContacts ? [
        { workEmail: { contains: search, mode: 'insensitive' as const } },
        { mobile: { contains: search } },
        ...(digits.length >= 6 && digits !== search ? [{ mobile: { contains: digits } }] : []),
      ] : []),
    ],
  }] : [];
  const base: Prisma.HrmEmployeeWhereInput[] = [
    working,
    ...(request.employeeId ? [{ id: { not: request.employeeId } }] : []),
    ...(caller.visible ? [{ OR: [caller.visible, { id: { in: alsoVisible } }] }] : []),
    ...matches,
  ];

  const select = {
    id: true, employeeCode: true, legalName: true, preferredName: true, status: true, userId: true,
    user: { select: { role: true, customRole: { select: { name: true } } } },
    assignments: {
      where: openAssignmentWhere(today),
      select: {
        effectiveFrom: true, designation: true, isOfficeManager: true,
        orgUnit: { select: { name: true } },
        officeUnit: { select: { name: true, type: true, stateId: true } },
        state: { select: { name: true } },
        city: { select: { name: true } },
      },
    },
  } satisfies Prisma.HrmEmployeeSelect;
  const find = (where: Prisma.HrmEmployeeWhereInput[], take = GROUP_LIMIT + 1) =>
    prisma.hrmEmployee.findMany({ where: { AND: [...base, ...where] }, select, orderBy: [{ legalName: 'asc' }, { id: 'asc' }], take });

  const worksAt = (office: Prisma.HrmOrgUnitWhereInput): Prisma.HrmEmployeeWhereInput => ({ assignments: { some: { ...currentAssignmentWhere(today), officeUnit: office } } });
  const atHeadOffice = worksAt({ type: 'HEAD_OFFICE' });
  const atState = target.stateId ? worksAt({ type: 'REGION', stateId: target.stateId }) : null;
  const suggestedIds = suggestions.map((item) => item.id);
  const notSuggested: Prisma.HrmEmployeeWhereInput = { id: { notIn: suggestedIds } };

  const [suggestedRows, stateRows, headRows] = await Promise.all([
    suggestedIds.length ? find([{ id: { in: suggestedIds } }], suggestedIds.length) : Promise.resolve([]),
    atState ? find([atState, notSuggested]) : Promise.resolve([]),
    find([atHeadOffice, notSuggested]),
  ]);
  // Everybody else: when searching, when no office is chosen yet, or when there is nobody else to show.
  const needsOthers = Boolean(search) || !target.kind || (!suggestedRows.length && !stateRows.length && !headRows.length);
  const otherRows = needsOthers
    ? await find([notSuggested, { NOT: atHeadOffice }, ...(atState ? [{ NOT: atState }] : [])])
    : [];

  type Row = (typeof suggestedRows)[number];
  const all: Row[] = [...suggestedRows, ...stateRows, ...headRows, ...otherRows];
  const ids = all.map((row) => row.id);
  const [reportGroups, charges] = ids.length ? await Promise.all([
    prisma.hrmEmploymentAssignment.groupBy({
      by: ['managerEmployeeId'],
      where: { managerEmployeeId: { in: ids }, ...currentAssignmentWhere(today), employee: { archivedAt: null, status: { notIn: LEFT } } },
      _count: { _all: true },
    }),
    prisma.hrmAdditionalCharge.findMany({ where: { employeeId: { in: ids }, ...activeChargeWhere(today) }, select: { employeeId: true, officeUnit: { select: { stateId: true } } } }),
  ]) : [[], []];
  const reportsOf = new Map(reportGroups.map((group) => [group.managerEmployeeId, group._count._all]));

  const toCandidate = (row: Row) => {
    const assignment = pickScopeAssignment(row.assignments, today);
    const login = row.user;
    return {
      id: row.id,
      employeeCode: row.employeeCode,
      name: row.preferredName || row.legalName,
      designation: assignment?.designation ?? null,
      department: assignment?.orgUnit?.name ?? null,
      officeName: assignment?.officeUnit?.name ?? null,
      officeType: assignment?.officeUnit?.type ?? null,
      stateId: assignment?.officeUnit?.stateId ?? null,
      stateName: assignment?.state?.name ?? null,
      cityName: assignment?.city?.name ?? null,
      isOfficeManager: Boolean(assignment?.isOfficeManager),
      chargeStateIds: charges.filter((charge) => charge.employeeId === row.id && charge.officeUnit.stateId).map((charge) => charge.officeUnit.stateId!),
      isNational: nationalIds.includes(row.id),
      directReports: reportsOf.get(row.id) ?? 0,
      role: login?.customRole?.name ?? (login?.role === 'SUPER_ADMIN' ? 'Super Admin' : login?.role === 'ADMIN' ? 'Admin' : null),
      hasLogin: Boolean(row.userId),
      status: row.status,
      suggestedAs: suggestions.find((item) => item.id === row.id)?.reason ?? null,
      blocked: loopReason(team.get(row.id), purpose, subject?.name ?? 'this person'),
    };
  };

  /** Selectable people first, office managers before the others; the database already sorted by name. */
  const ordered = (rows: Row[]) => rows.map(toCandidate).sort((a, b) => Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)) || Number(b.isOfficeManager) - Number(a.isOfficeManager));
  // Suggested keeps the order of the suggestions (best first).
  const suggested = suggestions.flatMap((item: Suggestion) => suggestedRows.filter((row) => row.id === item.id).map(toCandidate));
  const group = (id: 'SUGGESTED' | 'STATE' | 'HEAD_OFFICE' | 'OTHER', title: string, rows: Row[]) =>
    ({ id, title, people: ordered(rows.slice(0, GROUP_LIMIT)), more: rows.length > GROUP_LIMIT });
  const headGroup = group('HEAD_OFFICE', 'Head office', headRows);
  const stateGroup = group('STATE', `${target.stateName ?? 'State'} team`, stateRows);
  const groups = [
    { id: 'SUGGESTED' as const, title: 'Suggested', people: suggested, more: false },
    ...(target.kind === 'HEAD_OFFICE' ? [headGroup] : [stateGroup, headGroup]),
    group('OTHER', search ? 'Other offices' : 'Other employees', otherRows),
  ].filter((item) => item.people.length);

  const preselectId = pickPreselect(
    suggestions.map((item) => ({ ...item, blocked: suggested.find((person) => person.id === item.id)?.blocked ?? (suggested.some((person) => person.id === item.id) ? null : 'not listed') })),
    { purpose, managerRole },
  );
  return {
    target,
    currentManagerId: subject?.assignment?.managerEmployeeId ?? null,
    // A search is only about finding somebody: nothing is filled in and no note is shown.
    preselect: search ? null : suggested.find((person) => person.id === preselectId) ?? null,
    note: search ? null : managerNote({ purpose, managerRole, stateName: target.stateName, stateManagers: stateManagerIds.length, chargeHolders: chargeHolderIds.length, nationals: nationalIds.filter((id) => id !== request.employeeId).length }),
    groups,
    /** False when the caller only sees some people (their states): the search says so. */
    searchesEveryone: caller.visible === null,
  };
};

/** GET /hrm/manager-options: the list as an HRM user may see it. */
export const getHrmManagerOptions = async (actor: Actor, rawQuery: unknown) => {
  const query = parseHrmInput(schemas.managerOptionsQuery, rawQuery);
  if (query.employeeId) await assertEmployeeAccess({ ...actor, employeeId: query.employeeId });
  const [visible, abilities] = await Promise.all([getEmployeeScopeWhere(actor), abilitiesOf(actor)]);
  return listManagerCandidates(query, { visible, seesState: (stateId) => mayManageState(abilities, stateId), searchContacts: true });
};
