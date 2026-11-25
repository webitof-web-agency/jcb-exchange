import { z, type ZodType } from 'zod';
import { HrmHttpError } from './errors';

const id = z.string().trim().min(1).max(100);
const optionalId = id.nullable().optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD dates.');
const optionalDate = date.nullable().optional();
const optionalQueryText = (max: number) => z.string().trim().max(max).transform((value) => value || undefined).optional();
const idempotencyKey = z.string().trim().min(8).max(120);
const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);

type HrmValidationDetail = { path: string; message: string };

const summarizeValidation = (details: HrmValidationDetail[]) => {
  const shown = details.slice(0, 3).map((detail) => (detail.path && detail.path !== 'body' ? `${detail.path}: ${detail.message}` : detail.message));
  return shown.length ? `Please check the request. ${shown.join('; ')}${details.length > shown.length ? '; …' : ''}` : 'The HRM request could not be validated.';
};

/** A 400 the HRM controller returns as JSON; `error` names the first invalid fields so the UI can show them. */
export class HrmValidationError extends HrmHttpError {
  declare readonly details: HrmValidationDetail[];

  constructor(details: HrmValidationDetail[]) {
    super(400, 'HRM_VALIDATION_FAILED', summarizeValidation(details), details);
    this.name = 'HrmValidationError';
  }
}

