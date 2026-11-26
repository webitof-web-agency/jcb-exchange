import type { HrmDirectoryQuery, HrmEmployee } from './hrmApi';
import { formatHrmDate, formatHrmStatus } from './hrmUi';

export type DirectoryView = 'table' | 'cards';
export type DirectorySort = NonNullable<HrmDirectoryQuery['sort']>;

export type DirectoryFilters = {
  q: string;
  /** Id of a status tab, '' for All. */
  tab: string;
  orgUnitId: string;
  designation: string;
  employmentType: string;
  kyc: '' | 'complete' | 'pending';
  /** Reporting manager: 'missing' = not set. */
  manager: '' | 'missing' | 'assigned';
  sort: DirectorySort;
  order: 'asc' | 'desc';
  page: number;
  limit: number;
  view: DirectoryView;
};

export const DIRECTORY_PAGE_SIZES = [10, 25, 50, 100] as const;

export const DEFAULT_DIRECTORY_FILTERS: DirectoryFilters = {
  q: '', tab: '', orgUnitId: '', designation: '', employmentType: '', kyc: '', manager: '',
  sort: 'createdAt', order: 'desc', page: 1, limit: 25, view: 'table',
};

/** The tab that lists archived (never joined) records instead of a status. */
export const ARCHIVED_TAB = 'archived';

/** Status tabs. A tab can cover several statuses, so counts are summed from the per-status counts. */
export const DIRECTORY_TABS: ReadonlyArray<{ id: string; label: string; statuses: readonly string[] }> = [
  { id: '', label: 'All', statuses: [] },
  { id: 'active', label: 'Active', statuses: ['ACTIVE'] },
  { id: 'onboarding', label: 'Onboarding', statuses: ['PRE_ONBOARDING', 'ONBOARDING'] },
  { id: 'draft', label: 'Draft', statuses: ['DRAFT'] },
  { id: 'on-leave', label: 'On leave', statuses: ['ON_LEAVE'] },
  { id: 'notice', label: 'Notice period', statuses: ['NOTICE_PERIOD'] },
  { id: 'suspended', label: 'Suspended', statuses: ['SUSPENDED'] },
  { id: 'exited', label: 'Exited', statuses: ['EXITED', 'TERMINATED'] },
  // Records archived because the person never joined (cancelled joining): kept for history, read-only.
  { id: ARCHIVED_TAB, label: 'Archived', statuses: [] },
];

export const EMPLOYMENT_TYPE_OPTIONS = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'FREELANCE'] as const;

const SORTS: readonly DirectorySort[] = ['name', 'code', 'joinedOn', 'status', 'createdAt'];

type ParamReader = { get: (name: string) => string | null };

const positiveInt = (value: string | null, fallback: number, max: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, max) : fallback;
};

export const getTabStatuses = (tab: string) => DIRECTORY_TABS.find((item) => item.id === tab)?.statuses ?? [];

/**
 * The badge of a directory tab. Status counts are always for non-archived records (also while the Archived tab is
 * open); the Archived tab shows the server's separate archived total.
 */
export const getTabCount = (tab: string, counts?: { all: number; byStatus: Record<string, number> }, archivedTotal?: number | null) => {
  if (tab === ARCHIVED_TAB) return typeof archivedTotal === 'number' ? archivedTotal : null;
  if (!counts) return null;
  if (!tab) return counts.all;
  return getTabStatuses(tab).reduce((sum, status) => sum + (counts.byStatus[status] ?? 0), 0);
};

