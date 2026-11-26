import type {
  HrmAppointManagerPayload,
  HrmDeactivatePayload,
  HrmMoveResult,
  HrmOrganisationUnit,
  HrmReplaceManagerPayload,
  HrmTransferPayload,
} from './hrmApi';
import { describeAccessResult, describeEndedCharges } from './hrmManagerAccess';
import { indiaDay } from './hrmDay';

/**
 * Pure rules for the State Manager lifecycle dialogs (transfer, appoint, replace, deactivate). They mirror what the
 * server enforces, so a mistake is caught on the form instead of after a round trip. Dates are YYYY-MM-DD strings
 * and "today" is always passed in, which keeps every rule easy to test.
 */

export const MAX_BACKDATE_DAYS = 90;
export const MAX_SCHEDULE_DAYS = 365;
export const MIN_DEACTIVATE_REASON = 3;
export const MAX_REASON_LENGTH = 500;
export const MAX_DESIGNATION_LENGTH = 120;

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date that really exists (2026-02-31 is not one). */
export const isRealDay = (value: string) => {
  if (!DAY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/** The date on the person's own clock, for the default of a date field. */
export const toLocalDay = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/** The UTC calendar day of an instant (used for plain day arithmetic on YYYY-MM-DD strings). */
export const toUtcDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The date the server calls "today": the Indian (IST) calendar day. Every lifecycle dialog (Transfer, Deactivate,
 * Appoint and Replace a manager) uses this for its default date and for the min / max of its date field. The UTC day
 * must not be used: between 00:00 and 05:30 IST it is still yesterday, so the form would default to yesterday and
 * refuse today as "in the future" although the server accepts it.
 */
export const toServerDay = (date: Date = new Date()) => indiaDay(date);

/** The machine-readable code of a failed HRM request (for example DESIGNATION_REQUIRED), when the server sent one. */
export const errorCodeOf = (error: unknown): string => {
  const code = (error as { response?: { data?: { code?: unknown } } } | null | undefined)?.response?.data?.code;
  return typeof code === 'string' ? code : '';
};

export const DESIGNATION_REQUIRED_CODE = 'DESIGNATION_REQUIRED';

export const shiftDay = (day: string, days: number) => toUtcDay(new Date(new Date(`${day}T00:00:00.000Z`).getTime() + days * DAY_MS));

/** Whole days from `from` to `to` (positive when `to` is later). */
export const dayDifference = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / DAY_MS);

/** The earliest and latest date a change may carry. A deactivation can never be dated in the future. */
export const effectiveDateBounds = (today: string, allowFuture: boolean) => ({
  min: shiftDay(today, -MAX_BACKDATE_DAYS),
  max: allowFuture ? shiftDay(today, MAX_SCHEDULE_DAYS) : today,
});

export const validateEffectiveDate = (value: string, today: string, options: { allowFuture: boolean }) => {
  if (!value) return 'Select the date.';
  if (!isRealDay(value)) return 'Enter a valid date.';
  const offset = dayDifference(today, value);
  if (offset < -MAX_BACKDATE_DAYS) return `The date cannot be more than ${MAX_BACKDATE_DAYS} days in the past.`;
  if (offset > 0 && !options.allowFuture) return 'The date cannot be in the future.';
  if (offset > MAX_SCHEDULE_DAYS) return 'The date cannot be more than a year ahead.';
  return '';
};

/* ----------------------------- reporting manager ----------------------------- */

/** keep = leave it to the server default, set = a chosen person, none = nobody. */
export type ManagerMode = 'keep' | 'set' | 'none';
export interface ManagerChoice { mode: ManagerMode; employeeId: string }

export const KEEP_MANAGER: ManagerChoice = { mode: 'keep', employeeId: '' };
export const setManager = (employeeId: string): ManagerChoice => ({ mode: 'set', employeeId });

/** undefined keeps the current/default manager, null clears it, an id names the manager. */
export const managerPayloadValue = (choice: ManagerChoice): string | null | undefined => {
  if (choice.mode === 'none') return null;
  if (choice.mode === 'set') return choice.employeeId || undefined;
  return undefined;
};

export const validateManagerChoice = (choice: ManagerChoice, selfId?: string) => {
  if (choice.mode !== 'set') return '';
  if (!choice.employeeId) return 'Choose the reporting manager.';
  if (selfId && choice.employeeId === selfId) return 'An employee cannot report to themselves.';
  return '';
};

const withManager = (choice: ManagerChoice) => {
  const value = managerPayloadValue(choice);
  return value === undefined ? {} : { managerEmployeeId: value };
};

const withText = <K extends string>(key: K, value: string, max: number): Partial<Record<K, string>> => {
  const trimmed = value.trim();
  return trimmed ? ({ [key]: trimmed.slice(0, max) } as Record<K, string>) : {};
};

const validateOptionalText = (value: string, max: number, label: string) =>
  value.trim().length > max ? `${label} can be at most ${max} characters.` : '';

/* --------------------------------- offices --------------------------------- */

export type DestinationKind = 'HEAD_OFFICE' | 'STATE';

/** The offices a person can be moved to: active head office first, then state offices A–Z. */
export const selectableOffices = (units: readonly HrmOrganisationUnit[], excludeId?: string | null) =>
  units
    .filter((unit) => unit.isActive && (unit.kind === 'HEAD_OFFICE' || unit.kind === 'STATE') && unit.id !== excludeId)
    // Head offices first, the default one at the top.
    .sort((a, b) => (a.kind !== b.kind ? (a.kind === 'HEAD_OFFICE' ? -1 : 1) : Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name)));

