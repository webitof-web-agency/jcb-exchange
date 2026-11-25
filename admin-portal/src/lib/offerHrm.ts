import api from './api';
import type { OfferLetterFormData } from './offerLetter';
import { hasPermission } from './permissionUtils';

/**
 * The HRM side of a recruitment offer: where the person will work (department, designation from the managed list,
 * head office or a state office with state + city, State Manager or not, employment type, reporting manager) and the
 * monthly salary breakup. The backend checks the same rules (backend/src/utils/offerRules.ts and
 * backend/src/modules/hrm/services/offerPlacement.service.ts); an accepted offer becomes an HRM pre-joining record
 * from exactly these values.
 */

export type OfferStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN';
export type OfferLocationType = 'HEAD_OFFICE' | 'STATE_OFFICE';
export type OfferEmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'TEMPORARY' | 'FREELANCE';
export type SalaryComponentType = 'EARNING' | 'EMPLOYER_CONTRIBUTION';

export type OfferFormOptions = {
  departments: Array<{ id: string; code: string; name: string }>;
  designations: Array<{ id: string; name: string }>;
  states: Array<{ id: number; name: string; hasOffice: boolean; officeSwitchedOff: boolean }>;
  headOffice: { id: string; name: string; stateId: number | null; cityId: number | null } | null;
  nationalOperationsManagers: Array<{ id: string; employeeCode: string; name: string }>;
  employmentTypes: OfferEmploymentType[];
  stateManagerDesignation: string;
};

export type OfferManagerOption = { id: string; employeeCode: string; name: string; designation: string | null };
export type CityOption = { id: number; name: string };

export type SalaryComponentRow = {
  code: string;
  name: string;
  componentType: SalaryComponentType;
  /** Monthly rupees as typed (kept as text so the input can be edited freely). */
  monthlyAmount: string;
};

export type OfferHrmForm = {
  hrmOrgUnitId: string;
  locationType: OfferLocationType | '';
  /** Kept as strings for the selects; '' = not chosen. */
  stateId: string;
  cityId: string;
  isOfficeManager: boolean;
  employmentType: OfferEmploymentType;
  reportingManagerEmployeeId: string;
  reportingManagerName: string;
  salaryComponents: SalaryComponentRow[];
};

/** What the offers list returns for an offer that has a placement. */
export type StoredOfferPlacement = {
  hrmOrgUnitId: string;
  locationType: string | null;
  stateId: number | null;
  cityId: number | null;
  isOfficeManager: boolean;
  employmentType: string | null;
  reportingManagerEmployeeId: string | null;
};
export type StoredSalaryComponent = { code: string; name: string; componentType: SalaryComponentType; monthlyAmount: number };

export const EMPLOYMENT_TYPE_LABELS: Record<OfferEmploymentType, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  TEMPORARY: 'Temporary',
  FREELANCE: 'Freelance',
};

export const STANDARD_SALARY_COMPONENTS: ReadonlyArray<{ code: string; name: string; componentType: SalaryComponentType }> = [
  { code: 'BASIC', name: 'Basic salary', componentType: 'EARNING' },
  { code: 'HRA', name: 'House rent allowance', componentType: 'EARNING' },
  { code: 'CONVEYANCE', name: 'Conveyance allowance', componentType: 'EARNING' },
  { code: 'SPECIAL', name: 'Special allowance', componentType: 'EARNING' },
  { code: 'OTHER_ALLOWANCE', name: 'Other allowance', componentType: 'EARNING' },
  { code: 'PF_EMPLOYER', name: 'Employer PF contribution', componentType: 'EMPLOYER_CONTRIBUTION' },
  { code: 'ESI_EMPLOYER', name: 'Employer ESI contribution', componentType: 'EMPLOYER_CONTRIBUTION' },
  { code: 'GRATUITY', name: 'Gratuity', componentType: 'EMPLOYER_CONTRIBUTION' },
];

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
};

/** Same moves the backend allows (offerRules.ts). SENT -> SENT is "resend". */
const ALLOWED_STATUS_CHANGES: Record<OfferStatus, OfferStatus[]> = {
  DRAFT: ['SENT', 'WITHDRAWN'],
  SENT: ['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'],
  DECLINED: ['SENT', 'WITHDRAWN'],
  EXPIRED: ['SENT', 'WITHDRAWN'],
  ACCEPTED: [],
  WITHDRAWN: [],
};
export const allowedOfferStatusChanges = (status: OfferStatus): OfferStatus[] => ALLOWED_STATUS_CHANGES[status] ?? [];
export const canEditOffer = (status: OfferStatus) => status !== 'ACCEPTED' && status !== 'WITHDRAWN';
export const canDeleteOffer = (status: OfferStatus) => status !== 'ACCEPTED';
/** A reason is required when HR records a decline or withdraws an offer. */
export const statusChangeNeedsReason = (status: OfferStatus) => status === 'DECLINED' || status === 'WITHDRAWN';

