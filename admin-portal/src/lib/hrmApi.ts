import api from './api';

export type HrmEmployeeStatus = 'DRAFT' | 'PRE_ONBOARDING' | 'ONBOARDING' | 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'NOTICE_PERIOD' | 'EXITED' | 'TERMINATED';

export interface HrmAssignment {
  id: string;
  designation: string;
  employmentType?: string | null;
  workMode?: string | null;
  status?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  orgUnit?: { id: string; code: string; name: string; type?: string } | null;
  /** The office (head office or state office) the person works from; orgUnit is the department. */
  officeUnit?: { id: string; name: string; type?: string } | null;
  isOfficeManager?: boolean;
  state?: { id: number; name: string } | null;
  city?: { id: number; name: string } | null;
  managerEmployee?: { id: string; employeeCode: string; legalName: string } | null;
}

export interface HrmEmployee {
  id: string;
  employeeCode: string;
  source: string;
  status: HrmEmployeeStatus;
  legalName: string;
  preferredName?: string | null;
  workEmail?: string | null;
  personalEmail?: string | null;
  mobile?: string | null;
  joinedOn?: string | null;
  exitDate?: string | null;
  offerId?: string | null;
  dateOfBirth?: string | null;
  /** Personal details completed during onboarding (Phase 4). */
  gender?: HrmGender | null;
  fatherOrSpouseName?: string | null;
  maritalStatus?: HrmMaritalStatus | null;
  bloodGroup?: HrmBloodGroup | null;
  currentAddress?: HrmAddress | null;
  permanentAddress?: HrmAddress | null;
  emergencyContact?: HrmEmergencyContact | null;
  archivedAt?: string | null;
  version: number;
  assignments?: HrmAssignment[];
  /** The login account linked to this employee, when one exists. */
  user?: { id: string; email: string | null; mobile?: string | null; status: string; role?: string; customRole?: { id: string; name: string } | null } | null;
  documents?: HrmDocument[];
  bankAccounts?: HrmBankAccount[];
  /**
   * GET /hrm/employees/:id: whether the viewer may see documents and bank accounts (hrm.documents.read, .manage or
   * .verify). When false, `documents` and `bankAccounts` are empty arrays and the Documents / KYC & Bank parts are hidden.
   */
  documentsVisible?: boolean;
  onboardingCases?: HrmOnboardingCase[];
  /** Directory-only summary of what KYC is on file. */
  kyc?: HrmKycSummary;
  /** Directory-only: the assignment in force today (null when none is active). */
  currentAssignment?: HrmCurrentAssignment | null;
}

export interface HrmCurrentAssignment {
  designation: string;
  employmentType?: string | null;
  workMode?: string | null;
  orgUnit?: { id: string; code: string; name: string; type?: string } | null;
  officeUnit?: { id: string; name: string; type?: string } | null;
  isOfficeManager?: boolean;
  state?: { id: number; name: string } | null;
  city?: { id: number; name: string } | null;
  managerEmployee?: { id: string; employeeCode: string; legalName: string } | null;
}

export interface HrmDirectoryQuery {
  search?: string;
  /** One status or a comma-separated list. */
  status?: string;
  page?: number;
  limit?: number;
  sort?: 'name' | 'code' | 'joinedOn' | 'status' | 'createdAt';
  order?: 'asc' | 'desc';
  orgUnitId?: string;
  designation?: string;
  employmentType?: string;
  kyc?: 'complete' | 'pending';
  /** 'only' lists records archived because the person never joined (kept for history); default hides them. */
  archived?: 'exclude' | 'only';
}

export interface HrmDirectoryResponse {
  employees: HrmEmployee[];
  /** Present only when the request was paginated. */
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  /** Status counts of non-archived records (also when archived=only is asked for). */
  counts?: { all: number; byStatus: Record<string, number> };
  /** Records archived because the person never joined (kept for history), in the caller's scope. */
  archivedTotal?: number;
  facets?: { departments: Array<{ id: string; name: string; type?: string }>; designations: string[] };
  /**
   * How far the viewer reaches, so an empty list can say why: not all-India and no HR profile linked to the login
   * (nobody is shown) or no access scope yet (only the own record).
   */
  reach?: HrmReach;
}

export type HrmReach = { allIndia: boolean; hasProfile: boolean; scopeCount: number };

export type HrmLocationType = 'HEAD_OFFICE' | 'STATE_OFFICE';

/** Everything the Add employee form needs, limited to what the signed-in user may do. */
export interface HrmEmployeeFormOptions {
  nextEmployeeCode: string;
  abilities: { canManageEmployees: boolean; canAssign: boolean; canCreateLogin: boolean; canReadUsers: boolean; canManageOrg: boolean };
  departments: Array<{ id: string; code: string; name: string }>;
  roles: Array<{ id: string; name: string; description?: string | null }>;
  /** Every state of the master. A state without an office gets one when an administrator adds somebody there. */
  states: Array<{ id: number; name: string; hasOffice: boolean; /** The state has an office but it is switched off: it must be switched on first. */ officeSwitchedOff: boolean }>;
  /** The active designation list (managed from the Add employee screen). */
  designations: Array<{ id: string; name: string; isSystem: boolean }>;
  /** Raipur, Chhattisgarh from the location master; null when it is missing there. */
  headOffice: { stateId: number; stateName: string; cityId: number; cityName: string } | null;
  /** The head office unit; null until the head office has been set up on the Organisation page. */
  headOfficeUnit: { id: string; name: string } | null;
  /** State Managers report to this person by default when there is exactly one. */
  nationalOperationsManagers: Array<{ id: string; employeeCode: string; name: string }>;
  stateManagerDesignation: string;
}

