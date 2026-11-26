import type { HrmDepartmentRow, HrmHeadOfficeSetupResult, HrmOrganisation, HrmOrganisationUnit, HrmStateOfficesResult } from './hrmApi';

export type OrganisationGroups = {
  headOffices: HrmOrganisationUnit[];
  departments: HrmOrganisationUnit[];
  states: HrmOrganisationUnit[];
  others: HrmOrganisationUnit[];
};

export const matchesUnit = (unit: HrmOrganisationUnit, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [unit.name, unit.code, unit.state?.name, unit.city?.name, unit.parent?.name, ...unit.managers.map((manager) => manager.name), ...(unit.chargeHolders ?? []).map((holder) => holder.name)]
    .some((value) => value?.toLowerCase().includes(needle));
};

/** Splits the units into the sections of the page, applying the search text and the inactive switch. */
export const groupOrganisation = (units: HrmOrganisationUnit[], options: { query?: string; showInactive?: boolean } = {}): OrganisationGroups => {
  const visible = units.filter((unit) => (options.showInactive || unit.isActive) && matchesUnit(unit, options.query ?? ''));
  const pick = (kind: HrmOrganisationUnit['kind']) => visible.filter((unit) => unit.kind === kind);
  // The default head office leads its list.
  const headOffices = [...pick('HEAD_OFFICE')].sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));
  return { headOffices, departments: pick('DEPARTMENT'), states: pick('STATE'), others: pick('OTHER') };
};

/**
 * The numbers of the coverage strip. Everything is counted from the units the page shows, so the strip and the
 * table never disagree; only the people without an office marker come from the server.
 */
export const summariseOrganisation = (organisation: HrmOrganisation) => {
  const active = organisation.units.filter((unit) => unit.isActive);
  const activeOf = (kind: HrmOrganisationUnit['kind']) => active.filter((unit) => unit.kind === kind);
  const stateOffices = activeOf('STATE');
  const sumStaff = (units: HrmOrganisationUnit[]) => units.reduce((total, unit) => total + unit.employeeCount, 0);
  return {
    headOffice: activeOf('HEAD_OFFICE').find((unit) => unit.isDefault) ?? activeOf('HEAD_OFFICE')[0] ?? null,
    departments: activeOf('DEPARTMENT').length,
    stateOffices: stateOffices.length,
    totalStates: organisation.indiaStateCount || organisation.states.length,
    covered: stateOffices.filter((unit) => unit.coverage === 'COVERED').length,
    vacant: stateOffices.filter((unit) => unit.coverage === 'VACANT').length,
    // Covered only through somebody's additional charge (no manager of their own).
    coveredByCharge: stateOffices.filter((unit) => unit.coverage === 'COVERED' && !unit.managers.length).length,
    // Vacant today, but a State Manager is joining (still counted in vacant).
    joiningSoon: stateOffices.filter((unit) => unit.coverage === 'VACANT' && (unit.upcomingManagers?.length ?? 0) > 0).length,
    notSetUp: organisation.availableStates.length,
    staffInStates: sumStaff(stateOffices),
    staffInHeadOffice: sumStaff(activeOf('HEAD_OFFICE')),
    unplacedStaff: organisation.coverage?.unplacedStaff ?? 0,
    // Switched-off units that stay hidden unless asked for. State offices are not counted: every state is always listed.
    inactive: organisation.units.filter((unit) => !unit.isActive && unit.kind !== 'STATE').length,
  };
};

/** "Ravi Patel, Asha Singh" or "Ravi Patel, Asha Singh +2" when an office has many managers. */
export const formatManagerNames = (managers: ReadonlyArray<{ name: string }>, max = 2) => {
  const shown = managers.slice(0, max).map((manager) => manager.name).join(', ');
  return managers.length > max ? `${shown} +${managers.length - max}` : shown;
};

/** Departments that belong to one head office, for the chips on its card. */
export const departmentsOf = (units: HrmOrganisationUnit[], headOfficeId: string) =>
  units.filter((unit) => unit.kind === 'DEPARTMENT' && unit.isActive && unit.parent?.id === headOfficeId);

