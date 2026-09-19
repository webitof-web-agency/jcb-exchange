import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import prisma from '../lib/prisma';
import { secureUploadDir } from '../utils/documentUpload';
import {
  ensureDefaultRecruitmentData,
  generateApplicationRef,
  generateJobSlug,
  logRecruitmentActivity,
} from '../services/recruitment.service';
import {
  JobStatus,
  EmploymentType,
  WorkMode,
  CustomQuestionType,
  CandidateEmploymentStatus,
  InterviewType,
  InterviewStatus,
  InterviewRecommendation,
  OfferStatus,
  TalentPoolCategory,
  Prisma,
} from '@prisma/client';
import { dispatchPublishedWhatsApp, dispatchRecruitmentWhatsApp } from '../services/whatsappIntegration.service';
import { dispatchPublishedSms } from '../services/smsIntegration.service';
import { shouldDispatchSmsPublishedBroadcast } from '../modules/sms-core';

const getParamString = (param: unknown): string => {
  if (typeof param === 'string') return param;
  if (Array.isArray(param) && typeof param[0] === 'string') return param[0];
  return '';
};

const parseCustomAnswersPayload = (payload: unknown): Record<string, unknown> => {
  if (!payload) return {};

  if (typeof payload === 'string') {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  }

  if (typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return {};
};

const hasApplicationAnswerValue = (value: unknown) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const stringifyApplicationAnswer = (value: unknown) => {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
};

const parseOptionalRatingValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  const parsedValue = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1 || parsedValue > 5) return null;
  return parsedValue;
};

const normalizeStageCode = (input: unknown, fallbackName: string) => {
  const rawValue = typeof input === 'string' && input.trim() ? input.trim() : fallbackName;
  const normalized = rawValue
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return normalized || `STAGE_${Date.now()}`;
};

const parseStageOrder = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseStageColor = (value: unknown, fallback = 'blue') => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().toLowerCase();
  return trimmed || fallback;
};

const dispatchRecruitmentCandidateWhatsApp = ({
  eventCode,
  relatedEntityType,
  relatedEntityId,
  candidate,
  payloadSnapshot,
}: {
  eventCode:
    | 'RECRUITMENT_APPLICATION_RECEIVED'
    | 'RECRUITMENT_APPLICATION_STAGE_UPDATED'
    | 'RECRUITMENT_INTERVIEW_SCHEDULED'
    | 'RECRUITMENT_INTERVIEW_RESCHEDULED'
    | 'RECRUITMENT_INTERVIEW_CANCELLED'
    | 'RECRUITMENT_OFFER_SENT'
    | 'RECRUITMENT_OFFER_STATUS_UPDATED';
  relatedEntityType: string;
  relatedEntityId: string;
  candidate: { mobile?: string | null; fullName?: string | null };
  payloadSnapshot: Record<string, unknown>;
}) => {
  void dispatchRecruitmentWhatsApp({
    eventCode,
    relatedEntityType,
    relatedEntityId,
    recipientType: 'CANDIDATE',
    recipientPhone: candidate.mobile,
    payloadSnapshot: { candidateName: candidate.fullName || null, ...payloadSnapshot },
  });
};

const dispatchNewApplicationInternalAlerts = async ({
  applicationId,
  applicationRef,
  candidate,
  job,
}: {
  applicationId: string;
  applicationRef: string;
  candidate: { fullName: string; mobile: string };
  job: { id: string; title: string; createdById?: string | null };
}) => {
  try {
    const superAdmins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      select: { id: true, mobile: true, whatsappNumber: true },
    });
    const superAdminIds = new Set(superAdmins.map((user) => user.id));
    superAdmins.forEach((superAdmin) => {
      void dispatchRecruitmentWhatsApp({
        eventCode: 'RECRUITMENT_NEW_APPLICATION_SUPERADMIN',
        relatedEntityType: 'JOB_APPLICATION',
        relatedEntityId: applicationId,
        recipientType: 'SUPER_ADMIN',
        recipientPhone: superAdmin.whatsappNumber || superAdmin.mobile,
        payloadSnapshot: { applicationRef, candidateName: candidate.fullName, jobId: job.id, jobTitle: job.title },
      });
    });

    if (!job.createdById || superAdminIds.has(job.createdById)) return;
    const recruiter = await prisma.user.findFirst({
      where: { id: job.createdById, status: 'ACTIVE' },
      select: { mobile: true, whatsappNumber: true },
    });
    if (!recruiter) return;
    void dispatchRecruitmentWhatsApp({
      eventCode: 'RECRUITMENT_NEW_APPLICATION_RECRUITER',
      relatedEntityType: 'JOB_APPLICATION',
      relatedEntityId: applicationId,
      recipientType: 'RECRUITER',
      recipientPhone: recruiter.whatsappNumber || recruiter.mobile,
      payloadSnapshot: { applicationRef, candidateName: candidate.fullName, jobId: job.id, jobTitle: job.title },
    });
  } catch (error) {
    console.error('WhatsApp recruitment internal alert failed:', error);
  }
};

const getStageUsageCounts = async () => {
  const grouped = await prisma.jobApplication.groupBy({
    by: ['currentStage'],
    _count: { currentStage: true },
  });

  return new Map(grouped.map((item) => [item.currentStage, item._count.currentStage]));
};

const serializeApplicationStage = (
  stage: {
    id: string;
    name: string;
    code: string;
    order: number;
    color: string | null;
    isSystem: boolean;
    isTerminal: boolean;
  },
  usageCount = 0,
) => ({
  id: stage.id,
  name: stage.name,
  code: stage.code,
  order: stage.order,
  color: stage.color || 'blue',
  isSystem: stage.isSystem,
  isTerminal: stage.isTerminal,
  usageCount,
});

const recalculateApplicationOverallRating = async (applicationId: string) => {
  const ratings = await prisma.candidateRating.findMany({
    where: { applicationId },
    select: { overallRating: true },
  });

  const overallRating =
    ratings.length > 0
      ? parseFloat(
          (
            ratings.reduce((sum, rating) => sum + rating.overallRating, 0) / ratings.length
          ).toFixed(1)
        )
      : null;

  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: { overallRating },
  });

  return overallRating;
};

// ==================== PUBLIC CAREERS & APPLICATIONS ====================