export interface HrmProfileDetails {
  preferredName?: string | null;
  /** YYYY-MM-DD */
  dateOfBirth?: string | null;
  personalEmail?: string | null;
}

export interface HrmOnboardPayload {
  fullName: string;
  email: string;
  mobile: string;
  password: string;
  customRoleId: string | null;
  joiningDate: string;
  designation: string;
  orgUnitId: string;
  employmentType: string;
  /** Not sent by the add form (omit it): a State Manager then reports to the National Operations Manager by default. */
  managerEmployeeId?: string | null;
  locationType: HrmLocationType;
  /** State office: required. Head office: optional, defaults to the head office location; state and city go together. */
  stateId: number | null;
  cityId: number | null;
  /** Manager of the state office (State Manager). Only for a state office. */
  isOfficeManager?: boolean;
  preferredName?: string | null;
  dateOfBirth?: string | null;
  personalEmail?: string | null;
}

/** An employee login created earlier on the Users page that has no HR record yet. */
export interface HrmLinkableUser {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  status: string;
  title: string | null;
  role: { id: string; name: string } | null;
  createdAt: string;
  /** Set when an HR record with the same email or mobile already exists. */
  matchingEmployee: { id: string; employeeCode: string; name: string; hasLogin: boolean } | null;
}

export interface HrmOnboardExistingPayload extends HrmProfileDetails {
  userId: string;
  /** Only used when the login has no mobile number. */
  mobile?: string | null;
  joiningDate: string;
  designation: string;
  orgUnitId: string;
  employmentType: string;
  managerEmployeeId?: string | null;
  locationType: HrmLocationType;
  stateId: number | null;
  cityId: number | null;
  isOfficeManager?: boolean;
}

export interface HrmOnboardResult {
  employee: { id: string; employeeCode: string; legalName: string; workEmail: string | null; mobile: string | null; joinedOn: string | null; status: HrmEmployeeStatus; userId: string | null };
  assignment: { id: string; designation: string; status: string; effectiveFrom: string; stateId: number | null; cityId: number | null; orgUnitId: string };
  user: { id: string; name: string | null; email: string; role: { id: string; name: string } | null };
}

export type HrmOrganisationKind = 'HEAD_OFFICE' | 'STATE' | 'DEPARTMENT' | 'OTHER';

export interface HrmOrganisationUnit {
  id: string;
  code: string;
  name: string;
  type: string;
  kind: HrmOrganisationKind;
  isActive: boolean;
  parent: { id: string; name: string } | null;
  state: { id: number; name: string } | null;
  city: { id: number; name: string } | null;
  /** Managers of an office (State Managers); empty for departments. */
  managers: Array<{ id: string; employeeCode: string; name: string }>;
  /** Managers who are joining (pre-joining, or starting later): the office is still vacant until they join. */
  upcomingManagers?: Array<{ id: string; employeeCode: string; name: string; joiningDate: string }>;
  childCount: number;
  /** Employees working here: a department counts people placed in it, an office counts people who work from it. */
  employeeCount: number;
  /** State offices only: COVERED when somebody manages it, VACANT when nobody does. */
  coverage: 'COVERED' | 'VACANT' | null;
}

/** One designation of the managed list, with how much it is used. */
export interface HrmDesignation {
  id: string;
  name: string;
  isActive: boolean;
  /** State Manager and National Operations Manager: the HRM rules rely on them, so they cannot be changed. */
  isSystem: boolean;
  currentEmployees: number;
  totalAssignments: number;
  canDelete: boolean;
  /** Why it cannot be deleted (it can be switched off instead). */
  deleteBlockedReason: string | null;
}

export interface HrmDepartmentRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  parent: { id: string; name: string } | null;
  currentEmployees: number;
  totalAssignments: number;
  canDelete: boolean;
  deleteBlockedReason: string | null;
}

export interface HrmCoverage {
  totalStates: number;
  officesSetUp: number;
  covered: number;
  vacant: number;
  notSetUp: number;
  staffInStates: number;
  staffInHeadOffice: number;
  /** Staff without an office marker (added before offices existed); they can be placed with a transfer. */
  unplacedStaff: number;
}

export interface HrmOrganisation {
  scope: { allIndia: boolean };
  /** canManage (units, state offices, head office, designations) is false unless the viewer has all-India access. */
  abilities: { canManage: boolean; canManageAssignments: boolean };
  headOfficeLocation: { stateId: number; stateName: string; cityId: number; cityName: string } | null;
  indiaStateCount: number;
  states: Array<{ id: number; name: string }>;
  /** States that do not have an active state office yet. */
  availableStates: Array<{ id: number; name: string }>;
  units: HrmOrganisationUnit[];
  nationalOperationsManagers: Array<{ id: string; employeeCode: string; name: string }>;
  coverage: HrmCoverage;
}

export interface HrmOfficeTeamMember {
  assignmentId: string;
  employee: { id: string; employeeCode: string; name: string; status: HrmEmployeeStatus; mobile: string | null; email: string | null; joinedOn: string | null };
  designation: string;
  isOfficeManager: boolean;
  employmentType: string | null;
  department: { id: string; name: string } | null;
  city: { id: number; name: string } | null;
  reportsTo: { id: string; employeeCode: string; name: string } | null;
  since: string;
}