export const createEmptyOfferHrmForm = (): OfferHrmForm => ({
  hrmOrgUnitId: '',
  locationType: '',
  stateId: '',
  cityId: '',
  isOfficeManager: false,
  employmentType: 'FULL_TIME',
  reportingManagerEmployeeId: '',
  reportingManagerName: '',
  salaryComponents: STANDARD_SALARY_COMPONENTS.slice(0, 4).map((component) => ({ ...component, monthlyAmount: '' })),
});

/** The form for an offer that was saved earlier (placement may be null for offers made before it existed). */
export const offerHrmFormFromStored = (
  placement: StoredOfferPlacement | null | undefined,
  components: StoredSalaryComponent[] | null | undefined,
  reportingManagerName?: string | null,
): OfferHrmForm => {
  const empty = createEmptyOfferHrmForm();
  const employmentType = placement?.employmentType && placement.employmentType in EMPLOYMENT_TYPE_LABELS
    ? placement.employmentType as OfferEmploymentType
    : empty.employmentType;
  return {
    hrmOrgUnitId: placement?.hrmOrgUnitId ?? '',
    locationType: placement?.locationType === 'HEAD_OFFICE' || placement?.locationType === 'STATE_OFFICE' ? placement.locationType : '',
    stateId: placement?.stateId ? String(placement.stateId) : '',
    cityId: placement?.cityId ? String(placement.cityId) : '',
    isOfficeManager: Boolean(placement?.isOfficeManager),
    employmentType,
    reportingManagerEmployeeId: placement?.reportingManagerEmployeeId ?? '',
    reportingManagerName: placement?.reportingManagerEmployeeId ? reportingManagerName ?? '' : '',
    salaryComponents: components?.length
      ? components.map((component) => ({ code: component.code, name: component.name, componentType: component.componentType, monthlyAmount: String(component.monthlyAmount) }))
      : empty.salaryComponents,
  };
};

// ---- money ----

const roundMoney = (value: number) => Math.round(value * 100) / 100;
export const parseAmount = (value: string) => {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : Number.NaN;
};

/** Monthly gross (earnings), monthly CTC (with employer contributions) and yearly CTC. Rows with no amount count as 0. */
export const salaryTotals = (rows: readonly SalaryComponentRow[]) => {
  let gross = 0;
  let ctc = 0;
  for (const row of rows) {
    const amount = parseAmount(row.monthlyAmount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    ctc += amount;
    if (row.componentType === 'EARNING') gross += amount;
  }
  return { grossMonthly: roundMoney(gross), ctcMonthly: roundMoney(ctc), annualCtc: roundMoney(ctc * 12) };
};

/** True when at least one row has an amount (the breakup is then the source of the salary on the letter). */
export const hasSalaryBreakup = (rows: readonly SalaryComponentRow[]) => rows.some((row) => parseAmount(row.monthlyAmount) > 0);

/** The salary amount printed on the letter for the chosen period, from the breakup. */
export const letterSalaryFromBreakup = (rows: readonly SalaryComponentRow[], period: string) => {
  const totals = salaryTotals(rows);
  return String(period === 'month' ? totals.ctcMonthly : totals.annualCtc);
};

export const formatInr = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value);

// ---- place of posting ----

export const buildPlaceOfPosting = (
  form: Pick<OfferHrmForm, 'locationType'>,
  place: { stateName?: string | null; cityName?: string | null },
) => {
  const where = [place.cityName, place.stateName].filter(Boolean).join(', ');
  if (form.locationType === 'HEAD_OFFICE') return where ? `Head Office, ${where}` : 'Head Office';
  return where;
};

// ---- checks before generating the letter ----

export type OfferHrmErrors = Partial<Record<'hrmOrgUnitId' | 'designation' | 'locationType' | 'stateId' | 'cityId' | 'salaryComponents' | 'reportingManagerEmployeeId', string>>;

