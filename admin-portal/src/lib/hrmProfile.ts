import type {
  HrmAddress,
  HrmBloodGroup,
  HrmChecklistState,
  HrmDocumentCategory,
  HrmEmergencyContact,
  HrmEmployee,
  HrmGender,
  HrmMaritalStatus,
  HrmPersonalDetailsPatch,
  HrmSalaryRevision,
  HrmWeeklyOffs,
  HrmWeekDay,
} from './hrmApi';
import { parseAmount, salaryTotals, STANDARD_SALARY_COMPONENTS, type SalaryComponentRow } from './offerHrm';
import { indiaDay } from './hrmDay';

/**
 * Pure helpers for the employee profile cards (personal details, salary, shift, documents, checklist). The rules
 * mirror the backend (backend/src/modules/hrm/validation.ts) so a form never sends what the server will refuse.
 */

// ---- labels ----

export const GENDER_LABELS: Record<HrmGender, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other', UNDISCLOSED: 'Prefer not to say' };
export const MARITAL_LABELS: Record<HrmMaritalStatus, string> = { SINGLE: 'Single', MARRIED: 'Married', DIVORCED: 'Divorced', WIDOWED: 'Widowed', SEPARATED: 'Separated' };
export const BLOOD_GROUPS: HrmBloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const CHECKLIST_STATE_LABELS: Record<HrmChecklistState, string> = { DONE: 'Done', PENDING: 'Waiting', MISSING: 'Missing' };
export const checklistStateClass = (state: HrmChecklistState) =>
  state === 'DONE' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
    : state === 'PENDING' ? 'bg-amber-50 text-amber-800 ring-amber-600/20'
      : 'bg-rose-50 text-rose-700 ring-rose-600/20';

export const ONBOARDING_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending', NEEDS_REVIEW: 'Needs review', IN_PROGRESS: 'In progress', READY_FOR_APPROVAL: 'Ready for approval',
  APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled', COMPLETED: 'Completed',
};

export const DOCUMENT_CATEGORY_LABELS: Record<HrmDocumentCategory, string> = {
  IDENTITY: 'Identity proof', ADDRESS: 'Address proof', EDUCATION: 'Education certificate', EXPERIENCE: 'Experience / relieving letter',
  OFFER: 'Offer letter', ACCEPTANCE: 'Signed acceptance', BANK: 'Bank proof (cheque / passbook)', TAX: 'Tax document',
  EMPLOYMENT: 'Employment document', PHOTO: 'Passport photo', OTHER: 'Other',
};
export const UPLOAD_CATEGORIES: HrmDocumentCategory[] = ['OFFER', 'ACCEPTANCE', 'PHOTO', 'EDUCATION', 'ADDRESS', 'IDENTITY', 'BANK', 'TAX', 'EMPLOYMENT', 'EXPERIENCE', 'OTHER'];

export const SALARY_STATUS_LABELS: Record<HrmSalaryRevision['status'], string> = {
  DRAFT: 'Draft', PENDING_APPROVAL: 'Pending approval', APPROVED: 'Approved', REJECTED: 'Rejected', SUPERSEDED: 'Superseded',
};
export const salaryStatusClass = (status: HrmSalaryRevision['status']) =>
  status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
    : status === 'PENDING_APPROVAL' || status === 'DRAFT' ? 'bg-amber-50 text-amber-800 ring-amber-600/20'
      : status === 'REJECTED' ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
        : 'bg-slate-100 text-slate-600 ring-slate-500/20';

/** What the applicant submitted, in display order. CTC values are entered in lakhs on the careers form. */
export const SUBMITTED_FIELD_LABELS: Array<[key: string, label: string, kind?: 'lakhs' | 'years' | 'long']> = [
  ['address', 'Address'],
  ['currentCity', 'City'],
  ['state', 'State'],
  ['currentCompany', 'Current company'],
  ['currentDesignation', 'Current designation'],
  ['totalExperience', 'Total experience', 'years'],
  ['relevantExperience', 'Relevant experience', 'years'],
  ['currentCtc', 'Current CTC', 'lakhs'],
  ['expectedCtc', 'Expected CTC', 'lakhs'],
  ['noticePeriod', 'Notice period'],
  ['employmentStatus', 'Employment status'],
  ['linkedInUrl', 'LinkedIn'],
  ['portfolioUrl', 'Portfolio'],
  ['coverLetter', 'Cover letter', 'long'],
];