export const describeOfficeOption = (unit: Pick<HrmOrganisationUnit, 'name' | 'kind' | 'state'>) => {
  if (unit.kind === 'HEAD_OFFICE') return `${unit.name} · Head office`;
  const stateName = unit.state?.name;
  return stateName && !unit.name.toLowerCase().includes(stateName.toLowerCase()) ? `${unit.name} · ${stateName}` : unit.name;
};

export const destinationKindOf = (unit?: Pick<HrmOrganisationUnit, 'kind'> | null): DestinationKind | null =>
  unit?.kind === 'HEAD_OFFICE' ? 'HEAD_OFFICE' : unit?.kind === 'STATE' ? 'STATE' : null;

/* -------------------------------- transfer -------------------------------- */

export interface TransferForm {
  toOfficeUnitId: string;
  cityId: string;
  /** Empty keeps the current department. */
  orgUnitId: string;
  effectiveFrom: string;
  manager: ManagerChoice;
  /** Only meaningful for a person who manages an office today. */
  keepManagerRole: boolean;
  designation: string;
  reason: string;
}

export type TransferErrors = Partial<Record<'toOfficeUnitId' | 'cityId' | 'effectiveFrom' | 'manager' | 'designation' | 'reason', string>>;

/**
 * True when the move ends the person's manager role: they manage an office today and either go to the head office
 * (which has no manager) or give the role up in the new state. The server then needs a new designation, because they
 * can no longer be titled State Manager.
 */
export const stopsBeingManager = (input: { managesOffice: boolean; destinationKind: DestinationKind | null; keepManagerRole: boolean }) =>
  input.managesOffice && (input.destinationKind === 'HEAD_OFFICE' || (input.destinationKind === 'STATE' && !input.keepManagerRole));

export const createTransferForm = (today: string, defaultOfficeUnitId = ''): TransferForm => ({
  toOfficeUnitId: defaultOfficeUnitId, cityId: '', orgUnitId: '', effectiveFrom: today, manager: KEEP_MANAGER, keepManagerRole: true, designation: '', reason: '',
});