export const validateOfferHrmForm = (
  form: OfferHrmForm,
  designation: string,
  options: Pick<OfferFormOptions, 'designations' | 'states' | 'headOffice'> | null,
  /** How many National Operations Managers exist: with more than one, a State Manager needs a manager chosen. */
  nationalManagerCount = 0,
): OfferHrmErrors => {
  const errors: OfferHrmErrors = {};
  if (!form.hrmOrgUnitId) errors.hrmOrgUnitId = 'Select the department.';
  if (!designation.trim()) errors.designation = 'Select the designation.';
  else if (options && !options.designations.some((item) => item.name.toLowerCase() === designation.trim().toLowerCase())) {
    errors.designation = 'Choose a designation from the HRM list.';
  }
  if (!form.locationType) errors.locationType = 'Choose Head office or State office.';
  if (form.locationType === 'HEAD_OFFICE' && options && !options.headOffice) {
    errors.locationType = 'The head office is not set up yet. Set it up on the HRM Organisation page, or choose State office.';
  }
  if (form.locationType === 'HEAD_OFFICE' && Boolean(form.stateId) !== Boolean(form.cityId)) {
    errors.cityId = 'Select the state together with the city, or leave both empty for the head office city.';
  }
  if (form.locationType === 'STATE_OFFICE') {
    if (!form.stateId) errors.stateId = 'Select the state.';
    else {
      const state = options?.states.find((item) => String(item.id) === form.stateId);
      if (state?.officeSwitchedOff) errors.stateId = `The ${state.name} state office is switched off. Switch it on from the HRM Organisation page first.`;
    }
    if (!form.cityId) errors.cityId = 'Select the city.';
  }
  const seen = new Set<string>();
  for (const row of form.salaryComponents) {
    const amount = parseAmount(row.monthlyAmount);
    if (!row.name.trim() && amount) { errors.salaryComponents = 'Give every salary row a name.'; break; }
    if (Number.isNaN(amount) || amount < 0) { errors.salaryComponents = `Enter a valid monthly amount for ${row.name || 'each row'}.`; break; }
    const code = row.code.trim().toUpperCase();
    if (amount > 0 && seen.has(code)) { errors.salaryComponents = `${row.name} appears twice.`; break; }
    seen.add(code);
  }
  if (!errors.salaryComponents && hasSalaryBreakup(form.salaryComponents)
    && !form.salaryComponents.some((row) => row.componentType === 'EARNING' && parseAmount(row.monthlyAmount) > 0)) {
    errors.salaryComponents = 'The salary breakup needs at least one earning (for example Basic salary).';
  }
  if (form.locationType === 'STATE_OFFICE' && form.isOfficeManager && nationalManagerCount > 1 && !form.reportingManagerEmployeeId) {
    errors.reportingManagerEmployeeId = 'Choose who this State Manager will report to.';
  }
  return errors;
};

/** Adds the HRM fields to the multipart body sent with the generated PDF. */
export const appendOfferHrmFields = (payload: FormData, form: OfferHrmForm) => {
  payload.append('hrmOrgUnitId', form.hrmOrgUnitId);
  payload.append('locationType', form.locationType);
  payload.append('stateId', form.stateId);
  payload.append('cityId', form.cityId);
  payload.append('isOfficeManager', form.locationType === 'STATE_OFFICE' && form.isOfficeManager ? 'true' : 'false');
  payload.append('employmentType', form.employmentType);
  payload.append('reportingManagerEmployeeId', form.reportingManagerEmployeeId);
  const rows = form.salaryComponents
    .filter((row) => parseAmount(row.monthlyAmount) > 0)
    .map((row) => ({ code: row.code.trim().toUpperCase(), name: row.name.trim(), componentType: row.componentType, monthlyAmount: parseAmount(row.monthlyAmount) }));
  payload.append('salaryComponents', JSON.stringify(rows));
};

/** A code for a custom salary row (OTHER_1, OTHER_2 ...) that is not used yet. */
export const nextCustomComponentCode = (rows: readonly SalaryComponentRow[]) => {
  const taken = new Set(rows.map((row) => row.code.toUpperCase()));
  let index = 1;
  while (taken.has(`OTHER_${index}`)) index += 1;
  return `OTHER_${index}`;
};

// ---- reading what the server stored ----

/** Placement of an offer as returned by the application detail (raw offer columns); null for an older offer. */
export const storedPlacementFromOffer = (offer: {
  hrmOrgUnitId?: string | null;
  locationType?: string | null;
  stateId?: number | null;
  cityId?: number | null;
  isOfficeManager?: boolean | null;
  employmentType?: string | null;
  reportingManagerEmployeeId?: string | null;
} | null | undefined): StoredOfferPlacement | null => {
  if (!offer?.hrmOrgUnitId) return null;
  return {
    hrmOrgUnitId: offer.hrmOrgUnitId,
    locationType: offer.locationType ?? null,
    stateId: offer.stateId ?? null,
    cityId: offer.cityId ?? null,
    isOfficeManager: Boolean(offer.isOfficeManager),
    employmentType: offer.employmentType ?? null,
    reportingManagerEmployeeId: offer.reportingManagerEmployeeId ?? null,
  };
};

/** A stored breakup (JSON column) as typed rows; anything malformed is dropped. */
export const storedComponentsFrom = (value: unknown): StoredSalaryComponent[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const monthlyAmount = Number(item.monthlyAmount);
    if (typeof item.code !== 'string' || typeof item.name !== 'string' || !Number.isFinite(monthlyAmount)) return [];
    const componentType: SalaryComponentType = item.componentType === 'EMPLOYER_CONTRIBUTION' ? 'EMPLOYER_CONTRIBUTION' : 'EARNING';
    return [{ code: item.code, name: item.name, componentType, monthlyAmount }];
  });
};

// ---- letter in step with the breakup ----