export const formatSubmittedValue = (value: unknown, kind?: 'lakhs' | 'years' | 'long') => {
  if (value === null || value === undefined || value === '') return null;
  if (kind === 'lakhs' && typeof value === 'number') return `₹${value} lakh / year`;
  if (kind === 'years' && typeof value === 'number') return `${value} year${value === 1 ? '' : 's'}`;
  return String(value);
};

// ---- weekly offs ----

const DAY_NAMES: Record<HrmWeekDay, string> = { MON: 'Mondays', TUE: 'Tuesdays', WED: 'Wednesdays', THU: 'Thursdays', FRI: 'Fridays', SAT: 'Saturdays', SUN: 'Sundays' };
export const WEEK_DAYS: HrmWeekDay[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const ordinal = (value: number) => `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'}`;

/** "Sundays, 2nd & 4th Saturdays" / "No weekly off". */
export const describeWeeklyOffs = (offs: HrmWeeklyOffs | null | undefined) => {
  if (!offs) return 'No weekly off';
  const days = WEEK_DAYS.filter((day) => offs.days?.includes(day)).map((day) => DAY_NAMES[day]);
  const saturdays = offs.days?.includes('SAT') ? [] : [...new Set(offs.saturdays ?? [])].sort((a, b) => a - b);
  const parts = [...days];
  if (saturdays.length) {
    const list = saturdays.map(ordinal);
    parts.push(`${list.length > 1 ? `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}` : list[0]} Saturday${list.length > 1 ? 's' : ''}`);
  }
  return parts.length ? parts.join(', ') : 'No weekly off';
};

/** Same checks as the server: at least one working day; "every Saturday" excludes picking Saturdays of the month. */
export const validateWeeklyOffs = (offs: HrmWeeklyOffs): string | null => {
  const days = new Set(offs.days);
  if (days.size >= 7) return 'At least one working day is needed.';
  if (days.has('SAT') && (offs.saturdays ?? []).length) return 'Every Saturday is already off; untick the Saturdays of the month.';
  return null;
};

export const describeShiftTimes = (shift: { startTime: string; endTime: string; isNightShift?: boolean }) =>
  `${shift.startTime} – ${shift.endTime}${shift.isNightShift ? ' (next day)' : ''}`;

// ---- personal details ----

export type AddressForm = { line1: string; line2: string; city: string; state: string; pincode: string };
export type PersonalForm = {
  dateOfBirth: string;
  gender: HrmGender | '';
  fatherOrSpouseName: string;
  maritalStatus: HrmMaritalStatus | '';
  bloodGroup: HrmBloodGroup | '';
  currentAddress: AddressForm;
  permanentAddress: AddressForm;
  permanentSameAsCurrent: boolean;
  emergencyName: string;
  emergencyRelation: string;
  emergencyMobile: string;
};
export type PersonalErrors = Partial<Record<string, string>>;

const emptyAddress = (): AddressForm => ({ line1: '', line2: '', city: '', state: '', pincode: '' });
const addressForm = (value: HrmAddress | null | undefined): AddressForm => value
  ? { line1: value.line1 ?? '', line2: value.line2 ?? '', city: value.city ?? '', state: value.state ?? '', pincode: value.pincode ?? '' }
  : emptyAddress();
const sameAddress = (a: AddressForm, b: AddressForm) =>
  (['line1', 'line2', 'city', 'state', 'pincode'] as const).every((key) => a[key].trim() === b[key].trim());
const addressIsEmpty = (a: AddressForm) => (['line1', 'line2', 'city', 'state', 'pincode'] as const).every((key) => !a[key].trim());

export const toPersonalForm = (employee: Pick<HrmEmployee, 'dateOfBirth' | 'gender' | 'fatherOrSpouseName' | 'maritalStatus' | 'bloodGroup' | 'currentAddress' | 'permanentAddress' | 'emergencyContact'>): PersonalForm => {
  const current = addressForm(employee.currentAddress);
  const permanent = addressForm(employee.permanentAddress);
  return {
    dateOfBirth: employee.dateOfBirth ? String(employee.dateOfBirth).slice(0, 10) : '',
    gender: employee.gender ?? '',
    fatherOrSpouseName: employee.fatherOrSpouseName ?? '',
    maritalStatus: employee.maritalStatus ?? '',
    bloodGroup: employee.bloodGroup ?? '',
    currentAddress: current,
    permanentAddress: permanent,
    permanentSameAsCurrent: !addressIsEmpty(current) && sameAddress(current, permanent),
    emergencyName: employee.emergencyContact?.name ?? '',
    emergencyRelation: employee.emergencyContact?.relation ?? '',
    emergencyMobile: employee.emergencyContact?.mobile ?? '',
  };
};

