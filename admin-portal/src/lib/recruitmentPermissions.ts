import { hasAnyPermission, hasPermission } from './permissionUtils';

export const recruitmentPermissions = {
  dashboardRead: 'recruitment.dashboard.read',
  departmentsRead: 'recruitment.departments.read',
  departmentsCreate: 'recruitment.departments.create',
  departmentsUpdate: 'recruitment.departments.update',
  departmentsDelete: 'recruitment.departments.delete',
  jobsRead: 'recruitment.jobs.read',
  jobsCreate: 'recruitment.jobs.create',
  jobsUpdate: 'recruitment.jobs.update',
  jobsDelete: 'recruitment.jobs.delete',
  jobsDuplicate: 'recruitment.jobs.duplicate',
  jobsChangeStatus: 'recruitment.jobs.change_status',
  applicationsRead: 'recruitment.applications.read',
  applicationsUpdateStage: 'recruitment.applications.update_stage',
  applicationsAssign: 'recruitment.applications.assign',
  applicationsDelete: 'recruitment.applications.delete',
  notesCreate: 'recruitment.applications.notes.create',
  notesUpdate: 'recruitment.applications.notes.update',
  notesDelete: 'recruitment.applications.notes.delete',
  ratingsCreate: 'recruitment.applications.ratings.create',
  ratingsUpdate: 'recruitment.applications.ratings.update',
  ratingsDelete: 'recruitment.applications.ratings.delete',

  interviewsRead: 'recruitment.interviews.read',
  interviewsCreate: 'recruitment.interviews.create',
  interviewsUpdate: 'recruitment.interviews.update',
  interviewsDelete: 'recruitment.interviews.delete',
  interviewsScorecard: 'recruitment.interviews.scorecard',
  offersRead: 'recruitment.offers.read',
  offersCreate: 'recruitment.offers.create',
  offersUpdate: 'recruitment.offers.update',
  offersDelete: 'recruitment.offers.delete',
  offersChangeStatus: 'recruitment.offers.change_status',
  pipelineRead: 'recruitment.pipeline.read',
  pipelineCreate: 'recruitment.pipeline.create',
  pipelineUpdate: 'recruitment.pipeline.update',
  pipelineDelete: 'recruitment.pipeline.delete',
  candidatesRead: 'recruitment.candidates.read',
  candidatesUpdate: 'recruitment.candidates.update',
  settingsRead: 'recruitment.settings.read',
  settingsUpdate: 'recruitment.settings.update',
} as const;

export type RecruitmentPermission = (typeof recruitmentPermissions)[keyof typeof recruitmentPermissions];

export const recruitmentAnyPermissions: RecruitmentPermission[] = [
  recruitmentPermissions.dashboardRead,
  recruitmentPermissions.departmentsRead,
  recruitmentPermissions.jobsRead,
  recruitmentPermissions.applicationsRead,

  recruitmentPermissions.interviewsRead,
  recruitmentPermissions.offersRead,
  recruitmentPermissions.pipelineRead,
];

/** Each recruitment page and the permission its main request needs, in sidebar order. */
export const recruitmentRoutePermissions: Array<{ path: string; permissions: RecruitmentPermission[] }> = [
  { path: '/recruitment/dashboard', permissions: [recruitmentPermissions.dashboardRead] },
  { path: '/recruitment/jobs', permissions: [recruitmentPermissions.jobsRead] },
  { path: '/recruitment/applications', permissions: [recruitmentPermissions.applicationsRead] },
  { path: '/recruitment/interviews', permissions: [recruitmentPermissions.interviewsRead] },
  { path: '/recruitment/offers', permissions: [recruitmentPermissions.offersRead] },
  { path: '/recruitment/departments', permissions: [recruitmentPermissions.departmentsRead] },
  { path: '/recruitment/pipeline', permissions: [recruitmentPermissions.pipelineRead] },
  { path: '/recruitment/settings', permissions: [recruitmentPermissions.settingsRead, recruitmentPermissions.settingsUpdate] },
  { path: '/recruitment/candidates', permissions: [recruitmentPermissions.candidatesRead] },
];

const RECRUITMENT_PATH = /^\/(?:admin|employee)\/recruitment(?:\/|$)/;

export const isRecruitmentPath = (pathname: string) => RECRUITMENT_PATH.test(pathname);

export const canUseRecruitmentPermission = (
  user: { role?: string | null; permissions?: string[] } | null | undefined,
  permission: RecruitmentPermission,
) => user?.role === 'SUPER_ADMIN' || hasPermission(user?.permissions, permission);

export const canUseAnyRecruitmentPermission = (
  user: { role?: string | null; permissions?: string[] } | null | undefined,
  permissions: RecruitmentPermission[],
) => user?.role === 'SUPER_ADMIN' || hasAnyPermission(user?.permissions, permissions);

/**
 * The permissions a recruitment page needs (any of), for /admin/recruitment/** and /employee/recruitment/**.
 * A recruitment path that is not one of the listed pages needs any recruitment read permission; a path outside
 * recruitment gives null.
 */
export const getRecruitmentRoutePermissions = (pathname: string): RecruitmentPermission[] | null => {
  if (!isRecruitmentPath(pathname)) return null;
  const normalizedPath = pathname.replace(/^\/(?:admin|employee)/, '');
  const matchedRoute = [...recruitmentRoutePermissions]
    .sort((a, b) => b.path.length - a.path.length)
    .find((route) => normalizedPath === route.path || normalizedPath.startsWith(`${route.path}/`));

  return matchedRoute?.permissions || recruitmentAnyPermissions;
};

/** The first recruitment page these permissions open (there is no /recruitment index page), or null. */
export const getRecruitmentLandingPath = (permissions: string[] | undefined, portal: 'admin' | 'employee' = 'employee') => {
  const first = recruitmentRoutePermissions.find((route) => hasAnyPermission(permissions, route.permissions));
  return first ? `/${portal}${first.path}` : null;
};