const employeeSource = z.enum(['RECRUITMENT', 'DIRECT_HR']);
const employeeStatus = z.enum(['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'NOTICE_PERIOD', 'EXITED', 'TERMINATED']);

/** An Indian postal address. */
const address = z.object({
  line1: nonEmptyText(200),
  line2: z.string().trim().max(200).nullable().optional(),
  city: nonEmptyText(80),
  state: nonEmptyText(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit PIN code.'),
}).strict();
const emergencyContact = z.object({
  name: nonEmptyText(160),
  relation: nonEmptyText(60),
  mobile: z.string().trim().regex(/^(?=.{8,15}$)\+?[0-9]+$/, 'Enter a valid mobile number.'),
}).strict();
export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'] as const;
export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const createEmployee = z.object({
  employeeCode: z.string().trim().min(2).max(30).transform((value) => value.toUpperCase()),
  legalName: nonEmptyText(160),
  preferredName: z.string().trim().max(160).nullable().optional(),
  workEmail: z.string().trim().email().max(254).nullable().optional(),
  personalEmail: z.string().trim().email().max(254).nullable().optional(),
  // 8-15 characters including an optional leading +: the column is VarChar(15).
  mobile: z.string().trim().regex(/^(?=.{8,15}$)\+?[0-9]+$/).nullable().optional(),
  dateOfBirth: optionalDate,
  joinedOn: optionalDate,
  source: employeeSource,
  status: employeeStatus.optional(),
  userId: optionalId,
  // Personal details HR completes during onboarding.
  gender: z.enum(GENDERS).nullable().optional(),
  fatherOrSpouseName: z.string().trim().max(160).nullable().optional(),
  maritalStatus: z.enum(MARITAL_STATUSES).nullable().optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
  currentAddress: address.nullable().optional(),
  permanentAddress: address.nullable().optional(),
  emergencyContact: emergencyContact.nullable().optional(),
}).strict();

const updateEmployee = createEmployee.partial().extend({
  version: z.number().int().positive(),
}).strict();

const createAssignment = z.object({
  orgUnitId: id,
  operationalRegionId: optionalId,
  designation: nonEmptyText(120),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'FREELANCE']).nullable().optional(),
  workMode: z.enum(['ON_SITE', 'REMOTE', 'HYBRID']).nullable().optional(),
  stateId: z.number().int().positive().nullable().optional(),
  cityId: z.number().int().positive().nullable().optional(),
  managerEmployeeId: optionalId,
  approvalManagerId: optionalId,
  status: z.enum(['PLANNED', 'ACTIVE', 'ENDED', 'CANCELLED']).optional(),
  effectiveFrom: date,
  effectiveTo: optionalDate,
  reason: z.string().trim().max(5000).nullable().optional(),
}).strict();

const createOrgUnit = z.object({
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  name: nonEmptyText(160),
  type: z.enum(['COMPANY', 'HEAD_OFFICE', 'REGION', 'BRANCH', 'DEPARTMENT', 'TEAM']),
  parentId: optionalId,
  stateId: z.number().int().positive().nullable().optional(),
  cityId: z.number().int().positive().nullable().optional(),
  managerEmployeeId: optionalId,
}).strict();

const onboardingFromOffer = z.object({
  idempotencyKey,
  targetJoiningDate: optionalDate,
  legalDisclaimer: z.string().trim().max(2000).nullable().optional(),
}).strict();

const documentCategory = z.enum(['IDENTITY', 'ADDRESS', 'EDUCATION', 'EXPERIENCE', 'OFFER', 'ACCEPTANCE', 'BANK', 'TAX', 'EMPLOYMENT', 'PHOTO', 'OTHER']);

/** The fields sent with an uploaded document file (multipart). */
const uploadDocument = z.object({
  category: documentCategory,
  title: nonEmptyText(160),
  expiresAt: optionalDate,
}).strip();

const createDocument = z.object({
  category: documentCategory,
  title: nonEmptyText(160),
  fileRef: z.string().trim().min(1).max(500).refine((value) => !/^https?:\/\//i.test(value), 'Use an internal document reference.'),
  driveFileId: z.string().trim().max(200).nullable().optional(),
  mimeType: z.string().trim().max(120).nullable().optional(),
  fileSize: z.number().int().positive().max(20 * 1024 * 1024).nullable().optional(),
  // SUREPASS documents can only be created by the server-side KYC link flow.
  provider: z.enum(['MANUAL', 'GOOGLE_DRIVE', 'OTHER']).optional(),
  providerReference: z.string().trim().max(200).nullable().optional(),
  expiresAt: optionalDate,
}).strict();

const documentDecision = z.object({
  version: z.number().int().positive(),
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED']),
  rejectionReason: z.string().trim().max(5000).nullable().optional(),
}).strict();

const linkKycVerification = z.object({
  documentType: z.enum(['PAN', 'AADHAAR']),
  verificationRecordId: id,
}).strict();

const createBankAccount = z.object({
  bankName: z.string().trim().min(2).max(120).nullable().optional(),
  accountHolderName: z.string().trim().min(2).max(160).nullable().optional(),
  accountNumber: z.string().trim().regex(/^\d{6,20}$/, 'Enter a valid bank account number.'),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid 11-character IFSC.').nullable().optional(),
  isPrimary: z.boolean().optional(),
}).strict();

const attendance = z.object({
  attendanceDate: date,
  status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF']),
  checkIn: z.string().datetime().nullable().optional(),
  checkOut: z.string().datetime().nullable().optional(),
  source: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
}).strict();

const leaveRequest = z.object({
  leaveTypeId: id,
  startDate: date,
  endDate: date,
  units: z.number().positive().max(366),
  reason: z.string().trim().max(5000).nullable().optional(),
  idempotencyKey,
}).strict();

const leaveDecision = z.object({
  version: z.number().int().positive(),
  status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED']),
  decisionReason: z.string().trim().max(5000).nullable().optional(),
}).strict();

const compensation = z.object({
  effectiveFrom: date,
  effectiveTo: optionalDate,
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  baseSalary: z.number().nonnegative(),
  grossSalary: z.number().nonnegative(),
  annualCtc: z.number().nonnegative().nullable().optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUPERSEDED']).optional(),
  reason: z.string().trim().max(5000).nullable().optional(),
  components: z.array(z.object({
    code: nonEmptyText(40),
    name: nonEmptyText(100),
    componentType: nonEmptyText(30),
    amount: z.number().nonnegative(),
    isRecurring: z.boolean().optional(),
    isTaxable: z.boolean().optional(),
  }).strict()).max(100).optional(),
}).strict();

/** A salary revision proposed by HR: always PENDING_APPROVAL; monthly components (at least one earning). */
const proposeCompensation = z.object({
  effectiveFrom: date,
  reason: z.string().trim().max(2000).nullable().optional(),
  components: z.array(z.object({
    code: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{1,39}$/),
    name: nonEmptyText(100),
    componentType: z.enum(['EARNING', 'EMPLOYER_CONTRIBUTION']),
    monthlyAmount: z.number().nonnegative().max(100_000_000),
  }).strict()).min(1).max(20),
}).strict();

const compensationDecision = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().max(1000).nullable().optional(),
}).strict();