export interface HrmOfficeDetail {
  office: { id: string; code: string; name: string; kind: 'HEAD_OFFICE' | 'STATE'; isActive: boolean; state: { id: number; name: string } | null; city: { id: number; name: string } | null };
  managers: Array<{ id: string; employeeCode: string; name: string; designation: string; since: string }>;
  vacant: boolean;
  /** The viewer may see who manages the office but not the people in it (needs hrm.employees.read). */
  teamHidden: boolean;
  /** The team list is one page of everybody (search applied); counts are for the whole office. */
  teamPage: { page: number; limit: number; total: number; totalPages: number; search: string };
  team: HrmOfficeTeamMember[];
  counts: { staff: number; managers: number; onLeave: number };
  nationalOperationsManagers: Array<{ id: string; employeeCode: string; name: string }>;
  /** canManage (office masters) is already false unless the viewer has all-India access. */
  abilities: { canManage: boolean; canManageAssignments: boolean; canManageEmployees: boolean; allIndia?: boolean };
}

export interface HrmTransferPayload {
  toOfficeUnitId: string;
  orgUnitId?: string;
  cityId?: number | null;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  /** Omit to keep the current reporting manager; null clears it. */
  managerEmployeeId?: string | null;
  isOfficeManager?: boolean;
  designation?: string;
  reason?: string | null;
}

export interface HrmAppointManagerPayload {
  employeeId: string;
  cityId?: number | null;
  effectiveFrom: string;
  managerEmployeeId?: string | null;
  designation?: string;
  reason?: string | null;
}

export type HrmOutgoingManagerAction =
  /** `designation` is required by the server when the outgoing manager was titled State Manager. */
  | { action: 'KEEP_AS_MEMBER'; designation?: string }
  | { action: 'TRANSFER'; toOfficeUnitId: string; cityId?: number | null; orgUnitId?: string; designation?: string }
  | { action: 'DEACTIVATE'; outcome?: 'EXITED' | 'SUSPENDED'; disableLogin?: boolean };

export interface HrmReplaceManagerPayload {
  outgoingEmployeeId: string;
  incomingEmployeeId: string;
  incomingCityId?: number | null;
  effectiveFrom: string;
  managerEmployeeId?: string | null;
  outgoing: HrmOutgoingManagerAction;
  reason?: string | null;
}

export interface HrmDeactivatePayload {
  outcome: 'EXITED' | 'SUSPENDED';
  effectiveDate: string;
  reason: string;
  reassignReportsToEmployeeId?: string | null;
  disableLogin?: boolean;
}

export interface HrmLifecycleContext {
  employee: { id: string; employeeCode: string; name: string; status: HrmEmployeeStatus; hasLogin: boolean; /** False for somebody added from a recruitment offer: use Add assignment first. */ hasAssignment: boolean };
  directReports: Array<{ id: string; employeeCode: string; name: string }>;
  managerOf: Array<{ id: string; name: string }>;
}

export interface HrmMoveResult {
  assignment: { id: string };
  /** Set when the move left that state office without a manager. */
  vacatedOfficeId: string | null;
}

export interface HrmStateOfficesResult {
  created: Array<{ id: string; name: string; stateId: number }>;
  skipped: Array<{ stateId: number; name: string; reason: 'EXISTS' | 'SWITCHED_OFF' }>;
}

export interface HrmCreateUnitPayload {
  kind: 'STATE' | 'DEPARTMENT' | 'HEAD_OFFICE';
  name?: string;
  stateId?: number | null;
  cityId?: number | null;
  parentId?: string | null;
}

export interface HrmHeadOfficeSetupResult {
  headOffice: { id: string; name: string };
  createdHeadOffice: boolean;
  createdDepartments: string[];
  skippedDepartments: string[];
  /** Departments added earlier without a head office, now attached to it. */
  adoptedDepartments: string[];
}

export interface HrmKycSummary {
  pan: boolean;
  aadhaar: boolean;
  bankAccounts: number;
}

export interface HrmDocument {
  id: string;
  category: string;
  title: string;
  fileRef?: string;
  status: string;
  provider?: string;
  mimeType?: string | null;
  expiresAt?: string | null;
  verifiedAt?: string | null;
  createdAt?: string;
  /** For verified KYC: { documentType: 'PAN' | 'AADHAAR', maskedIdentifier, verificationRecordId, templateId }. */
  metadata?: Record<string, unknown> | null;
  version: number;
}

export interface HrmBankAccount {
  id: string;
  bankName?: string | null;
  accountHolderName?: string | null;
  /** Only the last four digits are ever sent to the browser. */
  maskedAccountNumber?: string | null;
  ifsc?: string | null;
  isPrimary: boolean;
  isVerified: boolean;
  verifiedAt?: string | null;
  createdAt: string;
}

export type HrmKycDocumentType = 'PAN' | 'AADHAAR';

export interface HrmOnboardingCase {
  id: string;
  offerId?: string | null;
  employeeId?: string | null;
  status: string;
  source: string;
  targetJoiningDate?: string | null;
  createdAt?: string;
}

export interface HrmOrgUnit {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId?: string | null;
  isActive: boolean;
}

export interface HrmAttendanceRecord {
  id: string;
  attendanceDate: string;
  status: string;
  checkIn?: string | null;
  checkOut?: string | null;
  notes?: string | null;
}

export interface HrmLeaveRequest {
  id: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  units: number;
  status: string;
  reason?: string | null;
  version: number;
}

export interface HrmCompensationRevision {
  id: string;
  effectiveFrom: string;
  currency: string;
  baseSalary: number;
  grossSalary: number;
  annualCtc?: number | null;
  status: string;
}

export interface HrmPerformanceReview {
  id: string;
  cycleId: string;
  status: string;
  rating?: number | null;
  strengths?: string | null;
  improvementAreas?: string | null;
}

export interface HrmIncentive {
  id: string;
  incentiveType: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: string;
}