export const getPublicJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDefaultRecruitmentData();

    const {
      q,
      departmentId,
      location,
      employmentType,
      workMode,
      experienceLevel,
      sortBy = 'latest',
      page = '1',
      limit = '12',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.JobWhereInput = {
      status: 'PUBLISHED',
    };

    if (q && typeof q === 'string' && q.trim()) {
      const searchTerm = q.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { summary: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { locationCity: { contains: searchTerm, mode: 'insensitive' } },
        { locationState: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    if (departmentId && typeof departmentId === 'string' && departmentId.trim()) {
      where.departmentId = departmentId.trim();
    }

    if (location && typeof location === 'string' && location.trim()) {
      const locStr = location.trim();
      where.OR = [
        ...(where.OR || []),
        { locationCity: { contains: locStr, mode: 'insensitive' } },
        { locationState: { contains: locStr, mode: 'insensitive' } },
      ];
    }

    if (employmentType && typeof employmentType === 'string' && employmentType.trim()) {
      where.employmentType = employmentType.trim() as EmploymentType;
    }

    if (workMode && typeof workMode === 'string' && workMode.trim()) {
      where.workMode = workMode.trim() as WorkMode;
    }

    if (experienceLevel && typeof experienceLevel === 'string' && experienceLevel.trim()) {
      const expStr = experienceLevel.trim();
      if (expStr === 'FRESHER') {
        where.minExperience = { lte: 1 };
      } else if (expStr === 'JUNIOR') {
        where.minExperience = { gte: 1, lte: 3 };
      } else if (expStr === 'MID_LEVEL') {
        where.minExperience = { gte: 3, lte: 6 };
      } else if (expStr === 'SENIOR') {
        where.minExperience = { gte: 5 };
      }
    }

    let orderBy: Prisma.JobOrderByWithRelationInput = { postedAt: 'desc' };
    if (sortBy === 'oldest') {
      orderBy = { postedAt: 'asc' };
    } else if (sortBy === 'closingSoon') {
      orderBy = { deadline: 'asc' };
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
        include: {
          department: {
            select: { id: true, name: true, code: true },
          },
          _count: {
            select: { applications: true },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    const publishedJobsWhere: Prisma.JobWhereInput = { status: 'PUBLISHED' };
    const [departments, employmentTypes, workModes, experienceJobs] = await Promise.all([
      prisma.jobDepartment.findMany({
        where: { jobs: { some: publishedJobsWhere } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      prisma.job.findMany({
        where: publishedJobsWhere,
        distinct: ['employmentType'],
        select: { employmentType: true },
        orderBy: { employmentType: 'asc' },
      }),
      prisma.job.findMany({
        where: publishedJobsWhere,
        distinct: ['workMode'],
        select: { workMode: true },
        orderBy: { workMode: 'asc' },
      }),
      prisma.job.findMany({
        where: publishedJobsWhere,
        select: { minExperience: true },
      }),
    ]);

    const experienceLevels = new Set<string>();
    for (const job of experienceJobs) {
      if (job.minExperience <= 1) experienceLevels.add('FRESHER');
      if (job.minExperience >= 1 && job.minExperience <= 3) experienceLevels.add('JUNIOR');
      if (job.minExperience >= 3 && job.minExperience <= 6) experienceLevels.add('MID_LEVEL');
      if (job.minExperience >= 5) experienceLevels.add('SENIOR');
    }

    res.status(200).json({
      success: true,
      jobs,
      departments,
      filterOptions: {
        departments,
        employmentTypes: employmentTypes.map((item) => item.employmentType),
        workModes: workModes.map((item) => item.workMode),
        experienceLevels: ['FRESHER', 'JUNIOR', 'MID_LEVEL', 'SENIOR'].filter((level) => experienceLevels.has(level)),
      },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicJobBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = getParamString(req.params.slug);

    const job = await prisma.job.findUnique({
      where: { slug },
      include: {
        department: true,
        customQuestions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!job || job.status !== 'PUBLISHED') {
      return res.status(404).json({
        success: false,
        error: 'Job posting not found or is no longer accepting applications.',
      });
    }

    const relatedJobs = await prisma.job.findMany({
      where: {
        status: 'PUBLISHED',
        id: { not: job.id },
        departmentId: job.departmentId,
      },
      take: 3,
      orderBy: { postedAt: 'desc' },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    res.status(200).json({
      success: true,
      job,
      relatedJobs,
    });
  } catch (error) {
    next(error);
  }
};

export const applyForJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = getParamString(req.params.slug);
    const body = req.body;

    const job = await prisma.job.findUnique({
      where: { slug },
      include: {
        customQuestions: true,
      },
    });

    if (!job || job.status !== 'PUBLISHED') {
      return res.status(400).json({
        success: false,
        error: 'This job is not active for new applications.',
      });
    }

    const fullName = body.fullName?.trim();
    const email = body.email?.trim().toLowerCase();
    const mobile = body.mobile?.trim();

    if (!fullName || !email || !mobile) {
      return res.status(400).json({
        success: false,
        error: 'Full name, email, and mobile number are required.',
      });
    }

    if (job.resumeRequired && !body.resumeUrl && !req.file) {
      return res.status(400).json({
        success: false,
        error: 'Resume document is required to apply for this job.',
      });
    }

    let customAnswers: Record<string, unknown> = {};
    try {
      customAnswers = parseCustomAnswersPayload(body.customAnswers);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Custom application answers must be valid JSON.',
      });
    }

    const missingRequiredQuestion = job.customQuestions.find(
      (question) => question.isRequired && !hasApplicationAnswerValue(customAnswers[question.id])
    );

    if (missingRequiredQuestion) {
      return res.status(400).json({
        success: false,
        error: `Please answer the required question: ${missingRequiredQuestion.question}`,
      });
    }

    let candidate = await prisma.candidate.findFirst({
      where: {
        OR: [{ email }, { mobile }],
      },
    });

    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          fullName,
          email,
          mobile,
          currentCity: body.currentCity?.trim() || null,
          state: body.state?.trim() || null,
          address: body.address?.trim() || null,
          currentCompany: body.currentCompany?.trim() || null,
          currentDesignation: body.currentDesignation?.trim() || null,
          totalExperience: body.totalExperience ? parseFloat(body.totalExperience) : null,
          relevantExperience: body.relevantExperience ? parseFloat(body.relevantExperience) : null,
          currentCtc: body.currentCtc ? parseFloat(body.currentCtc) : null,
          expectedCtc: body.expectedCtc ? parseFloat(body.expectedCtc) : null,
          noticePeriod: body.noticePeriod?.trim() || null,
          employmentStatus: (body.employmentStatus as CandidateEmploymentStatus) || null,
          linkedInUrl: body.linkedInUrl?.trim() || null,
          portfolioUrl: body.portfolioUrl?.trim() || null,
          coverLetter: body.coverLetter?.trim() || null,
        },
      });
    } else {
      candidate = await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          fullName,
          currentCity: body.currentCity?.trim() || candidate.currentCity,
          state: body.state?.trim() || candidate.state,
          address: body.address?.trim() || candidate.address,
          currentCompany: body.currentCompany?.trim() || candidate.currentCompany,
          currentDesignation: body.currentDesignation?.trim() || candidate.currentDesignation,
          totalExperience: body.totalExperience ? parseFloat(body.totalExperience) : candidate.totalExperience,
          relevantExperience: body.relevantExperience ? parseFloat(body.relevantExperience) : candidate.relevantExperience,
          currentCtc: body.currentCtc ? parseFloat(body.currentCtc) : candidate.currentCtc,
          expectedCtc: body.expectedCtc ? parseFloat(body.expectedCtc) : candidate.expectedCtc,
          noticePeriod: body.noticePeriod?.trim() || candidate.noticePeriod,
          employmentStatus: (body.employmentStatus as CandidateEmploymentStatus) || candidate.employmentStatus,
          linkedInUrl: body.linkedInUrl?.trim() || candidate.linkedInUrl,
          portfolioUrl: body.portfolioUrl?.trim() || candidate.portfolioUrl,
          coverLetter: body.coverLetter?.trim() || candidate.coverLetter,
        },
      });
    }

    const existingApp = await prisma.jobApplication.findUnique({
      where: {
        jobId_candidateId: {
          jobId: job.id,
          candidateId: candidate.id,
        },
      },
    });

    if (existingApp && !body.overrideDuplicate) {
      return res.status(400).json({
        success: false,
        error: 'You have already submitted an application for this position.',
        alreadyApplied: true,
        applicationRef: existingApp.applicationRef,
      });
    }

    const applicationRef = await generateApplicationRef();

    const application = await prisma.jobApplication.create({
      data: {
        applicationRef,
        jobId: job.id,
        candidateId: candidate.id,
        currentStage: 'NEW',
        isDuplicateOverride: !!body.overrideDuplicate,
      },
    });

    if (Object.keys(customAnswers).length > 0) {
      const answerEntries = Object.entries(customAnswers);
      const validQuestionIds = new Set(job.customQuestions.map((question) => question.id));
      for (const [questionId, ansValue] of answerEntries) {
        if (validQuestionIds.has(questionId) && hasApplicationAnswerValue(ansValue)) {
          await prisma.applicationAnswer.create({
            data: {
              applicationId: application.id,
              questionId,
              answerText: stringifyApplicationAnswer(ansValue),
              answerJson: typeof ansValue !== 'string' ? (ansValue as Prisma.InputJsonValue) : Prisma.JsonNull,
            },
          });
        }
      }
    }

    let resumeFileUrl: string | null = body.resumeUrl || null;
    let resumeFileName: string = body.resumeFileName || 'Resume.pdf';
    let resumeFileSize: number | null = body.resumeFileSize ? parseInt(body.resumeFileSize, 10) : null;
    let resumeMimeType: string = body.resumeMimeType || 'application/pdf';

    if (req.file) {
      resumeFileUrl = `/api/documents/secure/${req.file.filename}`;
      resumeFileName = req.file.originalname;
      resumeFileSize = req.file.size;
      resumeMimeType = req.file.mimetype;
    }

    if (resumeFileUrl) {
      await prisma.candidateDocument.create({
        data: {
          candidateId: candidate.id,
          applicationId: application.id,
          category: 'RESUME',
          fileName: resumeFileName,
          fileUrl: resumeFileUrl,
          fileSize: resumeFileSize,
          mimeType: resumeMimeType,
        },
      });
    }

    await prisma.applicationStageHistory.create({
      data: {
        applicationId: application.id,
        toStage: 'NEW',
        notes: 'Application submitted by candidate',
      },
    });

    await logRecruitmentActivity({
      candidateId: candidate.id,
      applicationId: application.id,
      action: 'APPLICATION_SUBMITTED',
      title: 'Job Application Submitted',
      details: `Candidate applied for position "${job.title}" with reference ${applicationRef}`,
    });

    dispatchRecruitmentCandidateWhatsApp({
      eventCode: 'RECRUITMENT_APPLICATION_RECEIVED',
      relatedEntityType: 'JOB_APPLICATION',
      relatedEntityId: application.id,
      candidate,
      payloadSnapshot: { applicationRef, jobId: job.id, jobTitle: job.title },
    });
    void dispatchNewApplicationInternalAlerts({
      applicationId: application.id,
      applicationRef,
      candidate,
      job: { id: job.id, title: job.title, createdById: job.createdById },
    });

    res.status(201).json({
      success: true,
      message: 'Your application has been submitted successfully!',
      applicationRef,
      jobTitle: job.title,
      candidateName: candidate.fullName,
      appliedAt: application.appliedAt,
    });
  } catch (error) {
    next(error);
  }
};

// ==================== RECRUITMENT ADMIN WORKSPACE ====================

export const getRecruitmentDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      activeJobs,
      totalApplications,
      newApplications,
      underReview,
      interviewsScheduled,
      selectedCandidates,
      offersSent,
      hiredCandidates,
      recentApplications,
      upcomingInterviews,
      appsByJobRaw,
      appsByDeptRaw,
    ] = await Promise.all([
      prisma.job.count({ where: { status: 'PUBLISHED' } }),
      prisma.jobApplication.count(),
      prisma.jobApplication.count({ where: { currentStage: 'NEW' } }),
      prisma.jobApplication.count({ where: { currentStage: 'UNDER_REVIEW' } }),
      prisma.interview.count({ where: { status: 'SCHEDULED' } }),
      prisma.jobApplication.count({ where: { currentStage: 'SELECTED' } }),
      prisma.offer.count({ where: { status: 'SENT' } }),
      prisma.jobApplication.count({ where: { currentStage: 'HIRED' } }),
      prisma.jobApplication.findMany({
        take: 6,
        orderBy: { appliedAt: 'desc' },
        include: {
          candidate: { select: { id: true, fullName: true, email: true, mobile: true } },
          job: { select: { id: true, title: true, jobCode: true, department: { select: { name: true } } } },
        },
      }),
      prisma.interview.findMany({
        where: { status: 'SCHEDULED' },
        take: 5,
        orderBy: { scheduledAt: 'asc' },
        include: {
          candidate: { select: { id: true, fullName: true, mobile: true } },
          job: { select: { id: true, title: true } },
          interviewer: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.jobApplication.groupBy({
        by: ['jobId'],
        _count: { id: true },
        take: 6,
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.job.groupBy({
        by: ['departmentId'],
        _count: { id: true },
      }),
    ]);

    const jobIds = appsByJobRaw.map((item) => item.jobId);
    const jobsInfo = await prisma.job.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, title: true },
    });
    const jobMap = new Map(jobsInfo.map((j) => [j.id, j.title]));

    const applicationsByJob = appsByJobRaw.map((item) => ({
      jobTitle: jobMap.get(item.jobId) || 'Job',
      count: item._count.id,
    }));

    const deptIds = appsByDeptRaw.map((item) => item.departmentId);
    const deptsInfo = await prisma.jobDepartment.findMany({
      where: { id: { in: deptIds } },
      select: { id: true, name: true },
    });
    const deptMap = new Map(deptsInfo.map((d) => [d.id, d.name]));

    const applicationsByDepartment = appsByDeptRaw.map((item) => ({
      departmentName: deptMap.get(item.departmentId) || 'Department',
      count: item._count.id,
    }));

    const pipelineFunnel = [
      { stage: 'New', count: newApplications },
      { stage: 'Under Review', count: underReview },
      { stage: 'Scheduled', count: interviewsScheduled },
      { stage: 'Selected', count: selectedCandidates },
      { stage: 'Offers Sent', count: offersSent },
      { stage: 'Hired', count: hiredCandidates },
    ];

    res.status(200).json({
      success: true,
      stats: {
        activeJobs,
        totalApplications,
        newApplications,
        underReview,
        interviewsScheduled,
        selectedCandidates,
        offersSent,
        hiredCandidates,
      },
      charts: {
        applicationsByJob,
        applicationsByDepartment,
        pipelineFunnel,
      },
      recentApplications,
      upcomingInterviews,
    });
  } catch (error) {
    next(error);
  }
};

// ==================== JOB MANAGEMENT (ADMIN) ====================

export const getAdminJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, departmentId, q, compact, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.JobWhereInput = {};

    if (status && typeof status === 'string' && status.trim()) {
      where.status = status.trim() as JobStatus;
    }

    if (departmentId && typeof departmentId === 'string' && departmentId.trim()) {
      where.departmentId = departmentId.trim();
    }

    if (q && typeof q === 'string' && q.trim()) {
      const query = q.trim();
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { jobCode: { contains: query, mode: 'insensitive' } },
        { locationCity: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (compact === 'true' || compact === '1') {
      const jobs = await prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        select: { id: true, title: true },
      });

      return res.status(200).json({
        success: true,
        jobs,
      });
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        select: {
          id: true,
          title: true,
          slug: true,
          jobCode: true,
          vacancies: true,
          employmentType: true,
          workMode: true,
          locationCity: true,
          locationState: true,
          status: true,
          postedAt: true,
          department: { select: { id: true, name: true, code: true } },
          _count: {
            select: {
              applications: true,
              customQuestions: true,
            },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    const departments = await prisma.jobDepartment.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });

    res.status(200).json({
      success: true,
      jobs,
      departments,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminJobById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lookup = getParamString(req.params.id);
    const jobLookup = await prisma.job.findFirst({
      where: {
        OR: [{ id: lookup }, { slug: lookup }],
      },
      select: { id: true },
    });

    if (!jobLookup) {
      return res.status(404).json({ success: false, error: 'Job posting not found.' });
    }

    const id = jobLookup.id;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        department: true,
        customQuestions: { orderBy: { order: 'asc' } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: {
          select: { applications: true },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job posting not found.' });
    }

    const stageBreakdown = await prisma.jobApplication.groupBy({
      by: ['currentStage'],
      where: { jobId: id },
      _count: { id: true },
    });

    res.status(200).json({
      success: true,
      job,
      stageBreakdown,
    });
  } catch (error) {
    next(error);
  }
};
export const getMyApplications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const userEmail = user?.email;
    const userMobile = user?.mobile;

    if (!userEmail && !userMobile) {
      return res.status(200).json({ success: true, applications: [] });
    }

    const candidate = await prisma.candidate.findFirst({
      where: {
        OR: [
          ...(userEmail ? [{ email: userEmail }] : []),
          ...(userMobile ? [{ mobile: userMobile }] : []),
        ],
      },
      select: { id: true },
    });

    if (!candidate) {
      return res.status(200).json({ success: true, applications: [] });
    }

    const applications = await prisma.jobApplication.findMany({
      where: { candidateId: candidate.id },
      include: {
        job: {
          select: { title: true, jobCode: true, department: true },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });

    res.status(200).json({ success: true, applications });
  } catch (error) {
    next(error);
  }
};

export const getMyApplicationById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const userEmail = user?.email;
    const userMobile = user?.mobile;

    if (!userEmail && !userMobile) {
      return res.status(404).json({ success: false, error: 'Application not found or unauthorized.' });
    }

    const candidate = await prisma.candidate.findFirst({
      where: {
        OR: [
          ...(userEmail ? [{ email: userEmail }] : []),
          ...(userMobile ? [{ mobile: userMobile }] : []),
        ],
      },
      select: { id: true },
    });

    if (!candidate) {
      return res.status(404).json({ success: false, error: 'Application not found or unauthorized.' });
    }

    const application = await prisma.jobApplication.findFirst({
      where: {
        candidateId: candidate.id,
        OR: [
          { id },
          { applicationRef: id },
        ],
      },
      include: {
        job: {
          include: { department: true, customQuestions: true },
        },
        candidate: true,
        answers: { include: { question: true } },
        documents: true,
        interviews: { orderBy: { scheduledAt: 'desc' } },
        offers: { orderBy: { createdAt: 'desc' } },
        stageHistory: {
          orderBy: { createdAt: 'desc' },
          include: { changedBy: { select: { id: true, name: true } } },
        },
      },
    });

    if (!application) {
      return res.status(404).json({ success: false, error: 'Application not found or unauthorized.' });
    }

    res.status(200).json({ success: true, application });
  } catch (error) {
    next(error);
  }
};

export const downloadMyApplicationDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const applicationId = getParamString(req.params.id);
    const documentId = getParamString(req.params.documentId);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, mobile: true } });
    const candidate = await prisma.candidate.findFirst({
      where: { OR: [...(user?.email ? [{ email: user.email }] : []), ...(user?.mobile ? [{ mobile: user.mobile }] : [])] },
      select: { id: true },
    });
    if (!candidate) return res.status(404).json({ success: false, error: 'Application not found.' });

    const document = await prisma.candidateDocument.findFirst({
      where: { id: documentId, applicationId, candidateId: candidate.id },
      select: { fileName: true, fileUrl: true, mimeType: true },
    });
    if (!document) return res.status(404).json({ success: false, error: 'Document not found.' });

    const fileName = path.basename(document.fileName || document.fileUrl);
    const absolutePath = path.join(secureUploadDir, fileName);
    await fs.access(absolutePath);
    res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
};


