import type { HrmLocationType, HrmOnboardExistingPayload, HrmOnboardPayload, HrmProfileDetails } from './hrmApi';
import type { ManagerSelection } from './hrmManagers';

/** NEW creates the login together with the employee; EXISTING links a login that was created on the Users page. */
export type OnboardMode = 'NEW' | 'EXISTING';

export type OnboardForm = {
  fullName: string;
  mobile: string;
  email: string;
  password: string;
  /** '' means "No permission role assigned". */
  customRoleId: string;
  /** Existing-login mode: the login being linked. */
  userId: string;
  joiningDate: string;
  /** The designation name, picked from the managed designation list. */
  designation: string;
  orgUnitId: string;
  employmentType: string;
  locationType: HrmLocationType;
  /** Head office postings: the chosen head office ('' = the default one). */
  headOfficeUnitId: string;
  /** State office postings only. */
  stateId: string;
  cityId: string;
  /** Manager of the state office (State Manager). Only meaningful for a state office. */
  isOfficeManager: boolean;
  /** Optional profile details (the "More details" section). */
  preferredName: string;
  dateOfBirth: string;
  personalEmail: string;
};

/** A box of the form. The reporting manager is held beside the form (lib/hrmManagers.ts ManagerSelection). */
export type OnboardField = keyof OnboardForm | 'managerEmployeeId';
export type OnboardErrors = Partial<Record<OnboardField, string>>;

export const createEmptyOnboardForm = (today: string, locationType: HrmLocationType = 'HEAD_OFFICE', headOfficeUnitId = ''): OnboardForm => ({
  fullName: '', mobile: '', email: '', password: '', customRoleId: '', userId: '',
  joiningDate: today, designation: '', orgUnitId: '', employmentType: 'FULL_TIME',
  locationType, headOfficeUnitId, stateId: '', cityId: '',
  isOfficeManager: false,
  preferredName: '', dateOfBirth: '', personalEmail: '',
});

/** Spaces collapsed and trimmed, the way the server compares department and designation names. */
export const normaliseName = (value: string) => value.replace(/\s+/g, ' ').trim();

/** The list entry with this name, ignoring case and extra spaces. */
export const findByName = <T extends { name: string }>(list: readonly T[], name: string): T | undefined => {
  const key = normaliseName(name).toLowerCase();
  return key ? list.find((item) => normaliseName(item.name).toLowerCase() === key) : undefined;
};

/** Which of the two managed lists a change belongs to (a department and a designation can share a name). */
export type ListKind = 'department' | 'designation';

/** What the manage dialogs report back so the form can keep its selection in step. */
export type ListChange =
  | { type: 'renamed'; list: ListKind; id: string; from: string; to: string }
  | { type: 'removed'; list: ListKind; id: string; name: string }
  | { type: 'other'; list: ListKind };

/**
 * The designation text after the lists changed: it follows a rename of a DESIGNATION (a department rename says nothing
 * about it), and is cleared once it is no longer on the list, so the server never has to re-create an old name.
 */
export const reconcileDesignation = (current: string, change: ListChange | null, designations: ReadonlyArray<{ name: string }>) => {
  let next = current;
  if (change?.type === 'renamed' && change.list === 'designation' && normaliseName(current).toLowerCase() === normaliseName(change.from).toLowerCase()) next = change.to;
  return next.trim() && !findByName(designations, next) ? '' : next;
};

/**
 * The department id after the lists changed: cleared when that department was deleted or switched off. A department
 * is kept by its id, so renaming it (or any change to the designation list) never moves the selection.
 */
export const reconcileDepartment = (current: string, departments: ReadonlyArray<{ id: string }>) =>
  current && !departments.some((department) => department.id === current) ? '' : current;