export interface HrmExitCase {
  id: string;
  exitType: string;
  resignationDate?: string | null;
  requestedLastDay?: string | null;
  status: string;
  reason?: string | null;
}

export interface HrmPayrollReadiness {
  summary: { total: number; ready: number; blocked: number };
  items: Array<{
    employeeId: string;
    employeeCode: string;
    legalName: string;
    status: string;
    readiness: 'READY' | 'BLOCKED';
    blockers: string[];
  }>;
}

// ---- Phase 4: personal details, onboarding, documents, salary, shifts, holidays ----

export type HrmGender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
export type HrmMaritalStatus = 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | 'SEPARATED';
export type HrmBloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type HrmAddress = { line1: string; line2?: string | null; city: string; state: string; pincode: string };
export type HrmEmergencyContact = { name: string; relation: string; mobile: string };
/** Fields PATCH /hrm/employees/:id accepts for personal details (null clears). Send together with `version`. */
export type HrmPersonalDetailsPatch = {
  dateOfBirth?: string | null; gender?: HrmGender | null; fatherOrSpouseName?: string | null; maritalStatus?: HrmMaritalStatus | null;
  bloodGroup?: HrmBloodGroup | null; currentAddress?: HrmAddress | null; permanentAddress?: HrmAddress | null; emergencyContact?: HrmEmergencyContact | null;
};

export type HrmChecklistState = 'DONE' | 'PENDING' | 'MISSING';
export type HrmChecklistItem = { key: string; label: string; required: boolean; counted: boolean; state: HrmChecklistState; hint: string };
export type HrmChecklistProgress = { done: number; total: number; percent: number; missingRequired: string[] };
export type HrmOnboardingStatus = 'PENDING' | 'NEEDS_REVIEW' | 'IN_PROGRESS' | 'READY_FOR_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';

