import { EMPLOYMENT_TYPE_OPTIONS } from './hrmDirectory';
import { indiaDay } from './hrmDay';

/**
 * Pure rules of the "Add assignment" form (the first assignment of a person who has none, for example one added from a
 * recruitment offer). Kept free of React so they can be tested on their own. The server checks the same things again.
 */

export type AssignmentLocationType = 'HEAD_OFFICE' | 'STATE_OFFICE';

export type AssignmentForm = {
  locationType: AssignmentLocationType;
  stateId: string;
  cityId: string;
  orgUnitId: string;
  designation: string;
  employmentType: string;
  effectiveFrom: string;
  reason: string;
};

export type AssignmentErrors = Partial<Record<keyof AssignmentForm, string>>;

/** The head office place (state and city ids) from the form options, or null when it is not set up. */
export type DefaultPlace = { stateId: number; cityId: number } | null;

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

export const createEmptyAssignmentForm = (today: string, place: DefaultPlace): AssignmentForm => ({
  locationType: place ? 'HEAD_OFFICE' : 'STATE_OFFICE',
  stateId: place ? String(place.stateId) : '',
  cityId: place ? String(place.cityId) : '',
  orgUnitId: '',
  designation: '',
  employmentType: 'FULL_TIME',
  effectiveFrom: today,
  reason: '',
});

const isDefaultPlace = (form: Pick<AssignmentForm, 'stateId' | 'cityId'>, place: DefaultPlace) =>
  Boolean(place) && form.stateId === String(place!.stateId) && form.cityId === String(place!.cityId);

/**
 * What the place becomes when the radio is switched. Head office goes back to its own place; moving to a state office
 * drops that default place (so the person does not keep Raipur by accident) but keeps a place somebody typed.
 */
export const placeAfterSwitch = (form: AssignmentForm, next: AssignmentLocationType, place: DefaultPlace) => {
  if (next === form.locationType) return { stateId: form.stateId, cityId: form.cityId };
  if (next === 'HEAD_OFFICE') return place ? { stateId: String(place.stateId), cityId: String(place.cityId) } : { stateId: form.stateId, cityId: form.cityId };
  return isDefaultPlace(form, place) ? { stateId: '', cityId: '' } : { stateId: form.stateId, cityId: form.cityId };
};

/**
 * The server places a person at the head office only when the place IS the head office city; any other place belongs
 * to that state's office. So a "head office" assignment with a different place is really a state office one.
 */
export const effectiveOfficeKind = (form: Pick<AssignmentForm, 'locationType' | 'stateId' | 'cityId'>, place: DefaultPlace): AssignmentLocationType =>
  form.locationType === 'HEAD_OFFICE' && isDefaultPlace(form, place) ? 'HEAD_OFFICE' : 'STATE_OFFICE';

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
  headOfficePlace: DefaultPlace;
  states: readonly StateOption[];
  canManageOrg: boolean;
  now?: Date;
};

export const validateAssignmentForm = (form: AssignmentForm, context: AssignmentContext): AssignmentErrors => {
  const errors: AssignmentErrors = {};
  if (form.locationType === 'HEAD_OFFICE' && !context.headOfficeAvailable) errors.locationType = 'The head office is not set up. Choose State office.';
  if (!form.stateId) errors.stateId = 'Select the state.';
  if (!form.cityId) errors.cityId = 'Select the city.';
  if (!form.orgUnitId) errors.orgUnitId = 'Select the department.';
  if (!form.designation.trim()) errors.designation = 'Select the designation.';
  if (form.employmentType && !(EMPLOYMENT_TYPE_OPTIONS as readonly string[]).includes(form.employmentType)) errors.employmentType = 'Select the employment type.';
  const dateError = validateStartDate(form.effectiveFrom, context.now);
  if (dateError) errors.effectiveFrom = dateError;
  if (form.reason.trim().length > REASON_MAX_LENGTH) errors.reason = `Keep the reason within ${REASON_MAX_LENGTH} characters.`;

  // A state without a usable office blocks the save (the same message the form shows under the state box).
  if (form.stateId && !errors.stateId && effectiveOfficeKind(form, context.headOfficePlace) === 'STATE_OFFICE') {
    const state = context.states.find((entry) => String(entry.id) === form.stateId);
    const status = stateOfficeStatus(state, context.canManageOrg);
    if (status.kind === 'blocked') errors.stateId = status.message;
  }
  return errors;
};

/** The request body: only what the form fills (no reporting manager, work mode or region). */
export const toAssignmentPayload = (form: AssignmentForm): Record<string, unknown> => ({
  orgUnitId: form.orgUnitId,
  designation: form.designation.trim(),
  employmentType: form.employmentType || 'FULL_TIME',
  stateId: Number(form.stateId),
  cityId: Number(form.cityId),
  effectiveFrom: form.effectiveFrom,
  ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
});

/** Where the first error is, in the order the form shows its fields (to focus it). */
export const ASSIGNMENT_FIELD_ORDER: ReadonlyArray<keyof AssignmentForm> = ['locationType', 'stateId', 'cityId', 'orgUnitId', 'designation', 'employmentType', 'effectiveFrom', 'reason'];

export const firstAssignmentError = (errors: AssignmentErrors) => ASSIGNMENT_FIELD_ORDER.find((field) => errors[field]);

/** Notice shown after a reactivation: the login part is only claimed when the server re-enabled a login. */
export const describeReactivation = (result: { employeeCode: string; loginEnabled: boolean }) =>
  result.loginEnabled ? `${result.employeeCode} is active again and their login is enabled.` : `${result.employeeCode} is active again.`;