/** The sentence shown when refreshing the lists took the person's department and/or designation away; '' when nothing was lost. */
export const describeLostSelections = (before: { orgUnitId: string; designation: string }, after: { orgUnitId: string; designation: string }) => {
  const lost: string[] = [];
  if (before.orgUnitId && !after.orgUnitId) lost.push('department');
  if (before.designation.trim() && !after.designation.trim()) lost.push('designation');
  if (!lost.length) return '';
  return `The ${lost.join(' and ')} you selected ${lost.length > 1 ? 'were' : 'was'} removed or switched off. Choose ${lost.length > 1 ? 'new ones' : 'another one'}.`;
};

/** True when anything in the form differs from how it started (the fields typed or chosen by the person). */
export const isOnboardFormDirty = (form: OnboardForm, baseline: OnboardForm) =>
  (Object.keys(baseline) as Array<keyof OnboardForm>).some((key) => form[key] !== baseline[key]);

/** Local date as YYYY-MM-DD (not UTC, so late evening in India does not show tomorrow). */
export const toDateInputValue = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * Digits of an Indian mobile number without the +91 / 91 / 0 prefix. It never cuts digits off: a number with
 * too many digits stays too long, so the form reports it instead of silently saving a different number.
 */
export const normalizeMobile = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};

/**
 * The text sent to the login search. A phone number typed the way people write it (+91 98765 43210, 91 98765 43210,
 * 098765 43210) is reduced to its digits without the country or trunk prefix, because logins store the plain number.
 * Anything that is not clearly a phone number (a name, an email) is sent as typed.
 */
export const normaliseLoginSearch = (query: string) => {
  const text = query.trim();
  if (!/^[\d+\s-]+$/.test(text)) return text;
  const digits = text.replace(/\D/g, '');
  if (digits.length < 7) return text;
  if (text.startsWith('+91')) return digits.slice(2);
  if (digits.startsWith('0')) return digits.slice(1);
  return normalizeMobile(digits);
};

/** What the mobile box keeps while typing: digits, +, spaces and dashes, so "+91 98765 43210" can be typed in full. */
export const sanitiseMobileInput = (value: string) => value.replace(/[^\d+\s-]/g, '').slice(0, 18);

/**
 * The email rule the server applies (zod's `email`, copied from node_modules/zod/v4/core/regexes): an address this
 * accepts is never rejected by the server, and one it rejects is caught here instead of after the round trip.
 */
const EMAIL_PATTERN = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

/** True when the (trimmed) text is an email address the server will accept. */
export const isValidEmail = (value: string) => EMAIL_PATTERN.test(value.trim());

/** Same rule as the server: the employee must be at least this old. */
export const MIN_EMPLOYEE_AGE_YEARS = 14;
const MIN_AGE_MS = MIN_EMPLOYEE_AGE_YEARS * 365.25 * 24 * 60 * 60 * 1000;
const EARLIEST_BIRTH_DATE = '1940-01-01';

const isRealDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/** Latest date of birth that is allowed today (YYYY-MM-DD); also the `max` of the date box. */
export const maxDateOfBirth = (now: Date = new Date()) => new Date(now.getTime() - MIN_AGE_MS).toISOString().slice(0, 10);

/** Same rules as the server: a real date, not before 1950, at most a year ahead. */
export const EARLIEST_JOINING_DATE = '1950-01-01';
const JOINING_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

/** Latest joining date that is allowed today (YYYY-MM-DD); also the `max` of the date box. */
export const maxJoiningDate = (now: Date = new Date()) => new Date(now.getTime() + JOINING_AHEAD_MS).toISOString().slice(0, 10);

/** '' when the joining date is acceptable, otherwise the message to show. */
export const validateJoiningDate = (value: string, now: Date = new Date()) => {
  if (!value) return 'Select the joining date.';
  if (!isRealDay(value) || value < EARLIEST_JOINING_DATE) return 'Enter a valid joining date.';
  if (value > maxJoiningDate(now)) return 'The joining date can be at most one year ahead.';
  return '';
};