const MOBILE_PATTERN = /^(?=.{8,15}$)\+?[0-9]+$/;
const PIN_PATTERN = /^\d{6}$/;

/** An address is either fully empty (not given) or complete: line 1, city, state and a 6-digit PIN. */
const checkAddress = (prefix: string, address: AddressForm, errors: PersonalErrors) => {
  if (addressIsEmpty(address)) return;
  if (!address.line1.trim()) errors[`${prefix}.line1`] = 'Enter the address line.';
  else if (address.line1.trim().length > 200) errors[`${prefix}.line1`] = 'At most 200 characters.';
  if (address.line2.trim().length > 200) errors[`${prefix}.line2`] = 'At most 200 characters.';
  if (!address.city.trim()) errors[`${prefix}.city`] = 'Enter the city.';
  else if (address.city.trim().length > 80) errors[`${prefix}.city`] = 'At most 80 characters.';
  if (!address.state.trim()) errors[`${prefix}.state`] = 'Enter the state.';
  else if (address.state.trim().length > 80) errors[`${prefix}.state`] = 'At most 80 characters.';
  if (!PIN_PATTERN.test(address.pincode.trim())) errors[`${prefix}.pincode`] = 'Enter a 6-digit PIN code.';
};

export const validatePersonalForm = (form: PersonalForm, todayIso: string): PersonalErrors => {
  const errors: PersonalErrors = {};
  if (form.dateOfBirth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth) || Number.isNaN(new Date(`${form.dateOfBirth}T00:00:00Z`).getTime())) errors.dateOfBirth = 'Enter a valid date.';
    else if (form.dateOfBirth > todayIso) errors.dateOfBirth = 'The date of birth cannot be in the future.';
    else if (form.dateOfBirth < '1900-01-01') errors.dateOfBirth = 'Enter a valid date of birth.';
  }
  if (form.fatherOrSpouseName.trim().length > 160) errors.fatherOrSpouseName = 'At most 160 characters.';
  checkAddress('currentAddress', form.currentAddress, errors);
  if (!form.permanentSameAsCurrent) checkAddress('permanentAddress', form.permanentAddress, errors);
  const contact = [form.emergencyName, form.emergencyRelation, form.emergencyMobile].map((value) => value.trim());
  if (contact.some(Boolean)) {
    if (!contact[0]) errors.emergencyName = 'Enter the contact name.';
    else if (contact[0].length > 160) errors.emergencyName = 'At most 160 characters.';
    if (!contact[1]) errors.emergencyRelation = 'Enter the relation (for example Father).';
    else if (contact[1].length > 60) errors.emergencyRelation = 'At most 60 characters.';
    if (!MOBILE_PATTERN.test(contact[2]!.replace(/[\s-]/g, ''))) errors.emergencyMobile = 'Enter a valid mobile number (8–15 digits, optional +).';
  }
  return errors;
};

const addressValue = (address: AddressForm): HrmAddress | null => addressIsEmpty(address) ? null : {
  line1: address.line1.trim(), line2: address.line2.trim() || null, city: address.city.trim(), state: address.state.trim(), pincode: address.pincode.trim(),
};
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Only what changed compared with the stored record (the PATCH also needs `version`). */
export const buildPersonalPatch = (form: PersonalForm, stored: PersonalForm): HrmPersonalDetailsPatch => {
  const patch: HrmPersonalDetailsPatch = {};
  if (form.dateOfBirth !== stored.dateOfBirth) patch.dateOfBirth = form.dateOfBirth || null;
  if (form.gender !== stored.gender) patch.gender = form.gender || null;
  if (form.fatherOrSpouseName.trim() !== stored.fatherOrSpouseName.trim()) patch.fatherOrSpouseName = form.fatherOrSpouseName.trim() || null;
  if (form.maritalStatus !== stored.maritalStatus) patch.maritalStatus = form.maritalStatus || null;
  if (form.bloodGroup !== stored.bloodGroup) patch.bloodGroup = form.bloodGroup || null;
  const current = addressValue(form.currentAddress);
  if (!sameJson(current, addressValue(stored.currentAddress))) patch.currentAddress = current;
  const permanent = form.permanentSameAsCurrent ? current : addressValue(form.permanentAddress);
  if (!sameJson(permanent, addressValue(stored.permanentAddress))) patch.permanentAddress = permanent;
  const contact: HrmEmergencyContact | null = form.emergencyName.trim() || form.emergencyRelation.trim() || form.emergencyMobile.trim()
    ? { name: form.emergencyName.trim(), relation: form.emergencyRelation.trim(), mobile: form.emergencyMobile.replace(/[\s-]/g, '') }
    : null;
  const storedContact = stored.emergencyName.trim() || stored.emergencyRelation.trim() || stored.emergencyMobile.trim()
    ? { name: stored.emergencyName.trim(), relation: stored.emergencyRelation.trim(), mobile: stored.emergencyMobile.replace(/[\s-]/g, '') }
    : null;
  if (!sameJson(contact, storedContact)) patch.emergencyContact = contact;
  return patch;
};