export const createJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;
    const userId = req.user?.id || null;

    if (!body.title || !body.departmentId || !body.description || !body.locationCity || !body.locationState) {
      return res.status(400).json({
        success: false,
        error: 'Title, department, description, location city and state are required.',
      });
    }

    const slug = body.slug?.trim() || generateJobSlug(body.title, body.locationCity);
    const count = await prisma.job.count();
    const jobCode = body.jobCode?.trim() || `JOB-${(count + 101).toString().padStart(4, '0')}`;

    const job = await prisma.job.create({
      data: {
        title: body.title.trim(),
        slug,
        jobCode,
        departmentId: body.departmentId,
        vacancies: body.vacancies ? parseInt(body.vacancies, 10) : 1,
        employmentType: (body.employmentType as EmploymentType) || 'FULL_TIME',
        workMode: (body.workMode as WorkMode) || 'ON_SITE',
        locationCity: body.locationCity.trim(),
        locationState: body.locationState.trim(),
        locationAddress: body.locationAddress?.trim() || null,
        minExperience: body.minExperience ? parseFloat(body.minExperience) : 0,
        maxExperience: body.maxExperience ? parseFloat(body.maxExperience) : null,
        minSalary: body.minSalary ? parseFloat(body.minSalary) : null,
        maxSalary: body.maxSalary ? parseFloat(body.maxSalary) : null,
        currency: body.currency || 'INR',
        salaryVisibility: body.salaryVisibility !== undefined ? !!body.salaryVisibility : true,
        educationRequirement: body.educationRequirement?.trim() || null,
        summary: body.summary?.trim() || null,
        description: body.description.trim(),
        responsibilities: Array.isArray(body.responsibilities) ? body.responsibilities : [],
        requirements: Array.isArray(body.requirements) ? body.requirements : [],
        preferredSkills: Array.isArray(body.preferredSkills) ? body.preferredSkills : [],
        benefits: Array.isArray(body.benefits) ? body.benefits : [],
        workingHours: body.workingHours?.trim() || null,
        aboutCompany: body.aboutCompany?.trim() || null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        deadline: body.deadline ? new Date(body.deadline) : null,
        resumeRequired: body.resumeRequired !== undefined ? !!body.resumeRequired : true,
        coverLetterRequired: body.coverLetterRequired !== undefined ? !!body.coverLetterRequired : false,
        seoTitle: body.seoTitle?.trim() || null,
        metaDescription: body.metaDescription?.trim() || null,
        ogImage: body.ogImage?.trim() || null,
        canonicalUrl: body.canonicalUrl?.trim() || null,
        status: (body.status as JobStatus) || 'DRAFT',
        postedAt: body.status === 'PUBLISHED' ? new Date() : null,
        createdById: userId,
      },
    });

    if (Array.isArray(body.customQuestions) && body.customQuestions.length > 0) {
      for (let i = 0; i < body.customQuestions.length; i++) {
        const q = body.customQuestions[i];
        if (q.question && q.question.trim()) {
          await prisma.jobCustomQuestion.create({
            data: {
              jobId: job.id,
              question: q.question.trim(),
              type: (q.type as CustomQuestionType) || 'SHORT_TEXT',
              options: Array.isArray(q.options) ? q.options : [],
              isRequired: !!q.isRequired,
              order: i + 1,
            },
          });
        }
      }
    }

    if (shouldDispatchSmsPublishedBroadcast({ previousStatus: null, nextStatus: job.status })) {
      const publishedPayload = {
        jobId: job.id,
        jobCode: job.jobCode,
        jobTitle: job.title,
        jobSlug: job.slug,
        locationCity: job.locationCity,
        locationState: job.locationState,
      };
      void dispatchPublishedSms({
        eventCode: 'RECRUITMENT_NEW_JOB_PUBLISHED',
        relatedEntityType: 'JOB',
        relatedEntityId: job.id,
        payloadSnapshot: publishedPayload,
      });
      void dispatchPublishedWhatsApp({
        eventCode: 'RECRUITMENT_NEW_JOB_PUBLISHED',
        relatedEntityType: 'JOB',
        relatedEntityId: job.id,
        payloadSnapshot: publishedPayload,
      });
    }

    res.status(201).json({
      success: true,
      job,
      message: 'Job posting created successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const updateJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const body = req.body;

    const existingJob = await prisma.job.findUnique({ where: { id } });
    if (!existingJob) {
      return res.status(404).json({ success: false, error: 'Job posting not found.' });
    }

    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        title: body.title?.trim() || existingJob.title,
        departmentId: body.departmentId || existingJob.departmentId,
        vacancies: body.vacancies ? parseInt(body.vacancies, 10) : existingJob.vacancies,
        employmentType: (body.employmentType as EmploymentType) || existingJob.employmentType,
        workMode: (body.workMode as WorkMode) || existingJob.workMode,
        locationCity: body.locationCity?.trim() || existingJob.locationCity,
        locationState: body.locationState?.trim() || existingJob.locationState,
        locationAddress: body.locationAddress?.trim() !== undefined ? body.locationAddress.trim() : existingJob.locationAddress,
        minExperience: body.minExperience !== undefined ? parseFloat(body.minExperience) : existingJob.minExperience,
        maxExperience: body.maxExperience !== undefined ? (body.maxExperience ? parseFloat(body.maxExperience) : null) : existingJob.maxExperience,
        minSalary: body.minSalary !== undefined ? (body.minSalary ? parseFloat(body.minSalary) : null) : existingJob.minSalary,
        maxSalary: body.maxSalary !== undefined ? (body.maxSalary ? parseFloat(body.maxSalary) : null) : existingJob.maxSalary,
        currency: body.currency || existingJob.currency,
        salaryVisibility: body.salaryVisibility !== undefined ? !!body.salaryVisibility : existingJob.salaryVisibility,
        educationRequirement: body.educationRequirement !== undefined ? body.educationRequirement : existingJob.educationRequirement,
        summary: body.summary !== undefined ? body.summary : existingJob.summary,
        description: body.description?.trim() || existingJob.description,
        responsibilities: Array.isArray(body.responsibilities) ? body.responsibilities : existingJob.responsibilities,
        requirements: Array.isArray(body.requirements) ? body.requirements : existingJob.requirements,
        preferredSkills: Array.isArray(body.preferredSkills) ? body.preferredSkills : existingJob.preferredSkills,
        benefits: Array.isArray(body.benefits) ? body.benefits : existingJob.benefits,
        workingHours: body.workingHours !== undefined ? body.workingHours : existingJob.workingHours,
        aboutCompany: body.aboutCompany !== undefined ? body.aboutCompany : existingJob.aboutCompany,
        startDate: body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : existingJob.startDate,
        deadline: body.deadline !== undefined ? (body.deadline ? new Date(body.deadline) : null) : existingJob.deadline,
        resumeRequired: body.resumeRequired !== undefined ? !!body.resumeRequired : existingJob.resumeRequired,
        coverLetterRequired: body.coverLetterRequired !== undefined ? !!body.coverLetterRequired : existingJob.coverLetterRequired,
        seoTitle: body.seoTitle !== undefined ? body.seoTitle : existingJob.seoTitle,
        metaDescription: body.metaDescription !== undefined ? body.metaDescription : existingJob.metaDescription,
        status: body.status ? (body.status as JobStatus) : existingJob.status,
        postedAt: body.status === 'PUBLISHED' && existingJob.status !== 'PUBLISHED' ? new Date() : existingJob.postedAt,
        closedAt: body.status === 'CLOSED' && existingJob.status !== 'CLOSED' ? new Date() : existingJob.closedAt,
      },
    });

    if (Array.isArray(body.customQuestions)) {
      await prisma.jobCustomQuestion.deleteMany({ where: { jobId: id } });

      for (let i = 0; i < body.customQuestions.length; i++) {
        const q = body.customQuestions[i];
        if (q.question && q.question.trim()) {
          await prisma.jobCustomQuestion.create({
            data: {
              jobId: id,
              question: q.question.trim(),
              type: (q.type as CustomQuestionType) || 'SHORT_TEXT',
              options: Array.isArray(q.options) ? q.options : [],
              isRequired: !!q.isRequired,
              order: i + 1,
            },
          });
        }
      }
    }

    if (shouldDispatchSmsPublishedBroadcast({ previousStatus: existingJob.status, nextStatus: updatedJob.status })) {
      const publishedPayload = {
        jobId: updatedJob.id,
        jobCode: updatedJob.jobCode,
        jobTitle: updatedJob.title,
        jobSlug: updatedJob.slug,
        locationCity: updatedJob.locationCity,
        locationState: updatedJob.locationState,
      };
      void dispatchPublishedSms({
        eventCode: 'RECRUITMENT_NEW_JOB_PUBLISHED',
        relatedEntityType: 'JOB',
        relatedEntityId: updatedJob.id,
        payloadSnapshot: publishedPayload,
      });
      void dispatchPublishedWhatsApp({
        eventCode: 'RECRUITMENT_NEW_JOB_PUBLISHED',
        relatedEntityType: 'JOB',
        relatedEntityId: updatedJob.id,
        payloadSnapshot: publishedPayload,
      });
    }

    res.status(200).json({
      success: true,
      job: updatedJob,
      message: 'Job posting updated successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const duplicateJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const userId = req.user?.id || null;

    const sourceJob = await prisma.job.findUnique({
      where: { id },
      include: { customQuestions: true },
    });

    if (!sourceJob) {
      return res.status(404).json({ success: false, error: 'Source job not found.' });
    }

    const title = `${sourceJob.title} (Copy)`;
    const slug = generateJobSlug(title, sourceJob.locationCity);
    const count = await prisma.job.count();
    const jobCode = `JOB-${(count + 101).toString().padStart(4, '0')}`;

    const newJob = await prisma.job.create({
      data: {
        title,
        slug,
        jobCode,
        departmentId: sourceJob.departmentId,
        vacancies: sourceJob.vacancies,
        employmentType: sourceJob.employmentType,
        workMode: sourceJob.workMode,
        locationCity: sourceJob.locationCity,
        locationState: sourceJob.locationState,
        locationAddress: sourceJob.locationAddress,
        minExperience: sourceJob.minExperience,
        maxExperience: sourceJob.maxExperience,
        minSalary: sourceJob.minSalary,
        maxSalary: sourceJob.maxSalary,
        currency: sourceJob.currency,
        salaryVisibility: sourceJob.salaryVisibility,
        educationRequirement: sourceJob.educationRequirement,
        summary: sourceJob.summary,
        description: sourceJob.description,
        responsibilities: sourceJob.responsibilities,
        requirements: sourceJob.requirements,
        preferredSkills: sourceJob.preferredSkills,
        benefits: sourceJob.benefits,
        workingHours: sourceJob.workingHours,
        aboutCompany: sourceJob.aboutCompany,
        resumeRequired: sourceJob.resumeRequired,
        coverLetterRequired: sourceJob.coverLetterRequired,
        status: 'DRAFT',
        createdById: userId,
      },
    });

    for (const q of sourceJob.customQuestions) {
      await prisma.jobCustomQuestion.create({
        data: {
          jobId: newJob.id,
          question: q.question,
          type: q.type,
          options: q.options,
          isRequired: q.isRequired,
          order: q.order,
        },
      });
    }

    res.status(201).json({
      success: true,
      job: newJob,
      message: 'Job posting duplicated as draft.',
    });
  } catch (error) {
    next(error);
  }
};

