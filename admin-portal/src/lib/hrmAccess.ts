import { hasAnyPermission } from './permissionUtils';
import { isHrmWorkspaceSection, type HrmWorkspaceSection } from './hrmNavigation';

/**
 * Who may open which HRM page, see which profile tab and use which control. The rules mirror the backend exactly:
 *  - the signed-in session's `permissions` are what the server checks (custom role, else direct grants);
 *  - only SUPER_ADMIN is all-access (an `ALL_ACCESS` key counts too). The legacy ADMIN role is checked like an
 *    EMPLOYEE in HRM: it gets nothing for free. (Payroll is the one exception: Finance Hub treats ADMIN as all-access.)
 * One map is used for the sidebar, the direct-URL guard and the in-page links, so they can never disagree.
 */

export type HrmViewer = { id?: string | null; role?: string | null; permissions?: readonly string[] | null } | null | undefined;

/** Each inner list is "any of"; every inner list is needed. */
export type HrmRequirement = ReadonlyArray<ReadonlyArray<string>>;

export const HRM_EMPLOYEES_READ = 'hrm.employees.read';

/** The permissions that let somebody use a workspace section (its list or its actions). */
export const HRM_SECTION_PERMISSIONS: Record<HrmWorkspaceSection, readonly string[]> = {
  attendance: ['hrm.attendance.read', 'hrm.attendance.manage'],
  leave: ['hrm.leave.read', 'hrm.leave.manage', 'hrm.leave.approve'],
  compensation: ['hrm.compensation.read', 'hrm.compensation.manage', 'hrm.compensation.approve'],
  performance: ['hrm.performance.read', 'hrm.performance.manage', 'hrm.incentive.read', 'hrm.incentive.manage'],
  exit: ['hrm.exit.read', 'hrm.exit.manage'],
};

export const HRM_PAYROLL_PERMISSIONS = ['fh.payroll.read', 'fh.payroll.manage'] as const;
export const HRM_DOCUMENT_VIEW_PERMISSIONS = ['hrm.documents.read', 'hrm.documents.manage', 'hrm.documents.verify'] as const;

export type HrmPageKey = 'directory' | 'profile' | 'organisation' | 'onboarding' | 'reports' | HrmWorkspaceSection | 'payroll';

/**
 * What each HRM page's main request needs:
 *  - directory, profile, reports: GET /hrm/employees(/:id), /hrm/reports/summary → hrm.employees.read;
 *  - organisation and its office pages: GET /hrm/organisation(/offices/:id) → hrm.org.read or hrm.org.manage;
 *  - onboarding: GET /hrm/onboarding/cases → hrm.onboarding.read or .manage;
 *  - a workspace section lists employees (hrm.employees.read) and needs the section's own permission.
 */
export const HRM_PAGE_REQUIREMENTS: Record<Exclude<HrmPageKey, 'payroll'>, HrmRequirement> = {
  directory: [[HRM_EMPLOYEES_READ]],
  profile: [[HRM_EMPLOYEES_READ]],
  organisation: [['hrm.org.read', 'hrm.org.manage']],
  onboarding: [['hrm.onboarding.read', 'hrm.onboarding.manage']],
  reports: [[HRM_EMPLOYEES_READ]],
  attendance: [[HRM_EMPLOYEES_READ], HRM_SECTION_PERMISSIONS.attendance],
  leave: [[HRM_EMPLOYEES_READ], HRM_SECTION_PERMISSIONS.leave],
  compensation: [[HRM_EMPLOYEES_READ], HRM_SECTION_PERMISSIONS.compensation],
  performance: [[HRM_EMPLOYEES_READ], HRM_SECTION_PERMISSIONS.performance],
  exit: [[HRM_EMPLOYEES_READ], HRM_SECTION_PERMISSIONS.exit],
};

/** Every key that opens at least one HRM page (used to map /admin/hrm/** onto /employee/hrm/**). */
export const HRM_ANY_PAGE_PERMISSIONS: string[] = [...new Set([
  ...Object.values(HRM_PAGE_REQUIREMENTS).flatMap((requirement) => requirement.flat()),
  ...HRM_PAYROLL_PERMISSIONS,
])];

