import type { Prisma } from '@prisma/client';

/**
 * Which part of recruitment a login sees. One rule for every list, count, record and action, kept free of the
 * database so it can be tested on its own.
 *
 *  - All of India: Super Admin, ALL_ACCESS, recruitment.scope.all, hrm.scope.all or an All-India access scope.
 *  - Otherwise: the states of the login's STATE access scopes (a State Manager's posting, additional charges, access
 *    given by hand) and, with a head office scope, the head office postings. Nothing else.
 *
 * A job belongs to its state and posting type; an offer to the place it posts the candidate (an offer made without a
 * placement follows its job). An application is visible through its job, or through an offer that posts the person
 * into the viewer's place.
 */

export const RECRUITMENT_ALL_PERMISSION = 'recruitment.scope.all';
export const JOB_LOCATION_TYPES = ['HEAD_OFFICE', 'STATE_OFFICE'] as const;
export type JobLocationType = (typeof JOB_LOCATION_TYPES)[number];

export type RecruitmentReach =
  | { all: true; userId: string }
  | { all: false; userId: string; stateIds: number[]; headOffice: boolean };

export const recruitmentReachFrom = (input: {
  userId: string;
  role: string;
  permissions: readonly string[];
  /** Access scopes in force today. */
  scopes: ReadonlyArray<{ scopeType: string; stateId?: number | null | undefined }>;
}): RecruitmentReach => {
  const all = input.role === 'SUPER_ADMIN'
    || ['ALL_ACCESS', RECRUITMENT_ALL_PERMISSION, 'hrm.scope.all'].some((permission) => input.permissions.includes(permission))
    || input.scopes.some((scope) => scope.scopeType === 'ALL_INDIA');
  if (all) return { all: true, userId: input.userId };
  return {
    all: false,
    userId: input.userId,
    stateIds: [...new Set(input.scopes.flatMap((scope) => (scope.scopeType === 'STATE' && scope.stateId ? [scope.stateId] : [])))],
    headOffice: input.scopes.some((scope) => scope.scopeType === 'HEAD_OFFICE'),
  };
};

export const reachesNothing = (reach: RecruitmentReach) => !reach.all && !reach.stateIds.length && !reach.headOffice;

/** Matches no row, whatever the table. */
const nothing = () => ({ id: { in: [] as string[] } });

export const jobReachWhere = (reach: RecruitmentReach): Prisma.JobWhereInput => {
  if (reach.all) return {};
  const places: Prisma.JobWhereInput[] = [];
  if (reach.stateIds.length) places.push({ hrmLocationType: 'STATE_OFFICE', hrmStateId: { in: reach.stateIds } });
  if (reach.headOffice) places.push({ hrmLocationType: 'HEAD_OFFICE' });
  return places.length ? { OR: places } : nothing();
};

/** Offers whose own placement is in the viewer's places. */
const placedOfferPlaces = (reach: Extract<RecruitmentReach, { all: false }>): Prisma.OfferWhereInput[] => [
  ...(reach.stateIds.length ? [{ locationType: 'STATE_OFFICE', stateId: { in: reach.stateIds } }] : []),
  ...(reach.headOffice ? [{ locationType: 'HEAD_OFFICE' }] : []),
];

export const offerReachWhere = (reach: RecruitmentReach): Prisma.OfferWhereInput => {
  if (reach.all) return {};
  const places = placedOfferPlaces(reach);
  if (!places.length) return nothing();
  return { OR: [...places, { locationType: null, job: jobReachWhere(reach) }] };
};

export const applicationReachWhere = (reach: RecruitmentReach): Prisma.JobApplicationWhereInput => {
  if (reach.all) return {};
  const places = placedOfferPlaces(reach);
  if (!places.length) return nothing();
  return { OR: [{ job: jobReachWhere(reach) }, { offers: { some: { OR: places } } }] };
};

/** Interviews of visible applications, plus the ones the viewer takes as the interviewer. */
export const interviewReachWhere = (reach: RecruitmentReach): Prisma.InterviewWhereInput => {
  if (reach.all) return {};
  const own: Prisma.InterviewWhereInput = { interviewerId: reach.userId };
  return reachesNothing(reach) ? own : { OR: [{ application: applicationReachWhere(reach) }, own] };
};