export const updateJobStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { status } = req.body;

    if (!status || !['DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Valid status is required.' });
    }

    const existingJob = await prisma.job.findUnique({ where: { id }, select: { status: true } });
    if (!existingJob) {
      return res.status(404).json({ success: false, error: 'Job posting not found.' });
    }

    const job = await prisma.job.update({
      where: { id },
      data: {
        status: status as JobStatus,
        postedAt: status === 'PUBLISHED' ? new Date() : null,
        closedAt: status === 'CLOSED' ? new Date() : null,
      },
    });

    if (shouldDispatchSmsPublishedBroadcast({ previousStatus: existingJob.status, nextStatus: job.status })) {
      const publishedPayload = {
        jobId: job.id,
        jobCode: job.jobCode,
        jobTitle: job.title,
        jobSlug: job.slug,
        locationCity: job.locationCity,
        locationState: job.locationState,
      };
      void dispatchPublishedSms({
        eventCode: 'RECRUITMENT_NEW_JOB_PUBLISHED',
        relatedEntityType: 'JOB',
        relatedEntityId: job.id,
        payloadSnapshot: publishedPayload,
      });
      void dispatchPublishedWhatsApp({
        eventCode: 'RECRUITMENT_NEW_JOB_PUBLISHED',
        relatedEntityType: 'JOB',
        relatedEntityId: job.id,
        payloadSnapshot: publishedPayload,
      });
    }

    res.status(200).json({
      success: true,
      job,
      message: `Job status updated to ${status}.`,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);

    await prisma.job.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: 'Job posting deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

// ==================== APPLICATIONS MANAGEMENT ====================

export const getAdminApplications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      jobId,
      jobSlug,
      departmentId,
      stage,
      q,
      assignedRecruiterId,
      rating,
      compact,
      view,
      includeMeta,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.JobApplicationWhereInput = {};

    if (jobId && typeof jobId === 'string' && jobId.trim()) {
      where.jobId = jobId.trim();
    } else if (jobSlug && typeof jobSlug === 'string' && jobSlug.trim()) {
      where.job = { slug: jobSlug.trim() };
    }

    if (departmentId && typeof departmentId === 'string' && departmentId.trim()) {
      where.job = {
        ...(where.job as Prisma.JobWhereInput | undefined),
        departmentId: departmentId.trim(),
      };
    }

    if (stage && typeof stage === 'string' && stage.trim()) {
      where.currentStage = stage.trim();
    }

    if (assignedRecruiterId && typeof assignedRecruiterId === 'string' && assignedRecruiterId.trim()) {
      where.assignedRecruiterId = assignedRecruiterId.trim();
    }

    if (rating) {
      where.overallRating = { gte: parseFloat(rating as string) };
    }

    if (q && typeof q === 'string' && q.trim()) {
      const query = q.trim();
      where.OR = [
        { applicationRef: { contains: query, mode: 'insensitive' } },
        { candidate: { fullName: { contains: query, mode: 'insensitive' } } },
        { candidate: { email: { contains: query, mode: 'insensitive' } } },
        { candidate: { mobile: { contains: query, mode: 'insensitive' } } },
      ];
    }

    if (compact === 'true' || compact === '1') {
      const applications = await prisma.jobApplication.findMany({
        where,
        orderBy: { appliedAt: 'desc' },
        skip,
        take: limitNum,
        select: {
          id: true,
          applicationRef: true,
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
      });

      return res.status(200).json({
        success: true,
        applications,
      });
    }

    if (view === 'pipeline') {
      const [applications, total] = await Promise.all([
        prisma.jobApplication.findMany({
          where,
          orderBy: { appliedAt: 'desc' },
          skip,
          take: limitNum,
          select: {
            id: true,
            applicationRef: true,
            currentStage: true,
            overallRating: true,
            appliedAt: true,
            candidate: {
              select: {
                id: true,
                fullName: true,
                email: true,
                mobile: true,
              },
            },
            job: { select: { id: true, title: true } },
          },
        }),
        prisma.jobApplication.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        applications,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    }

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        orderBy: { appliedAt: 'desc' },
        skip,
        take: limitNum,
        select: {
          id: true,
          applicationRef: true,
          currentStage: true,
          terminalStatus: true,
          overallRating: true,
          appliedAt: true,
          candidate: {
            select: {
              id: true,
              fullName: true,
              email: true,
              mobile: true,
              currentCompany: true,
              totalExperience: true,
            },
          },
          documents: {
            where: { category: 'RESUME' },
            orderBy: { uploadedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              category: true,
              fileName: true,
              fileUrl: true,
              uploadedAt: true,
            },
          },
          job: {
            select: {
              id: true,
              title: true,
              jobCode: true,
              locationCity: true,
              department: { select: { name: true } },
            },
          },
          assignedRecruiter: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.jobApplication.count({ where }),
    ]);

    const shouldIncludeMeta = includeMeta === 'true' || includeMeta === '1';
    const [stages, recruiters] = shouldIncludeMeta
      ? await Promise.all([
          (async () => {
            const [rawStages, usageCounts] = await Promise.all([
              prisma.applicationStage.findMany({
                orderBy: { order: 'asc' },
                select: {
                  id: true,
                  name: true,
                  code: true,
                  order: true,
                  color: true,
                  isSystem: true,
                  isTerminal: true,
                },
              }),
              getStageUsageCounts(),
            ]);

            return rawStages.map((stage) => serializeApplicationStage(stage, usageCounts.get(stage.code) || 0));
          })(),
          prisma.user.findMany({
            where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'] } },
            select: { id: true, name: true, email: true },
          }),
        ])
      : [[], []];

    res.status(200).json({
      success: true,
      applications,
      stages,
      recruiters,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminApplicationById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lookup = getParamString(req.params.id);
    const applicationLookup = await prisma.jobApplication.findFirst({
      where: {
        OR: [{ id: lookup }, { applicationRef: lookup }],
      },
      select: { id: true },
    });

    if (!applicationLookup) {
      return res.status(404).json({ success: false, error: 'Application record not found.' });
    }

    const id = applicationLookup.id;

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: {
        candidate: {
          include: {
            applications: {
              where: { id: { not: id } },
              include: { job: { select: { title: true, jobCode: true } } },
            },
          },
        },
        job: {
          include: {
            department: true,
            customQuestions: { orderBy: { order: 'asc' } },
          },
        },
        assignedRecruiter: { select: { id: true, name: true, email: true } },
        answers: {
          include: { question: true },
        },
        documents: true,
        stageHistory: {
          orderBy: { createdAt: 'desc' },
          include: { changedBy: { select: { name: true, email: true } } },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { name: true, email: true } } },
        },
        ratings: {
          orderBy: { createdAt: 'desc' },
          include: { evaluator: { select: { name: true, email: true } } },
        },
        interviews: {
          orderBy: { scheduledAt: 'desc' },
          include: {
            interviewer: { select: { name: true, email: true } },
            feedback: { include: { interviewer: { select: { name: true } } } },
          },
        },
        offers: {
          orderBy: { createdAt: 'desc' },
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { name: true, email: true } } },
        },
      },
    });

    if (!application) {
      return res.status(404).json({ success: false, error: 'Application record not found.' });
    }

    res.status(200).json({
      success: true,
      application,
    });
  } catch (error) {
    next(error);
  }
};