/** Reads the directory state from the URL; anything unknown falls back to the default. */
export const parseDirectoryParams = (params: ParamReader): DirectoryFilters => {
  const defaults = DEFAULT_DIRECTORY_FILTERS;
  const tab = params.get('tab') ?? '';
  const sort = params.get('sort') as DirectorySort | null;
  const type = params.get('type') ?? '';
  const kyc = params.get('kyc');
  const manager = params.get('manager');
  const limit = positiveInt(params.get('limit'), defaults.limit, 100);
  return {
    q: (params.get('q') ?? '').slice(0, 120),
    tab: DIRECTORY_TABS.some((item) => item.id === tab) ? tab : '',
    orgUnitId: params.get('dept') ?? '',
    designation: (params.get('role') ?? '').slice(0, 120),
    employmentType: (EMPLOYMENT_TYPE_OPTIONS as readonly string[]).includes(type) ? type : '',
    kyc: kyc === 'complete' || kyc === 'pending' ? kyc : '',
    manager: manager === 'missing' || manager === 'assigned' ? manager : '',
    sort: sort && SORTS.includes(sort) ? sort : defaults.sort,
    order: params.get('order') === 'asc' ? 'asc' : params.get('order') === 'desc' ? 'desc' : (sort === 'name' || sort === 'code' ? 'asc' : defaults.order),
    page: positiveInt(params.get('page'), 1, 100000),
    limit: (DIRECTORY_PAGE_SIZES as readonly number[]).includes(limit) ? limit : defaults.limit,
    view: params.get('view') === 'cards' ? 'cards' : 'table',
  };
};

/** Query string for the URL: defaults are left out so a clean directory has a clean URL. */
export const toDirectorySearch = (filters: DirectoryFilters) => {
  const defaults = DEFAULT_DIRECTORY_FILTERS;
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.tab) params.set('tab', filters.tab);
  if (filters.orgUnitId) params.set('dept', filters.orgUnitId);
  if (filters.designation) params.set('role', filters.designation);
  if (filters.employmentType) params.set('type', filters.employmentType);
  if (filters.kyc) params.set('kyc', filters.kyc);
  if (filters.manager) params.set('manager', filters.manager);
  if (filters.sort !== defaults.sort || filters.order !== defaults.order) {
    params.set('sort', filters.sort);
    params.set('order', filters.order);
  }
  if (filters.page > 1) params.set('page', String(filters.page));
  if (filters.limit !== defaults.limit) params.set('limit', String(filters.limit));
  if (filters.view !== defaults.view) params.set('view', filters.view);
  return params.toString();
};

export const toDirectoryApiQuery = (filters: DirectoryFilters): HrmDirectoryQuery => ({
  page: filters.page,
  limit: filters.limit,
  sort: filters.sort,
  order: filters.order,
  ...(filters.q.trim() ? { search: filters.q.trim() } : {}),
  ...(getTabStatuses(filters.tab).length ? { status: getTabStatuses(filters.tab).join(',') } : {}),
  ...(filters.tab === ARCHIVED_TAB ? { archived: 'only' as const } : {}),
  ...(filters.orgUnitId ? { orgUnitId: filters.orgUnitId } : {}),
  ...(filters.designation ? { designation: filters.designation } : {}),
  ...(filters.employmentType ? { employmentType: filters.employmentType } : {}),
  ...(filters.kyc ? { kyc: filters.kyc } : {}),
  ...(filters.manager ? { manager: filters.manager } : {}),
});

/** Number of filters in use (search and tab are shown separately in the UI). */
export const countActiveFilters = (filters: DirectoryFilters) =>
  [filters.orgUnitId, filters.designation, filters.employmentType, filters.kyc, filters.manager].filter(Boolean).length;

export const hasAnyDirectoryFilter = (filters: DirectoryFilters) =>
  Boolean(filters.q.trim() || filters.tab || countActiveFilters(filters));

/** Clicking the active column flips the direction; a new column starts ascending (dates start newest first). */
export const nextSort = (filters: Pick<DirectoryFilters, 'sort' | 'order'>, column: DirectorySort): Pick<DirectoryFilters, 'sort' | 'order'> => {
  if (filters.sort === column) return { sort: column, order: filters.order === 'asc' ? 'desc' : 'asc' };
  return { sort: column, order: column === 'joinedOn' || column === 'createdAt' ? 'desc' : 'asc' };
};

/** "Raipur, Chhattisgarh" from an assignment; empty when none is recorded. */
export const getAssignmentLocation = (assignment?: { city?: { name: string } | null; state?: { name: string } | null } | null) =>
  [assignment?.city?.name, assignment?.state?.name].filter(Boolean).join(', ');