export type HrmOnboardingCaseRow = {
  id: string;
  status: HrmOnboardingStatus;
  targetJoiningDate: string | null;
  reviewNote: string | null;
  createdAt: string;
  employee: { id: string; employeeCode: string; name: string; status: HrmEmployeeStatus; archived: boolean } | null;
  candidateName: string | null;
  offer: { id: string; designation: string; department: string; placeOfPosting: string; applicationRef: string } | null;
  progress: HrmChecklistProgress | null;
  /** NEEDS_REVIEW only: the HR records this offer matched (by email or mobile). Only these can be used for a re-hire. */
  matches?: Array<{ id: string; employeeCode: string; name: string; status: HrmEmployeeStatus; matchedBy: 'email' | 'mobile' }>;
};
export type HrmOnboardingListQuery = {
  search?: string; status?: 'OPEN' | 'ALL' | HrmOnboardingStatus; joining?: 'THIS_WEEK' | 'NEXT_30_DAYS' | 'OVERDUE';
  stateId?: number; orgUnitId?: string; page?: number; limit?: number;
};
export type HrmOnboardingList = {
  cases: HrmOnboardingCaseRow[];
  statusCounts: Partial<Record<HrmOnboardingStatus, number>>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
export type HrmSalaryComponentRow = { code: string; name: string; componentType: 'EARNING' | 'EMPLOYER_CONTRIBUTION'; monthlyAmount: number };
export type HrmRecruitmentDetails = {
  offerId: string;
  status: string;
  letterNo: string | null;
  jobTitle: string;
  jobLocation: string;
  designation: string;
  department: string;
  placeOfPosting: string;
  joiningDate: string | null;
  probationPeriod: string | null;
  annualCtc: number | null;
  salaryComponents: HrmSalaryComponentRow[];
  candidate: { fullName: string; email: string; mobile: string };
  application: {
    id: string; applicationRef: string; appliedAt: string; stage: string;
    /** What the applicant typed on this application (address, experience, CTC...). */
    submitted: Record<string, unknown> | null;
    answers: Array<{ question: string; answer: string }>;
    interviews: Array<{ id: string; scheduledAt: string; type: string; status: string }>;
  };
  acceptance: null | {
    method: 'TYPED' | 'DRAWN' | 'UPLOADED_SCAN' | 'OFFLINE_HR' | null; name: string | null; place: string | null; acceptedAt: string | null;
    ipAddress: string | null; documentHash: string | null; signatureHash: string | null; note: string | null;
  };
};
export type HrmEmployeeOnboarding = {
  case: (Omit<HrmOnboardingCase, 'status'> & { status: HrmOnboardingStatus; reviewNote?: string | null; rejectionReason?: string | null }) | null;
  checklist: HrmChecklistItem[];
  progress: HrmChecklistProgress;
  recruitment: HrmRecruitmentDetails | null;
  /** What the viewer may see: salary needs hrm.compensation.read; submissions / evidence need hrm.onboarding.read. */
  access?: { salary: boolean; onboarding: boolean };
};
export type HrmResolveReviewPayload = { action: 'CREATE_NEW' | 'USE_EXISTING' | 'DISMISS'; employeeId?: string; reason: string };

export type HrmDocumentCategory = 'IDENTITY' | 'ADDRESS' | 'EDUCATION' | 'EXPERIENCE' | 'OFFER' | 'ACCEPTANCE' | 'BANK' | 'TAX' | 'EMPLOYMENT' | 'PHOTO' | 'OTHER';

export type HrmSalaryRevision = {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
  baseSalary: string | number;
  grossSalary: string | number;
  annualCtc: string | number | null;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  reason: string | null;
  createdById: string | null;
  createdByName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  components: Array<{ id: string; code: string; name: string; componentType: string; amount: string | number }>;
};
export type HrmSalaryHistory = { currentRevisionId: string | null; revisions: HrmSalaryRevision[] };
export type HrmProposeSalaryPayload = { effectiveFrom: string; reason?: string | null; components: HrmSalaryComponentRow[] };

export type HrmWeekDay = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
export type HrmShift = {
  id: string; code: string; name: string; startTime: string; endTime: string; breakMinutes: number; graceMinutes: number;
  halfDayMinutes: number | null; fullDayMinutes: number | null; isNightShift: boolean; isActive: boolean;
  employeesNow?: number; lengthMinutes?: number;
};
export type HrmShiftPayload = Omit<HrmShift, 'id' | 'employeesNow' | 'lengthMinutes'>;
export type HrmWeeklyOffs = { days: HrmWeekDay[]; saturdays?: number[] };
export type HrmShiftAssignment = {
  id: string; employeeId: string; shiftId: string; weeklyOffs: HrmWeeklyOffs; effectiveFrom: string; effectiveTo: string | null;
  status: 'ACTIVE' | 'PLANNED' | 'ENDED' | 'CANCELLED'; reason: string | null; createdAt: string;
  shift: Pick<HrmShift, 'id' | 'code' | 'name' | 'startTime' | 'endTime' | 'isNightShift' | 'isActive'>;
};
export type HrmHoliday = { id: string; date: string; name: string; scope: 'ALL_INDIA' | 'STATE'; stateId: number | null; stateName: string | null; isOptional: boolean };
export type HrmHolidayPayload = { date: string; name: string; scope: 'ALL_INDIA' | 'STATE'; stateId?: number | null; isOptional?: boolean };

// ---- Phase 5: confirm joining, login role, HRM access ----

export type HrmScopeType = 'OWN' | 'DIRECT_REPORTS' | 'TEAM' | 'DEPARTMENT' | 'REGION' | 'STATE' | 'HEAD_OFFICE' | 'ALL_INDIA';
export type HrmSuggestedScope = {
  scopeType: HrmScopeType; stateId?: number | null; orgUnitId?: string | null;
  /** PLACEMENT follows the person's office (moved on transfer, ended on exit); MANUAL stays until HR ends it. */
  source: 'PLACEMENT' | 'MANUAL'; label: string; recommended: boolean; reason: string;
};
export type HrmJoiningContext = {
  employee: { id: string; employeeCode: string; name: string; legalName: string; status: HrmEmployeeStatus; plannedJoiningDate: string | null; version: number; personalEmail: string | null; mobile: string | null };
  canBeConfirmed: boolean;
  case: { id: string; status: HrmOnboardingStatus } | null;
  checklist: HrmChecklistItem[];
  progress: HrmChecklistProgress;
  placement: null | {
    designation: string; department: string | null; office: { id: string; name: string; kind: string | null } | null;
    state: { id: number; name: string } | null; isOfficeManager: boolean; effectiveFrom: string | null;
  };
  suggestedScopes: HrmSuggestedScope[];
  login: null | { id: string; email: string | null; mobile: string | null; status: string; role: string; customRole: { id: string; name: string } | null };
  /** Only the roles the viewer may give (they hold every permission in them); empty when there is none. */
  roles: Array<{ id: string; name: string; description?: string | null }>;
  suggestedRoleId: string | null;
  /** Today's date in India (YYYY-MM-DD): the latest joining date allowed. */
  today: string;
  abilities: { canConfirm: boolean; canCreateLogin: boolean; canLinkLogin: boolean; canUpdateLogin: boolean; canManageScopes: boolean; allIndia: boolean };
};
export type HrmJoiningLogin =
  | { mode: 'CREATE'; email: string; mobile?: string | null; password: string; customRoleId?: string | null }
  | { mode: 'LINK'; userId: string }
  | { mode: 'KEEP'; reactivate?: boolean; newPassword?: string; customRoleId?: string | null }
  | { mode: 'NONE'; reason: string };
export type HrmGrantedScope = { scopeType: HrmScopeType; stateId?: number | null; orgUnitId?: string | null; source?: 'PLACEMENT' | 'MANUAL' };
export type HrmConfirmJoiningPayload = {
  version: number;
  joiningDate: string;
  login: HrmJoiningLogin;
  scopes?: HrmGrantedScope[];
  /** Required when required checklist items are still open (server answers 409 CHECKLIST_INCOMPLETE otherwise). */
  overrideReason?: string;
};
export type HrmConfirmJoiningResult = {
  employeeCode: string;
  status: 'ACTIVE';
  loginEmail: string | null;
  loginMode: HrmJoiningLogin['mode'];
  scopesGranted: number;
  /** requested = HR ticked "send welcome"; it goes out after the confirm on the channels switched on in Settings. */
  welcome?: { requested: boolean };
};
export type HrmEmployeeAccess = {
  login: null | { id: string; email: string | null; mobile: string | null; status: string; role: string; customRole: { id: string; name: string } | null };
  scopes: Array<{
    id: string; scopeType: HrmScopeType; source: 'PLACEMENT' | 'MANUAL' | string;
    state: { id: number; name: string } | null; orgUnit: { id: string; name: string } | null;
    activeFrom: string | null; activeTo: string | null; isActive: boolean; isUpcoming: boolean;
  }>;
  /** Only the roles the viewer may give (they hold every permission in them); empty when there is none. */
  roles: Array<{ id: string; name: string }>;
  /**
   * canChangeRole is users.update; the route also needs hrm.employees.manage (checked in the card). ownStateIds, when
   * the server sends it, lists the viewer's own STATE scopes (what a non-all-India viewer may give or end).
   */
  abilities: { canManageScopes: boolean; canChangeRole: boolean; allIndia: boolean; ownStateIds?: number[] };
};

/** GET /hrm/holidays abilities: ALL_INDIA holidays need all-India access; a STATE holiday also the state's own HR. */
export type HrmHolidayAbilities = { allIndia: boolean; stateIds: number[] };

// ---- Phase 6: reports ----

export type HrmHeadcountCounts = { working: number; notice: number; joining: number; onHold: number; total: number };
export type HrmReportPerson = { id: string; employeeCode: string; name: string; designation: string | null; state: string | null; date: string | null; status?: string };
export type HrmReportSummary = {
  /** YYYY-MM of the joinings / exits block. */
  month: string;
  filters: { stateId: number | null; orgUnitId: string | null };
  totals: { working: number; notice: number; joining: number; onHold: number };
  /** Working people with no assignment in force today (0 when a state / department filter is applied). */
  unplaced: number;
  byState: Array<{ stateId: number | null; state: string } & HrmHeadcountCounts>;
  byDepartment: Array<{ orgUnitId: string | null; department: string } & HrmHeadcountCounts>;
  joinings: { count: number; truncated: boolean; people: HrmReportPerson[] };
  exits: { count: number; truncated: boolean; people: HrmReportPerson[] };
  /** Null without hrm.onboarding.read. */
  onboarding: Partial<Record<HrmOnboardingStatus, number>> | null;
  kyc: { employees: number; complete: number; percent: number };
  vacantStates: Array<{ officeId: string; office: string; state: string | null }>;
  scope: { allIndia: boolean };
};
export type HrmReportQuery = { month?: string; stateId?: number; orgUnitId?: string };

export const hrmApi = {
  listEmployees: (params?: HrmDirectoryQuery) =>
    api.get<HrmDirectoryResponse>('/hrm/employees', { params }),
  getEmployeeFormOptions: () => api.get<{ options: HrmEmployeeFormOptions }>('/hrm/employees/form-options'),
  /** Creates the employee, their login account and first assignment in one transaction. */
  onboardEmployee: (payload: HrmOnboardPayload) => api.post<HrmOnboardResult>('/hrm/employees/onboard', payload),
  /** Employee logins from the Users page that have no HR record yet. */
  listLinkableUsers: (search?: string) => api.get<{ users: HrmLinkableUser[] }>('/hrm/employees/linkable-users', { params: search ? { search } : undefined }),
  /** Creates the HR record for a login that already exists (no second login is created). */
  onboardExistingLogin: (payload: HrmOnboardExistingPayload) => api.post<HrmOnboardResult>('/hrm/employees/onboard-existing', payload),
  /** Attaches an existing login to an HR record that has none. */
  linkLoginToEmployee: (employeeId: string, userId: string) => api.post<{ employeeId: string; user: { id: string; name: string | null; email: string; role: { id: string; name: string } | null } }>(`/hrm/employees/${encodeURIComponent(employeeId)}/link-login`, { userId }),
  transferEmployee: (employeeId: string, payload: HrmTransferPayload) => api.post<HrmMoveResult>(`/hrm/employees/${encodeURIComponent(employeeId)}/transfer`, payload),
  deactivateEmployee: (employeeId: string, payload: HrmDeactivatePayload) => api.post<{ employeeCode: string; reportsMoved: number; loginDisabled: boolean; vacatedOfficeIds: string[] }>(`/hrm/employees/${encodeURIComponent(employeeId)}/deactivate`, payload),
  reactivateEmployee: (employeeId: string) => api.post<{ employeeCode: string; loginEnabled: boolean }>(`/hrm/employees/${encodeURIComponent(employeeId)}/reactivate`),
  getLifecycleContext: (employeeId: string) => api.get<{ context: HrmLifecycleContext }>(`/hrm/employees/${encodeURIComponent(employeeId)}/lifecycle-context`),
  getOfficeDetail: (officeId: string, params: { page?: number; limit?: number; search?: string } = {}) => api.get<{ office: HrmOfficeDetail }>(`/hrm/organisation/offices/${encodeURIComponent(officeId)}`, { params }),
  appointOfficeManager: (officeId: string, payload: HrmAppointManagerPayload) => api.post<HrmMoveResult>(`/hrm/organisation/offices/${encodeURIComponent(officeId)}/managers`, payload),
  replaceOfficeManager: (officeId: string, payload: HrmReplaceManagerPayload) => api.post<{ assignment: { id: string }; reportsMoved: number; vacatedOfficeId: string | null }>(`/hrm/organisation/offices/${encodeURIComponent(officeId)}/replace-manager`, payload),
  createStateOffices: (stateIds: number[]) => api.post<HrmStateOfficesResult>('/hrm/organisation/state-offices', { stateIds }),
  getOrganisation: () => api.get<{ organisation: HrmOrganisation }>('/hrm/organisation'),
  createOrganisationUnit: (payload: HrmCreateUnitPayload) => api.post<{ unit: { id: string; code: string; name: string; type: string } }>('/hrm/organisation/units', payload),
  /** Departments with usage, for the manage dialog. */
  listDepartmentsForManagement: () => api.get<{ departments: HrmDepartmentRow[] }>('/hrm/organisation/departments'),
  /** Deletes a department nothing ever used (otherwise the server answers 409 and the department is switched off instead). */
  deleteOrganisationUnit: (id: string) => api.delete<{ deleted: boolean; unit: { id: string; name: string }; departmentsDeleted?: string[] }>(`/hrm/organisation/units/${encodeURIComponent(id)}`),
  listDesignations: () => api.get<{ designations: HrmDesignation[] }>('/hrm/designations'),
  createDesignation: (name: string) => api.post<{ designation: { id: string; name: string; isActive: boolean; isSystem: boolean } }>('/hrm/designations', { name }),
  /** Renaming rewrites the text on every assignment that used the old name; the response says how many. */
  updateDesignation: (id: string, payload: { name?: string; isActive?: boolean }) => api.patch<{ designation: { id: string; name: string; isActive: boolean; isSystem: boolean }; assignmentsUpdated: number }>(`/hrm/designations/${encodeURIComponent(id)}`, payload),
  deleteDesignation: (id: string) => api.delete<{ deleted: boolean }>(`/hrm/designations/${encodeURIComponent(id)}`),
  /** Sets a new login password for the employee (needs hrm.employees.manage and users.update). */
  resetLoginPassword: (employeeId: string, password: string) => api.post<{ employeeId: string; reset: boolean; loginStatus: string }>(`/hrm/employees/${encodeURIComponent(employeeId)}/reset-password`, { password }),
  updateOrganisationUnit: (id: string, payload: { name?: string; isActive?: boolean }) => api.patch<{ unit: { id: string; name: string; isActive: boolean } }>(`/hrm/organisation/units/${encodeURIComponent(id)}`, payload),
  setupHeadOffice: (payload: { departments: string[] }) => api.post<HrmHeadOfficeSetupResult>('/hrm/organisation/head-office-setup', payload),
  getPayrollReadiness: () => api.get<{ payrollReadiness: HrmPayrollReadiness }>('/hrm/payroll/readiness'),
  getEmployee: (id: string) => api.get<{ employee: HrmEmployee }>(`/hrm/employees/${id}`),
  updateEmployee: (id: string, payload: Record<string, unknown>) => api.patch<{ employee: HrmEmployee }>(`/hrm/employees/${id}`, payload),
  listOrgUnits: () => api.get<{ orgUnits: HrmOrgUnit[] }>('/hrm/org-units'),
  createAssignment: (id: string, payload: Record<string, unknown>) => api.post<{ assignment: HrmAssignment }>(`/hrm/employees/${id}/assignments`, payload),
  listOnboarding: () => api.get<{ onboarding: HrmOnboardingCase[] }>('/hrm/onboarding'),
  onboardOffer: (offerId: string, payload: Record<string, unknown>) => api.post<{ onboarding: HrmOnboardingCase }>(`/hrm/onboarding/from-offer/${offerId}`, payload),
  addDocument: (id: string, payload: Record<string, unknown>) => api.post<{ document: HrmDocument }>(`/hrm/employees/${id}/documents`, payload),
  decideDocument: (id: string, payload: Record<string, unknown>) => api.patch<{ document: HrmDocument }>(`/hrm/documents/${id}/decision`, payload),
  getDocumentFile: (documentId: string) => api.get<Blob>(`/hrm/documents/${encodeURIComponent(documentId)}/file`, { responseType: 'blob' }),
  linkKycVerification: (employeeId: string, payload: { documentType: HrmKycDocumentType; verificationRecordId: string }) =>
    api.post<{ document: HrmDocument }>(`/hrm/employees/${encodeURIComponent(employeeId)}/kyc-verifications`, payload),
  createBankAccount: (employeeId: string, payload: { accountHolderName: string; bankName?: string | null; accountNumber: string; ifsc: string; isPrimary?: boolean }) =>
    api.post<{ bankAccount: HrmBankAccount }>(`/hrm/employees/${encodeURIComponent(employeeId)}/bank-accounts`, payload),
  setPrimaryBankAccount: (employeeId: string, accountId: string) =>
    api.patch<{ bankAccount: HrmBankAccount }>(`/hrm/employees/${encodeURIComponent(employeeId)}/bank-accounts/${encodeURIComponent(accountId)}/primary`),
  removeBankAccount: (employeeId: string, accountId: string) =>
    api.delete<{ removed: boolean }>(`/hrm/employees/${encodeURIComponent(employeeId)}/bank-accounts/${encodeURIComponent(accountId)}`),
  listAttendance: (id: string) => api.get<{ attendance: HrmAttendanceRecord[] }>(`/hrm/employees/${id}/attendance`),
  upsertAttendance: (id: string, payload: Record<string, unknown>) => api.put<{ attendance: HrmAttendanceRecord }>(`/hrm/employees/${id}/attendance`, payload),
  listLeave: (id: string) => api.get<{ leave: HrmLeaveRequest[] }>(`/hrm/employees/${id}/leave`),
  createLeave: (id: string, payload: Record<string, unknown>) => api.post<{ leave: HrmLeaveRequest }>(`/hrm/employees/${id}/leave`, payload),
  decideLeave: (id: string, payload: Record<string, unknown>) => api.patch<{ leave: HrmLeaveRequest }>(`/hrm/leave/${id}/decision`, payload),
  listCompensation: (id: string) => api.get<{ compensation: HrmCompensationRevision[] }>(`/hrm/employees/${id}/compensation`),
  createCompensation: (id: string, payload: Record<string, unknown>) => api.post<{ compensation: HrmCompensationRevision }>(`/hrm/employees/${id}/compensation`, payload),
  // ---- Phase 4 ----
  listOnboardingCases: (query: HrmOnboardingListQuery = {}) => api.get<HrmOnboardingList & { success: boolean }>('/hrm/onboarding/cases', { params: query }),
  cancelJoining: (caseId: string, reason: string) => api.post<{ caseId: string; employeeOutcome: 'ARCHIVED' | 'EXITED_AGAIN' | null }>(`/hrm/onboarding/cases/${encodeURIComponent(caseId)}/cancel`, { reason }),
  resolveOnboardingReview: (caseId: string, payload: HrmResolveReviewPayload) => api.post<{ result: { outcome: string; employeeId?: string; caseId: string; notes?: string[] } }>(`/hrm/onboarding/cases/${encodeURIComponent(caseId)}/resolve`, payload),
  getEmployeeOnboarding: (employeeId: string) => api.get<{ onboarding: HrmEmployeeOnboarding }>(`/hrm/employees/${encodeURIComponent(employeeId)}/onboarding`),
  uploadDocument: (employeeId: string, payload: { file: File; category: HrmDocumentCategory; title: string; expiresAt?: string | null }) => {
    const body = new FormData();
    body.append('file', payload.file);
    body.append('category', payload.category);
    body.append('title', payload.title);
    if (payload.expiresAt) body.append('expiresAt', payload.expiresAt);
    return api.post<{ document: HrmDocument }>(`/hrm/employees/${encodeURIComponent(employeeId)}/documents/upload`, body, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 });
  },
  getSalaryHistory: (employeeId: string) => api.get<HrmSalaryHistory & { success: boolean }>(`/hrm/employees/${encodeURIComponent(employeeId)}/salary`),
  proposeSalary: (employeeId: string, payload: HrmProposeSalaryPayload) => api.post<{ revision: HrmSalaryRevision }>(`/hrm/employees/${encodeURIComponent(employeeId)}/salary`, payload),
  decideSalary: (revisionId: string, action: 'APPROVE' | 'REJECT', reason?: string) => api.post<{ revision: HrmSalaryRevision }>(`/hrm/salary-revisions/${encodeURIComponent(revisionId)}/decision`, { action, ...(reason ? { reason } : {}) }),
  /** abilities.allIndia: shift masters are head office's (create / edit / delete also need hrm.attendance.manage). */
  listShifts: (includeInactive = false) => api.get<{ shifts: HrmShift[]; abilities?: { allIndia: boolean } }>('/hrm/shifts', { params: includeInactive ? { includeInactive: 'true' } : {} }),
  createShift: (payload: HrmShiftPayload) => api.post<{ shift: HrmShift }>('/hrm/shifts', payload),
  updateShift: (shiftId: string, payload: Partial<HrmShiftPayload>) => api.patch<{ shift: HrmShift }>(`/hrm/shifts/${encodeURIComponent(shiftId)}`, payload),
  deleteShift: (shiftId: string) => api.delete(`/hrm/shifts/${encodeURIComponent(shiftId)}`),
  listEmployeeShifts: (employeeId: string) => api.get<{ currentId: string | null; assignments: HrmShiftAssignment[] }>(`/hrm/employees/${encodeURIComponent(employeeId)}/shifts`),
  assignShift: (employeeId: string, payload: { shiftId: string; weeklyOffs: HrmWeeklyOffs; effectiveFrom: string; reason?: string | null }) => api.post<{ assignment: HrmShiftAssignment }>(`/hrm/employees/${encodeURIComponent(employeeId)}/shifts`, payload),
  listHolidays: (query: { year?: number; stateId?: number } = {}) => api.get<{ year: number; holidays: HrmHoliday[]; abilities?: HrmHolidayAbilities }>('/hrm/holidays', { params: query }),
  createHoliday: (payload: HrmHolidayPayload) => api.post<{ holiday: HrmHoliday }>('/hrm/holidays', payload),
  updateHoliday: (holidayId: string, payload: HrmHolidayPayload) => api.patch<{ holiday: HrmHoliday }>(`/hrm/holidays/${encodeURIComponent(holidayId)}`, payload),
  deleteHoliday: (holidayId: string) => api.delete(`/hrm/holidays/${encodeURIComponent(holidayId)}`),
  // ---- Phase 6 ----
  getReportSummary: (query: HrmReportQuery = {}) => api.get<{ report: HrmReportSummary }>('/hrm/reports/summary', { params: query }),
  /** CSV blob of the headcount table (state-wise or department-wise). */
  downloadHeadcountCsv: (query: HrmReportQuery & { by: 'state' | 'department' }) => api.get<Blob>('/hrm/reports/headcount.csv', { params: query, responseType: 'blob' }),
  // ---- Phase 5 ----
  getJoiningContext: (employeeId: string) => api.get<{ context: HrmJoiningContext }>(`/hrm/employees/${encodeURIComponent(employeeId)}/joining-context`),
  confirmJoining: (employeeId: string, payload: HrmConfirmJoiningPayload) => api.post<{ result: HrmConfirmJoiningResult }>(`/hrm/employees/${encodeURIComponent(employeeId)}/confirm-joining`, payload),
  getEmployeeAccess: (employeeId: string) => api.get<{ access: HrmEmployeeAccess }>(`/hrm/employees/${encodeURIComponent(employeeId)}/access`),
  grantEmployeeScope: (employeeId: string, payload: HrmGrantedScope & { activeFrom?: string | null }) => api.post(`/hrm/employees/${encodeURIComponent(employeeId)}/access-scopes`, payload),
  endEmployeeScope: (scopeId: string, lastDay?: string | null) => api.post(`/hrm/access-scopes/${encodeURIComponent(scopeId)}/end`, lastDay ? { lastDay } : {}),
  changeLoginRole: (employeeId: string, customRoleId: string | null) => api.patch<{ changed: boolean }>(`/hrm/employees/${encodeURIComponent(employeeId)}/login-role`, { customRoleId }),
  listPerformance: (id: string) => api.get<{ performance: HrmPerformanceReview[] }>(`/hrm/employees/${id}/performance`),
  listIncentives: (id: string) => api.get<{ incentives: HrmIncentive[] }>(`/hrm/employees/${id}/incentives`),
  listExit: (id: string) => api.get<{ exit: HrmExitCase[] }>(`/hrm/employees/${id}/exit`),
};