/** The salary to print for the period, or null when the breakup is empty (HR then types the amount). */
export const letterSalaryForPeriod = (rows: readonly SalaryComponentRow[], period: string) =>
  hasSalaryBreakup(rows) ? letterSalaryFromBreakup(rows, period) : null;

/** Rows with an amount, for the breakup table on the PDF. */
export const salaryBreakupForPdf = (rows: readonly SalaryComponentRow[]) =>
  rows
    .map((row) => ({ name: row.name.trim() || row.code, componentType: row.componentType, monthlyAmount: parseAmount(row.monthlyAmount) }))
    .filter((row) => Number.isFinite(row.monthlyAmount) && row.monthlyAmount > 0);

export type PdfSalaryRow = ReturnType<typeof salaryBreakupForPdf>[number];

/** "₹3.58 L / yr" for a yearly amount. */
export const formatLakhsPerYear = (annualCtc: number) =>
  Number.isFinite(annualCtc) && annualCtc > 0 ? `₹${(annualCtc / 100000).toFixed(2)} L / yr` : '—';

// ---- the request ----

/** The whole multipart body for POST / PATCH /recruitment/admin/offers. */
export const buildOfferMultipart = (input: {
  applicationId: string;
  letter: OfferLetterFormData;
  hrm: OfferHrmForm;
  pdfBlob: Blob;
}) => {
  const { letter } = input;
  const payload = new FormData();
  payload.append('applicationId', input.applicationId);
  payload.append('designation', letter.designation.trim());
  payload.append('department', letter.department.trim());
  payload.append('joiningLocation', letter.placeOfPosting.trim());
  payload.append('ctc', letter.salaryAmount.replace(/,/g, '').trim());
  payload.append('joiningDate', letter.joiningDate);
  payload.append('probationPeriod', letter.probationPeriod.trim());
  payload.append('additionalTerms', letter.additionalTerms.trim());
  payload.append('offerValidUntil', letter.offerValidUntil);
  payload.append('offerData', JSON.stringify(letter));
  appendOfferHrmFields(payload, input.hrm);
  payload.append('offerPdf', input.pdfBlob, `${letter.offerLetterNo || 'offer-letter'}.pdf`.replace(/[\\/]+/g, '-'));
  return payload;
};

/** The server's message for a failed request (axios error), or the fallback. */
export const apiErrorMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  const message = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : '';
  return message.trim() || fallback;
};

export const OFFER_STATUS_ACTION_LABELS: Record<OfferStatus, string> = {
  DRAFT: 'Move to draft',
  SENT: 'Resend offer',
  ACCEPTED: 'Record signed acceptance',
  DECLINED: 'Mark declined',
  EXPIRED: 'Mark expired',
  WITHDRAWN: 'Withdraw offer',
};

/** What the confirmation dialog says before HR changes the status (`from` = the offer's status now). */
export const describeOfferStatusAction = (status: OfferStatus, candidateName: string, from?: OfferStatus) => {
  switch (status) {
    case 'SENT':
      if (from === 'DECLINED' || from === 'EXPIRED') {
        return `Re-open this ${from === 'DECLINED' ? 'declined' : 'expired'} offer and send ${candidateName} a new link on the channels you choose. The old link stops working.`;
      }
      return `Send ${candidateName} a new link on the channels you choose. The old link stops working.`;
    case 'ACCEPTED': return `Upload the offer letter ${candidateName} signed on paper (or their written acceptance). They move to HRM onboarding, and the offer can no longer be edited.`;
    case 'DECLINED': return `Record that ${candidateName} declined this offer. The link stops accepting answers.`;
    case 'EXPIRED': return `Close this offer as expired. The candidate can no longer answer it (the link shows it expired). You can resend it later if needed.`;
    case 'WITHDRAWN': return `Take this offer back. The candidate can no longer answer it (the link shows it was withdrawn), and it cannot be reopened.`;
    default: return '';
  }
};

// ---- sending the offer: what each channel did ----