export type StateRowStatus = 'COVERED' | 'VACANT' | 'NOT_SET_UP' | 'SWITCHED_OFF';
export type StateFilter = 'ALL' | 'COVERED' | 'VACANT' | 'NOT_SET_UP';

export type StateRow = {
  stateId: number;
  stateName: string;
  /** The state office: the active one when there is one, otherwise a switched-off one, otherwise null. */
  unit: HrmOrganisationUnit | null;
  status: StateRowStatus;
  managers: HrmOrganisationUnit['managers'];
  /** People looking after the office through an additional charge today. */
  chargeHolders: NonNullable<HrmOrganisationUnit['chargeHolders']>;
  /** People joining as manager of a vacant office (pre-joining, or starting later). */
  upcomingManagers: NonNullable<HrmOrganisationUnit['upcomingManagers']>;
  employeeCount: number;
};

/**
 * One row for EVERY state of the master (not only the states that have an office), so the page shows what is covered
 * and what is still open. A state whose only office is switched off stays in the list as "switched off".
 */
export const buildStateRows = (organisation: Pick<HrmOrganisation, 'states' | 'units'>): StateRow[] => {
  const offices = new Map<number, HrmOrganisationUnit[]>();
  for (const unit of organisation.units) {
    if (unit.kind !== 'STATE' || !unit.state) continue;
    const list = offices.get(unit.state.id) ?? [];
    list.push(unit);
    offices.set(unit.state.id, list);
  }
  return organisation.states.map((state) => {
    const list = offices.get(state.id) ?? [];
    const unit = list.find((candidate) => candidate.isActive) ?? list[0] ?? null;
    if (!unit) return { stateId: state.id, stateName: state.name, unit: null, status: 'NOT_SET_UP' as const, managers: [], chargeHolders: [], upcomingManagers: [], employeeCount: 0 };
    if (!unit.isActive) return { stateId: state.id, stateName: state.name, unit, status: 'SWITCHED_OFF' as const, managers: [], chargeHolders: [], upcomingManagers: [], employeeCount: unit.employeeCount };
    const chargeHolders = unit.chargeHolders ?? [];
    const status: StateRowStatus = unit.coverage ?? (unit.managers.length || chargeHolders.length ? 'COVERED' : 'VACANT');
    // A state without its own manager still shows who is joining, also while a charge covers it.
    return { stateId: state.id, stateName: state.name, unit, status, managers: unit.managers, chargeHolders, upcomingManagers: unit.managers.length ? [] : unit.upcomingManagers ?? [], employeeCount: unit.employeeCount };
  });
};

const matchesStateRow = (row: StateRow, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.stateName, row.unit?.name, row.unit?.code, ...row.managers.map((manager) => manager.name), ...row.chargeHolders.map((holder) => holder.name)]
    .some((value) => value?.toLowerCase().includes(needle));
};

/** Search text first, then the status chip. "Not set up" also covers a state whose office is switched off. */
export const filterStateRows = (rows: readonly StateRow[], filter: StateFilter, query = ''): StateRow[] =>
  rows.filter((row) => matchesStateRow(row, query) && (
    filter === 'ALL'
    || (filter === 'NOT_SET_UP' ? row.status === 'NOT_SET_UP' || row.status === 'SWITCHED_OFF' : row.status === filter)
  ));

/** Numbers on the filter chips, counted over the rows that match the search text. */
export const countStateRows = (rows: readonly StateRow[], query = ''): Record<StateFilter, number> => {
  const searched = filterStateRows(rows, 'ALL', query);
  return {
    ALL: searched.length,
    COVERED: searched.filter((row) => row.status === 'COVERED').length,
    VACANT: searched.filter((row) => row.status === 'VACANT').length,
    NOT_SET_UP: searched.filter((row) => row.status === 'NOT_SET_UP' || row.status === 'SWITCHED_OFF').length,
  };
};

/**
 * States an administrator can open a new office in: the ones without any state office, switched-off or not.
 * (A switched-off office is switched on again from its row instead, because a state has only one office.)
 */
