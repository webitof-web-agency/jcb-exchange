import { EMPLOYMENT_TYPE_OPTIONS } from './hrmDirectory';
import { indiaDay } from './hrmDay';

/**
 * Pure rules of the "Add assignment" form (the first assignment of a person who has none, for example one added from a
 * recruitment offer). Kept free of React so they can be tested on their own. The server checks the same things again.
 */

export type AssignmentLocationType = 'HEAD_OFFICE' | 'STATE_OFFICE';

export type AssignmentForm = {
  locationType: AssignmentLocationType;
  /** Head office postings: the chosen head office. */
  headOfficeUnitId: string;
  /** State office postings only. */
  stateId: string;
  cityId: string;
  orgUnitId: string;
  designation: string;
  employmentType: string;
  effectiveFrom: string;
  reason: string;
};

export type AssignmentErrors = Partial<Record<keyof AssignmentForm, string>>;

export type StateOption = { id: number; name: string; hasOffice: boolean; officeSwitchedOff: boolean };

/** Same window the server enforces for a start date. */
export const MIN_START_DATE = '1990-01-01';
export const MAX_START_AHEAD_DAYS = 365;
export const REASON_MAX_LENGTH = 500;

const DAY_MS = 86_400_000;

/** Local calendar day as YYYY-MM-DD (what a date input shows). */
export const toLocalDay = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/** A date that exists (2026-02-31 would silently roll over to March). */
export const isRealDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/** Latest start date the server accepts: a year after today's Indian (IST) day, which is the server's "today". */
export const maxStartDate = (now = new Date()) => {
  const serverToday = new Date(`${indiaDay(now)}T00:00:00.000Z`).getTime();
  return new Date(serverToday + MAX_START_AHEAD_DAYS * DAY_MS).toISOString().slice(0, 10);
};

export const validateStartDate = (value: string, now = new Date()) => {
  if (!value) return 'Select the start date.';
  if (!isRealDay(value) || value < MIN_START_DATE) return 'Enter a valid start date.';
  if (value > maxStartDate(now)) return 'The start date can be at most one year ahead.';
  return '';
};

/** `headOfficeId` is the default head office; without one the form starts on a state office. */
export const createEmptyAssignmentForm = (today: string, headOfficeId: string | null): AssignmentForm => ({
  locationType: headOfficeId ? 'HEAD_OFFICE' : 'STATE_OFFICE',
  headOfficeUnitId: headOfficeId ?? '',
  stateId: '',
  cityId: '',
  orgUnitId: '',
  designation: '',
  employmentType: 'FULL_TIME',
  effectiveFrom: today,
  reason: '',
});

export type StateOfficeStatus =
  | { kind: 'ok'; message: '' }
  | { kind: 'create'; message: string }
  | { kind: 'blocked'; message: string };

/** Whether the state can take people right now: it has an office, one is created for an administrator, or it is blocked. */
export const stateOfficeStatus = (state: StateOption | undefined, canManageOrg: boolean): StateOfficeStatus => {
  if (!state) return { kind: 'ok', message: '' };
  if (state.officeSwitchedOff) return { kind: 'blocked', message: `The ${state.name} state office is switched off. Switch it on from the Organisation page first.` };
  if (!state.hasOffice) {
    return canManageOrg
      ? { kind: 'create', message: `A state office will be created for ${state.name} when you save.` }
      : { kind: 'blocked', message: `${state.name} has no state office yet. Ask an administrator to add it from the Organisation page.` };
  }
  return { kind: 'ok', message: '' };
};

export type AssignmentContext = {
  headOfficeAvailable: boolean;
  /** Why the chosen head office cannot be used (it has no state and city yet). */
  headOfficeMessage?: string | null | undefined;
  states: readonly StateOption[];
  canManageOrg: boolean;
  now?: Date;
};

export const validateAssignmentForm = (form: AssignmentForm, context: AssignmentContext): AssignmentErrors => {
  const errors: AssignmentErrors = {};
  if (form.locationType === 'HEAD_OFFICE') {
    if (!context.headOfficeAvailable) errors.locationType = 'The head office is not set up. Choose State office.';
    else if (context.headOfficeMessage) errors.headOfficeUnitId = context.headOfficeMessage;
  } else {
    if (!form.stateId) errors.stateId = 'Select the state.';
    if (!form.cityId) errors.cityId = 'Select the city.';
  }
  if (!form.orgUnitId) errors.orgUnitId = 'Select the department.';
  if (!form.designation.trim()) errors.designation = 'Select the designation.';
  if (form.employmentType && !(EMPLOYMENT_TYPE_OPTIONS as readonly string[]).includes(form.employmentType)) errors.employmentType = 'Select the employment type.';
  const dateError = validateStartDate(form.effectiveFrom, context.now);
  if (dateError) errors.effectiveFrom = dateError;
  if (form.reason.trim().length > REASON_MAX_LENGTH) errors.reason = `Keep the reason within ${REASON_MAX_LENGTH} characters.`;

  // A state without a usable office blocks the save (the same message the form shows under the state box).
  if (form.locationType === 'STATE_OFFICE' && form.stateId && !errors.stateId) {
    const state = context.states.find((entry) => String(entry.id) === form.stateId);
    const status = stateOfficeStatus(state, context.canManageOrg);
    if (status.kind === 'blocked') errors.stateId = status.message;
  }
  return errors;
};

/** The request body: only what the form fills (no work mode or region; the reporting manager only when chosen). */
export const toAssignmentPayload = (form: AssignmentForm, managerEmployeeId?: string | null): Record<string, unknown> => ({
  ...(managerEmployeeId ? { managerEmployeeId } : {}),
  orgUnitId: form.orgUnitId,
  designation: form.designation.trim(),
  employmentType: form.employmentType || 'FULL_TIME',
  locationType: form.locationType,
  ...(form.locationType === 'HEAD_OFFICE'
    ? { ...(form.headOfficeUnitId ? { headOfficeUnitId: form.headOfficeUnitId } : {}) }
    : { stateId: Number(form.stateId), cityId: Number(form.cityId) }),
  effectiveFrom: form.effectiveFrom,
  ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
});

/** Where the first error is, in the order the form shows its fields (to focus it). */
export const ASSIGNMENT_FIELD_ORDER: ReadonlyArray<keyof AssignmentForm> = ['locationType', 'headOfficeUnitId', 'stateId', 'cityId', 'orgUnitId', 'designation', 'employmentType', 'effectiveFrom', 'reason'];

export const firstAssignmentError = (errors: AssignmentErrors) => ASSIGNMENT_FIELD_ORDER.find((field) => errors[field]);

/** Notice shown after a reactivation: the login part is only claimed when the server re-enabled a login. */
export const describeReactivation = (result: { employeeCode: string; loginEnabled: boolean }) =>
  result.loginEnabled ? `${result.employeeCode} is active again and their login is enabled.` : `${result.employeeCode} is active again.`;