export const candidateReachWhere = (reach: RecruitmentReach): Prisma.CandidateWhereInput => {
  if (reach.all) return {};
  return reachesNothing(reach) ? nothing() : { applications: { some: applicationReachWhere(reach) } };
};

/** May the viewer create or move something to this place? */
export const placeInReach = (reach: RecruitmentReach, place: { locationType: string | null | undefined; stateId: number | null | undefined }) => {
  if (reach.all) return true;
  if (place.locationType === 'HEAD_OFFICE') return reach.headOffice;
  return place.locationType === 'STATE_OFFICE' && Boolean(place.stateId) && reach.stateIds.includes(place.stateId!);
};

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

/** A job's posting type when none is chosen: head office in the head office's own city, otherwise a state office. */
export const defaultJobLocationType = (
  stateId: number | null,
  city: string,
  headOffices: ReadonlyArray<{ stateId: number | null; cityName: string | null }>,
): JobLocationType | null => {
  if (!stateId) return null;
  return headOffices.some((office) => office.stateId === stateId && office.cityName !== null && sameName(office.cityName, city)) ? 'HEAD_OFFICE' : 'STATE_OFFICE';
};

/** The state with this typed name (jobs keep the name as text). */
export const findStateByName = <T extends { id: number; name: string }>(states: readonly T[], name: string): T | null =>
  states.find((state) => sameName(state.name, name)) ?? null;

/** Offer letters and signed copies: documents that show a salary. */
export const OFFER_DOCUMENT_CATEGORIES = ['OFFER_LETTER', 'OFFER_LETTER_SIGNED', 'OFFER_ACCEPTANCE_CERTIFICATE'] as const;

type OfferFiles = { applicationId: string; offerLetterUrl: string | null; signatureFileUrl: string | null; acceptanceCertificateUrl: string | null; signedLetterUrl: string | null };

/**
 * Candidate documents the viewer may see, given the offers of their applications split into visible and hidden: when
 * an application also has an offer the viewer cannot see, only the offer files of the visible ones are listed.
 */
export const filterOfferDocuments = <D extends { category: string; fileUrl: string; applicationId: string | null }>(
  documents: readonly D[],
  visible: readonly OfferFiles[],
  hidden: readonly OfferFiles[],
): D[] => {
  const urls = (offers: readonly OfferFiles[]) => new Set(offers.flatMap((offer) => [offer.offerLetterUrl, offer.signatureFileUrl, offer.acceptanceCertificateUrl, offer.signedLetterUrl]).filter((value): value is string => Boolean(value)));
  const hiddenApplications = new Set(hidden.map((offer) => offer.applicationId));
  const visibleUrls = urls(visible);
  const hiddenUrls = urls(hidden);
  return documents.filter((document) => {
    if (hiddenUrls.has(document.fileUrl)) return false;
    if (!(OFFER_DOCUMENT_CATEGORIES as readonly string[]).includes(document.category)) return true;
    return !document.applicationId || !hiddenApplications.has(document.applicationId) || visibleUrls.has(document.fileUrl);
  });
};

/**
 * The activity a state-limited viewer may read: nothing about the offers of an application that also has an offer they
 * cannot see, and no salary amount in the entry written when an offer is made.
 */
export const limitOfferActivity = <L extends { action: string; applicationId: string | null; details: string | null }>(
  logs: readonly L[],
  hidden: ReadonlyArray<{ applicationId: string }>,
): L[] => {
  const hiddenApplications = new Set(hidden.map((offer) => offer.applicationId));
  return logs
    .filter((log) => !(log.action.startsWith('OFFER_') && log.applicationId && hiddenApplications.has(log.applicationId)))
    .map((log) => (log.action === 'OFFER_CREATED' && log.details ? { ...log, details: log.details.replace(/\s+with CTC .*$/, '') } : log));
};

