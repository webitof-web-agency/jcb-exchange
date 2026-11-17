import prisma from '../../lib/prisma';
import {
  RECRUITMENT_AI_PAGE_KEYS,
  recruitmentPagePermissionsFor,
  recruitmentPageQuestionKeys,
  type RecruitmentAiPageKey,
} from './recruitmentAiPage.service';
import type { AiToolContext } from './aiReadOnlyTools.service';

export type RecruitmentPageArguments = {
  pageKey: RecruitmentAiPageKey;
  limit?: number;
  query?: string;
  recordId?: string;
  days?: number;
};

const limitFor = (value: number | undefined) => Math.min(20, Math.max(1, Math.floor(value ?? 10)));
const dateValue = (value: Date | null | undefined) => value?.toISOString() || null;
const decimalValue = (value: unknown) => (value === null || value === undefined ? null : Number(value));

const assertPagePermission = (context: AiToolContext, pageKey: RecruitmentAiPageKey) => {
  if (context.role === 'SUPER_ADMIN' || context.role === 'ADMIN' || context.permissions.includes('ALL_ACCESS')) return;
  if (!recruitmentPagePermissionsFor(pageKey).some((permission) => context.permissions.includes(permission))) {
    throw new Error('Recruitment page permission required.');
  }
};

export const getRecruitmentAiPageData = async (context: AiToolContext, args: RecruitmentPageArguments) => {
  assertPagePermission(context, args.pageKey);
  const limit = limitFor(args.limit);
  const questionKeys = recruitmentPageQuestionKeys(args.pageKey);
  const base = { pageKey: args.pageKey, questionKeys, relatedModules: [...RECRUITMENT_AI_PAGE_KEYS], limit };

  if (args.pageKey === 'dashboard') {
    const [activeJobs, totalApplications, newApplications, underReview, interviewsScheduled, selectedCandidates, offersSent, hiredCandidates, recentApplications, upcomingInterviews] = await Promise.all([
      prisma.job.count({ where: { status: 'PUBLISHED' } }),
      prisma.jobApplication.count(),
      prisma.jobApplication.count({ where: { currentStage: 'NEW' } }),
      prisma.jobApplication.count({ where: { currentStage: 'UNDER_REVIEW' } }),
      prisma.interview.count({ where: { status: 'SCHEDULED' } }),
      prisma.jobApplication.count({ where: { currentStage: 'SELECTED' } }),
      prisma.offer.count({ where: { status: 'SENT' } }),
      prisma.jobApplication.count({ where: { currentStage: 'HIRED' } }),
      prisma.jobApplication.findMany({ take: limit, orderBy: { appliedAt: 'desc' }, select: { id: true, applicationRef: true, currentStage: true, appliedAt: true, job: { select: { title: true, jobCode: true, department: { select: { name: true } } } } } }),
      prisma.interview.findMany({ where: { status: 'SCHEDULED' }, take: limit, orderBy: { scheduledAt: 'asc' }, select: { id: true, scheduledAt: true, type: true, status: true, job: { select: { title: true } } } }),
    ]);
    return { ...base, stats: { activeJobs, totalApplications, newApplications, underReview, interviewsScheduled, selectedCandidates, offersSent, hiredCandidates }, recentApplications: recentApplications.map((row) => ({ ...row, appliedAt: dateValue(row.appliedAt) })), upcomingInterviews: upcomingInterviews.map((row) => ({ ...row, scheduledAt: dateValue(row.scheduledAt) })), insights: ['Review applications stuck in UNDER_REVIEW before opening new requisitions.', 'Use upcoming interview load to balance interviewer capacity.'] };
  }

  if (args.pageKey === 'jobs' || args.pageKey === 'job-detail') {
    const where = args.recordId ? { id: args.recordId } : args.query ? { OR: [{ title: { contains: args.query, mode: 'insensitive' as const } }, { jobCode: { contains: args.query, mode: 'insensitive' as const } }] } : {};
    const jobs = await prisma.job.findMany({ where, take: limit, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, jobCode: true, status: true, vacancies: true, employmentType: true, workMode: true, locationCity: true, locationState: true, deadline: true, postedAt: true, department: { select: { id: true, name: true } }, _count: { select: { applications: true, interviews: true, offers: true } } } });
    return { ...base, total: jobs.length, items: jobs.map((row) => ({ ...row, deadline: dateValue(row.deadline), postedAt: dateValue(row.postedAt), counts: row._count })), insights: ['Prioritize jobs with high application volume but low progression.', 'Check deadlines and unreviewed applications daily.'] };
  }

  if (args.pageKey === 'applications' || args.pageKey === 'application-detail') {
    const where = args.recordId ? { id: args.recordId } : args.query ? { OR: [{ applicationRef: { contains: args.query, mode: 'insensitive' as const } }, { currentStage: { contains: args.query, mode: 'insensitive' as const } }] } : {};
    const [total, byStage, applications] = await Promise.all([
      prisma.jobApplication.count({ where }),
      prisma.jobApplication.groupBy({ by: ['currentStage'], where, _count: { _all: true } }),
      prisma.jobApplication.findMany({ where, take: limit, orderBy: { appliedAt: 'desc' }, select: { id: true, applicationRef: true, currentStage: true, terminalStatus: true, overallRating: true, appliedAt: true, updatedAt: true, job: { select: { id: true, title: true, jobCode: true, department: { select: { name: true } } } }, _count: { select: { interviews: true, offers: true, documents: true, stageHistory: true } } } }),
    ]);
    return { ...base, total, byStage: byStage.map((row) => ({ stage: row.currentStage, count: row._count._all })), items: applications.map((row) => ({ ...row, appliedAt: dateValue(row.appliedAt), updatedAt: dateValue(row.updatedAt), counts: row._count })), insights: ['Applications with no stage movement need recruiter follow-up.', 'Use ratings with interview feedback; do not make automatic hiring decisions.'] };
  }

  if (args.pageKey === 'candidates' || args.pageKey === 'candidate-detail') {
    const where = args.recordId ? { id: args.recordId } : args.query ? { fullName: { contains: args.query, mode: 'insensitive' as const } } : {};
    const [total, candidates] = await Promise.all([
      prisma.candidate.count({ where }),
      prisma.candidate.findMany({ where, take: limit, orderBy: { updatedAt: 'desc' }, select: { id: true, fullName: true, currentCity: true, currentCompany: true, currentDesignation: true, totalExperience: true, relevantExperience: true, talentPoolCategory: true, inTalentPool: true, createdAt: true, updatedAt: true, _count: { select: { applications: true, interviews: true, offers: true, documents: true } } } }),
    ]);
    return { ...base, total, items: candidates.map((row) => ({ ...row, createdAt: dateValue(row.createdAt), updatedAt: dateValue(row.updatedAt), counts: row._count })), insights: ['Keep candidate records linked to a specific job and stage.', 'Candidate fit is a human review decision; AI only summarizes evidence.'] };
  }

  if (args.pageKey === 'interviews') {
    const [byStatus, interviews] = await Promise.all([
      prisma.interview.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.interview.findMany({ take: limit, orderBy: { scheduledAt: 'asc' }, select: { id: true, scheduledAt: true, durationMinutes: true, type: true, status: true, job: { select: { title: true, jobCode: true } } } }),
    ]);
    return { ...base, byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })), items: interviews.map((row) => ({ ...row, scheduledAt: dateValue(row.scheduledAt) })), insights: ['Resolve overdue feedback before the next interview round.', 'Avoid double-booking interviewers and candidates.'] };
  }

  if (args.pageKey === 'offers') {
    const [byStatus, offers] = await Promise.all([
      prisma.offer.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.offer.findMany({ take: limit, orderBy: { updatedAt: 'desc' }, select: { id: true, designation: true, department: true, joiningLocation: true, ctc: true, joiningDate: true, offerValidUntil: true, status: true, sentAt: true, respondedAt: true, job: { select: { title: true, jobCode: true } }, offerLetterFileName: true } }),
    ]);
    return { ...base, byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })), items: offers.map((row) => ({ ...row, ctc: decimalValue(row.ctc), joiningDate: dateValue(row.joiningDate), offerValidUntil: dateValue(row.offerValidUntil), sentAt: dateValue(row.sentAt), respondedAt: dateValue(row.respondedAt), hasOfferLetter: Boolean(row.offerLetterFileName), offerLetterFileName: row.offerLetterFileName })), insights: ['Follow up on offers approaching offerValidUntil.', 'Offer acceptance and compensation decisions remain human-controlled.'] };
  }

  if (args.pageKey === 'departments') {
    const departments = await prisma.jobDepartment.findMany({ take: limit, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, description: true, _count: { select: { jobs: true } } } });
    const applicationGroups = await prisma.job.groupBy({ by: ['departmentId'], _count: { _all: true } });
    const applicationMap = new Map(applicationGroups.map((row) => [row.departmentId, row._count._all]));
    return { ...base, total: departments.length, items: departments.map((row) => ({ ...row, jobCount: row._count.jobs, applicationCount: applicationMap.get(row.id) || 0 })) };
  }

  if (args.pageKey === 'pipeline') {
    const [stages, usage] = await Promise.all([
      prisma.applicationStage.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true, code: true, order: true, color: true, isSystem: true, isTerminal: true } }),
      prisma.jobApplication.groupBy({ by: ['currentStage'], _count: { _all: true } }),
    ]);
    const usageMap = new Map(usage.map((row) => [row.currentStage, row._count._all]));
    return { ...base, items: stages.map((stage) => ({ ...stage, count: usageMap.get(stage.code) || 0 })), unmappedStageCount: usage.filter((row) => !stages.some((stage) => stage.code === row.currentStage)).reduce((sum, row) => sum + row._count._all, 0) };
  }

  const [departments, stages, templates] = await Promise.all([
    prisma.jobDepartment.count(),
    prisma.applicationStage.count(),
    prisma.recruitmentEmailTemplate.findMany({ take: limit, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, subject: true, variables: true, isSystem: true, updatedAt: true } }),
  ]);
  return { ...base, counts: { departments, stages, emailTemplates: templates.length }, emailTemplates: templates.map((template) => ({ ...template, variableCount: template.variables.length, updatedAt: dateValue(template.updatedAt), variables: undefined })), notes: ['Configuration secrets and provider credentials are never returned in AI data.', 'Settings changes require the existing permissioned UI workflow.'] };
};