export const updateApplicationStage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { toStage, terminalStatus, notes } = req.body;
    const userId = req.user?.id || null;

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: { candidate: true, job: true },
    });

    if (!application) {
      return res.status(404).json({ success: false, error: 'Application record not found.' });
    }

    const previousStage = application.currentStage;
    const previousTerminal = application.terminalStatus;
    const targetStage = typeof toStage === 'string' ? toStage.trim() : '';

    if (targetStage) {
      const matchingStage = await prisma.applicationStage.findUnique({ where: { code: targetStage } });
      if (!matchingStage) {
        return res.status(400).json({ success: false, error: 'Invalid pipeline stage selected.' });
      }
    }

    const updatedApp = await prisma.jobApplication.update({
      where: { id },
      data: {
        currentStage: targetStage || previousStage,
        terminalStatus: terminalStatus !== undefined ? terminalStatus : previousTerminal,
      },
    });

    await prisma.applicationStageHistory.create({
      data: {
        applicationId: id,
        fromStage: previousStage,
        toStage: targetStage || previousStage,
        fromTerminalStatus: previousTerminal,
        toTerminalStatus: terminalStatus !== undefined ? terminalStatus : previousTerminal,
        changedById: userId,
        notes: notes || null,
      },
    });

    await logRecruitmentActivity({
      candidateId: application.candidateId,
      applicationId: id,
      actorId: userId,
      action: 'STAGE_CHANGED',
      title: `Stage updated to ${targetStage || terminalStatus}`,
      details: `Moved from "${previousStage}" to "${targetStage || terminalStatus}"`,
    });

    const candidateUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(application.candidate.email ? [{ email: application.candidate.email }] : []),
          ...(application.candidate.mobile ? [{ mobile: application.candidate.mobile }] : []),
        ],
      },
    });

    if (candidateUser) {
      await prisma.notification.create({
        data: {
          userId: candidateUser.id,
          title: 'Application Update',
          message: `Your application for ${application.job.title} has been updated to ${targetStage || terminalStatus}.`,
          type: 'INFO',
          link: '/profile?tab=applications',
        },
      });
    }

    dispatchRecruitmentCandidateWhatsApp({
      eventCode: 'RECRUITMENT_APPLICATION_STAGE_UPDATED',
      relatedEntityType: 'JOB_APPLICATION_STAGE',
      relatedEntityId: `${id}:${targetStage || terminalStatus || previousStage}`,
      candidate: application.candidate,
      payloadSnapshot: { applicationId: id, applicationRef: application.applicationRef, jobTitle: application.job.title, stage: targetStage || terminalStatus || previousStage },
    });

    res.status(200).json({
      success: true,
      application: updatedApp,
      message: 'Application stage updated successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const assignRecruiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { recruiterId } = req.body;

    const application = await prisma.jobApplication.update({
      where: { id },
      data: { assignedRecruiterId: recruiterId || null },
      include: { assignedRecruiter: { select: { id: true, name: true, email: true } } },
    });

    res.status(200).json({
      success: true,
      application,
      message: 'Assigned recruiter updated.',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteApplication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const userId = req.user?.id || null;

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: {
        candidate: { select: { id: true, fullName: true } },
        job: { select: { id: true, title: true } },
      },
    });

    if (!application) {
      return res.status(404).json({ success: false, error: 'Application record not found.' });
    }

    await prisma.$transaction([
      prisma.candidateDocument.updateMany({
        where: { applicationId: id },
        data: { applicationId: null },
      }),
      prisma.jobApplication.delete({
        where: { id },
      }),
    ]);

    await logRecruitmentActivity({
      candidateId: application.candidateId,
      actorId: userId,
      action: 'APPLICATION_DELETED',
      title: 'Job Application Deleted',
      details: `${application.candidate.fullName}'s application for "${application.job.title}" was deleted.`,
      metadata: {
        deletedApplicationId: id,
        applicationRef: application.applicationRef,
        jobId: application.jobId,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Application deleted successfully.',
    });
  } catch (error) {
    return next(error);
  }
};

// ==================== CANDIDATE DATABASE & TALENT POOL ====================

export const getAdminCandidates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inTalentPool, talentPoolCategory, q, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.CandidateWhereInput = {};

    if (inTalentPool === 'true') {
      where.inTalentPool = true;
    }

    if (talentPoolCategory && typeof talentPoolCategory === 'string' && talentPoolCategory.trim()) {
      where.talentPoolCategory = talentPoolCategory.trim() as TalentPoolCategory;
    }

    if (q && typeof q === 'string' && q.trim()) {
      const query = q.trim();
      where.OR = [
        { fullName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { mobile: { contains: query, mode: 'insensitive' } },
        { currentCompany: { contains: query, mode: 'insensitive' } },
        { currentDesignation: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        select: {
          id: true,
          fullName: true,
          email: true,
          mobile: true,
          currentCity: true,
          currentCompany: true,
          currentDesignation: true,
          totalExperience: true,
          noticePeriod: true,
          talentPoolCategory: true,
          inTalentPool: true,
          createdAt: true,
          applications: {
            take: 2,
            orderBy: { appliedAt: 'desc' },
            select: {
              id: true,
              applicationRef: true,
              currentStage: true,
              terminalStatus: true,
              appliedAt: true,
              job: { select: { title: true, jobCode: true } },
            },
          },
          _count: { select: { applications: true } },
        },
      }),
      prisma.candidate.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      candidates,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminCandidateById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        applications: {
          orderBy: { appliedAt: 'desc' },
          include: {
            job: { include: { department: true } },
            assignedRecruiter: { select: { name: true } },
          },
        },
        documents: true,
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { name: true, email: true } } },
        },
        ratings: {
          orderBy: { createdAt: 'desc' },
          include: { evaluator: { select: { name: true, email: true } } },
        },
        interviews: {
          orderBy: { scheduledAt: 'desc' },
          include: { job: { select: { title: true } }, interviewer: { select: { name: true } } },
        },
        offers: {
          orderBy: { createdAt: 'desc' },
          include: { job: { select: { title: true } } },
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { name: true } } },
        },
      },
    });

    if (!candidate) {
      return res.status(404).json({ success: false, error: 'Candidate record not found.' });
    }

    res.status(200).json({
      success: true,
      candidate,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleTalentPool = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { inTalentPool, talentPoolCategory, talentPoolNotes } = req.body;

    const candidate = await prisma.candidate.update({
      where: { id },
      data: {
        inTalentPool: !!inTalentPool,
        talentPoolCategory: talentPoolCategory ? (talentPoolCategory as TalentPoolCategory) : null,
        talentPoolNotes: talentPoolNotes || null,
      },
    });

    res.status(200).json({
      success: true,
      candidate,
      message: candidate.inTalentPool ? 'Added candidate to talent pool.' : 'Removed candidate from talent pool.',
    });
  } catch (error) {
    next(error);
  }
};

// ==================== NOTES & RATINGS ====================

export const addApplicationNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { content } = req.body;
    const userId = req.user?.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Note content is required.' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User authentication required.' });
    }

    const application = await prisma.jobApplication.findUnique({ where: { id } });
    if (!application) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const note = await prisma.candidateNote.create({
      data: {
        applicationId: id,
        candidateId: application.candidateId,
        authorId: userId,
        content: content.trim(),
      },
      include: { author: { select: { name: true, email: true } } },
    });

    await logRecruitmentActivity({
      candidateId: application.candidateId,
      applicationId: id,
      actorId: userId,
      action: 'NOTE_ADDED',
      title: 'Internal Note Added',
      details: content.trim().slice(0, 100),
    });

    res.status(201).json({
      success: true,
      note,
    });
  } catch (error) {
    next(error);
  }
};