export const statesWithoutOffice = (organisation: Pick<HrmOrganisation, 'availableStates' | 'units'>) => {
  const hasOffice = new Set(organisation.units.filter((unit) => unit.kind === 'STATE' && unit.state).map((unit) => unit.state!.id));
  return organisation.availableStates.filter((state) => !hasOffice.has(state.id));
};

/** Which part of the portal the page is in: the admin portal or the employee portal. */
export const getHrmBase = (pathname: string | null | undefined) => (pathname?.startsWith('/employee') ? '/employee/hrm' : '/admin/hrm');

export const officeHref = (base: string, officeId: string) => `${base}/organisation/offices/${encodeURIComponent(officeId)}`;

export const describeSetupResult = (result: HrmHeadOfficeSetupResult) => {
  const added = result.createdDepartments.length;
  const parts = [
    result.createdHeadOffice ? `${result.headOffice.name} created` : `${result.headOffice.name} already set up`,
    added ? `${added} department${added === 1 ? '' : 's'} added` : 'no new departments',
  ];
  if (result.skippedDepartments.length) parts.push(`${result.skippedDepartments.length} already existed`);
  const adopted = result.adoptedDepartments?.length ?? 0;
  if (adopted) parts.push(`${adopted} moved under the head office`);
  return parts.join(' · ');
};

export const describeStateOfficesResult = (result: HrmStateOfficesResult) => {
  const created = result.created.length;
  const parts = [created ? `${created} state office${created === 1 ? '' : 's'} added` : 'No new state offices'];
  if (result.skipped.length) parts.push(`${result.skipped.length} skipped`);
  return parts.join(' · ');
};

export const describeSkippedState = (skipped: HrmStateOfficesResult['skipped'][number]) =>
  skipped.reason === 'SWITCHED_OFF'
    ? `${skipped.name}: its office is switched off. Switch it on from the table instead.`
    : `${skipped.name}: it already has a state office.`;

/**
 * An office / department name as the server stores it: control characters, zero-width spaces and bidi overrides
 * removed and spaces collapsed (zero-width joiners stay for Indic scripts). Same rule as the backend.
 */
export const cleanUnitName = (value: string) => value
  .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Why a cleaned name cannot be used; null when it is fine. */
export const unitNameProblem = (name: string): string | null => {
  if (name.length < 2) return 'Enter at least 2 characters.';
  if (name.length > 160) return 'The name can have at most 160 characters.';
  if (/[<>]/.test(name)) return 'The name cannot contain < or >.';
  if (!/[\p{L}\p{N}]/u.test(name)) return 'The name needs at least one letter or number.';
  return null;
};

/** Adds a department name to a list: cleaned, checked and never repeated (case-insensitive). */
export const addCustomDepartment = (current: readonly string[], raw: string) => {
  const name = cleanUnitName(raw);
  const problem = unitNameProblem(name);
  if (problem) return { names: [...current], error: problem };
  if (current.some((existing) => existing.toLowerCase() === name.toLowerCase())) return { names: [...current], error: `${name} is already in the list.` };
  return { names: [...current, name], error: '' };
};

export const filterDepartments = <T extends { name: string; code: string }>(rows: readonly T[], query = ''): T[] => {
  const needle = query.trim().toLowerCase();
  return needle ? rows.filter((row) => row.name.toLowerCase().includes(needle) || row.code.toLowerCase().includes(needle)) : [...rows];
};

/** What uses a department, in short labels for its row ([] when nothing does). */
export const describeDepartmentUse = (row: Pick<HrmDepartmentRow, 'currentEmployees' | 'totalAssignments' | 'openOffers' | 'accessScopes'>) => {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const uses: string[] = [];
  if (row.currentEmployees) uses.push(plural(row.currentEmployees, 'employee'));
  if (row.openOffers) uses.push(plural(row.openOffers, 'open offer'));
  if (row.accessScopes) uses.push('HRM access');
  // Placements that are not today's: people who left or moved, or who join later.
  if (!row.currentEmployees && row.totalAssignments) uses.push('Employee records');
  return uses;
};