export const getEmployeeDisplayName = (employee: Pick<HrmEmployee, 'legalName' | 'preferredName'>) =>
  employee.preferredName?.trim() || employee.legalName;

export const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return `${first}${last}`.toUpperCase();
};

const AVATAR_TONES = [
  'bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800',
  'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800',
] as const;

/** Stable colour per employee so the same person always has the same avatar. */
export const getAvatarTone = (seed: string) => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
};

export const getKycProgress = (kyc?: HrmEmployee['kyc']) => {
  const done = kyc ? [kyc.pan, kyc.aadhaar, kyc.bankAccounts > 0].filter(Boolean).length : 0;
  return { done, total: 3, complete: done === 3 };
};

const csvCell = (value: unknown) => {
  let text = value === null || value === undefined ? '' : String(value);
  // Spreadsheet apps run cells that start with these characters as formulas.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const DIRECTORY_CSV_HEADERS = [
  'Employee code', 'Name', 'Designation', 'Department', 'Location', 'Reporting manager', 'Employment type', 'Work email', 'Mobile', 'Joined on', 'Status', 'PAN', 'Aadhaar', 'Bank account',
] as const;

/** CSV of exactly what the directory shows (no raw KYC data; only whether each item is on file). */
export const employeesToCsv = (employees: HrmEmployee[]) => {
  const rows = employees.map((employee) => {
    const assignment = employee.currentAssignment;
    return [
      employee.employeeCode,
      getEmployeeDisplayName(employee),
      assignment?.designation ?? '',
      assignment?.orgUnit?.name ?? '',
      getAssignmentLocation(assignment),
      assignment?.managerEmployee?.legalName ?? employee.upcomingManager?.legalName ?? '',
      assignment?.employmentType ? formatHrmStatus(assignment.employmentType) : '',
      employee.workEmail ?? '',
      employee.mobile ?? '',
      employee.joinedOn ? formatHrmDate(employee.joinedOn) : '',
      formatHrmStatus(employee.status),
      employee.kyc?.pan ? 'Verified' : 'Pending',
      employee.kyc?.aadhaar ? 'Verified' : 'Pending',
      (employee.kyc?.bankAccounts ?? 0) > 0 ? 'Added' : 'Pending',
    ];
  });
  return [DIRECTORY_CSV_HEADERS, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
};

export type EmployeeOptionPerson = {
  employeeCode: string;
  designation?: string | null;
  department?: string | null;
  officeName?: string | null;
  officeType?: string | null;
  location?: string | null;
  isOfficeManager?: boolean;
  directReports?: number;
  /** State offices looked after on top of the posting (additional charges) today. */
  additionalCharges?: number;
  /** Undefined when the list does not know about logins (the badge line then leaves the role out). */
  hasLogin?: boolean;
  loginRole?: string | null;
  status?: string | null;
};

/**
 * How a person is described in an employee picker, so HR knows exactly who is being chosen: a manager badge (State
 * Manager, Office Manager or Manager with the number of reports), the job (designation and department) and the
 * identifying line (code, office or place, permission role).
 */
export const describeEmployeeOption = (person: EmployeeOptionPerson) => {
  const reports = person.directReports ?? 0;
  const charges = person.additionalCharges ?? 0;
  const badge = person.isOfficeManager
    ? (person.officeType === 'REGION' ? 'State Manager' : 'Office Manager')
    : charges > 0 ? 'Additional charge' : reports > 0 ? 'Manager' : null;
  const role = person.hasLogin === undefined ? null : person.loginRole ? `Role: ${person.loginRole}` : person.hasLogin ? 'No role' : 'No login';
  return {
    badge,
    reports: reports > 0 ? `${reports} report${reports === 1 ? '' : 's'}` : null,
    states: charges > 0 ? `${person.isOfficeManager ? '+' : ''}${charges} state${charges === 1 ? '' : 's'}` : null,
    job: [person.designation, person.department].filter(Boolean).join(' · ') || 'No designation yet',
    detail: [person.employeeCode, person.officeName || person.location, role].filter(Boolean).join(' · '),
    status: person.status && person.status !== 'ACTIVE' ? person.status : null,
  };
};