const timeOfDay = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour).');
const shiftFields = {
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()),
  name: nonEmptyText(80),
  startTime: timeOfDay,
  endTime: timeOfDay,
  breakMinutes: z.number().int().min(0).max(480).optional(),
  graceMinutes: z.number().int().min(0).max(240).optional(),
  halfDayMinutes: z.number().int().min(30).max(1440).nullable().optional(),
  fullDayMinutes: z.number().int().min(30).max(1440).nullable().optional(),
  isNightShift: z.boolean().optional(),
  isActive: z.boolean().optional(),
};
const createShift = z.object(shiftFields).strict();
const updateShift = z.object(shiftFields).partial().strict();

const WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
/** Weekly offs: whole days off every week, plus which Saturdays of the month (1st-5th) are off. */
const weeklyOffs = z.object({
  days: z.array(z.enum(WEEK_DAYS)).max(7),
  saturdays: z.array(z.number().int().min(1).max(5)).max(5).optional(),
}).strict();
const assignShift = z.object({
  shiftId: id,
  weeklyOffs,
  effectiveFrom: date,
  reason: z.string().trim().max(1000).nullable().optional(),
}).strict();

const holiday = z.object({
  date,
  name: nonEmptyText(120),
  scope: z.enum(['ALL_INDIA', 'STATE']),
  stateId: z.number().int().positive().nullable().optional(),
  isOptional: z.boolean().optional(),
}).strict();
const holidayQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  stateId: z.coerce.number().int().positive().optional(),
}).strip();

const onboardingQuery = z.object({
  search: optionalQueryText(80),
  status: z.enum(['OPEN', 'NEEDS_REVIEW', 'PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL', 'COMPLETED', 'CANCELLED', 'ALL']).optional(),
  joining: z.enum(['THIS_WEEK', 'NEXT_30_DAYS', 'OVERDUE']).optional(),
  stateId: z.coerce.number().int().positive().optional(),
  orgUnitId: optionalQueryText(100),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strip();
const cancelJoining = z.object({
  reason: z.string().trim().min(3).max(1000),
}).strict();
const resolveOnboardingReview = z.object({
  /** CREATE_NEW: a different person; USE_EXISTING: the same person who left earlier (rehire); DISMISS: close it. */
  action: z.enum(['CREATE_NEW', 'USE_EXISTING', 'DISMISS']),
  employeeId: optionalId,
  reason: z.string().trim().min(3).max(1000),
}).strict();

const scopeTypeEnum = z.enum(['OWN', 'DIRECT_REPORTS', 'TEAM', 'DEPARTMENT', 'REGION', 'STATE', 'HEAD_OFFICE', 'ALL_INDIA']);
const grantedScope = z.object({
  scopeType: scopeTypeEnum,
  stateId: z.number().int().positive().nullable().optional(),
  orgUnitId: optionalId,
  /** PLACEMENT follows the person's office (only a State Manager's STATE scope); MANUAL stays until HR ends it. */
  source: z.enum(['PLACEMENT', 'MANUAL']).optional(),
}).strict();

/** Confirm joining: the actual date, the login (made by HR), the access HR confirms, and a reason if the checklist is not complete. */
const confirmJoining = z.object({
  version: z.number().int().positive(),
  joiningDate: date,
  login: z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('CREATE'),
      email: z.string().trim().email().max(254),
      mobile: z.string().trim().max(20).nullable().optional(),
      password: z.string().min(8).max(72),
      customRoleId: optionalId,
    }).strict(),
    z.object({ mode: z.literal('LINK'), userId: id }).strict(),
    z.object({
      mode: z.literal('KEEP'),
      /** Switch a login that HR switched off (a re-hire) back on. */
      reactivate: z.boolean().optional(),
      newPassword: z.string().min(8).max(72).optional(),
      customRoleId: optionalId,
    }).strict(),
    z.object({ mode: z.literal('NONE'), reason: z.string().trim().min(3).max(500) }).strict(),
  ]),
  scopes: z.array(grantedScope).max(10).optional(),
  overrideReason: z.string().trim().min(3).max(1000).optional(),
  /** HR ticked "send welcome": RECRUITMENT_JOINING_WELCOME goes to the person after the confirm commits. */
  sendWelcome: z.boolean().optional(),
}).strict();

const grantScope = grantedScope.extend({ activeFrom: optionalDate }).strict();
const endScope = z.object({ lastDay: optionalDate }).strict();
const changeLoginRole = z.object({ customRoleId: optionalId }).strict();

const reportQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  stateId: z.coerce.number().int().positive().optional(),
  orgUnitId: optionalQueryText(100),
  by: z.enum(['state', 'department']).optional(),
}).strip();

const performanceReview = z.object({
  cycleId: id,
  reviewerEmployeeId: optionalId,
  status: z.enum(['DRAFT', 'OPEN', 'SUBMITTED', 'REVIEWED', 'ACKNOWLEDGED', 'CLOSED']).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  goals: z.unknown().nullable().optional(),
  strengths: z.string().trim().max(5000).nullable().optional(),
  improvementAreas: z.string().trim().max(5000).nullable().optional(),
  employeeComment: z.string().trim().max(5000).nullable().optional(),
}).strict();

const incentive = z.object({
  incentiveType: nonEmptyText(60),
  periodStart: date,
  periodEnd: date,
  amount: z.number().nonnegative(),
  // A new incentive always waits for approval (the approval / payout step comes with the incentives module).
  status: z.literal('PENDING_APPROVAL').optional(),
  reason: z.string().trim().max(5000).nullable().optional(),
}).strict();

const exitCase = z.object({
  exitType: nonEmptyText(40),
  resignationDate: optionalDate,
  requestedLastDay: optionalDate,
  reason: z.string().trim().max(5000).nullable().optional(),
}).strict();

const accessScope = z.object({
  userId: id,
  scopeType: z.enum(['OWN', 'DIRECT_REPORTS', 'TEAM', 'DEPARTMENT', 'REGION', 'STATE', 'HEAD_OFFICE', 'ALL_INDIA']),
  orgUnitId: optionalId,
  operationalRegionId: optionalId,
  stateId: z.number().int().positive().nullable().optional(),
  includeChildren: z.boolean().optional(),
  activeFrom: date,
  activeTo: optionalDate,
}).strict();

const employmentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'FREELANCE']);


/** A state office placement needs a state and a city; only a state office can have a manager. */
const refineLocation = (
  value: { locationType: 'HEAD_OFFICE' | 'STATE_OFFICE'; stateId?: number | null | undefined; cityId?: number | null | undefined; isOfficeManager?: boolean | undefined },
  context: z.RefinementCtx,
) => {
  if (value.locationType === 'STATE_OFFICE') {
    if (!value.stateId) context.addIssue({ code: 'custom', path: ['stateId'], message: 'Select the state.' });
    if (!value.cityId) context.addIssue({ code: 'custom', path: ['cityId'], message: 'Select the city.' });
  } else {
    // The head office defaults to Raipur; a different place may be chosen, but state and city go together.
    if (Boolean(value.stateId) !== Boolean(value.cityId)) {
      context.addIssue({ code: 'custom', path: [value.stateId ? 'cityId' : 'stateId'], message: 'Select both the state and the city.' });
    }
    if (value.isOfficeManager) {
      context.addIssue({ code: 'custom', path: ['isOfficeManager'], message: 'Only a state office has a manager.' });
    }
  }
};

const isRealDay = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
/** A calendar date that exists (2026-02-31 would silently roll over to March). */
const realDate = date.refine(isRealDay, 'Enter a valid date.');

const joiningDateField = date
  .refine((value) => isRealDay(value) && value >= '1950-01-01', 'Enter a valid joining date.')
  .refine((value) => new Date(`${value}T00:00:00.000Z`).getTime() <= Date.now() + 366 * 24 * 60 * 60 * 1000, 'The joining date can be at most one year ahead.');

/** Optional profile details HR can fill while adding the person; everything else can be completed later. */
const profileDetails = {
  preferredName: z.string().trim().max(160).nullable().optional(),
  dateOfBirth: date
    .refine((value) => isRealDay(value) && value >= '1940-01-01', 'Enter a valid date of birth.')
    .refine((value) => new Date(`${value}T00:00:00.000Z`).getTime() <= Date.now() - 14 * 365.25 * 24 * 60 * 60 * 1000, 'The employee must be at least 14 years old.')
    .nullable().optional(),
  personalEmail: z.string().trim().email('Enter a valid personal email address.').max(254).nullable().optional(),
};