export type OfferChannel = 'email' | 'whatsapp' | 'sms';
export const OFFER_CHANNELS: readonly OfferChannel[] = ['email', 'whatsapp', 'sms'];
export const OFFER_CHANNEL_LABELS: Record<OfferChannel, string> = { email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS' };

/** One channel's result as the backend sends it (recruitmentOfferCommunication.service.ts ChannelResult). */
export type OfferChannelResult = { channel: OfferChannel; ok: boolean; skipped?: boolean; reason?: string; error?: string; result?: unknown };
/** `communications` of a create / edit / resend answer. allSucceeded is a boolean, not a channel. */
export type OfferCommunications = Partial<Record<OfferChannel, OfferChannelResult>> & { allSucceeded?: boolean };

export type OfferDispatchSummary = {
  sent: OfferChannel[];
  /** Switched off, not set up, no recipient, or already sent: not a delivery failure. */
  notConfigured: Array<{ channel: OfferChannel; reason: string }>;
  failed: Array<{ channel: OfferChannel; error: string }>;
  /** Not chosen for this send. */
  skipped: OfferChannel[];
  summary: string;
  /** success = every chosen channel went out; warning otherwise. */
  tone: 'success' | 'warning';
};

// Reasons from the email / WhatsApp / SMS services and their automation policies (backend whatsappIntegration,
// smsIntegration and recruitmentEmail services; whatsapp-core / sms-core automationPolicy.ts).
const SWITCHED_OFF_REASONS = new Set([
  'INTEGRATION_DISABLED', 'AUTOMATION_DISABLED', 'TEMPLATE_DISABLED', 'RULE_DISABLED', 'SETTINGS_DISABLED',
  'MESSAGE_ID_REQUIRED', 'APPROVED_TEMPLATE_REQUIRED',
]);
const TEMPLATE_PROBLEM_REASONS = new Set(['AUTOMATION_CONFIGURATION_INVALID', 'INVALID_TEMPLATE_CONFIGURATION', 'DOCUMENT_UNAVAILABLE']);
const NO_RECIPIENT_REASONS = new Set(['RECIPIENT_MISSING', 'RECIPIENT_PHONE_REQUIRED', 'RECIPIENT_PHONE_INVALID']);
/** DUPLICATE = WhatsApp / SMS answered { duplicate: true } (this link's message was already sent). */
const ALREADY_SENT_REASONS = new Set(['ALREADY_QUEUED', 'DUPLICATE']);
const OPTED_OUT_REASONS = new Set(['NOTIFICATION_PREFERENCE_DISABLED']);
const isNotSetUpReason = (reason: string) =>
  SWITCHED_OFF_REASONS.has(reason) || TEMPLATE_PROBLEM_REASONS.has(reason) || NO_RECIPIENT_REASONS.has(reason)
  || ALREADY_SENT_REASONS.has(reason) || OPTED_OUT_REASONS.has(reason);

const FAILURE_REASON_TEXT: Record<string, string> = {
  DISPATCH_ERROR: 'it could not be sent.',
  LINK_SUPERSEDED: 'a newer link replaced this one.',
  OFFER_NOT_OPEN: 'the offer is no longer open.',
  OFFER_NOT_FOUND: 'the offer no longer exists.',
};
const NO_RESULT = 'no result came back.';

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
const joinLabels = (channels: readonly OfferChannel[]) => {
  const labels = channels.map((channel) => OFFER_CHANNEL_LABELS[channel]);
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
};

/** Why a channel did not go out although nothing failed, as one short sentence. */
export const describeOfferChannelReason = (channel: OfferChannel, reason: string) => {
  const label = OFFER_CHANNEL_LABELS[channel];
  if (NO_RECIPIENT_REASONS.has(reason)) {
    return channel === 'email' ? 'Email was not sent: the candidate has no valid email address.' : `${label} was not sent: the candidate has no valid mobile number.`;
  }
  if (ALREADY_SENT_REASONS.has(reason)) return `${label} was already sent for this link.`;
  if (OPTED_OUT_REASONS.has(reason)) return `${label} was not sent: the candidate turned these messages off.`;
  if (TEMPLATE_PROBLEM_REASONS.has(reason)) return `${label} was not sent: check its template in Settings > ${label}.`;
  return `${label} is not set up (switch it on in Settings > ${label}).`;
};

/**
 * What happened on each channel after an offer was sent (create, edit or resend), read only from the email /
 * whatsapp / sms keys; a missing or malformed answer never throws. "Not set up" (switched off, no template, no
 * recipient, already sent) is kept apart from a real delivery failure.
 */
export const describeOfferDispatch = (communications: unknown): OfferDispatchSummary => {
  const source = communications && typeof communications === 'object' && !Array.isArray(communications)
    ? communications as Record<string, unknown>
    : {};
  const sent: OfferChannel[] = [];
  const notConfigured: OfferDispatchSummary['notConfigured'] = [];
  const failed: OfferDispatchSummary['failed'] = [];
  const skipped: OfferChannel[] = [];
  let reported = 0;

  for (const channel of OFFER_CHANNELS) {
    const value = source[channel];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      failed.push({ channel, error: NO_RESULT });
      continue;
    }
    reported += 1;
    const entry = value as { ok?: unknown; skipped?: unknown; reason?: unknown; error?: unknown; result?: unknown };
    const result = entry.result && typeof entry.result === 'object' ? entry.result as { duplicate?: unknown } : null;
    const reason = typeof entry.reason === 'string' && entry.reason.trim()
      ? entry.reason.trim()
      : result?.duplicate === true ? 'DUPLICATE' : '';
    if (entry.skipped === true || reason === 'NOT_SELECTED') skipped.push(channel);
    else if (entry.ok === true) sent.push(channel);
    else if (reason && isNotSetUpReason(reason)) notConfigured.push({ channel, reason });
    else {
      const message = typeof entry.error === 'string' && entry.error.trim() ? entry.error.trim() : '';
      const error = message ? sentence(message.length > 160 ? `${message.slice(0, 157)}…` : message) : FAILURE_REASON_TEXT[reason] ?? 'it could not be sent.';
      failed.push({ channel, error });
    }
  }

  const tone: OfferDispatchSummary['tone'] = sent.length && !failed.length && !notConfigured.length ? 'success' : 'warning';
  if (!reported) {
    return { sent, notConfigured, failed, skipped, tone: 'warning', summary: 'The server did not say which messages went out. Check the Email, WhatsApp and SMS logs.' };
  }

  const parts: string[] = [sent.length ? `Sent by ${joinLabels(sent)}.` : 'Nothing was sent.'];
  for (const item of notConfigured) parts.push(describeOfferChannelReason(item.channel, item.reason));
  // The same error on several channels (e.g. the letter PDF is missing) is said once.
  const byError = new Map<string, OfferChannel[]>();
  for (const item of failed) byError.set(item.error, [...(byError.get(item.error) ?? []), item.channel]);
  for (const [error, channels] of byError) parts.push(`${joinLabels(channels)} failed: ${error}`);
  if (failed.length) parts.push('Check the message logs, and resend if needed.');
  return { sent, notConfigured, failed, skipped, tone, summary: parts.join(' ') };
};