export const validateTransferForm = (form: TransferForm, context: { today: string; destinationKind: DestinationKind | null; employeeId: string }): TransferErrors => {
  const errors: TransferErrors = {};
  if (!form.toOfficeUnitId) errors.toOfficeUnitId = 'Select the office.';
  if (context.destinationKind === 'STATE' && !form.cityId) errors.cityId = 'Select the city.';
  const date = validateEffectiveDate(form.effectiveFrom, context.today, { allowFuture: true });
  if (date) errors.effectiveFrom = date;
  const manager = validateManagerChoice(form.manager, context.employeeId);
  if (manager) errors.manager = manager;
  const designation = validateOptionalText(form.designation, MAX_DESIGNATION_LENGTH, 'The designation');
  if (designation) errors.designation = designation;
  const reason = validateOptionalText(form.reason, MAX_REASON_LENGTH, 'The reason');
  if (reason) errors.reason = reason;
  return errors;
};

export const toTransferPayload = (form: TransferForm, options: { destinationKind: DestinationKind | null; managesOffice: boolean }): HrmTransferPayload => ({
  toOfficeUnitId: form.toOfficeUnitId,
  effectiveFrom: form.effectiveFrom,
  ...(options.destinationKind === 'STATE' && form.cityId ? { cityId: Number(form.cityId) } : {}),
  ...(form.orgUnitId ? { orgUnitId: form.orgUnitId } : {}),
  ...withManager(form.manager),
  // Omitted keeps the manager role. A head office has no manager, so the server clears it there by itself.
  ...(options.destinationKind === 'STATE' && options.managesOffice && !form.keepManagerRole ? { isOfficeManager: false } : {}),
  ...withText('designation', form.designation, MAX_DESIGNATION_LENGTH),
  ...withText('reason', form.reason, MAX_REASON_LENGTH),
});

/* -------------------------------- deactivate -------------------------------- */

export type ExitOutcome = 'EXITED' | 'SUSPENDED';

export const EXIT_OUTCOME_OPTIONS: ReadonlyArray<{ id: ExitOutcome; title: string; description: string }> = [
  { id: 'EXITED', title: 'Exited', description: 'The person has left. Their assignments end and they no longer count as staff.' },
  { id: 'SUSPENDED', title: 'Suspended', description: 'On hold. Their assignments stay, and they can be reactivated later.' },
];

export interface DeactivateForm {
  outcome: ExitOutcome;
  effectiveDate: string;
  reason: string;
  disableLogin: boolean;
  reassignToId: string;
}

export type DeactivateErrors = Partial<Record<'effectiveDate' | 'reason' | 'reassignToId', string>>;

export const createDeactivateForm = (todayUtc: string): DeactivateForm => ({
  outcome: 'EXITED', effectiveDate: todayUtc, reason: '', disableLogin: true, reassignToId: '',
});

export const validateDeactivateForm = (form: DeactivateForm, context: { todayUtc: string; directReports: number; employeeId: string }): DeactivateErrors => {
  const errors: DeactivateErrors = {};
  const date = validateEffectiveDate(form.effectiveDate, context.todayUtc, { allowFuture: false });
  if (date) errors.effectiveDate = date;
  const reason = form.reason.trim();
  if (reason.length < MIN_DEACTIVATE_REASON) errors.reason = `Enter the reason (at least ${MIN_DEACTIVATE_REASON} characters).`;
  else if (reason.length > MAX_REASON_LENGTH) errors.reason = `The reason can be at most ${MAX_REASON_LENGTH} characters.`;
  if (context.directReports > 0) {
    if (!form.reassignToId) errors.reassignToId = 'Choose who these people report to from now on.';
    else if (form.reassignToId === context.employeeId) errors.reassignToId = 'Choose someone else.';
  }
  return errors;
};

export const toDeactivatePayload = (form: DeactivateForm, options: { hasLogin: boolean; directReports: number }): HrmDeactivatePayload => ({
  outcome: form.outcome,
  effectiveDate: form.effectiveDate,
  reason: form.reason.trim(),
  ...(options.directReports > 0 && form.reassignToId ? { reassignReportsToEmployeeId: form.reassignToId } : {}),
  ...(options.hasLogin ? { disableLogin: form.disableLogin } : {}),
});

/* --------------------------------- appoint --------------------------------- */