export const formatAddress = (address: HrmAddress | null | undefined) =>
  address ? [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ') : '—';

// ---- salary ----

/** Monthly gross / CTC and yearly CTC of a stored revision (components are monthly amounts). */
export const summariseRevision = (revision: Pick<HrmSalaryRevision, 'components' | 'annualCtc' | 'grossSalary'>) => {
  const rows: SalaryComponentRow[] = revision.components.map((component) => ({
    code: component.code,
    name: component.name,
    componentType: component.componentType === 'EMPLOYER_CONTRIBUTION' ? 'EMPLOYER_CONTRIBUTION' : 'EARNING',
    monthlyAmount: String(component.amount),
  }));
  const totals = salaryTotals(rows);
  return rows.length
    ? totals
    : { grossMonthly: Number(revision.grossSalary) || 0, ctcMonthly: Math.round(((Number(revision.annualCtc) || 0) / 12) * 100) / 100, annualCtc: Number(revision.annualCtc) || 0 };
};

/** A fresh breakup form: the standard rows, prefilled from the salary in force when there is one. */
export const salaryRowsFrom = (revision: Pick<HrmSalaryRevision, 'components'> | null): SalaryComponentRow[] => {
  const rows: SalaryComponentRow[] = STANDARD_SALARY_COMPONENTS.map((component) => ({ ...component, monthlyAmount: '' }));
  for (const component of revision?.components ?? []) {
    const existing = rows.find((row) => row.code === component.code);
    if (existing) existing.monthlyAmount = String(component.amount);
    else rows.push({ code: component.code, name: component.name, componentType: component.componentType === 'EMPLOYER_CONTRIBUTION' ? 'EMPLOYER_CONTRIBUTION' : 'EARNING', monthlyAmount: String(component.amount) });
  }
  return rows;
};

/** Checks the proposal the way the server does; returns a message or null. */
export const validateSalaryProposal = (rows: readonly SalaryComponentRow[], effectiveFrom: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return 'Choose the date the salary applies from.';
  const seen = new Set<string>();
  let earnings = 0;
  let any = 0;
  for (const row of rows) {
    const amount = parseAmount(row.monthlyAmount);
    if (Number.isNaN(amount) || amount < 0) return `Enter a valid monthly amount for ${row.name || row.code}.`;
    if (amount === 0) continue;
    if (!row.name.trim()) return 'Give every salary row with an amount a name.';
    const code = row.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(code)) return `The code of ${row.name} is not valid.`;
    if (seen.has(code)) return `${row.name} appears twice.`;
    seen.add(code);
    any += 1;
    if (row.componentType === 'EARNING') earnings += 1;
  }
  if (!any) return 'Enter at least one monthly amount.';
  if (!earnings) return 'The salary needs at least one earning (for example Basic salary).';
  return null;
};

export const buildSalaryProposal = (rows: readonly SalaryComponentRow[]) => rows
  .filter((row) => parseAmount(row.monthlyAmount) > 0)
  .map((row) => ({ code: row.code.trim().toUpperCase(), name: row.name.trim(), componentType: row.componentType, monthlyAmount: parseAmount(row.monthlyAmount) }));

// ---- document files ----

export const DOCUMENT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const checkDocumentFile = (file: { name: string; size: number; type: string } | null | undefined, category: HrmDocumentCategory): string | null => {
  if (!file) return 'Choose the file to upload.';
  if (!DOCUMENT_UPLOAD_TYPES.includes(file.type)) return 'Upload a PDF, JPG, PNG or WEBP file.';
  if (category === 'PHOTO' && !IMAGE_TYPES.has(file.type)) return 'A passport photo must be a JPG, PNG or WEBP image.';
  if (file.size <= 0) return 'The file is empty.';
  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) return 'The file is larger than 5 MB.';
  return null;
};

export const extensionForMime = (type: string | null | undefined) =>
  type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/jpeg' ? 'jpg' : 'bin';