/** The ticked channels, in the fixed order email, WhatsApp, SMS. */
export const chosenOfferChannels = (selection: Partial<Record<OfferChannel, boolean>>): OfferChannel[] =>
  OFFER_CHANNELS.filter((channel) => selection[channel] === true);

export type OfferSendResponse = { success?: boolean; communications?: OfferCommunications; message?: string };

// ---- API ----

// ---- acceptance evidence ----

export type AcceptanceMethod = 'TYPED' | 'DRAWN' | 'UPLOADED_SCAN' | 'OFFLINE_HR';
export type StoredOfferAcceptance = {
  method: AcceptanceMethod | string | null;
  name: string | null;
  place: string | null;
  acceptedAt: string | null;
  documentHash: string | null;
  hasCertificate: boolean;
  hasSignatureFile: boolean;
};

export const ACCEPTANCE_METHOD_LABELS: Record<AcceptanceMethod, string> = {
  TYPED: 'Typed name',
  DRAWN: 'Drawn signature',
  UPLOADED_SCAN: 'Uploaded signed copy',
  OFFLINE_HR: 'Recorded by HR from paper copy',
};
export const describeAcceptanceMethod = (method: string | null | undefined) =>
  method && method in ACCEPTANCE_METHOD_LABELS ? ACCEPTANCE_METHOD_LABELS[method as AcceptanceMethod] : method || '-';
/** What the second download button is called: a drawn signature image, or the signed copy. */
export const signatureFileLabel = (method: string | null | undefined) => (method === 'DRAWN' ? 'Download signature' : 'Download signed copy');
export const shortHash = (hash: string | null | undefined, length = 12) => (hash ? (hash.length > length ? `${hash.slice(0, length)}…` : hash) : '-');

export const MAX_SIGNED_COPY_BYTES = 5 * 1024 * 1024;
const SIGNED_COPY_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const SIGNED_COPY_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