/** The HRM sidebar pages in menu order (payroll is a separate sub-group). */
export const HRM_NAV_PAGES: ReadonlyArray<{ key: Exclude<HrmPageKey, 'profile' | 'payroll'>; label: string; suffix: string }> = [
  { key: 'directory', label: 'Employee Directory', suffix: '' },
  { key: 'organisation', label: 'Organisation', suffix: '/organisation' },
  { key: 'onboarding', label: 'Onboarding', suffix: '/onboarding' },
  { key: 'reports', label: 'Reports', suffix: '/reports' },
  { key: 'attendance', label: 'Attendance', suffix: '/attendance' },
  { key: 'leave', label: 'Leave', suffix: '/leave' },
  { key: 'compensation', label: 'Compensation', suffix: '/compensation' },
  { key: 'performance', label: 'Performance & Incentives', suffix: '/performance' },
  { key: 'exit', label: 'Exit & Full and Final', suffix: '/exit' },
];

export const isHrmSuperAdmin = (viewer: HrmViewer) => viewer?.role === 'SUPER_ADMIN';

/** The viewer holds any of these (Super Admin and ALL_ACCESS hold everything). */
export const viewerHasAny = (viewer: HrmViewer, permissions: readonly string[]) =>
  isHrmSuperAdmin(viewer) || hasAnyPermission(viewer?.permissions ? [...viewer.permissions] : undefined, [...permissions]);

export const meetsHrmRequirement = (viewer: HrmViewer, requirement: HrmRequirement) =>
  isHrmSuperAdmin(viewer) || requirement.every((anyOf) => viewerHasAny(viewer, anyOf));

/** Finance Hub payroll: Finance treats the ADMIN role as all-access, unlike HRM. */
export const canUseHrmPayroll = (viewer: HrmViewer) =>
  isHrmSuperAdmin(viewer) || viewer?.role === 'ADMIN' || viewerHasAny(viewer, HRM_PAYROLL_PERMISSIONS);

const HRM_PATH = /^\/(?:admin|employee)\/hrm(?:\/(.*))?$/;

export const isHrmPath = (pathname: string) => HRM_PATH.test(pathname);

/** Which HRM page a path is (null when it is not an HRM path). */
export const getHrmPageKey = (pathname: string): HrmPageKey | null => {
  const match = HRM_PATH.exec(pathname);
  if (!match) return null;
  const [first = ''] = (match[1] ?? '').split('/').filter(Boolean);
  if (!first) return 'directory';
  if (first === 'organisation') return 'organisation';
  if (first === 'onboarding') return 'onboarding';
  if (first === 'reports') return 'reports';
  if (first === 'payroll') return 'payroll';
  if (isHrmWorkspaceSection(first)) return first;
  return 'profile';
};

export const canOpenHrmPage = (viewer: HrmViewer, key: HrmPageKey) =>
  key === 'payroll' ? canUseHrmPayroll(viewer) : meetsHrmRequirement(viewer, HRM_PAGE_REQUIREMENTS[key]);

/** True for a non-HRM path (other guards decide those). */
export const canOpenHrmPath = (viewer: HrmViewer, pathname: string) => {
  const key = getHrmPageKey(pathname);
  return key === null || canOpenHrmPage(viewer, key);
};

export const getVisibleHrmPages = (viewer: HrmViewer, portal: 'admin' | 'employee') =>
  HRM_NAV_PAGES.filter((page) => canOpenHrmPage(viewer, page.key)).map((page) => ({ ...page, href: `/${portal}/hrm${page.suffix}` }));

/** The first HRM page the viewer can open (payroll aside), for the landing page and "Back to HRM" links. */
export const getFirstHrmPath = (viewer: HrmViewer, portal: 'admin' | 'employee') => getVisibleHrmPages(viewer, portal)[0]?.href ?? null;

/** The HRM menu shows when any page in it can be opened (payroll counts when it is granted, not by role alone). */
export const canSeeHrmMenu = (viewer: HrmViewer) =>
  getVisibleHrmPages(viewer, 'employee').length > 0 || isHrmSuperAdmin(viewer) || viewerHasAny(viewer, HRM_PAYROLL_PERMISSIONS);

// ---- one employee profile ----