export const updateApplicationNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const applicationId = getParamString(req.params.id);
    const noteId = getParamString(req.params.noteId);
    const { content } = req.body;
    const userId = req.user?.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Note content is required.' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User authentication required.' });
    }

    const note = await prisma.candidateNote.findFirst({
      where: { id: noteId, applicationId },
    });

    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found.' });
    }

    const updatedNote = await prisma.candidateNote.update({
      where: { id: noteId },
      data: { content: content.trim() },
      include: { author: { select: { name: true, email: true } } },
    });

    await logRecruitmentActivity({
      candidateId: note.candidateId,
      applicationId,
      actorId: userId,
      action: 'NOTE_UPDATED',
      title: 'Internal Note Updated',
      details: content.trim().slice(0, 100),
    });

    res.status(200).json({
      success: true,
      note: updatedNote,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteApplicationNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const applicationId = getParamString(req.params.id);
    const noteId = getParamString(req.params.noteId);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User authentication required.' });
    }

    const note = await prisma.candidateNote.findFirst({
      where: { id: noteId, applicationId },
    });

    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found.' });
    }

    await prisma.candidateNote.delete({
      where: { id: noteId },
    });

    await logRecruitmentActivity({
      candidateId: note.candidateId,
      applicationId,
      actorId: userId,
      action: 'NOTE_DELETED',
      title: 'Internal Note Deleted',
      details: note.content.slice(0, 100),
    });

    res.status(200).json({
      success: true,
      message: 'Note deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const addCandidateRating = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { overallRating, communicationRating, technicalRating, experienceRating, cultureFitRating, feedback } = req.body;
    const userId = req.user?.id;

    const parsedOverallRating = parseOptionalRatingValue(overallRating);

    if (!parsedOverallRating || parsedOverallRating < 1 || parsedOverallRating > 5) {
      return res.status(400).json({ success: false, error: 'Overall rating between 1 and 5 is required.' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User authentication required.' });
    }

    const application = await prisma.jobApplication.findUnique({ where: { id } });
    if (!application) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const rating = await prisma.candidateRating.create({
      data: {
        applicationId: id,
        candidateId: application.candidateId,
        evaluatorId: userId,
        overallRating: parsedOverallRating,
        communicationRating: parseOptionalRatingValue(communicationRating),
        technicalRating: parseOptionalRatingValue(technicalRating),
        experienceRating: parseOptionalRatingValue(experienceRating),
        cultureFitRating: parseOptionalRatingValue(cultureFitRating),
        feedback: feedback?.trim() || null,
      },
      include: { evaluator: { select: { name: true, email: true } } },
    });

    await recalculateApplicationOverallRating(id);

    res.status(201).json({
      success: true,
      rating,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCandidateRating = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const applicationId = getParamString(req.params.id);
    const ratingId = getParamString(req.params.ratingId);
    const { overallRating, communicationRating, technicalRating, experienceRating, cultureFitRating, feedback } = req.body;
    const userId = req.user?.id;

    const parsedOverallRating = parseOptionalRatingValue(overallRating);

    if (!parsedOverallRating || parsedOverallRating < 1 || parsedOverallRating > 5) {
      return res.status(400).json({ success: false, error: 'Overall rating between 1 and 5 is required.' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User authentication required.' });
    }

    const existingRating = await prisma.candidateRating.findFirst({
      where: { id: ratingId, applicationId },
    });

    if (!existingRating) {
      return res.status(404).json({ success: false, error: 'Rating not found.' });
    }

    const rating = await prisma.candidateRating.update({
      where: { id: ratingId },
      data: {
        overallRating: parsedOverallRating,
        communicationRating: parseOptionalRatingValue(communicationRating),
        technicalRating: parseOptionalRatingValue(technicalRating),
        experienceRating: parseOptionalRatingValue(experienceRating),
        cultureFitRating: parseOptionalRatingValue(cultureFitRating),
        feedback: feedback?.trim() || null,
      },
      include: { evaluator: { select: { name: true, email: true } } },
    });

    await recalculateApplicationOverallRating(applicationId);

    await logRecruitmentActivity({
      candidateId: existingRating.candidateId,
      applicationId,
      actorId: userId,
      action: 'RATING_UPDATED',
      title: 'Candidate Rating Updated',
      details: `Overall rating updated to ${parsedOverallRating}/5`,
    });

    res.status(200).json({
      success: true,
      rating,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCandidateRating = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const applicationId = getParamString(req.params.id);
    const ratingId = getParamString(req.params.ratingId);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User authentication required.' });
    }

    const existingRating = await prisma.candidateRating.findFirst({
      where: { id: ratingId, applicationId },
    });

    if (!existingRating) {
      return res.status(404).json({ success: false, error: 'Rating not found.' });
    }

    await prisma.candidateRating.delete({
      where: { id: ratingId },
    });

    await recalculateApplicationOverallRating(applicationId);

    await logRecruitmentActivity({
      candidateId: existingRating.candidateId,
      applicationId,
      actorId: userId,
      action: 'RATING_DELETED',
      title: 'Candidate Rating Deleted',
      details: `Removed rating ${existingRating.overallRating}/5`,
    });

    res.status(200).json({
      success: true,
      message: 'Rating deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

// ==================== INTERVIEW MANAGEMENT ====================

export const getAdminInterviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, interviewerId, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.InterviewWhereInput = {};

    if (status && typeof status === 'string' && status.trim()) {
      where.status = status.trim() as InterviewStatus;
    }

    if (interviewerId && typeof interviewerId === 'string' && interviewerId.trim()) {
      where.interviewerId = interviewerId.trim();
    }

    const selectCandidateBasic = {
      select: { id: true, fullName: true, email: true, mobile: true },
    };

    const [interviewsRaw, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        skip,
        take: limitNum,
        select: {
          id: true,
          scheduledAt: true,
          durationMinutes: true,
          type: true,
          status: true,
          meetingUrl: true,
          location: true,
          notes: true,
          candidate: selectCandidateBasic,
          job: { select: { id: true, title: true, jobCode: true } },
          interviewer: { select: { id: true, name: true, email: true } },
          application: {
            select: {
              id: true,
              applicationRef: true,
              currentStage: true,
              ratings: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true,
                  overallRating: true,
                  communicationRating: true,
                  technicalRating: true,
                  experienceRating: true,
                  cultureFitRating: true,
                  feedback: true,
                  createdAt: true,
                  evaluator: { select: { name: true, email: true } },
                },
              },
            },
          },
          feedback: {
            take: 3,
            orderBy: { submittedAt: 'desc' },
            select: {
              id: true,
              overallRating: true,
              recommendation: true,
              strengths: true,
              notes: true,
              interviewer: { select: { name: true } },
            },
          },
        },
      }),
      prisma.interview.count({ where }),
    ]);

    const interviews = interviewsRaw.map((interview) => ({
      id: interview.id,
      interviewType: interview.type,
      scheduledAt: interview.scheduledAt,
      durationMinutes: interview.durationMinutes,
      meetingUrl: interview.meetingUrl,
      meetingLocation: interview.location,
      status: interview.status,
      interviewerName: interview.interviewer?.name || null,
      interviewerEmail: interview.interviewer?.email || null,
      notes: interview.notes,
      application: {
        ...interview.application,
        candidate: interview.candidate,
        job: interview.job,
      },
      ratings: interview.application.ratings,
      feedback: interview.feedback.map((item) => ({
        id: item.id,
        interviewerName: item.interviewer?.name || 'Interviewer',
        rating: item.overallRating,
        recommendation: item.recommendation,
        strengths: item.strengths,
        comments: item.notes,
      })),
    }));

    res.status(200).json({
      success: true,
      interviews,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const scheduleInterview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { applicationId, scheduledAt, durationMinutes, type, interviewerId, meetingUrl, location, notes } = req.body;
    const userId = req.user?.id || null;

    if (!applicationId || !scheduledAt) {
      return res.status(400).json({ success: false, error: 'Application and scheduled date/time are required.' });
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { candidate: true, job: true },
    });

    if (!application) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const interview = await prisma.interview.create({
      data: {
        applicationId,
        candidateId: application.candidateId,
        jobId: application.jobId,
        scheduledAt: new Date(scheduledAt),
        durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : 30,
        type: (type as InterviewType) || 'VIDEO',
        status: 'SCHEDULED',
        interviewerId: interviewerId || userId,
        meetingUrl: meetingUrl?.trim() || null,
        location: location?.trim() || null,
        notes: notes?.trim() || null,
        createdById: userId,
      },
      include: {
        candidate: true,
        job: true,
        interviewer: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.jobApplication.update({
      where: { id: applicationId },
      data: { currentStage: 'INTERVIEW_SCHEDULED' },
    });

    await prisma.applicationStageHistory.create({
      data: {
        applicationId,
        fromStage: application.currentStage,
        toStage: 'INTERVIEW_SCHEDULED',
        changedById: userId,
        notes: `Scheduled ${type} interview for ${new Date(scheduledAt).toLocaleString()}`,
      },
    });

    await logRecruitmentActivity({
      candidateId: application.candidateId,
      applicationId,
      actorId: userId,
      action: 'INTERVIEW_SCHEDULED',
      title: 'Interview Scheduled',
      details: `${type} interview scheduled for ${new Date(scheduledAt).toLocaleString()}`,
    });

    const candidateUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(application.candidate.email ? [{ email: application.candidate.email }] : []),
          ...(application.candidate.mobile ? [{ mobile: application.candidate.mobile }] : []),
        ],
      },
    });

    if (candidateUser) {
      await prisma.notification.create({
        data: {
          userId: candidateUser.id,
          title: 'Interview Scheduled',
          message: `An interview has been scheduled for your application to ${application.job.title} on ${new Date(scheduledAt).toLocaleString()}.`,
          type: 'INFO',
          link: '/profile?tab=applications',
        },
      });
    }

    dispatchRecruitmentCandidateWhatsApp({
      eventCode: 'RECRUITMENT_INTERVIEW_SCHEDULED',
      relatedEntityType: 'INTERVIEW',
      relatedEntityId: interview.id,
      candidate: application.candidate,
      payloadSnapshot: { applicationId, applicationRef: application.applicationRef, jobTitle: application.job.title, scheduledAt: interview.scheduledAt.toISOString(), interviewType: interview.type },
    });

    res.status(201).json({
      success: true,
      interview,
      message: 'Interview scheduled successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const updateInterview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { scheduledAt, durationMinutes, type, interviewerId, meetingUrl, location, notes, status } = req.body;
    const userId = req.user?.id || null;
    const validStatuses = ['SCHEDULED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED'] as const;
    const validTypes = ['VIDEO', 'PHONE', 'IN_PERSON'] as const;

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: { application: true, candidate: true, job: true },
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found.' });
    }

    if (status !== undefined && (typeof status !== 'string' || !validStatuses.includes(status as (typeof validStatuses)[number]))) {
      return res.status(400).json({ success: false, error: 'Invalid interview status.' });
    }

    if (type !== undefined && (typeof type !== 'string' || !validTypes.includes(type as (typeof validTypes)[number]))) {
      return res.status(400).json({ success: false, error: 'Invalid interview type.' });
    }

    const nextStatus = (status || interview.status) as InterviewStatus;
    const nextStage = nextStatus === 'COMPLETED'
      ? 'INTERVIEW_COMPLETED'
      : nextStatus === 'SCHEDULED' || nextStatus === 'RESCHEDULED'
        ? 'INTERVIEW_SCHEDULED'
        : null;

    const updatedInterview = await prisma.$transaction(async (tx) => {
      const updated = await tx.interview.update({
        where: { id },
        data: {
          scheduledAt: scheduledAt ? new Date(scheduledAt) : interview.scheduledAt,
          durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : interview.durationMinutes,
          type: type ? (type as InterviewType) : interview.type,
          interviewerId: interviewerId !== undefined ? interviewerId : interview.interviewerId,
          meetingUrl: meetingUrl !== undefined ? meetingUrl : interview.meetingUrl,
          location: location !== undefined ? location : interview.location,
          notes: notes !== undefined ? notes : interview.notes,
          status: nextStatus,
        },
      });

      if (nextStage && interview.application.currentStage !== nextStage) {
        await tx.jobApplication.update({
          where: { id: interview.applicationId },
          data: { currentStage: nextStage },
        });

        await tx.applicationStageHistory.create({
          data: {
            applicationId: interview.applicationId,
            fromStage: interview.application.currentStage,
            toStage: nextStage,
            changedById: userId,
            notes: `Interview status changed to ${nextStatus}.`,
          },
        });
      }

      return updated;
    });

    await logRecruitmentActivity({
      candidateId: interview.candidateId,
      applicationId: interview.applicationId,
      actorId: userId,
      action: 'INTERVIEW_UPDATED',
      title: `Interview ${nextStatus}`,
      details: `Interview updated for candidate with status ${nextStatus}.`,
    });

    if (nextStatus === 'RESCHEDULED' || nextStatus === 'CANCELLED') {
      dispatchRecruitmentCandidateWhatsApp({
        eventCode: nextStatus === 'RESCHEDULED' ? 'RECRUITMENT_INTERVIEW_RESCHEDULED' : 'RECRUITMENT_INTERVIEW_CANCELLED',
        relatedEntityType: 'INTERVIEW',
        relatedEntityId: `${id}:${nextStatus}:${updatedInterview.scheduledAt.toISOString()}`,
        candidate: interview.candidate,
        payloadSnapshot: { applicationId: interview.applicationId, applicationRef: interview.application.applicationRef, jobTitle: interview.job.title, scheduledAt: updatedInterview.scheduledAt.toISOString(), interviewType: updatedInterview.type, status: nextStatus },
      });
    }

    res.status(200).json({
      success: true,
      interview: updatedInterview,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteInterview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const interview = await prisma.interview.findUnique({ where: { id }, include: { application: true, candidate: true, job: true } });
    if (!interview) return res.status(404).json({ success: false, error: 'Interview not found.' });

    await prisma.interview.delete({ where: { id } });
    await logRecruitmentActivity({
      candidateId: interview.candidateId,
      applicationId: interview.applicationId,
      actorId: req.user?.id || null,
      action: 'INTERVIEW_DELETED',
      title: 'Interview Deleted',
      details: 'Scheduled interview was deleted.',
    });
    dispatchRecruitmentCandidateWhatsApp({
      eventCode: 'RECRUITMENT_INTERVIEW_CANCELLED',
      relatedEntityType: 'INTERVIEW',
      relatedEntityId: `${id}:DELETED`,
      candidate: interview.candidate,
      payloadSnapshot: { applicationId: interview.applicationId, applicationRef: interview.application.applicationRef, jobTitle: interview.job.title, status: 'CANCELLED' },
    });
    res.status(200).json({ success: true, message: 'Interview deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

export const submitInterviewFeedback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { overallRating, communicationRating, technicalRating, experienceRating, strengths, weaknesses, notes, recommendation } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User authentication required.' });
    }

    const interview = await prisma.interview.findUnique({ where: { id } });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found.' });
    }

    const feedback = await prisma.interviewFeedback.create({
      data: {
        interviewId: id,
        interviewerId: userId,
        overallRating: parseInt(overallRating, 10) || 3,
        communicationRating: communicationRating ? parseInt(communicationRating, 10) : null,
        technicalRating: technicalRating ? parseInt(technicalRating, 10) : null,
        experienceRating: experienceRating ? parseInt(experienceRating, 10) : null,
        strengths: strengths?.trim() || null,
        weaknesses: weaknesses?.trim() || null,
        notes: notes?.trim() || null,
        recommendation: (recommendation as InterviewRecommendation) || 'HIRE',
      },
    });

    await prisma.interview.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    await prisma.jobApplication.update({
      where: { id: interview.applicationId },
      data: { currentStage: 'INTERVIEW_COMPLETED' },
    });

    await logRecruitmentActivity({
      candidateId: interview.candidateId,
      applicationId: interview.applicationId,
      actorId: userId,
      action: 'INTERVIEW_FEEDBACK_SUBMITTED',
      title: 'Interview Feedback Logged',
      details: `Recommendation: ${recommendation || 'HIRE'}, Overall Rating: ${overallRating}/5`,
    });

    res.status(201).json({
      success: true,
      feedback,
    });
  } catch (error) {
    next(error);
  }
};

// ==================== OFFER MANAGEMENT ====================

export const getAdminOffers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.OfferWhereInput = {};
    if (status && typeof status === 'string' && status.trim()) {
      where.status = status.trim() as OfferStatus;
    }

    const selectCandidateBasic = {
      select: { id: true, fullName: true, email: true, mobile: true },
    };

    const [offersRaw, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        select: {
          id: true,
          designation: true,
          ctc: true,
          joiningLocation: true,
          joiningDate: true,
          offerValidUntil: true,
          status: true,
          createdAt: true,
          candidate: selectCandidateBasic,
          job: { select: { id: true, title: true, jobCode: true } },
          application: { select: { id: true, applicationRef: true } },
        },
      }),
      prisma.offer.count({ where }),
    ]);

    const offers = offersRaw.map((offer, index) => ({
      id: offer.id,
      offerRef: `OFFER-${new Date(offer.createdAt).getFullYear()}-${String(skip + index + 1).padStart(4, '0')}`,
      designation: offer.designation,
      annualCtc: Number(offer.ctc),
      workLocation: offer.joiningLocation,
      joiningDate: offer.joiningDate,
      expiryDate: offer.offerValidUntil,
      status: offer.status,
      createdAt: offer.createdAt,
      application: {
        ...offer.application,
        candidate: offer.candidate,
        job: offer.job,
      },
    }));

    res.status(200).json({
      success: true,
      offers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { applicationId, designation, department, joiningLocation, ctc, joiningDate, probationPeriod, reportingManager, offerValidUntil, additionalTerms } = req.body;
    const userId = req.user?.id || null;

    if (!applicationId || !designation || !ctc) {
      return res.status(400).json({ success: false, error: 'Application, designation, and CTC are required.' });
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { candidate: true, job: { include: { department: true } } },
    });

    if (!application) {
      return res.status(404).json({ success: false, error: 'Application record not found.' });
    }

    const offer = await prisma.offer.create({
      data: {
        applicationId,
        candidateId: application.candidateId,
        jobId: application.jobId,
        designation: designation.trim(),
        department: department?.trim() || application.job.department.name,
        joiningLocation: joiningLocation?.trim() || `${application.job.locationCity}, ${application.job.locationState}`,
        ctc: parseFloat(ctc),
        joiningDate: joiningDate ? new Date(joiningDate) : null,
        probationPeriod: probationPeriod?.trim() || null,
        reportingManager: reportingManager?.trim() || null,
        offerValidUntil: offerValidUntil ? new Date(offerValidUntil) : null,
        additionalTerms: additionalTerms?.trim() || null,
        status: 'SENT',
        createdById: userId,
        sentAt: new Date(),
      },
    });

    await prisma.jobApplication.update({
      where: { id: applicationId },
      data: { currentStage: 'OFFER_SENT' },
    });

    await logRecruitmentActivity({
      candidateId: application.candidateId,
      applicationId,
      actorId: userId,
      action: 'OFFER_CREATED',
      title: 'Employment Offer Sent',
      details: `Offer created for designation "${designation}" with CTC ₹${ctc}`,
    });

    const candidateUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(application.candidate.email ? [{ email: application.candidate.email }] : []),
          ...(application.candidate.mobile ? [{ mobile: application.candidate.mobile }] : []),
        ],
      },
    });

    if (candidateUser) {
      await prisma.notification.create({
        data: {
          userId: candidateUser.id,
          title: 'Offer Sent',
          message: `An employment offer has been sent for your application to ${application.job.title}.`,
          type: 'SUCCESS',
          link: '/profile?tab=applications',
        },
      });
    }

    dispatchRecruitmentCandidateWhatsApp({
      eventCode: 'RECRUITMENT_OFFER_SENT',
      relatedEntityType: 'OFFER',
      relatedEntityId: offer.id,
      candidate: application.candidate,
      payloadSnapshot: { applicationId, applicationRef: application.applicationRef, jobTitle: application.job.title, designation: offer.designation },
    });

    res.status(201).json({
      success: true,
      offer,
      message: 'Offer sent successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const updateOfferStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { status, offerLetterUrl } = req.body;
    const userId = req.user?.id || null;
    const validStatuses = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'] as const;

    if (typeof status !== 'string' || !validStatuses.includes(status as (typeof validStatuses)[number])) {
      return res.status(400).json({ success: false, error: 'Invalid offer status.' });
    }

    const offer = await prisma.offer.findUnique({
      where: { id },
      include: { application: true, candidate: true, job: true },
    });

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found.' });
    }

    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: {
        status: status as OfferStatus,
        offerLetterUrl: offerLetterUrl !== undefined ? offerLetterUrl : offer.offerLetterUrl,
        sentAt: status === 'SENT' ? new Date() : offer.sentAt,
        respondedAt: status === 'ACCEPTED' || status === 'DECLINED' ? new Date() : offer.respondedAt,
      },
    });

    let targetStage = offer.application.currentStage;
    if (status === 'SENT') targetStage = 'OFFER_SENT';
    if (status === 'ACCEPTED') targetStage = 'OFFER_ACCEPTED';

    if (targetStage !== offer.application.currentStage) {
      await prisma.jobApplication.update({
        where: { id: offer.applicationId },
        data: { currentStage: targetStage },
      });
    }

    await logRecruitmentActivity({
      candidateId: offer.candidateId,
      applicationId: offer.applicationId,
      actorId: userId,
      action: 'OFFER_STATUS_UPDATED',
      title: `Offer Status: ${status}`,
      details: `Offer state changed to ${status}`,
    });

    dispatchRecruitmentCandidateWhatsApp({
      eventCode: 'RECRUITMENT_OFFER_STATUS_UPDATED',
      relatedEntityType: 'OFFER_STATUS',
      relatedEntityId: `${offer.id}:${status}`,
      candidate: offer.candidate,
      payloadSnapshot: { applicationId: offer.applicationId, applicationRef: offer.application.applicationRef, jobTitle: offer.job.title, offerStatus: status },
    });

    res.status(200).json({
      success: true,
      offer: updatedOffer,
    });
  } catch (error) {
    next(error);
  }
};