/** HR creates the employee, their login account and their first assignment in one request. */
const onboardEmployee = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name.').max(160),
  email: z.string().trim().email('Enter a valid email address.').max(254),
  mobile: z.string().trim().min(10, 'Enter a valid 10-digit mobile number.').max(20),
  // Not trimmed: spaces are legal in a password. bcrypt ignores everything after 72 bytes.
  password: z.string().min(8, 'Password must be at least 8 characters long.')
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long (72 bytes at most; accented or non-English characters count as more than one).'),
  customRoleId: optionalId,
  joiningDate: joiningDateField,
  designation: nonEmptyText(120),
  orgUnitId: id,
  employmentType: employmentTypeEnum.optional(),
  managerEmployeeId: optionalId,
  locationType: z.enum(['HEAD_OFFICE', 'STATE_OFFICE']),
  stateId: z.number().int().positive().nullable().optional(),
  cityId: z.number().int().positive().nullable().optional(),
  /** Manager of the state office (State Manager). Only meaningful for a state office. */
  isOfficeManager: z.boolean().optional(),
  ...profileDetails,
}).strict().superRefine(refineLocation);

/** Links a login that already exists (created on the Users page) to a new HR record, filling the rest here. */
const onboardExistingEmployee = z.object({
  userId: id,
  // Only used when the login has no mobile number of its own.
  mobile: z.string().trim().max(20).nullable().optional(),
  joiningDate: joiningDateField,
  designation: nonEmptyText(120),
  orgUnitId: id,
  employmentType: employmentTypeEnum.optional(),
  managerEmployeeId: optionalId,
  locationType: z.enum(['HEAD_OFFICE', 'STATE_OFFICE']),
  stateId: z.number().int().positive().nullable().optional(),
  cityId: z.number().int().positive().nullable().optional(),
  isOfficeManager: z.boolean().optional(),
  ...profileDetails,
}).strict().superRefine(refineLocation);

/** Attach an existing login to an HR record that has none. */
const linkLogin = z.object({ userId: id }).strict();