/** '' when the date of birth is acceptable (or empty, it is optional), otherwise the message to show. */
export const validateDateOfBirth = (value: string, now: Date = new Date()) => {
  if (!value) return '';
  if (!isRealDay(value) || value < EARLIEST_BIRTH_DATE) return 'Enter a valid date of birth.';
  if (value > maxDateOfBirth(now)) return `The employee must be at least ${MIN_EMPLOYEE_AGE_YEARS} years old.`;
  return '';
};

type ValidateOptions = {
  headOfficeAvailable: boolean;
  /** Why the chosen head office cannot be used (it has no state and city yet). */
  headOfficeMessage?: string | null | undefined;
  /** Defaults to NEW. In EXISTING mode the login supplies name, email and password, so those are not checked. */
  mode?: OnboardMode;
  /** When set and the location is a state office, it is reported as the state's error (for example "no office yet"). */
  stateOfficeMessage?: string | null;
  /** How many National Operations Managers exist: with more than one, a State Manager needs a manager chosen. */
  nationalManagerCount?: number;
  /** The reporting manager chosen. */
  managerId?: string | null | undefined;
};

export const validateOnboardForm = (form: OnboardForm, options: ValidateOptions): OnboardErrors => {
  const errors: OnboardErrors = {};
  const existing = options.mode === 'EXISTING';
  if (existing) {
    if (!form.userId) errors.userId = 'Select the login to link.';
    // The login's own mobile is used; one typed for a login without a mobile still has to be a real number.
    if (form.mobile.trim() && normalizeMobile(form.mobile).length !== 10) errors.mobile = 'Enter a valid 10-digit mobile number.';
  } else {
    if (form.fullName.trim().length < 2) errors.fullName = 'Enter the employee’s full name.';
    if (normalizeMobile(form.mobile).length !== 10) errors.mobile = 'Enter a valid 10-digit mobile number.';
    if (!isValidEmail(form.email)) errors.email = 'Enter a valid email address.';
    if (form.password.length < 8) errors.password = 'Password must be at least 8 characters long.';
    else if (new TextEncoder().encode(form.password).length > 72) errors.password = 'Password is too long (72 bytes at most; accented characters count as more than one).';
  }
  const joiningError = validateJoiningDate(form.joiningDate);
  if (joiningError) errors.joiningDate = joiningError;
  if (!form.designation.trim()) errors.designation = 'Select the designation.';
  if (!form.orgUnitId) errors.orgUnitId = 'Select the department.';
  if (form.locationType === 'HEAD_OFFICE') {
    if (!options.headOfficeAvailable) errors.locationType = 'The head office is not set up yet. Choose State office, or set it up on the Organisation page.';
    else if (options.headOfficeMessage) errors.headOfficeUnitId = options.headOfficeMessage;
  }
  if (form.locationType === 'STATE_OFFICE') {
    if (!form.stateId) errors.stateId = 'Select the state.';
    else if (options.stateOfficeMessage) errors.stateId = options.stateOfficeMessage;
    if (!form.cityId) errors.cityId = 'Select the city.';
    if (form.isOfficeManager && (options.nationalManagerCount ?? 0) > 1 && !options.managerId) {
      errors.managerEmployeeId = 'Choose who this State Manager reports to.';
    }
  }
  const dobError = validateDateOfBirth(form.dateOfBirth);
  if (dobError) errors.dateOfBirth = dobError;
  if (form.personalEmail.trim() && !isValidEmail(form.personalEmail)) errors.personalEmail = 'Enter a valid personal email address.';
  return errors;
};

/** Only the optional profile fields that were actually filled in (so empty ones are never sent). */
const profileDetailsPayload = (form: OnboardForm): HrmProfileDetails => ({
  ...(form.preferredName.trim() ? { preferredName: form.preferredName.replace(/\s+/g, ' ').trim() } : {}),
  ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
  ...(form.personalEmail.trim() ? { personalEmail: form.personalEmail.trim() } : {}),
});