export const updateOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const existing = await prisma.offer.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Offer not found.' });

    const { designation, department, joiningLocation, ctc, joiningDate, offerValidUntil, probationPeriod, reportingManager, additionalTerms } = req.body;
    if (!designation || !ctc) return res.status(400).json({ success: false, error: 'Designation and CTC are required.' });

    const offer = await prisma.offer.update({
      where: { id },
      data: {
        designation: String(designation).trim(),
        department: department !== undefined ? String(department).trim() : existing.department,
        joiningLocation: joiningLocation !== undefined ? String(joiningLocation).trim() : existing.joiningLocation,
        ctc: Number(ctc),
        joiningDate: joiningDate ? new Date(joiningDate) : null,
        offerValidUntil: offerValidUntil ? new Date(offerValidUntil) : null,
        probationPeriod: probationPeriod !== undefined ? String(probationPeriod).trim() || null : existing.probationPeriod,
        reportingManager: reportingManager !== undefined ? String(reportingManager).trim() || null : existing.reportingManager,
        additionalTerms: additionalTerms !== undefined ? String(additionalTerms).trim() || null : existing.additionalTerms,
      },
    });
    res.status(200).json({ success: true, offer, message: 'Offer updated successfully.' });
  } catch (error) {
    next(error);
  }
};

