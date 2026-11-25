import type { HrmHeadOfficeSetupResult, HrmOrganisation, HrmOrganisationUnit, HrmStateOfficesResult } from './hrmApi';

/** Departments suggested when the head office is set up. The administrator can untick or add more. */
export const SUGGESTED_HEAD_OFFICE_DEPARTMENTS = [
  'Human Resources',
  'Finance & Accounts',
  'Sales',
  'Operations',
  'Technology',
  'Customer Support',
  'Marketing',
  'Legal & Compliance',
] as const;

export type OrganisationGroups = {
  headOffices: HrmOrganisationUnit[];
  departments: HrmOrganisationUnit[];
  states: HrmOrganisationUnit[];
  others: HrmOrganisationUnit[];
};

export const matchesUnit = (unit: HrmOrganisationUnit, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [unit.name, unit.code, unit.state?.name, unit.city?.name, unit.parent?.name, ...unit.managers.map((manager) => manager.name)]
    .some((value) => value?.toLowerCase().includes(needle));
};

/** Splits the units into the sections of the page, applying the search text and the inactive switch. */
export const groupOrganisation = (units: HrmOrganisationUnit[], options: { query?: string; showInactive?: boolean } = {}): OrganisationGroups => {
  const visible = units.filter((unit) => (options.showInactive || unit.isActive) && matchesUnit(unit, options.query ?? ''));
  const pick = (kind: HrmOrganisationUnit['kind']) => visible.filter((unit) => unit.kind === kind);
  return { headOffices: pick('HEAD_OFFICE'), departments: pick('DEPARTMENT'), states: pick('STATE'), others: pick('OTHER') };
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
    headOffice: activeOf('HEAD_OFFICE')[0] ?? null,
    departments: activeOf('DEPARTMENT').length,
    stateOffices: stateOffices.length,
    totalStates: organisation.indiaStateCount || organisation.states.length,
    covered: stateOffices.filter((unit) => unit.coverage === 'COVERED').length,
    vacant: stateOffices.filter((unit) => unit.coverage === 'VACANT').length,
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
    if (!unit) return { stateId: state.id, stateName: state.name, unit: null, status: 'NOT_SET_UP' as const, managers: [], upcomingManagers: [], employeeCount: 0 };
    if (!unit.isActive) return { stateId: state.id, stateName: state.name, unit, status: 'SWITCHED_OFF' as const, managers: [], upcomingManagers: [], employeeCount: unit.employeeCount };
    const status: StateRowStatus = unit.coverage ?? (unit.managers.length ? 'COVERED' : 'VACANT');
    return { stateId: state.id, stateName: state.name, unit, status, managers: unit.managers, upcomingManagers: status === 'VACANT' ? unit.upcomingManagers ?? [] : [], employeeCount: unit.employeeCount };
  });
};

const matchesStateRow = (row: StateRow, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.stateName, row.unit?.name, row.unit?.code, ...row.managers.map((manager) => manager.name)]
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

/** Adds a custom department name to the checklist: trims, ignores blanks and repeats (case-insensitive). */
export const addCustomDepartment = (current: readonly string[], raw: string) => {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2) return { names: [...current], error: 'Enter at least 2 characters.' };
  if (current.some((existing) => existing.toLowerCase() === name.toLowerCase())) return { names: [...current], error: `${name} is already in the list.` };
  return { names: [...current, name], error: '' };
};