/** One page of an office's team (no fixed cap: the list pages through everyone). */
const officeTeamQuery = z.object({
  search: optionalQueryText(80),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strip();

const linkableUsersQuery = z.object({
  search: optionalQueryText(120),
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strip();

const reasonText = z.string().trim().max(500).nullable().optional();
const cityIdField = z.number().int().positive().nullable().optional();

/** Move an employee to another office (a State Manager to another state, or anyone to the head office). */
const transferEmployee = z.object({
  toOfficeUnitId: id,
  orgUnitId: id.optional(),
  cityId: cityIdField,
  effectiveFrom: realDate,
  /** Omit to keep the current reporting manager; null clears it. */
  managerEmployeeId: optionalId,
  isOfficeManager: z.boolean().optional(),
  designation: nonEmptyText(120).optional(),
  reason: reasonText,
}).strict();

/** Make an existing employee a manager of a state office (moving them there when they work elsewhere). */
const appointOfficeManager = z.object({
  employeeId: id,
  cityId: cityIdField,
  effectiveFrom: realDate,
  managerEmployeeId: optionalId,
  designation: nonEmptyText(120).optional(),
  reason: reasonText,
}).strict();

const exitOutcome = z.enum(['EXITED', 'SUSPENDED']);

/** The manager who steps down is kept as a member, moved to another office, or deactivated. */
const outgoingManagerAction = z.discriminatedUnion('action', [
  // A manager who steps down needs a new title when they were titled State Manager.
  z.object({ action: z.literal('KEEP_AS_MEMBER'), designation: nonEmptyText(120).optional() }).strict(),
  z.object({ action: z.literal('TRANSFER'), toOfficeUnitId: id, cityId: cityIdField, orgUnitId: id.optional(), designation: nonEmptyText(120).optional() }).strict(),
  z.object({ action: z.literal('DEACTIVATE'), outcome: exitOutcome.optional(), disableLogin: z.boolean().optional() }).strict(),
]);

const replaceOfficeManager = z.object({
  outgoingEmployeeId: id,
  incomingEmployeeId: id,
  incomingCityId: cityIdField,
  effectiveFrom: realDate,
  /** Reporting manager of the incoming manager. Omit to use the outgoing manager's own manager. */
  managerEmployeeId: optionalId,
  outgoing: outgoingManagerAction,
  reason: reasonText,
}).strict();

const deactivateEmployee = z.object({
  outcome: exitOutcome,
  effectiveDate: realDate,
  reason: z.string().trim().min(3, 'Enter the reason (at least 3 characters).').max(500),
  /** Who the direct reports move to. Required when somebody reports to this employee. */
  reassignReportsToEmployeeId: optionalId,
  disableLogin: z.boolean().optional(),
}).strict();

const designationName = z.string().trim().min(2, 'Enter the designation (at least 2 characters).').max(120);
const createDesignation = z.object({ name: designationName }).strict();
const updateDesignation = z.object({
  name: designationName.optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => value.name !== undefined || value.isActive !== undefined, 'Nothing to change.');

/** Sets a new login password for an employee. Not trimmed (spaces are legal); bcrypt ignores everything after 72 bytes. */
const resetLoginPassword = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters long.')
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long (72 bytes at most; accented or non-English characters count as more than one).'),
}).strict();

const createStateOffices = z.object({
  stateIds: z.array(z.number().int().positive()).min(1, 'Select at least one state.').max(60),
}).strict();

/** The three kinds of unit an administrator adds from the Organisation page. */
const organisationUnitKind = z.enum(['STATE', 'DEPARTMENT', 'HEAD_OFFICE']);

const createOrganisationUnit = z.object({
  kind: organisationUnitKind,
  // A state office may omit the name; it then becomes "<State> State Office".
  name: z.string().trim().max(160).optional(),
  stateId: z.number().int().positive().nullable().optional(),
  cityId: z.number().int().positive().nullable().optional(),
  parentId: optionalId,
}).strict().superRefine((value, context) => {
  const name = value.name?.trim() ?? '';
  if (value.kind !== 'STATE' && name.length < 2) context.addIssue({ code: 'custom', path: ['name'], message: 'Enter the name (at least 2 characters).' });
  if (value.kind === 'STATE' && !value.stateId) context.addIssue({ code: 'custom', path: ['stateId'], message: 'Select the state.' });
  if (value.kind === 'HEAD_OFFICE') {
    if (!value.stateId) context.addIssue({ code: 'custom', path: ['stateId'], message: 'Select the state.' });
    if (!value.cityId) context.addIssue({ code: 'custom', path: ['cityId'], message: 'Select the city.' });
  }
});

const updateOrganisationUnit = z.object({
  name: z.string().trim().min(2, 'Enter the name (at least 2 characters).').max(160).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => value.name !== undefined || value.isActive !== undefined, 'Nothing to change.');

const headOfficeSetup = z.object({
  departments: z.array(z.string().trim().min(2).max(160)).max(30),
}).strict();


/** Directory query. Without `page`/`limit` the endpoint keeps its original unpaged behaviour. */
const listEmployeesQuery = z.object({
  // One status or a comma-separated list (for example the "Onboarding" tab = PRE_ONBOARDING,ONBOARDING).
  status: z.string().trim().max(200).transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(employeeStatus).min(1).max(9)).optional(),
  search: optionalQueryText(120),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['name', 'code', 'joinedOn', 'status', 'createdAt']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  orgUnitId: optionalQueryText(100),
  designation: optionalQueryText(120),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'FREELANCE']).optional(),
  kyc: z.enum(['complete', 'pending']).optional(),
  /** 'only' lists the records archived because the person never joined (history); default hides them. */
  archived: z.enum(['exclude', 'only']).optional(),
}).strip();

export const schemas = {
  listEmployeesQuery,
  createOrganisationUnit,
  updateOrganisationUnit,
  headOfficeSetup,
  onboardEmployee,
  onboardExistingEmployee,
  linkLogin,
  linkableUsersQuery,
  officeTeamQuery,
  uploadDocument,
  proposeCompensation,
  compensationDecision,
  createShift,
  updateShift,
  assignShift,
  holiday,
  holidayQuery,
  onboardingQuery,
  cancelJoining,
  resolveOnboardingReview,
  confirmJoining,
  grantScope,
  endScope,
  changeLoginRole,
  reportQuery,
  transferEmployee,
  appointOfficeManager,
  replaceOfficeManager,
  deactivateEmployee,
  createStateOffices,
  createDesignation,
  updateDesignation,
  resetLoginPassword,
  createOrgUnit,
  createEmployee,
  updateEmployee,
  createAssignment,
  onboardingFromOffer,
  createDocument,
  documentDecision,
  linkKycVerification,
  createBankAccount,
  attendance,
  leaveRequest,
  leaveDecision,
  compensation,
  performanceReview,
  incentive,
  exitCase,
  accessScope,
} as const;

export const parseHrmInput = <T>(schema: ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HrmValidationError(result.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'body',
      message: issue.message,
    })));
  }
  return result.data;
};