/** Today as YYYY-MM-DD in the browser's own day (the signing date cannot be later). */
export const todayIso = (now = new Date()) => {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export type OfflineAcceptanceForm = { file: { name: string; size: number; type: string } | null; signedOn: string; place: string; note: string };
export type OfflineAcceptanceErrors = Partial<Record<'file' | 'signedOn' | 'note', string>>;

/** Checks the "Record signed acceptance" form (the server checks again, including "not before the offer was sent"). */
export const validateOfflineAcceptance = (form: OfflineAcceptanceForm, today = todayIso()): OfflineAcceptanceErrors => {
  const errors: OfflineAcceptanceErrors = {};
  if (!form.file) errors.file = 'Choose the signed offer letter (PDF, JPG, PNG or WEBP).';
  else {
    const extension = form.file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!SIGNED_COPY_EXTENSIONS.includes(extension) || (form.file.type && !SIGNED_COPY_TYPES.includes(form.file.type))) errors.file = 'Upload a PDF, JPG, PNG or WEBP file.';
    else if (form.file.size <= 0) errors.file = 'The file is empty.';
    else if (form.file.size > MAX_SIGNED_COPY_BYTES) errors.file = 'The file is larger than 5 MB.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.signedOn)) errors.signedOn = 'Enter the date the candidate signed.';
  else if (form.signedOn > today) errors.signedOn = 'The signing date cannot be in the future.';
  if (form.note.trim().length > 1000) errors.note = 'Keep the note under 1000 characters.';
  return errors;
};

export const buildOfflineAcceptancePayload = (form: { file: Blob; fileName: string; signedOn: string; place: string; note: string }) => {
  const payload = new FormData();
  payload.append('signedCopy', form.file, form.fileName);
  payload.append('signedOn', form.signedOn);
  if (form.place.trim()) payload.append('place', form.place.trim());
  if (form.note.trim()) payload.append('note', form.note.trim());
  return payload;
};

// ---- HRM handoff (accepted offer -> HRM pre-joining record) ----

/**
 * CANCELLED = Cancel joining on the Onboarding page (the HR record was archived, or a re-hire went back to the earlier
 * record); DISMISSED = a "needs review" case was dismissed (or cancelled before any HR record existed). Both are final:
 * the offer stays ACCEPTED (its evidence stays viewable) but no longer counts as the application's live offer.
 */
export type OfferHrmHandoffStatus = 'PENDING' | 'DONE' | 'NEEDS_REVIEW' | 'FAILED' | 'CANCELLED' | 'DISMISSED';
export const CLOSED_HRM_HANDOFF_STATUSES: readonly OfferHrmHandoffStatus[] = ['CANCELLED', 'DISMISSED'];
export const isClosedHrmHandoff = (status: string | null | undefined) =>
  status === 'CANCELLED' || status === 'DISMISSED';

/**
 * The backend's "live offer" (recruitment.controller.ts LIVE_OFFER_WHERE): DRAFT, SENT, or ACCEPTED whose HRM handoff
 * was not cancelled / dismissed. An application can have only one, so "Create offer" needs none to be live.
 */
export const isLiveOffer = (offer: { status: string; hrmHandoffStatus?: string | null }) =>
  offer.status === 'DRAFT'
  || offer.status === 'SENT'
  || (offer.status === 'ACCEPTED' && !isClosedHrmHandoff(offer.hrmHandoffStatus));

/** True when the application has no live offer, so a new one may be created. */
export const canCreateAnotherOffer = (offers: ReadonlyArray<{ status: string; hrmHandoffStatus?: string | null }>) =>
  !offers.some(isLiveOffer);

/** The reason HR typed when cancelling the joining / dismissing the review (the note may carry a "Joining cancelled:" prefix). */
export const closedHandoffReason = (note: string | null | undefined) =>
  (note ?? '').replace(/^\s*Joining cancelled:\s*/i, '').trim();

export type StoredOfferHrm = {
  status: OfferHrmHandoffStatus | string | null;
  note: string | null;
  attempts: number;
  employeeId: string | null;
  employeeCode: string | null;
};
export type OfferHrmHandoffResult = {
  outcome: 'CREATED' | 'REHIRED' | 'ALREADY_DONE' | 'NEEDS_REVIEW';
  employeeId?: string;
  caseId: string;
  notes: string[];
};
export type OfferHrmTone = 'success' | 'info' | 'danger' | 'warning' | 'neutral';

/** The HRM state of an accepted offer, as one label + colour + whether HR can (re)run the handoff. */
export const describeOfferHrm = (hrm: StoredOfferHrm | null | undefined): { label: string; tone: OfferHrmTone; canRun: boolean; runLabel: string; detail: string | null } => {
  const status = hrm?.status ?? null;
  if (status === 'DONE') {
    return {
      label: hrm?.employeeCode ? `In HRM · ${hrm.employeeCode}` : 'In HRM',
      tone: 'success',
      canRun: false,
      runLabel: '',
      detail: hrm?.note ? `To complete in HRM: ${hrm.note}` : null,
    };
  }
  if (status === 'PENDING') return { label: 'Adding to HRM…', tone: 'info', canRun: false, runLabel: '', detail: null };
  if (status === 'FAILED') {
    const attempts = hrm?.attempts ?? 0;
    return {
      label: 'Could not add to HRM',
      tone: 'danger',
      canRun: true,
      runLabel: 'Retry',
      detail: `${hrm?.note || 'The HRM record could not be created.'}${attempts ? ` (${attempts} attempt${attempts === 1 ? '' : 's'})` : ''}`,
    };
  }
  if (status === 'NEEDS_REVIEW') {
    return {
      label: 'Check before adding to HRM',
      tone: 'warning',
      canRun: true,
      runLabel: 'Retry after checking',
      detail: hrm?.note || 'This person may already have an HR record. Check the existing record, then retry.',
    };
  }
  // Final states: no Retry / Add, and the application is free for a new offer.
  if (status === 'CANCELLED' || status === 'DISMISSED') {
    const reason = closedHandoffReason(hrm?.note);
    const cancelledJoining = status === 'CANCELLED' || /^\s*Joining cancelled/i.test(hrm?.note ?? '');
    const label = status === 'CANCELLED'
      ? 'Joining cancelled'
      : cancelledJoining ? 'Joining cancelled — no HR record' : 'HRM review dismissed — no HR record';
    const outcome = status === 'CANCELLED'
      ? 'The HR record was archived (or a re-hire went back to the earlier record).'
      : 'No HR record was created from this offer.';
    return {
      label,
      tone: 'neutral',
      canRun: false,
      runLabel: '',
      detail: `${reason ? `Reason: ${reason.replace(/[.\s]+$/, '')}. ` : ''}${outcome} A new offer can be made on this application.`,
    };
  }
  return { label: 'Not in HRM yet', tone: 'neutral', canRun: true, runLabel: 'Add to HRM', detail: null };
};

/**
 * Whether the viewer may open an HRM profile (GET /hrm/employees/:id needs hrm.employees.read; only Super Admin is
 * all-access, the legacy ADMIN role is checked like an employee). Without it the profile link is shown as plain text.
 */
export const canOpenHrmProfile = (user: { role?: string | null; permissions?: string[] | null } | null | undefined) =>
  user?.role === 'SUPER_ADMIN' || hasPermission(user?.permissions ?? undefined, 'hrm.employees.read');

/** The HRM profile link in the same portal (/admin/... or /employee/...). */
export const hrmProfileHref = (pathname: string, employeeId: string) =>
  `${pathname.startsWith('/employee/') ? '/employee' : '/admin'}/hrm/${encodeURIComponent(employeeId)}`;

/** The toast after HR ran the handoff. */
export const describeHandoffOutcome = (result: OfferHrmHandoffResult, employeeCode?: string | null): { kind: 'success' | 'info' | 'warning'; message: string } => {
  if (result.outcome === 'CREATED' || result.outcome === 'REHIRED') {
    const who = employeeCode ? ` as ${employeeCode}` : '';
    const extra = result.notes.length ? ` ${result.notes.join(' ')}` : '';
    return { kind: 'success', message: `${result.outcome === 'REHIRED' ? 'Re-hired in HRM' : 'Added to HRM'}${who}.${extra}` };
  }
  if (result.outcome === 'ALREADY_DONE') return { kind: 'info', message: 'This person is already in HRM.' };
  return { kind: 'warning', message: result.notes.join(' ') || 'This person may already have an HR record. Check it in HRM.' };
};

/** The HRM state from the raw offer row the application detail page receives. */
export const storedHrmFromOfferRow = (row: { hrmHandoffStatus?: string | null; hrmHandoffError?: string | null; hrmHandoffAttempts?: number | null; hrmEmployeeId?: string | null; hrmEmployeeCode?: string | null }): StoredOfferHrm => ({
  status: row.hrmHandoffStatus ?? null,
  note: row.hrmHandoffError ?? null,
  attempts: row.hrmHandoffAttempts ?? 0,
  employeeId: row.hrmEmployeeId ?? null,
  employeeCode: row.hrmEmployeeCode ?? null,
});

export const offerHrmApi = {
  runHrmHandoff: (offerId: string) =>
    api.post<{ success: boolean; result: OfferHrmHandoffResult }>(`/recruitment/admin/offers/${encodeURIComponent(offerId)}/hrm-handoff`),
  getFormOptions: () => api.get<{ success: boolean; options: OfferFormOptions }>('/recruitment/admin/offers/form-options'),
  searchManagers: (search: string) => api.get<{ success: boolean; managers: OfferManagerOption[] }>('/recruitment/admin/offers/manager-options', { params: { search } }),
  getCities: (stateId: number | string) => api.get<CityOption[]>(`/locations/cities/${stateId}`),
  changeStatus: (offerId: string, status: OfferStatus, reason?: string) =>
    api.patch(`/recruitment/admin/offers/${encodeURIComponent(offerId)}/status`, { status, ...(reason ? { reason } : {}) }),
  /**
   * (Re)send with a new link on the chosen channels (SENT, or re-open a DECLINED / EXPIRED offer). Every older link,
   * long and short, stops working on every channel. 409 when someone else changed the offer a moment ago.
   */
  resend: (offerId: string, channels: readonly OfferChannel[]) =>
    api.post<OfferSendResponse>(`/recruitment/admin/offers/${encodeURIComponent(offerId)}/resend`, { channels: [...channels] }),
  acceptOffline: (offerId: string, payload: FormData) =>
    api.post(`/recruitment/admin/offers/${encodeURIComponent(offerId)}/accept-offline`, payload, { headers: { 'Content-Type': 'multipart/form-data' } }),
  downloadAcceptanceFile: (offerId: string, kind: 'certificate' | 'signature') =>
    api.get<Blob>(`/recruitment/admin/offers/${encodeURIComponent(offerId)}/acceptance/${kind}`, { responseType: 'blob' }),
};

/** What the candidate's offer page says when the offer can no longer be answered. */
export const describeClosedOffer = (status: string) => {
  switch (status) {
    case 'ACCEPTED': return 'You have accepted this offer. Our HR team will contact you about joining.';
    case 'DECLINED': return 'You declined this offer.';
    case 'WITHDRAWN': return 'This offer was withdrawn by JCB Exchange. Please contact HR if you have questions.';
    case 'EXPIRED': return 'This offer has expired. Please contact HR if you are still interested.';
    default: return 'This offer is no longer awaiting a response.';
  }
};