export interface AppointForm {
  employeeId: string;
  cityId: string;
  effectiveFrom: string;
  manager: ManagerChoice;
  designation: string;
  reason: string;
}

export type AppointErrors = Partial<Record<'employeeId' | 'cityId' | 'effectiveFrom' | 'manager' | 'designation' | 'reason', string>>;

export const createAppointForm = (today: string, defaultDesignation: string, nationalManagerId = ''): AppointForm => ({
  employeeId: '', cityId: '', effectiveFrom: today, manager: nationalManagerId ? setManager(nationalManagerId) : KEEP_MANAGER, designation: defaultDesignation, reason: '',
});

/**
 * `alreadyInOffice` is true when the chosen person already works from this office (no city needed), false when
 * they work elsewhere or have no office recorded (the city of the new place is needed).
 */
export const validateAppointForm = (form: AppointForm, context: { today: string; alreadyInOffice: boolean }): AppointErrors => {
  const errors: AppointErrors = {};
  if (!form.employeeId) errors.employeeId = 'Choose the person to appoint.';
  if (form.employeeId && !context.alreadyInOffice && !form.cityId) errors.cityId = 'Select the city they will work from.';
  const date = validateEffectiveDate(form.effectiveFrom, context.today, { allowFuture: true });
  if (date) errors.effectiveFrom = date;
  const manager = validateManagerChoice(form.manager, form.employeeId);
  if (manager) errors.manager = manager;
  const designation = validateOptionalText(form.designation, MAX_DESIGNATION_LENGTH, 'The designation');
  if (designation) errors.designation = designation;
  const reason = validateOptionalText(form.reason, MAX_REASON_LENGTH, 'The reason');
  if (reason) errors.reason = reason;
  return errors;
};

export const toAppointPayload = (form: AppointForm): HrmAppointManagerPayload => ({
  employeeId: form.employeeId,
  effectiveFrom: form.effectiveFrom,
  ...(form.cityId ? { cityId: Number(form.cityId) } : {}),
  ...withManager(form.manager),
  ...withText('designation', form.designation, MAX_DESIGNATION_LENGTH),
  ...withText('reason', form.reason, MAX_REASON_LENGTH),
});

/* --------------------------------- replace --------------------------------- */

export type OutgoingActionId = 'KEEP_AS_MEMBER' | 'TRANSFER' | 'DEACTIVATE';

export const OUTGOING_ACTION_OPTIONS: ReadonlyArray<{ id: OutgoingActionId; title: string; description: string }> = [
  { id: 'KEEP_AS_MEMBER', title: 'Stay in this office as a member', description: 'They keep working here but are no longer a manager.' },
  { id: 'TRANSFER', title: 'Move to another office', description: 'They are transferred on the same date, without the manager role.' },
  { id: 'DEACTIVATE', title: 'Deactivate', description: 'They leave or are put on hold. Deactivation is applied today.' },
];

/** Deactivating is a separate permission (hrm.employees.manage): without it the option is not offered at all. */
export const outgoingActionOptions = (canDeactivate: boolean) =>
  OUTGOING_ACTION_OPTIONS.filter((option) => option.id !== 'DEACTIVATE' || canDeactivate);

export const REPLACE_DATE_MESSAGE = 'A replacement takes effect today (or a past date). To schedule a future change, appoint the new manager and transfer the old one on that date.';

export const OUTGOING_DESIGNATION_HINT = 'Required when they were titled State Manager – they stop being one.';

export interface ReplaceForm {
  incomingEmployeeId: string;
  incomingCityId: string;
  effectiveFrom: string;
  /** keep = the outgoing manager's own manager (or the National Operations Manager). */
  manager: ManagerChoice;
  outgoingAction: OutgoingActionId;
  transferOfficeId: string;
  transferCityId: string;
  transferOrgUnitId: string;
  /** The new title of the outgoing manager (stay / move). Empty keeps the current one. */
  outgoingDesignation: string;
  deactivateOutcome: ExitOutcome;
  disableLogin: boolean;
  reason: string;
}