/** The office manager flag only exists for a state office. */
const officeManagerPayload = (form: OnboardForm): { isOfficeManager?: boolean } =>
  (form.locationType === 'STATE_OFFICE' && form.isOfficeManager ? { isOfficeManager: true } : {});

/**
 * The reporting manager: the chosen person, or null when HR removed it (so the server does not put one back). With
 * nothing chosen and nothing removed it is left out, and the server applies its own default.
 */
const managerPayload = (selection: ManagerSelection | undefined): { managerEmployeeId?: string | null } => {
  if (selection?.manager) return { managerEmployeeId: selection.manager.id };
  return selection?.source === 'user' ? { managerEmployeeId: null } : {};
};

/** The place sent to the server: a head office posting names the head office, a state office its state and city. */
const locationPayload = (form: OnboardForm): { headOfficeUnitId?: string; stateId: number | null; cityId: number | null } => {
  if (form.locationType === 'STATE_OFFICE') {
    return { stateId: form.stateId ? Number(form.stateId) : null, cityId: form.cityId ? Number(form.cityId) : null };
  }
  return { ...(form.headOfficeUnitId ? { headOfficeUnitId: form.headOfficeUnitId } : {}), stateId: null, cityId: null };
};

export const toOnboardPayload = (form: OnboardForm, manager?: ManagerSelection): HrmOnboardPayload => ({
  fullName: form.fullName.trim(),
  email: form.email.trim(),
  mobile: normalizeMobile(form.mobile),
  password: form.password,
  customRoleId: form.customRoleId || null,
  joiningDate: form.joiningDate,
  designation: normaliseName(form.designation),
  orgUnitId: form.orgUnitId,
  employmentType: form.employmentType || 'FULL_TIME',
  locationType: form.locationType,
  ...locationPayload(form),
  ...officeManagerPayload(form),
  ...managerPayload(manager),
  ...profileDetailsPayload(form),
});

/** Payload for linking an existing login: no name, email or password, the login supplies them. */
export const toOnboardExistingPayload = (form: OnboardForm, manager?: ManagerSelection): HrmOnboardExistingPayload => ({
  userId: form.userId,
  // Sent only when the login has no mobile of its own and HR typed one.
  ...(form.mobile.trim() ? { mobile: normalizeMobile(form.mobile) } : {}),
  joiningDate: form.joiningDate,
  designation: normaliseName(form.designation),
  orgUnitId: form.orgUnitId,
  employmentType: form.employmentType || 'FULL_TIME',
  locationType: form.locationType,
  ...locationPayload(form),
  ...officeManagerPayload(form),
  ...managerPayload(manager),
  ...profileDetailsPayload(form),
});

/**
 * What ticking "Manager of this state office" fills in: the State Manager designation when none is chosen yet.
 * A designation that is already chosen stays.
 */
export const getStateManagerDefaults = (
  form: Pick<OnboardForm, 'designation'>,
  defaults: { designation: string },
): Partial<Pick<OnboardForm, 'designation'>> => ({
  ...(!form.designation.trim() && defaults.designation ? { designation: defaults.designation } : {}),
});

/**
 * Undoes what ticking "Manager of this state office" filled in: the designation goes back to empty, but only while it
 * still holds the value the tick put there. Something the person chose or typed themselves is never touched.
 */
export const revertStateManagerDefaults = (
  form: Pick<OnboardForm, 'designation'>,
  autoFilled: string | null,
): Partial<Pick<OnboardForm, 'designation'>> =>
  (autoFilled && normaliseName(form.designation).toLowerCase() === normaliseName(autoFilled).toLowerCase() ? { designation: '' } : {});

type StateOfficeInfo = { name: string; hasOffice: boolean; officeSwitchedOff?: boolean };