/**
 * Every admin recruitment route and how it is limited. A contract test fails when a route is added without being
 * listed here, so a new screen can never forget the state limit.
 *  - SCOPED: the list / counts / body are limited inside the handler.
 *  - RECORD: a route guard refuses a record outside the viewer's places.
 *  - MASTER_READ: company-wide settings anybody with the permission may read.
 *  - MASTER_WRITE: company-wide settings only an all-India viewer changes (route guard).
 *  - MASTER_MAIL: email templates shared by every module; a state-limited recruiter cannot change recruitment ones.
 */
export type RecruitmentRouteAccess = 'SCOPED' | 'RECORD' | 'MASTER_READ' | 'MASTER_WRITE' | 'MASTER_MAIL';

export const RECRUITMENT_ROUTE_ACCESS: Record<string, RecruitmentRouteAccess> = {
  'GET /admin/reach': 'SCOPED',
  'GET /admin/dashboard': 'SCOPED',
  'GET /admin/departments': 'SCOPED',
  'POST /admin/departments': 'MASTER_WRITE',
  'PUT /admin/departments/:id': 'MASTER_WRITE',
  'DELETE /admin/departments/:id': 'MASTER_WRITE',
  'GET /admin/jobs': 'SCOPED',
  'POST /admin/jobs': 'SCOPED',
  'GET /admin/jobs/:id': 'RECORD',
  'PUT /admin/jobs/:id': 'RECORD',
  'POST /admin/jobs/:id/duplicate': 'RECORD',
  'PATCH /admin/jobs/:id/status': 'RECORD',
  'DELETE /admin/jobs/:id': 'RECORD',
  'GET /admin/applications': 'SCOPED',
  'GET /admin/applications/:id': 'RECORD',
  'PATCH /admin/applications/:id/stage': 'RECORD',
  'PATCH /admin/applications/:id/assign': 'RECORD',
  'POST /admin/applications/:id/notes': 'RECORD',
  'PATCH /admin/applications/:id/notes/:noteId': 'RECORD',
  'DELETE /admin/applications/:id/notes/:noteId': 'RECORD',
  'POST /admin/applications/:id/ratings': 'RECORD',
  'PATCH /admin/applications/:id/ratings/:ratingId': 'RECORD',
  'DELETE /admin/applications/:id/ratings/:ratingId': 'RECORD',
  'DELETE /admin/applications/:id': 'RECORD',
  'GET /admin/candidates': 'SCOPED',
  'GET /admin/candidates/:id': 'RECORD',
  'PATCH /admin/candidates/:id/talent-pool': 'RECORD',
  'GET /admin/interviews': 'SCOPED',
  'POST /admin/interviews': 'SCOPED',
  'PATCH /admin/interviews/:id': 'RECORD',
  'DELETE /admin/interviews/:id': 'RECORD',
  'POST /admin/interviews/:id/feedback': 'RECORD',
  'GET /admin/offers/form-options': 'SCOPED',
  'GET /admin/offers/manager-options': 'SCOPED',
  'GET /admin/offers': 'SCOPED',
  'GET /admin/offers/:id/pdf': 'RECORD',
  'POST /admin/offers': 'SCOPED',
  'PATCH /admin/offers/:id': 'RECORD',
  'PATCH /admin/offers/:id/status': 'RECORD',
  'POST /admin/offers/:id/resend': 'RECORD',
  'POST /admin/offers/:id/accept-offline': 'RECORD',
  'GET /admin/offers/:id/acceptance/:kind': 'RECORD',
  'POST /admin/offers/:id/hrm-handoff': 'RECORD',
  'DELETE /admin/offers/:id': 'RECORD',
  'GET /admin/settings': 'SCOPED',
  'POST /admin/settings/pipeline-stages': 'MASTER_WRITE',
  'PUT /admin/settings/pipeline-stages/:id': 'MASTER_WRITE',
  'DELETE /admin/settings/pipeline-stages/:id': 'MASTER_WRITE',
  'PUT /admin/settings/departments/:id': 'MASTER_WRITE',
  'POST /admin/settings/templates': 'MASTER_MAIL',
  'PUT /admin/settings/templates/:id': 'MASTER_MAIL',
  'DELETE /admin/settings/templates/:id': 'MASTER_MAIL',
  'PUT /admin/settings/email-rules/:eventCode': 'MASTER_MAIL',
};
