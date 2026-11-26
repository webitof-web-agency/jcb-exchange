import { formatHrmDate, formatHrmStatus } from './hrmUi';

/**
 * The rules of the "Reporting manager" dropdown and of "Change manager", kept free of React so they can be tested on
 * their own. The list itself (who is offered, who is suggested, who is blocked) comes from the server.
 */

export type ManagerCandidate = {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  department: string | null;
  officeName: string | null;
  officeType: string | null;
  /** The state of their state office (null at head office). */
  stateId: number | null;
  stateName: string | null;
  cityName: string | null;
  isOfficeManager: boolean;
  /** State offices they also look after (additional charges). */
  chargeStateIds: number[];
  isNational: boolean;
  directReports: number;
  role: string | null;
  hasLogin: boolean;
  status: string;
  /** Why they are suggested, for example "State Manager of Gujarat". */
  suggestedAs: string | null;
  /** Why they cannot be chosen (a reporting loop). */
  blocked: string | null;
};

/** A chosen manager: a row of the list, or only the id and name (a stored offer). */
export type ManagerPick = Pick<ManagerCandidate, 'id' | 'name'> & Partial<Omit<ManagerCandidate, 'id' | 'name'>>;

export type ManagerTarget = { kind: 'HEAD_OFFICE' | 'STATE' | null; stateId: number | null; stateName: string | null };

export type ManagerGroup = { id: 'SUGGESTED' | 'STATE' | 'HEAD_OFFICE' | 'OTHER'; title: string; people: ManagerCandidate[]; more: boolean };

export type ManagerOptions = {
  target: ManagerTarget;
  currentManagerId: string | null;
  /** The one obvious choice, filled in before HR chooses (null when there is none or several). */
  preselect: ManagerCandidate | null;
  note: string | null;
  groups: ManagerGroup[];
  /** False when the viewer only sees some people (their states). */
  searchesEveryone: boolean;
};

/** Where the manager is chosen for: the person and / or the place they will work. */
export type ManagerQuery = {
  employeeId?: string | undefined;
  stateId?: string | number | null | undefined;
  headOffice?: boolean | undefined;
  /** The person is, or will be, the manager of the state office. */
  managerRole?: boolean | undefined;
  purpose?: 'manager' | 'successor' | undefined;
};

/** Query string values: empty ones are left out; a head office needs no state or city. */
export const toManagerParams = (query: ManagerQuery, search = '') => {
  const params: Record<string, string> = {};
  if (query.employeeId) params.employeeId = query.employeeId;
  if (query.headOffice) params.headOffice = 'true';
  else if (query.stateId) params.stateId = String(query.stateId);
  if (query.managerRole !== undefined) params.managerRole = String(query.managerRole);
  if (query.purpose) params.purpose = query.purpose;
  if (search.trim()) params.search = search.trim().slice(0, 80);
  return params;
};

/** The two labels next to the name: the job and the permission role. */
export const managerLabels = (person: ManagerPick) => ({
  designation: person.designation === undefined ? null : person.designation || 'No designation',
  role: person.hasLogin === undefined ? null : !person.hasLogin ? 'No login' : person.role ? `Role: ${person.role}` : 'No role',
});

/** The identifying line under the name. */
export const managerDetail = (person: ManagerPick) => {
  const place = person.officeType === 'HEAD_OFFICE' ? ['Head office', person.cityName].filter(Boolean).join(', ') : person.cityName || person.officeName;
  const reports = person.directReports ? `${person.directReports} report${person.directReports === 1 ? '' : 's'}` : '';
  const status = person.status && person.status !== 'ACTIVE' ? formatHrmStatus(person.status) : '';
  return [person.employeeCode, person.department, place, reports, status].filter(Boolean).join(' · ');
};

/**
 * A manager from another state office is allowed (real companies do it) but pointed out. Head office people, the
 * National Operations Manager and whoever holds the state's additional charge are never flagged.
 */