/** What the form says about a state's office: an error that blocks saving, or a note about what saving will do. */
export const describeStateOffice = (state: StateOfficeInfo | undefined, canManageOrg: boolean): { error: string | null; note: string | null } => {
  if (!state || state.hasOffice) return { error: null, note: null };
  if (state.officeSwitchedOff) return { error: `The ${state.name} state office is switched off. Switch it on from the Organisation page first.`, note: null };
  return canManageOrg
    ? { error: null, note: `A state office will be created for ${state.name} when you save.` }
    : { error: `${state.name} has no state office yet. Ask an administrator to add it from the Organisation page.`, note: null };
};

/** The label a state carries in the State list. */
export const stateOptionLabel = (state: StateOfficeInfo) =>
  (state.hasOffice ? state.name : state.officeSwitchedOff ? `${state.name} · Office switched off` : `${state.name} · No office yet`);

export type ServerFieldErrors = { fields: OnboardErrors; /** Messages for fields this form does not show (or that carry no field). */ unmapped: string[] };

/**
 * Splits a server validation failure into per-field messages. The server answers a bad request with
 * `details: [{ path, message }]` (HrmValidationError); each message belongs to its own field, so a rejected personal
 * email is never shown on the login email. Paths this form has no box for are returned as "unmapped" for the banner.
 */
export const extractFieldErrors = (error: unknown, allowed: ReadonlyArray<OnboardField>): ServerFieldErrors => {
  const details = (error as { response?: { data?: { details?: unknown } } } | null)?.response?.data?.details;
  const fields: OnboardErrors = {};
  const unmapped: string[] = [];
  if (!Array.isArray(details)) return { fields, unmapped };
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;
    const { path, message } = detail as { path?: unknown; message?: unknown };
    if (typeof message !== 'string' || !message) continue;
    const segment = Array.isArray(path) ? String(path[0] ?? '') : typeof path === 'string' ? path.split('.')[0] : '';
    const key = segment ? (segment as OnboardField) : undefined;
    if (key && allowed.includes(key)) {
      if (!fields[key]) fields[key] = message;
    } else {
      unmapped.push(typeof path === 'string' && path && path !== 'body' ? `${path}: ${message}` : message);
    }
  }
  return { fields, unmapped };
};

/**
 * Which box a server message without field details belongs to (a duplicate email or mobile found while saving).
 * A message about the personal email is never put on the login email.
 */
export const fieldForServerMessage = (message: string, mode: OnboardMode): OnboardField | null => {
  if (/reporting manager/i.test(message)) return 'managerEmployeeId';
  if (/selected head office|no state and city/i.test(message)) return 'headOfficeUnitId';
  if (/personal e-?mail/i.test(message)) return 'personalEmail';
  if (mode === 'NEW' && /e-?mail/i.test(message)) return 'email';
  if (/mobile/i.test(message)) return 'mobile';
  return null;
};

const PASSWORD_GROUPS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*!?'] as const;

/** 12-character temporary password with upper, lower, digit and symbol; confusing characters (0/O, 1/l/I) left out. */
export const generateTemporaryPassword = (
  random: (max: number) => number = (max) => {
    const buffer = new Uint32Array(1);
    // Rejection sampling keeps the choice uniform.
    const limit = Math.floor(0x100000000 / max) * max;
    do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0]! >= limit);
    return buffer[0]! % max;
  },
  length = 12,
) => {
  const all = PASSWORD_GROUPS.join('');
  const chars = PASSWORD_GROUPS.map((group) => group[random(group.length)]!);
  while (chars.length < length) chars.push(all[random(all.length)]!);
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = random(index + 1);
    [chars[index], chars[swap]] = [chars[swap]!, chars[index]!];
  }
  return chars.join('');
};

export const buildLoginDetailsText = (input: { employeeCode: string; name: string; email: string; password: string; portalUrl: string }) =>
  [
    'JCB Exchange – employee login',
    `Name: ${input.name}`,
    `Employee ID: ${input.employeeCode}`,
    `Login email: ${input.email}`,
    `Temporary password: ${input.password}`,
    `Sign in: ${input.portalUrl}`,
    'Please change the password after your first login.',
  ].join('\n');
