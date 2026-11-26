import { HRM_SECTION_PERMISSIONS } from './hrmAccess';

export const HRM_READ_PERMISSIONS = [
  'hrm.employees.read',
  'hrm.org.read',
  'hrm.onboarding.read',
] as const;

export const HRM_MANAGE_PERMISSIONS = [
  'hrm.employees.manage',
  'hrm.org.manage',
  'hrm.onboarding.manage',
  'hrm.assignments.manage',
] as const;

export const HRM_EMPLOYEE_MANAGE_PERMISSIONS = ['hrm.employees.manage'] as const;
export const HRM_ORG_MANAGE_PERMISSIONS = ['hrm.org.manage'] as const;
export const HRM_DOCUMENT_MANAGE_PERMISSIONS = ['hrm.documents.manage'] as const;
/** Viewing a stored document file (GET /hrm/documents/:id/file) needs document read access. */
export const HRM_DOCUMENT_READ_PERMISSIONS = ['hrm.documents.read'] as const;
export const HRM_ATTENDANCE_MANAGE_PERMISSIONS = ['hrm.attendance.manage'] as const;
export const HRM_LEAVE_MANAGE_PERMISSIONS = ['hrm.leave.manage'] as const;

export type HrmModuleTab = 'overview' | 'kyc' | 'attendance' | 'leave' | 'compensation' | 'performance' | 'exit';

export const HRM_MODULES: ReadonlyArray<{
  id: Exclude<HrmModuleTab, 'overview' | 'kyc'>;
  label: string;
  description: string;
  managePermission: string;
  /** Any of these opens the module (its list or its actions); the same list gates the sidebar and the page. */
  permissions: readonly string[];
}> = [
  { id: 'attendance', label: 'Attendance', description: 'Daily presence, work status and corrections.', managePermission: 'hrm.attendance.manage', permissions: HRM_SECTION_PERMISSIONS.attendance },
  { id: 'leave', label: 'Leave', description: 'Requests, decisions and leave history.', managePermission: 'hrm.leave.manage', permissions: HRM_SECTION_PERMISSIONS.leave },
  { id: 'compensation', label: 'Compensation', description: 'Effective-dated salary revisions and payroll readiness.', managePermission: 'hrm.compensation.manage', permissions: HRM_SECTION_PERMISSIONS.compensation },
  { id: 'performance', label: 'Performance & incentives', description: 'Reviews, ratings and incentive records.', managePermission: 'hrm.performance.manage', permissions: HRM_SECTION_PERMISSIONS.performance },
  { id: 'exit', label: 'Exit & full and final', description: 'Resignation, last working day and exit records.', managePermission: 'hrm.exit.manage', permissions: HRM_SECTION_PERMISSIONS.exit },
];

export const getHrmModulePath = (
  portal: 'admin' | 'employee',
  employeeId: string,
  module: HrmModuleTab,
) => `/${portal}/hrm/${encodeURIComponent(employeeId)}?module=${module}`;

/**
 * Any of `required`. Only a Super Admin (or an ALL_ACCESS key) holds everything: the legacy ADMIN role gets no HRM
 * permission for free, exactly as on the server.
 */
export const hasHrmPermission = (
  permissions: readonly string[] | undefined,
  required: readonly string[],
  isSuperAdmin = false,
) => isSuperAdmin || Boolean(permissions?.includes('ALL_ACCESS')) || required.some((permission) => permissions?.includes(permission));

export const formatHrmDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
};

/** Tailwind classes for an employee status chip. */
export const getHrmStatusClass = (status: string) => {
  if (status === 'ACTIVE') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  if (status === 'ON_LEAVE' || status === 'NOTICE_PERIOD') return 'bg-amber-50 text-amber-700 ring-amber-600/20';
  if (status === 'EXITED' || status === 'TERMINATED') return 'bg-slate-100 text-slate-600 ring-slate-500/20';
  if (status === 'SUSPENDED') return 'bg-rose-50 text-rose-700 ring-rose-600/20';
  return 'bg-blue-50 text-blue-700 ring-blue-600/20';
};

export const formatHrmStatus = (value?: string | null) =>
  (value || 'UNKNOWN')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const getHrmErrorMessage = (error: unknown, fallback = 'The HRM request could not be completed.') => {
  const response = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (typeof response?.error === 'string') return response.error;
  if (typeof response?.message === 'string') return response.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};