export type ReplaceErrors = Partial<Record<'incomingEmployeeId' | 'incomingCityId' | 'effectiveFrom' | 'manager' | 'transferOfficeId' | 'transferCityId' | 'outgoingDesignation' | 'reason', string>>;

export const createReplaceForm = (today: string): ReplaceForm => ({
  incomingEmployeeId: '', incomingCityId: '', effectiveFrom: today, manager: KEEP_MANAGER,
  outgoingAction: 'KEEP_AS_MEMBER', transferOfficeId: '', transferCityId: '', transferOrgUnitId: '', outgoingDesignation: '',
  deactivateOutcome: 'EXITED', disableLogin: true, reason: '',
});

export const validateReplaceForm = (
  form: ReplaceForm,
  context: { today: string; outgoingEmployeeId: string; incomingAlreadyInOffice: boolean; transferKind: DestinationKind | null },
): ReplaceErrors => {
  const errors: ReplaceErrors = {};
  if (!form.incomingEmployeeId) errors.incomingEmployeeId = 'Choose the new manager.';
  else if (form.incomingEmployeeId === context.outgoingEmployeeId) errors.incomingEmployeeId = 'Choose a different person as the replacement.';
  if (form.incomingEmployeeId && !context.incomingAlreadyInOffice && !form.incomingCityId) errors.incomingCityId = 'Select the city they will work from.';
  // The replacement and the people who now report to them change together, so the server takes today or a past date only.
  const date = validateEffectiveDate(form.effectiveFrom, context.today, { allowFuture: false });
  if (date) errors.effectiveFrom = dayDifference(context.today, form.effectiveFrom) > 0 && isRealDay(form.effectiveFrom) ? REPLACE_DATE_MESSAGE : date;
  const manager = validateManagerChoice(form.manager, form.incomingEmployeeId);
  if (manager) errors.manager = manager;
  if (form.outgoingAction !== 'DEACTIVATE') {
    const designation = validateOptionalText(form.outgoingDesignation, MAX_DESIGNATION_LENGTH, 'The designation');
    if (designation) errors.outgoingDesignation = designation;
  }
  if (form.outgoingAction === 'TRANSFER') {
    if (!form.transferOfficeId) errors.transferOfficeId = 'Select the office they move to.';
    else if (context.transferKind === 'STATE' && !form.transferCityId) errors.transferCityId = 'Select the city.';
  }
  const reason = validateOptionalText(form.reason, MAX_REASON_LENGTH, 'The reason');
  if (reason) errors.reason = reason;
  return errors;
};

export const toReplacePayload = (form: ReplaceForm, context: { outgoingEmployeeId: string; transferKind: DestinationKind | null }): HrmReplaceManagerPayload => {
  const outgoing: HrmReplaceManagerPayload['outgoing'] = form.outgoingAction === 'TRANSFER'
    ? {
      action: 'TRANSFER',
      toOfficeUnitId: form.transferOfficeId,
      ...(context.transferKind === 'STATE' && form.transferCityId ? { cityId: Number(form.transferCityId) } : {}),
      ...(form.transferOrgUnitId ? { orgUnitId: form.transferOrgUnitId } : {}),
      ...withText('designation', form.outgoingDesignation, MAX_DESIGNATION_LENGTH),
    }
    : form.outgoingAction === 'DEACTIVATE'
      ? { action: 'DEACTIVATE', outcome: form.deactivateOutcome, disableLogin: form.disableLogin }
      : { action: 'KEEP_AS_MEMBER', ...withText('designation', form.outgoingDesignation, MAX_DESIGNATION_LENGTH) };
  return {
    outgoingEmployeeId: context.outgoingEmployeeId,
    incomingEmployeeId: form.incomingEmployeeId,
    effectiveFrom: form.effectiveFrom,
    ...(form.incomingCityId ? { incomingCityId: Number(form.incomingCityId) } : {}),
    ...withManager(form.manager),
    outgoing,
    ...withText('reason', form.reason, MAX_REASON_LENGTH),
  };
};