export const deleteOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const offer = await prisma.offer.findUnique({ where: { id } });
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found.' });
    await prisma.offer.delete({ where: { id } });
    await logRecruitmentActivity({
      candidateId: offer.candidateId,
      applicationId: offer.applicationId,
      actorId: req.user?.id || null,
      action: 'OFFER_DELETED',
      title: 'Employment Offer Deleted',
      details: 'Offer draft was deleted.',
    });
    res.status(200).json({ success: true, message: 'Offer deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// ==================== SETTINGS & EMAIL TEMPLATES ====================

export const getRecruitmentSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDefaultRecruitmentData();
    const section = typeof req.query.section === 'string' ? req.query.section : 'all';

    const fetchDepartments = () => prisma.jobDepartment.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        _count: { select: { jobs: true } },
      },
    });
    const fetchStages = async () => {
      const [stages, usageCounts] = await Promise.all([
        prisma.applicationStage.findMany({
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            code: true,
            order: true,
            color: true,
            isSystem: true,
            isTerminal: true,
          },
        }),
        getStageUsageCounts(),
      ]);

      return stages.map((stage) => serializeApplicationStage(stage, usageCounts.get(stage.code) || 0));
    };
    const fetchTemplates = () => prisma.recruitmentEmailTemplate.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, subject: true, bodyHtml: true, variables: true, isSystem: true },
    });

    const [departments, stages, templates] = await Promise.all([
      section === 'all' || section === 'departments' ? fetchDepartments() : Promise.resolve([]),
      section === 'all' || section === 'pipeline' ? fetchStages() : Promise.resolve([]),
      section === 'all' || section === 'templates' ? fetchTemplates() : Promise.resolve([]),
    ]);

    const emailTemplates = templates.map((template) => ({
      id: template.id,
      name: template.name,
      type: template.code,
      subject: template.subject,
      body: template.bodyHtml,
      isDefault: template.isSystem,
    }));

    res.status(200).json({
      success: true,
      departments,
      stages,
      templates: emailTemplates,
      data: {
        departments: departments.map((department) => ({
          ...department,
          isActive: true,
        })),
        stages,
        emailTemplates,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createPipelineStage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDefaultRecruitmentData();
    const { name, code, order, color, isTerminal } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Stage name is required.' });
    }

    const cleanName = String(name).trim();
    const cleanCode = normalizeStageCode(code, cleanName);
    const cleanOrder = parseStageOrder(order, (await prisma.applicationStage.count()) + 1);
    const cleanColor = parseStageColor(color);
    const cleanIsTerminal = isTerminal === true || isTerminal === 'true' || isTerminal === 1 || isTerminal === '1';

    const duplicate = await prisma.applicationStage.findFirst({
      where: {
        OR: [
          { name: { equals: cleanName, mode: 'insensitive' } },
          { code: { equals: cleanCode, mode: 'insensitive' } },
        ],
      },
    });

    if (duplicate) {
      return res.status(400).json({ success: false, error: 'A pipeline stage with this name or code already exists.' });
    }

    const stage = await prisma.applicationStage.create({
      data: {
        name: cleanName,
        code: cleanCode,
        order: cleanOrder,
        color: cleanColor,
        isSystem: false,
        isTerminal: cleanIsTerminal,
      },
    });

    res.status(201).json({
      success: true,
      stage: serializeApplicationStage(stage, 0),
      message: 'Pipeline stage created successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const updatePipelineStage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDefaultRecruitmentData();
    const id = getParamString(req.params.id);
    const { name, code, order, color, isTerminal } = req.body;

    const existing = await prisma.applicationStage.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Pipeline stage not found.' });
    }

    const cleanName = name && String(name).trim() ? String(name).trim() : existing.name;
    const cleanCode = code && String(code).trim()
      ? normalizeStageCode(code, cleanName)
      : existing.code;
    const cleanOrder = order !== undefined ? parseStageOrder(order, existing.order) : existing.order;
    const cleanColor = color !== undefined ? parseStageColor(color, existing.color || 'blue') : existing.color || 'blue';
    const cleanIsTerminal = isTerminal !== undefined
      ? (isTerminal === true || isTerminal === 'true' || isTerminal === 1 || isTerminal === '1')
      : existing.isTerminal;

    const duplicate = await prisma.applicationStage.findFirst({
      where: {
        id: { not: id },
        OR: [
          { name: { equals: cleanName, mode: 'insensitive' } },
          { code: { equals: cleanCode, mode: 'insensitive' } },
        ],
      },
    });

    if (duplicate) {
      return res.status(400).json({ success: false, error: 'Another pipeline stage with this name or code already exists.' });
    }

    const stage = await prisma.$transaction(async (tx) => {
      if (cleanCode !== existing.code) {
        await tx.jobApplication.updateMany({
          where: { currentStage: existing.code },
          data: { currentStage: cleanCode },
        });
      }

      return tx.applicationStage.update({
        where: { id },
        data: {
          name: cleanName,
          code: cleanCode,
          order: cleanOrder,
          color: cleanColor,
          isTerminal: cleanIsTerminal,
        },
      });
    });

    res.status(200).json({
      success: true,
      stage: serializeApplicationStage(stage, await prisma.jobApplication.count({ where: { currentStage: stage.code } })),
      message: 'Pipeline stage updated successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const deletePipelineStage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDefaultRecruitmentData();
    const id = getParamString(req.params.id);

    const stage = await prisma.applicationStage.findUnique({ where: { id } });
    if (!stage) {
      return res.status(404).json({ success: false, error: 'Pipeline stage not found.' });
    }

    const usageCount = await prisma.jobApplication.count({ where: { currentStage: stage.code } });
    if (usageCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete "${stage.name}" because ${usageCount} application(s) are currently using it.`,
      });
    }

    await prisma.applicationStage.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: 'Pipeline stage deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminDepartments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDefaultRecruitmentData();
    const { q, compact } = req.query;
    const where: Prisma.JobDepartmentWhereInput = {};

    if (q && typeof q === 'string' && q.trim()) {
      const query = q.trim();
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { code: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    const departments = await prisma.jobDepartment.findMany({
      where,
      orderBy: { name: 'asc' },
      select: compact === 'true' || compact === '1'
        ? { id: true, name: true, code: true }
        : {
            id: true,
            name: true,
            code: true,
            description: true,
            createdAt: true,
            _count: { select: { jobs: true } },
          },
    });

    res.status(200).json({
      success: true,
      departments,
    });
  } catch (error) {
    next(error);
  }
};

export const createAdminDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, code, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Department name is required.' });
    }

    const cleanName = name.trim();
    let cleanCode = code && typeof code === 'string' && code.trim()
      ? code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
      : cleanName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

    if (!cleanCode) {
      cleanCode = `DEPT_${Date.now()}`;
    }

    const existing = await prisma.jobDepartment.findFirst({
      where: {
        OR: [
          { name: { equals: cleanName, mode: 'insensitive' } },
          { code: { equals: cleanCode, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'Department with this name or code already exists.' });
    }

    const department = await prisma.jobDepartment.create({
      data: {
        name: cleanName,
        code: cleanCode,
        description: description && typeof description === 'string' ? description.trim() : null,
      },
      include: {
        _count: {
          select: { jobs: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      department,
      message: 'Department created successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const updateAdminDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { name, code, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Department name is required.' });
    }

    const cleanName = name.trim();
    let cleanCode = code && typeof code === 'string' && code.trim()
      ? code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
      : cleanName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

    if (!cleanCode) {
      cleanCode = `DEPT_${Date.now()}`;
    }

    const existingDept = await prisma.jobDepartment.findUnique({ where: { id } });
    if (!existingDept) {
      return res.status(404).json({ success: false, error: 'Department not found.' });
    }

    const duplicate = await prisma.jobDepartment.findFirst({
      where: {
        id: { not: id },
        OR: [
          { name: { equals: cleanName, mode: 'insensitive' } },
          { code: { equals: cleanCode, mode: 'insensitive' } },
        ],
      },
    });

    if (duplicate) {
      return res.status(400).json({ success: false, error: 'Another department with this name or code already exists.' });
    }

    const department = await prisma.jobDepartment.update({
      where: { id },
      data: {
        name: cleanName,
        code: cleanCode,
        description: description !== undefined ? (description && typeof description === 'string' ? description.trim() : null) : existingDept.description,
      },
      include: {
        _count: {
          select: { jobs: true },
        },
      },
    });

    res.status(200).json({
      success: true,
      department,
      message: 'Department updated successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAdminDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);

    const department = await prisma.jobDepartment.findUnique({
      where: { id },
      include: { _count: { select: { jobs: true } } },
    });

    if (!department) {
      return res.status(404).json({ success: false, error: 'Department not found.' });
    }

    if (department._count.jobs > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete department "${department.name}" because it has ${department._count.jobs} job posting(s) associated with it.`,
      });
    }

    await prisma.jobDepartment.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const updateDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { name, code, description } = req.body;

    if (id === 'new') {
      const dept = await prisma.jobDepartment.create({
        data: {
          name: name.trim(),
          code: (code || name).toUpperCase().replace(/[^A_Z0-9]/g, '_'),
          description: description?.trim() || null,
        },
      });
      return res.status(201).json({ success: true, department: dept });
    }

    const dept = await prisma.jobDepartment.update({
      where: { id },
      data: {
        name: name?.trim(),
        description: description?.trim() !== undefined ? description.trim() : undefined,
      },
    });

    res.status(200).json({ success: true, department: dept });
  } catch (error) {
    next(error);
  }
};

export const updateEmailTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { subject, bodyHtml } = req.body;

    const tpl = await prisma.recruitmentEmailTemplate.update({
      where: { id },
      data: {
        subject: subject?.trim(),
        bodyHtml: bodyHtml?.trim(),
      },
    });

    res.status(200).json({ success: true, template: tpl });
  } catch (error) {
    next(error);
  }
};