export const managerWarning = (person: ManagerPick, target: ManagerTarget | null | undefined) => {
  if (!target || target.kind !== 'STATE' || !target.stateId) return null;
  if (person.isNational || person.officeType !== 'REGION' || !person.stateId || person.stateId === target.stateId) return null;
  if (person.chargeStateIds?.includes(target.stateId)) return null;
  return `Works from ${person.officeName ?? 'another state office'}, not in ${target.stateName ?? 'the chosen state'}.`;
};

/** What the field holds and who put it there: 'auto' = filled in from the suggestion, 'user' = HR chose or removed it. */
export type ManagerSelection = { manager: ManagerPick | null; source: 'empty' | 'auto' | 'user' };
export const EMPTY_MANAGER_SELECTION: ManagerSelection = { manager: null, source: 'empty' };
export const chosenManager = (manager: ManagerPick | null): ManagerSelection => ({ manager, source: 'user' });
/** A new suggestion never replaces what HR chose or removed. */
export const suggestedManager = (current: ManagerSelection, preselect: ManagerPick | null): ManagerSelection =>
  (current.source === 'user' ? current : preselect ? { manager: preselect, source: 'auto' } : EMPTY_MANAGER_SELECTION);
/** The place changed: a manager filled in for the old place goes; one HR chose stays. */
export const forgetSuggestedManager = (current: ManagerSelection): ManagerSelection => (current.source === 'auto' ? EMPTY_MANAGER_SELECTION : current);

/* ------------------------------- change manager ------------------------------- */

type Posting = { status?: string; effectiveFrom: string; effectiveTo?: string | null };

/** The assignment a change builds on (as the server picks it): the newest active one, when it has no end date. */
export const openPostingOf = <T extends Posting>(assignments: readonly T[] | undefined): T | null => {
  const newest = [...(assignments ?? [])].filter((row) => row.status === 'ACTIVE').sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return newest && !newest.effectiveTo ? newest : null;
};

const addDays = (day: string, days: number) => new Date(new Date(`${day}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** The dates the server accepts: up to 90 days back (never before the assignment began) and up to a year ahead. */
export const managerChangeWindow = (assignmentFrom: string, today: string) => {
  const began = assignmentFrom.slice(0, 10);
  const back = addDays(today, -90);
  return { min: began > back ? began : back, max: addDays(today, 365), initial: began > today ? began : today, startsLater: began > today, began };
};

export type ManagerChangeForm = { mode: 'set' | 'none'; managerId: string; effectiveFrom: string; reason: string };
export type ManagerChangeErrors = Partial<Record<'manager' | 'effectiveFrom' | 'reason', string>>;

export const validateManagerChange = (form: ManagerChangeForm, context: { currentId: string | null; selfId: string; min: string; max: string }) => {
  const errors: ManagerChangeErrors = {};
  if (form.mode === 'set') {
    if (!form.managerId) errors.manager = 'Choose the reporting manager.';
    else if (form.managerId === context.selfId) errors.manager = 'An employee cannot report to themselves.';
    else if (form.managerId === context.currentId) errors.manager = 'They already report to this person.';
  } else if (!context.currentId) errors.manager = 'They have no reporting manager already.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveFrom)) errors.effectiveFrom = 'Select the date.';
  else if (form.effectiveFrom < context.min) errors.effectiveFrom = `Choose ${formatHrmDate(context.min)} or later.`;
  else if (form.effectiveFrom > context.max) errors.effectiveFrom = 'The date can be at most one year ahead.';
  if (form.reason.trim().length > 500) errors.reason = 'Keep the reason within 500 characters.';
  return errors;
};

export const describeManagerChange = (input: { name: string; managerName: string | null; effectiveFrom: string; today: string }) => {
  const from = input.effectiveFrom > input.today ? ` from ${formatHrmDate(input.effectiveFrom)}` : '';
  return input.managerName ? `${input.name} reports to ${input.managerName}${from}.` : `${input.name} has no reporting manager${from}.`;
};
