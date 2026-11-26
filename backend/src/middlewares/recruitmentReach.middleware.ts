import type { NextFunction, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getEmailEventCodeForTemplateCode } from '../services/communicationEventRegistry';
import { requestReach } from '../services/recruitmentReach.service';
import { loadOperatorPermissions } from '../utils/permissionGrant';
import {
  applicationReachWhere,
  candidateReachWhere,
  jobReachWhere,
  offerReachWhere,
  type RecruitmentReach,
} from '../utils/recruitmentReachRules';

/**
 * Route guards for single recruitment records: a record outside the caller's states answers "not found", so it can be
 * neither read nor changed (nor can its existence be probed). They run after the permission check.
 *
 * Writes act on the id exactly, so they are checked by the id exactly. The detail pages also take a job slug or an
 * application reference: those are resolved to one record first (id wins), and the handler gets that record's id.
 */

const param = (req: Request) => {
  const value = req.params.id;
  return typeof value === 'string' ? value : Array.isArray(value) ? String(value[0] ?? '') : '';
};

type Limited = Extract<RecruitmentReach, { all: false }>;

const notFound = (res: Response, what: string) => res.status(404).json({ success: false, code: 'RECRUITMENT_OUT_OF_REACH', error: `${what} not found.` });

const guard = (what: string, visible: (reach: Limited, id: string) => Promise<number>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reach = await requestReach(req, res);
      if (reach.all) return next();
      if (await visible(reach, param(req))) return next();
      return notFound(res, what);
    } catch (error) {
      return next(error);
    }
  };

/** For a GET that accepts a second key: the record it means (id first), checked and passed on as its id. */
const viewGuard = (what: string, resolve: (key: string) => Promise<string | null>, visible: (reach: Limited, id: string) => Promise<number>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reach = await requestReach(req, res);
      if (reach.all) return next();
      const id = await resolve(param(req));
      if (!id || !(await visible(reach, id))) return notFound(res, what);
      req.params.id = id;
      return next();
    } catch (error) {
      return next(error);
    }
  };

const jobVisible = (reach: Limited, id: string) => prisma.job.count({ where: { AND: [{ id }, jobReachWhere(reach)] } });
const applicationVisible = (reach: Limited, id: string) => prisma.jobApplication.count({ where: { AND: [{ id }, applicationReachWhere(reach)] } });

export const requireJobInReach = guard('Job posting', jobVisible);
export const requireJobViewInReach = viewGuard('Job posting', async (key) => (
  (await prisma.job.findUnique({ where: { id: key }, select: { id: true } }))
  ?? (await prisma.job.findUnique({ where: { slug: key }, select: { id: true } }))
)?.id ?? null, jobVisible);

export const requireApplicationInReach = guard('Application record', applicationVisible);
export const requireApplicationViewInReach = viewGuard('Application record', async (key) => (
  (await prisma.jobApplication.findUnique({ where: { id: key }, select: { id: true } }))
  ?? (await prisma.jobApplication.findUnique({ where: { applicationRef: key }, select: { id: true } }))
)?.id ?? null, applicationVisible);

export const requireCandidateInReach = guard('Candidate record', (reach, id) =>
  prisma.candidate.count({ where: { AND: [{ id }, candidateReachWhere(reach)] } }));

export const requireOfferInReach = guard('Offer', (reach, id) =>
  prisma.offer.count({ where: { AND: [{ id }, offerReachWhere(reach)] } }));

/** Changing an interview needs its application; being its interviewer is not enough. */
export const requireInterviewInReach = guard('Interview', (reach, id) =>
  prisma.interview.count({ where: { id, application: applicationReachWhere(reach) } }));

/** Feedback may also come from the person who takes the interview, whatever their states. */
export const requireInterviewFeedbackAccess = guard('Interview', (reach, id) =>
  prisma.interview.count({ where: { id, OR: [{ interviewerId: reach.userId }, { application: applicationReachWhere(reach) }] } }));

const ALL_INDIA_REFUSAL = {
  success: false,
  code: 'RECRUITMENT_ALL_INDIA_REQUIRED',
  error: 'These settings are shared by the whole company, so changing them needs all-India recruitment access (recruitment.scope.all).',
};

/** Company-wide recruitment settings are changed by all-India users only. */
export const requireAllIndiaRecruitment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if ((await requestReach(req, res)).all) return next();
    return res.status(403).json(ALL_INDIA_REFUSAL);
  } catch (error) {
    return next(error);
  }
};

/** The events an email template / rule request touches: the rule's path, the body, and the stored template. */
const emailEventsOf = async (req: Request) => {
  const codes = [req.params.eventCode, req.body?.eventCode].filter((value): value is string => typeof value === 'string' && value !== '');
  const id = param(req);
  if (id) {
    const template = await prisma.recruitmentEmailTemplate.findUnique({ where: { id }, select: { eventCode: true, code: true } });
    if (template) codes.push(template.eventCode || template.code);
  }
  return codes.map((code) => getEmailEventCodeForTemplateCode(code) ?? code);
};

/**
 * The email templates and rules of every module share these routes, and email.manage runs them. The one extra rule:
 * a state-limited recruiter does not change the company-wide recruitment messages.
 */
export const refuseStateLimitedRecruitmentMail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reach = await requestReach(req, res);
    if (reach.all) return next();
    const permissions = await loadOperatorPermissions({ userId: req.user!.id, role: req.user!.role });
    if (![...permissions].some((permission) => permission.startsWith('recruitment.'))) return next();
    if (!(await emailEventsOf(req)).some((event) => event.startsWith('RECRUITMENT_'))) return next();
    return res.status(403).json(ALL_INDIA_REFUSAL);
  } catch (error) {
    return next(error);
  }
};