const JOINING_STATUSES = new Set(['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING']);
const LEFT_STATUSES = new Set(['EXITED', 'TERMINATED']);
/** People who can hold an additional charge (the server's working statuses). */
const CHARGE_STATUSES = new Set(['ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'NOTICE_PERIOD']);

export type HrmProfileFacts = {
  archived: boolean;
  status: string;
  /** The profile's login is the signed-in user. */
  ownLogin: boolean;
  hasLogin: boolean;
  /** The linked login's account role (EMPLOYEE / ADMIN / SUPER_ADMIN); undefined while not known. */
  loginRole?: string | null;
  /** From GET /hrm/employees/:id (false: documents and bank accounts were left out). Undefined = not sent. */
  documentsVisible?: boolean;
  /** An onboarding case is still open for this person. */
  openCase: boolean;
  /** The person has an open-ended ACTIVE assignment. */
  hasOpenAssignment: boolean;
};

export const SELF_ACTION_HINT = 'Done by another HR user';

/** Which profile lists the viewer may load: each list endpoint accepts only its read permission. */
export const getHrmProfileReads = (viewer: HrmViewer) => {
  const has = (...permissions: string[]) => viewerHasAny(viewer, permissions);
  return {
    attendance: has('hrm.attendance.read'),
    leave: has('hrm.leave.read'),
    performance: has('hrm.performance.read'),
    incentives: has('hrm.incentive.read'),
    exit: has('hrm.exit.read'),
    salary: has('hrm.compensation.read', 'hrm.compensation.manage', 'hrm.compensation.approve'),
    documentFiles: has('hrm.documents.read'),
    shift: has('hrm.attendance.read', HRM_EMPLOYEES_READ),
  };
};

export type HrmProfileReads = ReturnType<typeof getHrmProfileReads>;

/**
 * Every control on the profile, following the endpoint behind it:
 *  - own record (Super Admin excepted): the server refuses HR actions on yourself; only personal details, a leave
 *    request and document uploads stay;
 *  - leavers (EXITED / TERMINATED): attendance, leave requests, salary, KYC / bank, shift, performance and incentives
 *    are refused; document upload / verify, leave decisions and the exit case stay;
 *  - archived records: read-only.
 */
export const getHrmProfileAbilities = (viewer: HrmViewer, facts: HrmProfileFacts) => {
  const has = (...permissions: string[]) => viewerHasAny(viewer, permissions);
  const writable = !facts.archived;
  const left = LEFT_STATUSES.has(facts.status);
  const joining = JOINING_STATUSES.has(facts.status);
  const own = facts.ownLogin && !isHrmSuperAdmin(viewer);
  const working = writable && !left;
  const documentsVisible = facts.documentsVisible !== false && has(...HRM_DOCUMENT_VIEW_PERMISSIONS);
  const canAssign = has('hrm.assignments.manage');
  const canManageEmployees = has('hrm.employees.manage');
  const joinerWithOpenCase = joining && facts.openCase;

  return {
    own,
    left,
    writable,
    documentsVisible,
    tabs: {
      kyc: documentsVisible,
      attendance: has(...HRM_SECTION_PERMISSIONS.attendance),
      leave: has(...HRM_SECTION_PERMISSIONS.leave),
      compensation: has(...HRM_SECTION_PERMISSIONS.compensation),
      performance: has(...HRM_SECTION_PERMISSIONS.performance),
      exit: has(...HRM_SECTION_PERMISSIONS.exit),
    },
    /** The list endpoints accept only their read permission. */
    read: getHrmProfileReads(viewer),
    editProfile: writable && !own && canManageEmployees,
    editPersonal: writable && canManageEmployees,
    /** Date of birth is HR-controlled: not on your own record. */
    lockDateOfBirth: own,
    markAttendance: working && !own && has('hrm.attendance.manage'),
    submitLeave: working && has('hrm.leave.manage'),
    manageKyc: working && !own && has('hrm.documents.manage'),
    uploadDocuments: writable && has('hrm.documents.manage'),
    verifyDocuments: writable && !own && has('hrm.documents.verify'),
    proposeSalary: working && !own && has('hrm.compensation.manage'),
    approveSalary: working && !own && has('hrm.compensation.approve'),
    assignShift: working && !own && has('hrm.attendance.manage'),
    transfer: working && !own && canAssign && has('hrm.org.read'),
    addAssignment: working && !own && canAssign && canManageEmployees && !facts.hasOpenAssignment,
    /** Who they report to, on its own: it needs an assignment to build on. */
    changeManager: working && !own && canAssign && facts.hasOpenAssignment,
    /** A state office on top of their posting: only somebody already working (never your own record). */
    giveCharge: working && !own && canAssign && CHARGE_STATUSES.has(facts.status),
    /** The server refuses deactivating your own account (even a Super Admin) and a joiner with an open case. */
    deactivate: working && !facts.ownLogin && canAssign && canManageEmployees && !joinerWithOpenCase,
    /** Shown instead of Deactivate for a joiner whose onboarding is still open. */
    useCancelJoining: working && canAssign && canManageEmployees && joinerWithOpenCase && has('hrm.onboarding.read', 'hrm.onboarding.manage'),
    reactivate: writable && !own && canManageEmployees && facts.status === 'SUSPENDED',
    /**
     * The login's email / mobile and its password: users.update as well, an EMPLOYEE login only (an ADMIN or SUPER_ADMIN
     * account is changed on the Users screen), never your own. Without a login those fields are plain HR fields.
     */
    editLoginIdentity: writable && !own && facts.hasLogin && facts.loginRole === 'EMPLOYEE' && canManageEmployees && has('users.update'),
    resetPassword: writable && !own && facts.hasLogin && facts.loginRole === 'EMPLOYEE' && canManageEmployees && has('users.update'),
    linkLogin: writable && !facts.hasLogin && canManageEmployees && has('users.read'),
    /** Confirm joining loads the joining context (employees.read) and needs onboarding.manage + employees.manage. */
    confirmJoining: writable && !own && joining && has('hrm.onboarding.manage') && canManageEmployees && has(HRM_EMPLOYEES_READ),
    openOnboarding: has('hrm.onboarding.read', 'hrm.onboarding.manage'),
  };
};

export type HrmProfileAbilities = ReturnType<typeof getHrmProfileAbilities>;

/** A 403 from the server: the viewer may not see this (shown as "no access", never as "no records"). */
export const isHrmForbidden = (error: unknown) => (error as { response?: { status?: number } } | null | undefined)?.response?.status === 403;

export const HRM_NO_ACCESS_MESSAGE = 'You do not have access to this.';

/** Why an empty directory is empty when it is about access, not data (null when access is fine). */
export const describeHrmReachProblem = (reach: { allIndia: boolean; hasProfile: boolean; scopeCount: number } | null | undefined) => {
  if (!reach || reach.allIndia) return null;
  if (!reach.hasProfile) {
    return 'Your login is not linked to an HR employee profile yet, so no employees are shown. Ask an administrator to link your login to your HR record, or to give you hrm.scope.all or an All-India / State HRM access scope.';
  }
  if (reach.scopeCount === 0) {
    return 'Your login has no HRM access scope yet, so you only see your own record. Ask an administrator for hrm.scope.all or an All-India / State HRM access scope.';
  }
  return null;
};

// ---- the Access card ----

/** Role pickers only list roles the viewer may give (they hold every permission in it). */
export const NO_GRANTABLE_ROLE_MESSAGE = 'No role you can give — ask a Super Admin.';

/**
 * A scope the viewer may end from the Access card: all-India users any; others only what they could give
 * themselves (a STATE in their own STATE scopes, DIRECT_REPORTS or OWN).
 */
export const canEndHrmScope = (
  abilities: { canManageScopes: boolean; allIndia: boolean; ownStateIds?: readonly number[] | null },
  scope: { scopeType: string; source?: string; state?: { id: number } | null; stateId?: number | null },
) => {
  // The access of an additional charge ends with the charge, not here.
  if (scope.source === 'CHARGE') return false;
  if (!abilities.canManageScopes) return false;
  if (abilities.allIndia) return true;
  if (scope.scopeType === 'DIRECT_REPORTS' || scope.scopeType === 'OWN') return true;
  const stateId = scope.state?.id ?? scope.stateId ?? null;
  return scope.scopeType === 'STATE' && stateId !== null && Boolean(abilities.ownStateIds?.includes(stateId));
};

/** The states the viewer may give a STATE scope for: every state when all-India, otherwise their own STATE scopes. */
export const grantableStates = <T extends { id: number }>(states: readonly T[], abilities: { allIndia: boolean; ownStateIds?: readonly number[] | null }) =>
  abilities.allIndia ? [...states] : states.filter((state) => Boolean(abilities.ownStateIds?.includes(state.id)));

// ---- holidays ----

export type HrmHolidayReach = { allIndia: boolean; stateIds: readonly number[] };

/** ALL_INDIA holidays are head office's (all-India access); a STATE holiday also its own state's HR. */
export const canChangeHoliday = (reach: HrmHolidayReach | null | undefined, holiday: { scope: string; stateId?: number | null }) => {
  if (!reach) return false;
  if (reach.allIndia) return true;
  return holiday.scope === 'STATE' && holiday.stateId !== null && holiday.stateId !== undefined && reach.stateIds.includes(holiday.stateId);
};
