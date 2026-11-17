export const RECRUITMENT_AI_PAGE_KEYS = [
  'dashboard',
  'jobs',
  'job-detail',
  'applications',
  'application-detail',
  'candidates',
  'candidate-detail',
  'interviews',
  'offers',
  'departments',
  'pipeline',
  'settings',
] as const;

export type RecruitmentAiPageKey = (typeof RECRUITMENT_AI_PAGE_KEYS)[number];

type PageContext = { moduleKey?: string | null | undefined };

const PAGE_ALIASES: ReadonlyArray<readonly [RecruitmentAiPageKey, readonly string[]]> = [
  ['job-detail', ['job detail', 'job posting detail', 'vacancy detail', 'position detail']],
  ['application-detail', ['application detail', 'candidate application detail', 'application record']],
  ['candidate-detail', ['candidate detail', 'applicant detail', 'talent detail', 'candidate record']],
  ['dashboard', ['recruitment dashboard', 'hiring dashboard', 'recruitment overview', 'hiring overview', 'recruitment summary']],
  ['jobs', ['recruitment jobs', 'job list', 'jobs list', 'job postings', 'vacancies', 'open positions']],
  ['applications', ['applications', 'application list', 'job applications', 'applicant list', 'applications data']],
  ['candidates', ['candidates', 'candidate list', 'applicants', 'talent pool']],
  ['interviews', ['interviews', 'interview schedule', 'interview list', 'interview pipeline']],
  ['offers', ['offers', 'offer letters', 'offer list', 'hiring offers']],
  ['departments', ['recruitment departments', 'job departments', 'department list', 'hiring departments']],
  ['pipeline', ['pipeline', 'pipeline stages', 'application stages', 'hiring funnel', 'recruitment funnel']],
  ['settings', ['recruitment settings', 'hiring settings', 'recruitment configuration', 'recruitment templates']],
];

const QUESTION_KEYS: Record<RecruitmentAiPageKey, readonly string[]> = {
  dashboard: ['recruitment.dashboard.summary', 'recruitment.dashboard.pipeline', 'recruitment.dashboard.workload', 'recruitment.dashboard.recent_applications', 'recruitment.dashboard.upcoming_interviews'],
  jobs: ['recruitment.jobs.list', 'recruitment.jobs.status', 'recruitment.jobs.department_breakdown', 'recruitment.jobs.application_count', 'recruitment.jobs.detail'],
  'job-detail': ['recruitment.job.detail', 'recruitment.job.applications', 'recruitment.job.pipeline', 'recruitment.job.interviews', 'recruitment.job.offer_status'],
  applications: ['recruitment.applications.list', 'recruitment.applications.stage_breakdown', 'recruitment.applications.recent', 'recruitment.applications.rating', 'recruitment.applications.status'],
  'application-detail': ['recruitment.application.detail', 'recruitment.application.timeline', 'recruitment.application.interviews', 'recruitment.application.offers', 'recruitment.application.documents'],
  candidates: ['recruitment.candidates.list', 'recruitment.candidates.talent_pool', 'recruitment.candidates.experience', 'recruitment.candidates.application_status', 'recruitment.candidates.documents'],
  'candidate-detail': ['recruitment.candidate.detail', 'recruitment.candidate.applications', 'recruitment.candidate.interviews', 'recruitment.candidate.offers', 'recruitment.candidate.activity'],
  interviews: ['recruitment.interviews.schedule', 'recruitment.interviews.status', 'recruitment.interviews.upcoming', 'recruitment.interviews.feedback', 'recruitment.interviews.workload'],
  offers: ['recruitment.offers.list', 'recruitment.offers.status', 'recruitment.offers.pending_response', 'recruitment.offers.joining_dates', 'recruitment.offers.documents'],
  departments: ['recruitment.departments.list', 'recruitment.departments.jobs', 'recruitment.departments.applications', 'recruitment.departments.pipeline', 'recruitment.departments.status'],
  pipeline: ['recruitment.pipeline.stages', 'recruitment.pipeline.counts', 'recruitment.pipeline.conversion', 'recruitment.pipeline.bottlenecks', 'recruitment.pipeline.status'],
  settings: ['recruitment.settings.overview', 'recruitment.settings.stages', 'recruitment.settings.departments', 'recruitment.settings.email_templates', 'recruitment.settings.status'],
};

const PAGE_PERMISSIONS: Record<RecruitmentAiPageKey, readonly string[]> = {
  dashboard: ['recruitment.dashboard.read'],
  jobs: ['recruitment.jobs.read'],
  'job-detail': ['recruitment.jobs.read'],
  applications: ['recruitment.applications.read'],
  'application-detail': ['recruitment.applications.read'],
  candidates: ['recruitment.candidates.read'],
  'candidate-detail': ['recruitment.candidates.read'],
  interviews: ['recruitment.interviews.read'],
  offers: ['recruitment.offers.read'],
  departments: ['recruitment.departments.read'],
  pipeline: ['recruitment.pipeline.read'],
  settings: ['recruitment.settings.read'],
};

const normalize = (message: string) => message
  .toLocaleLowerCase('en-IN')
  .replace(/recruitement/gu, 'recruitment')
  .replace(/aplication/gu, 'application')
  .replace(/intervew/gu, 'interview')
  .replace(/\s+/gu, ' ')
  .trim();

export const isRecruitmentAiPageKey = (value: string | null | undefined): value is RecruitmentAiPageKey =>
  Boolean(value && (RECRUITMENT_AI_PAGE_KEYS as readonly string[]).includes(value));

export const recruitmentPageKeyFor = (message: string, context: PageContext = {}): RecruitmentAiPageKey | null => {
  if (isRecruitmentAiPageKey(context.moduleKey)) return context.moduleKey;
  if (context.moduleKey === 'analytics-overview') return null;
  const normalized = normalize(message);
  if (!normalized) return null;
  for (const [key, aliases] of PAGE_ALIASES) {
    if (aliases.some((alias) => normalized.includes(alias))) return key;
  }
  if (/\b(recruitment|hiring|job|jobs|candidate|candidates|applicant|applications?)\b/u.test(normalized)) {
    return 'dashboard';
  }
  return null;
};

export const recruitmentPageQuestionKeys = (pageKey: RecruitmentAiPageKey): readonly string[] => QUESTION_KEYS[pageKey];
export const recruitmentPagePermissionsFor = (pageKey: RecruitmentAiPageKey): readonly string[] => PAGE_PERMISSIONS[pageKey];
