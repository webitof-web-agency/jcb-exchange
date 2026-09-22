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

export const recruitmentRoutePermissions: Array<{ path: string; permissions: RecruitmentPermission[] }> = [
  { path: '/recruitment/dashboard', permissions: [recruitmentPermissions.dashboardRead] },
  { path: '/recruitment/departments', permissions: [recruitmentPermissions.departmentsRead] },
  { path: '/recruitment/jobs', permissions: [recruitmentPermissions.jobsRead] },
  { path: '/recruitment/applications', permissions: [recruitmentPermissions.applicationsRead] },
  { path: '/recruitment/interviews', permissions: [recruitmentPermissions.interviewsRead] },
  { path: '/recruitment/offers', permissions: [recruitmentPermissions.offersRead] },
  { path: '/recruitment/pipeline', permissions: [recruitmentPermissions.pipelineRead] },
];

export const canUseRecruitmentPermission = (
  user: { role?: string | null; permissions?: string[] } | null | undefined,
  permission: RecruitmentPermission,
) => user?.role === 'SUPER_ADMIN' || hasPermission(user?.permissions, permission);

export const canUseAnyRecruitmentPermission = (
  user: { role?: string | null; permissions?: string[] } | null | undefined,
  permissions: RecruitmentPermission[],
) => user?.role === 'SUPER_ADMIN' || hasAnyPermission(user?.permissions, permissions);

export const getRecruitmentRoutePermissions = (pathname: string): RecruitmentPermission[] | null => {
  const normalizedPath = pathname.replace(/^\/(?:superadmin|employee)/, '');
  const matchedRoute = recruitmentRoutePermissions
    .sort((a, b) => b.path.length - a.path.length)
    .find((route) => normalizedPath === route.path || normalizedPath.startsWith(`${route.path}/`));

  return matchedRoute?.permissions || null;
};