/* ------------------------------- result texts ------------------------------- */

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const officeName = (id: string, officeNames: Record<string, string>) => officeNames[id] ?? 'A state office';

/** Toast after a transfer or appointment; warns when the move left a state office without a manager. */
export const describeMoveResult = (result: Pick<HrmMoveResult, 'vacatedOfficeId' | 'access' | 'chargesEnded'>, officeNames: Record<string, string> = {}, action = 'Change saved') => {
  const base = `${action}.${describeAccessResult(result.access)}${describeEndedCharges(result.chargesEnded)}`;
  return result.vacatedOfficeId ? `${base} ${officeName(result.vacatedOfficeId, officeNames)} now has no manager.` : base;
};

export const describeDeactivation = (
  result: { employeeCode: string; reportsMoved: number; loginDisabled: boolean; vacatedOfficeIds: readonly string[]; chargesEnded?: ReadonlyArray<{ officeName: string }> },
  outcome: ExitOutcome,
  officeNames: Record<string, string> = {},
) => {
  const parts = [`${result.employeeCode} ${outcome === 'EXITED' ? 'marked as exited' : 'suspended'}`];
  if (result.reportsMoved) parts.push(`${plural(result.reportsMoved, 'person', 'people')} now report${result.reportsMoved === 1 ? 's' : ''} to the new manager`);
  if (result.loginDisabled) parts.push('login disabled');
  const vacated = result.vacatedOfficeIds.map((id) => officeName(id, officeNames));
  const warning = vacated.length ? ` ${vacated.join(', ')} now ${vacated.length === 1 ? 'has' : 'have'} no manager.` : '';
  return `${parts.join(' · ')}.${describeEndedCharges(result.chargesEnded)}${warning}`;
};

/**
 * Toast after a replacement. When the new manager managed another state until now, that state is now without a manager
 * and the toast says so (`vacatedOfficeId`, named through `officeNames`).
 */
export const describeReplaceResult = (
  result: { reportsMoved: number; vacatedOfficeId?: string | null | undefined; access?: HrmMoveResult['access'] | undefined; chargesEnded?: HrmMoveResult['chargesEnded'] | undefined; outgoingRoleChanged?: boolean | undefined; alsoVacatedOfficeIds?: readonly string[] | undefined },
  officeLabel: string,
  officeNames: Record<string, string> = {},
) => {
  const base = result.reportsMoved
    ? `${officeLabel} has a new manager. ${plural(result.reportsMoved, 'person', 'people')} now report${result.reportsMoved === 1 ? 's' : ''} to them.`
    : `${officeLabel} has a new manager.`;
  const done = `${base}${describeAccessResult(result.access)}${result.outgoingRoleChanged ? ' The outgoing manager\u2019s role was changed.' : ''}${describeEndedCharges(result.chargesEnded)}`;
  const vacated = [...new Set([...(result.vacatedOfficeId ? [result.vacatedOfficeId] : []), ...(result.alsoVacatedOfficeIds ?? [])])].map((id) => officeName(id, officeNames));
  return vacated.length ? `${done} ${vacated.join(', ')} now ${vacated.length === 1 ? 'has' : 'have'} no manager.` : done;
};

/** Short line under the National Operations Manager tile. */
export const describeNationalManagers = (managers: ReadonlyArray<{ name: string }>) => {
  if (!managers.length) return { value: 'Not set', hint: 'No one holds this designation yet.' };
  if (managers.length === 1) return { value: managers[0]!.name, hint: 'State Managers report here by default.' };
  return { value: `${managers.length} people`, hint: 'Several people hold this designation; pick the manager by hand.' };
};

/** The Vacant / Covered chip of an office. Offices that are switched off show neither. */
export const officeCoverageLabel = (office: { kind: string; isActive: boolean }, managerCount: number, chargeCount = 0) => {
  if (office.kind !== 'STATE' || !office.isActive) return null;
  if (managerCount > 0) return 'Covered';
  return chargeCount > 0 ? 'Covered (additional charge)' : 'Vacant';
};