/** A document whose file the server stored itself (HR upload, recruitment files, verified KYC template). */
export const hasStoredFile = (document: { provider?: string | null }) => document.provider === 'GOOGLE_DRIVE' || document.provider === 'SUREPASS';

export const documentStatusClass = (status: string) =>
  status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
    : status === 'PENDING' ? 'bg-amber-50 text-amber-800 ring-amber-600/20'
      : status === 'REJECTED' ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
        : 'bg-slate-100 text-slate-600 ring-slate-500/20';

/** The checklist item -> where HR completes it on the profile. */
export const CHECKLIST_TARGET: Record<string, { card: 'personal' | 'assignment' | 'kyc' | 'documents' | 'salary' | 'shift' | 'login'; category?: HrmDocumentCategory }> = {
  PERSONAL: { card: 'personal' },
  PLACEMENT: { card: 'assignment' },
  PAN: { card: 'kyc' },
  AADHAAR: { card: 'kyc' },
  BANK: { card: 'kyc' },
  OFFER_LETTER: { card: 'documents', category: 'OFFER' },
  ACCEPTANCE: { card: 'documents', category: 'ACCEPTANCE' },
  PHOTO: { card: 'documents', category: 'PHOTO' },
  ADDRESS_PROOF: { card: 'documents', category: 'ADDRESS' },
  EDUCATION: { card: 'documents', category: 'EDUCATION' },
  SALARY: { card: 'salary' },
  SHIFT: { card: 'shift' },
  LOGIN: { card: 'login' },
};

/** Today in India as YYYY-MM-DD (the date inputs' max / default). */
export const indiaToday = (now = new Date()) => indiaDay(now);

export const formatIstDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(date)} IST`;
};

const PERSONAL_FIELD_LABELS: Record<keyof PersonalForm, string> = {
  dateOfBirth: 'date of birth',
  gender: 'gender',
  fatherOrSpouseName: 'father / spouse name',
  maritalStatus: 'marital status',
  bloodGroup: 'blood group',
  currentAddress: 'current address',
  permanentAddress: 'permanent address',
  permanentSameAsCurrent: 'permanent address',
  emergencyName: 'emergency contact',
  emergencyRelation: 'emergency contact',
  emergencyMobile: 'emergency contact',
};

/**
 * After a version conflict: the reloaded record wins for every field the person did not touch in the dialog; the
 * fields they did change keep their typed value. Returns the merged form and the (de-duplicated) labels that were kept.
 */
export const mergePersonalForm = (current: PersonalForm, baseline: PersonalForm, fresh: PersonalForm) => {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const merged = { ...fresh } as PersonalForm;
  const kept: string[] = [];
  for (const key of Object.keys(PERSONAL_FIELD_LABELS) as Array<keyof PersonalForm>) {
    if (same(current[key], baseline[key])) continue;
    (merged as Record<string, unknown>)[key] = current[key];
    if (!kept.includes(PERSONAL_FIELD_LABELS[key])) kept.push(PERSONAL_FIELD_LABELS[key]);
  }
  return { merged, kept };
};

// ---- the profile's Status select ----

/** The only status moves the profile itself makes; everything else has its own flow. */
export const PROFILE_EDITABLE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'NOTICE_PERIOD'] as const;
const JOINING_STATUSES = ['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING'];

/**
 * What the profile's Status field offers for the current status: the three working states can be switched among
 * themselves; joining states change through Confirm / Cancel joining, and suspend / exit / reactivate through
 * Deactivate / Reactivate (the server refuses those here).
 */
export const profileStatusControl = (current: string): { editable: boolean; options: string[]; hint: string } => {
  if ((PROFILE_EDITABLE_STATUSES as readonly string[]).includes(current)) {
    return { editable: true, options: [...PROFILE_EDITABLE_STATUSES], hint: 'To suspend or exit someone use Deactivate; a suspended person is brought back with Reactivate.' };
  }
  if (JOINING_STATUSES.includes(current)) {
    return { editable: false, options: [current], hint: 'Changes through Confirm joining (when they join) or Cancel joining (if they do not).' };
  }
  return { editable: false, options: [current], hint: 'Changes through Deactivate / Reactivate.' };
};

/** Clear text for the server's status-change refusals; null for any other error. */
export const describeStatusChangeRefusal = (error: unknown): string | null => {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  if (code === 'USE_CONFIRM_JOINING') return 'A joining status changes through Confirm joining or Cancel joining, not by editing the profile.';
  if (code === 'USE_LIFECYCLE') return 'Suspending, exiting and reactivating go through Deactivate / Reactivate, not by editing the profile.';
  return null;
};
