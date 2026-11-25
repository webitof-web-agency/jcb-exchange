import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma';
import {
  deleteFileFromDrive,
  extractDriveFileId,
  makeDriveFilePrivate,
  streamDriveMediaWithHeaders,
  streamFileFromDrive,
  uploadFileToDrive,
} from '../services/googleDrive.service';
import { secureUploadDir } from '../utils/documentUpload';
import { getSecureDocumentUrl } from '../utils/secureDocumentUrl';
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
import { normalizeOfferLetterData, validateOfferLetterData, type OfferLetterData } from '../utils/offerLetter';
import { validateField } from '../utils/fieldValidation';
import { sanitizeEmailHtml } from '../utils/htmlSanitizer';
import { dispatchOfferCommunications, parseOfferChannels } from '../services/recruitmentOfferCommunication.service';
import { lookupOfferShortLink } from '../services/offerShortLink.service';
import { verifyOfferResponseToken } from '../utils/offerResponseToken';
import { communicationEventRegistry, getCommunicationEvent, getEmailAttachmentModeForEvent, getEmailEventCodeForTemplateCode } from '../services/communicationEventRegistry';
import { buildEmailTemplateDeletePlan } from '../services/emailTemplateLifecycle';
import { handOfferToHrm, handOfferToHrmQuietly } from '../modules/hrm/services/offerHandoff.service';
import { HrmHttpError } from '../modules/hrm/errors';
import {
  OfferAcceptanceConflict,
  recordOfferAcceptance,
  validateCandidateAcceptance,
} from '../services/offerAcceptance.service';
import { getOfferFormOptions as loadOfferFormOptions, resolveOfferPlacement, searchOfferReportingManagers, type OfferPlacement } from '../modules/hrm/services/offerPlacement.service';
import {
  annualCtcFrom,
  canDeleteOffer,
  canEditOffer,
  describeOfferStatusChangeBlock,
  isOfferStatus,
  normalizeSalaryComponents,
  totalSalaryComponents,
  type SalaryComponent,
} from '../utils/offerRules';

const getParamString = (param: unknown): string => {
  if (typeof param === 'string') return param;
  if (Array.isArray(param) && typeof param[0] === 'string') return param[0];
  return '';
};

const getOfferResponse = async (token: string) => {
  const payload = verifyOfferResponseToken(token);
  if (!payload) return null;
  const offer = await prisma.offer.findUnique({
    where: { id: payload.offerId },
    include: { candidate: true, job: true, application: true },
  });
  if (!offer || offer.responseTokenVersion !== payload.version) return null;
  return { offer, payload };
};

const notifyOfferResponse = async (offer: { id: string; candidate: { fullName: string }; job: { title: string }; createdById: string | null }, status: 'ACCEPTED' | 'DECLINED' | 'EXPIRED') => {
  const recipients = await prisma.user.findMany({
    where: { status: 'ACTIVE', OR: [{ role: 'SUPER_ADMIN' }, ...(offer.createdById ? [{ id: offer.createdById }] : [])] },
    select: { id: true },
  });
  await Promise.all(recipients.map((recipient) => {
    const dedupeKey = `${offer.id}:response:${status}:${recipient.id}`;
    return prisma.notification.upsert({
      where: { dedupeKey },
      create: {
        userId: recipient.id,
        title: `Offer ${status === 'ACCEPTED' ? 'Accepted' : status === 'DECLINED' ? 'Declined' : 'Expired'}`,
        message: `${offer.candidate.fullName}'s offer for ${offer.job.title} has ${status === 'ACCEPTED' ? 'been accepted' : status === 'DECLINED' ? 'been declined' : 'expired'}.`,
        type: status === 'ACCEPTED' ? 'SUCCESS' : status === 'DECLINED' ? 'WARNING' : 'INFO',
        link: '/admin/recruitment/offers',
        dedupeKey,
      },
      update: {},
    });
  }));
};

type AcceptedOfferForMessages = {
  id: string;
  applicationId: string;
  designation: string;
  joiningDate: Date | null;
  respondedAt: Date | null;
  acceptanceMethod: string | null;
  acceptanceCertificateUrl: string | null;
  responseTokenVersion: number;
  createdById: string | null;
  candidate: { fullName: string; mobile?: string | null; email?: string | null };
  application: { applicationRef: string };
  job: { title: string };
};

const offerDay = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : '');
// A moment in time (when the candidate accepted) is shown as the Indian calendar day.
const indiaDay = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);

/**
 * After an acceptance (signed on the link or recorded by HR from a paper copy): the candidate gets the confirmation
 * (with the acceptance certificate on email / WhatsApp, text on SMS) and the offer's creator plus the Super Admins get
 * an alert. WhatsApp and SMS go only after HR picks the approved template / DLT id and switches the event on; email
 * uses the default template and is on unless HR switches it off (Settings > Email > Recruitment).
 */
const dispatchOfferAcceptedMessages = async (offer: AcceptedOfferForMessages) => {
  const common = {
    candidateName: offer.candidate.fullName,
    applicationId: offer.applicationId,
    applicationRef: offer.application.applicationRef,
    jobTitle: offer.job.title,
    designation: offer.designation,
    joiningDate: offerDay(offer.joiningDate),
    acceptedOn: indiaDay(offer.respondedAt ?? new Date()),
  };
  void dispatchRecruitmentWhatsApp({
    eventCode: 'RECRUITMENT_OFFER_ACCEPTED',
    relatedEntityType: 'OFFER',
    relatedEntityId: offer.id,
    recipientType: 'CANDIDATE',
    recipientPhone: offer.candidate.mobile,
    recipientEmail: offer.candidate.email,
    payloadSnapshot: {
      ...common,
      acceptanceMethod: offer.acceptanceMethod ?? '',
      // A secure (signed-in) document URL, not a bearer link: the WhatsApp document header / email attachment.
      acceptanceDocumentUrl: offer.acceptanceCertificateUrl ?? '',
      acceptanceDocumentFileName: `Offer_Acceptance_${offer.application.applicationRef}.pdf`,
    },
  });
  try {
    const superAdmins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, select: { id: true, mobile: true, whatsappNumber: true, email: true } });
    const creator = offer.createdById && !superAdmins.some((user) => user.id === offer.createdById)
      ? await prisma.user.findFirst({ where: { id: offer.createdById, status: 'ACTIVE' }, select: { id: true, mobile: true, whatsappNumber: true, email: true } })
      : null;
    for (const [user, recipientType] of [...superAdmins.map((user) => [user, 'SUPER_ADMIN'] as const), ...(creator ? [[creator, 'RECRUITER'] as const] : [])]) {
      void dispatchRecruitmentWhatsApp({
        eventCode: 'RECRUITMENT_OFFER_ACCEPTED_HR',
        relatedEntityType: 'OFFER',
        relatedEntityId: offer.id,
        recipientType,
        recipientPhone: user.whatsappNumber || user.mobile,
        recipientEmail: user.email,
        // The certificate too, for a template with a DOCUMENT header (a secure signed-in URL, not a bearer link).
        payloadSnapshot: { ...common, acceptanceDocumentUrl: offer.acceptanceCertificateUrl ?? '', acceptanceDocumentFileName: `Offer_Acceptance_${offer.application.applicationRef}.pdf` },
      });
    }
  } catch (error) {
    console.error('[recruitment] offer accepted HR alert failed:', error instanceof Error ? error.message : error);
  }
};

const notifyOfferResponseSafely = async (offer: Parameters<typeof notifyOfferResponse>[0], status: Parameters<typeof notifyOfferResponse>[1]) => {
  try {
    await notifyOfferResponse(offer, status);
  } catch (error) {
    console.error('[recruitment] offer response notification failed:', error instanceof Error ? error.message : error);
  }
};

/**
 * An accepted offer becomes an HRM record. The acceptance is already saved when this runs, so a failure here is
 * logged for HR (the record can be created again from HRM: POST /hrm/onboarding/from-offer/:offerId) and never shown
 * to the candidate as an error. The audit names the offer's creator (or an active Super Admin) with their real role.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const handOfferToHrmSafely = async (offer: { id: string }, _ipAddress?: string | null) => {
  // Failures are recorded on the offer (hrmHandoffStatus FAILED) and retried by the background worker.
  await handOfferToHrmQuietly(offer.id);
};

/** HR runs the HRM handoff of an accepted offer again (after fixing a duplicate, a switched-off office, ...). */
export const retryOfferHrmHandoff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const result = await handOfferToHrm(id);
    res.status(200).json({ success: true, result });
  } catch (error) {
    if (sendHrmError(res, error)) return;
    if (error instanceof Error) return res.status(500).json({ success: false, error: `The HRM record could not be created: ${error.message}` });
    next(error);
  }
};

/** HRM validation errors (placement) reach the admin as a normal 4xx answer. */
const sendHrmError = (res: Response, error: unknown) => {
  if (!(error instanceof HrmHttpError)) return false;
  res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  return true;
};

/**
 * What the candidate sees on the offer link: the job they applied for, what they submitted, the offer itself (with
 * the salary breakup) and, once accepted, how it was accepted. Only this candidate's own data.
 */
const buildPublicOfferView = async (offer: Prisma.OfferGetPayload<{ include: { candidate: true; job: true; application: true } }>) => {
  const letter = (offer.offerLetterData && typeof offer.offerLetterData === 'object' ? offer.offerLetterData : {}) as Partial<OfferLetterData> & Record<string, unknown>;
  const snapshot = (offer.application.applicantSnapshot && typeof offer.application.applicantSnapshot === 'object'
    ? offer.application.applicantSnapshot
    : {}) as Record<string, unknown>;
  const answers = await prisma.applicationAnswer.findMany({
    where: { applicationId: offer.applicationId },
    select: { answerText: true, question: { select: { question: true, order: true } } },
    orderBy: { question: { order: 'asc' } },
  });
  const pick = (key: string, fallback: unknown) => (snapshot[key] ?? fallback ?? null);
  const salaryPeriod = letter.salaryPeriod === 'month' ? 'month' : 'annum';
  return {
    id: offer.id,
    status: offer.status,
    companyName: letter.companyName || 'JCB Exchange',
    letterNo: letter.offerLetterNo || null,
    letterDate: letter.letterDate || null,
    candidateName: offer.candidate.fullName,
    jobTitle: offer.job.title,
    designation: offer.designation,
    department: offer.department,
    placeOfPosting: offer.joiningLocation,
    employmentType: offer.employmentType ?? offer.job.employmentType,
    reportingManager: offer.reportingManager,
    joiningDate: offer.joiningDate,
    offerValidUntil: offer.offerValidUntil ?? (typeof letter.offerValidUntil === 'string' && letter.offerValidUntil ? letter.offerValidUntil : null),
    probationPeriod: offer.probationPeriod,
    noticePeriod: letter.noticePeriod || null,
    salary: {
      amount: Number(offer.ctc),
      period: salaryPeriod,
      annualCtc: offer.annualCtc !== null ? Number(offer.annualCtc) : annualCtcFrom(Number(offer.ctc), salaryPeriod),
      components: readStoredComponents(offer.salaryComponents),
    },
    additionalTerms: offer.additionalTerms,
    application: {
      applicationRef: offer.application.applicationRef,
      appliedAt: offer.application.appliedAt,
      jobLocation: [offer.job.locationCity, offer.job.locationState].filter(Boolean).join(', '),
      // Personal details are shown only while the offer is open; once it is answered or closed, the link (which
      // may sit in a mailbox for months) shows the offer and its outcome, not the person's contact data.
      details: offer.status !== 'SENT' ? null : {
        fullName: pick('fullName', offer.candidate.fullName),
        email: pick('email', offer.candidate.email),
        mobile: pick('mobile', offer.candidate.mobile),
        address: pick('address', offer.candidate.address),
        city: pick('currentCity', offer.candidate.currentCity),
        state: pick('state', offer.candidate.state),
        currentCompany: pick('currentCompany', offer.candidate.currentCompany),
        currentDesignation: pick('currentDesignation', offer.candidate.currentDesignation),
        totalExperience: pick('totalExperience', offer.candidate.totalExperience),
        relevantExperience: pick('relevantExperience', offer.candidate.relevantExperience),
        noticePeriod: pick('noticePeriod', offer.candidate.noticePeriod),
      },
      answers: offer.status !== 'SENT' ? [] : answers.map((answer) => ({ question: answer.question.question, answer: answer.answerText ?? '' })),
    },
    offerLetterFileName: offer.offerLetterFileName,
    offerLetterAvailable: Boolean(offer.offerLetterUrl) && offer.status !== 'WITHDRAWN',
    acceptance: offer.status === 'ACCEPTED' ? {
      method: offer.acceptanceMethod,
      name: offer.acceptedName,
      place: offer.acceptedPlace,
      acceptedAt: offer.respondedAt,
      certificateAvailable: Boolean(offer.acceptanceCertificateUrl),
    } : null,
  };
};

export const getPublicOfferResponse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getParamString(req.params.token);
    const response = await getOfferResponse(token);
    if (!response) return res.status(404).json({ success: false, error: 'This offer link is invalid or has been replaced by a newer one.' });

    // The link works until HR marks the offer Expired / Withdrawn or resends it (a resend closes this link).
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.status(200).json({ success: true, offer: await buildPublicOfferView(response.offer) });
  } catch (error) {
    next(error);
  }
};

/** Streams one of the offer's private files (letter, acceptance certificate, signed copy) to the browser. */
const streamOfferFile = async (req: Request, res: Response, fileUrl: string | null, fileName: string, contentType: string, disposition: 'inline' | 'attachment') => {
  const driveFileId = extractDriveFileId(fileUrl);
  if (!driveFileId) {
    res.status(404).json({ success: false, error: 'The file is unavailable.' });
    return;
  }
  const { stream, totalSize, byteRange, headers } = await streamDriveMediaWithHeaders(
    driveFileId,
    typeof req.headers.range === 'string' ? req.headers.range : undefined,
  );
  res.status(byteRange ? 206 : 200);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(fileName).replace(/[\r\n"]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (headers['content-length']) res.setHeader('Content-Length', String(headers['content-length']));
  else if (totalSize !== null) res.setHeader('Content-Length', String(totalSize));
  if (headers['content-range']) res.setHeader('Content-Range', String(headers['content-range']));
  stream.on('error', (error) => { if (!res.headersSent) res.status(502).end(); else res.destroy(error as Error); });
  stream.pipe(res);
};

/** The acceptance certificate, for the candidate who accepted. */
export const getPublicOfferCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const response = await getOfferResponse(getParamString(req.params.token));
    if (!response || response.offer.status !== 'ACCEPTED' || !response.offer.acceptanceCertificateUrl) {
      return res.status(404).json({ success: false, error: 'The acceptance certificate is not available.' });
    }
    await streamOfferFile(req, res, response.offer.acceptanceCertificateUrl, `Offer_Acceptance_${response.offer.application.applicationRef}.pdf`, 'application/pdf', 'attachment');
  } catch (error) {
    next(error);
  }
};

export const getPublicOfferPdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getParamString(req.params.token);
    const response = await getOfferResponse(token);
    if (!response) return res.status(404).json({ success: false, error: 'This offer link is invalid or has expired.' });
    const { offer } = response;
    if (offer.status === 'WITHDRAWN') return res.status(410).json({ success: false, error: 'This offer was withdrawn.' });

    await streamOfferFile(req, res, offer.offerLetterUrl, offer.offerLetterFileName || 'Offer_Letter.pdf', 'application/pdf', req.query.download === '1' ? 'attachment' : 'inline');
  } catch (error) {
    next(error);
  }
};

export const respondToPublicOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getParamString(req.params.token);
    const action = typeof req.body?.action === 'string' ? req.body.action.trim().toUpperCase() : '';
    if (action !== 'ACCEPT' && action !== 'DECLINE') {
      return res.status(400).json({ success: false, error: 'Choose accept or decline for this offer.' });
    }

    const response = await getOfferResponse(token);
    if (!response) return res.status(404).json({ success: false, error: 'This offer link is invalid or has expired.' });
    const { offer, payload } = response;
    if (offer.status !== 'SENT') {
      return res.status(409).json({ success: false, error: `This offer is already ${offer.status.toLowerCase()}.`, status: offer.status });
    }

    if (action === 'ACCEPT') {
      const checked = validateCandidateAcceptance(req.body ?? {}, offer.candidate.fullName, Boolean(req.file));
      if ('error' in checked) return res.status(400).json({ success: false, error: checked.error });
      const file = checked.value.method === 'DRAWN'
        ? { buffer: checked.drawn!, mimeType: 'image/png', originalName: 'signature.png' }
        : checked.value.method === 'UPLOADED_SCAN' && req.file
          ? { buffer: req.file.buffer, mimeType: req.file.mimetype, originalName: req.file.originalname }
          : null;
      let accepted: Awaited<ReturnType<typeof recordOfferAcceptance>>;
      try {
        accepted = await recordOfferAcceptance({
          offer,
          tokenVersion: payload.version,
          method: checked.value.method,
          acceptedName: checked.value.fullName,
          place: checked.value.place,
          ipAddress: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null,
          file,
        });
      } catch (error) {
        if (error instanceof OfferAcceptanceConflict) return res.status(409).json({ success: false, error: error.message });
        throw error;
      }
      // The acceptance is saved: answer the candidate now; HRM and the notifications follow (never as an error).
      res.status(200).json({ success: true, status: 'ACCEPTED', message: 'Thank you. Your acceptance has been recorded.' });
      void (async () => {
        await handOfferToHrmSafely(offer, req.ip);
        await notifyOfferResponseSafely(offer, 'ACCEPTED');
        await dispatchOfferAcceptedMessages({ ...offer, ...accepted, candidate: offer.candidate, application: offer.application, job: offer.job });
      })().catch((error) => console.error('[recruitment] follow-up after offer acceptance failed:', error instanceof Error ? error.message : error));
      return;
    }

    const declineReason = typeof req.body?.declineReason === 'string' ? req.body.declineReason.trim() : '';
    if (declineReason.length < 3 || declineReason.length > 1000) {
      return res.status(400).json({ success: false, error: 'Please provide a decline reason between 3 and 1000 characters.' });
    }
    // Only a decline reaches this point (an acceptance is recorded above, with its evidence).
    const status = 'DECLINED' as 'ACCEPTED' | 'DECLINED';
    const updated = await prisma.$transaction(async (transaction) => {
      const result = await transaction.offer.updateMany({
        where: { id: offer.id, status: 'SENT', responseTokenVersion: payload.version },
        data: { status, respondedAt: new Date(), declineReason: status === 'DECLINED' ? declineReason : null },
      });
      if (result.count !== 1) return null;
      const nextStage = status === 'ACCEPTED' ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED';
      await transaction.jobApplication.update({
        where: { id: offer.applicationId },
        data: { currentStage: nextStage, terminalStatus: status === 'DECLINED' ? 'Offer Declined' : null },
      });
      await transaction.applicationStageHistory.create({
        data: {
          applicationId: offer.applicationId,
          fromStage: offer.application.currentStage,
          toStage: nextStage,
          fromTerminalStatus: offer.application.terminalStatus,
          toTerminalStatus: status === 'DECLINED' ? 'Offer Declined' : null,
          changedById: null,
          notes: status === 'DECLINED' ? declineReason : 'Candidate accepted the offer.',
        },
      });
      await transaction.recruitmentActivityLog.create({
        data: {
          candidateId: offer.candidateId,
          applicationId: offer.applicationId,
          actorId: null,
          action: `OFFER_${status}`,
          title: `Candidate ${status === 'ACCEPTED' ? 'Accepted' : 'Declined'} Offer`,
          details: 'Candidate response received through the secure offer link.',
          metadata: {
            responseTokenVersion: payload.version,
            source: 'PUBLIC_OFFER_LINK',
            ...(status === 'DECLINED' ? { declineReason } : {}),
            ...(req.ip ? { ip: req.ip } : {}),
            ...(req.get('user-agent') ? { userAgent: req.get('user-agent') } : {}),
          },
        },
      });
      return transaction.offer.findUnique({ where: { id: offer.id } });
    });
    if (!updated) return res.status(409).json({ success: false, error: 'This offer has already received a response.' });
    await notifyOfferResponseSafely(offer, status);

    dispatchRecruitmentCandidateWhatsApp({
      eventCode: 'RECRUITMENT_OFFER_STATUS_UPDATED',
      relatedEntityType: 'OFFER_STATUS',
      relatedEntityId: `${offer.id}:${status}`,
      candidate: offer.candidate,
      payloadSnapshot: { applicationId: offer.applicationId, applicationRef: offer.application.applicationRef, jobTitle: offer.job.title, offerStatus: status },
    });

    res.status(200).json({ success: true, status, message: `Offer ${status === 'ACCEPTED' ? 'accepted' : 'declined'} successfully.` });
  } catch (error) {
    next(error);
  }
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
    | 'RECRUITMENT_OFFER_STATUS_UPDATED'
    | 'RECRUITMENT_OFFER_ACCEPTED';
  relatedEntityType: string;
  relatedEntityId: string;
  candidate: { mobile?: string | null; email?: string | null; fullName?: string | null };
  payloadSnapshot: Record<string, unknown>;
}) => {
  void dispatchRecruitmentWhatsApp({
    eventCode,
    relatedEntityType,
    relatedEntityId,
    recipientType: 'CANDIDATE',
    recipientPhone: candidate.mobile,
    recipientEmail: candidate.email,
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
      select: { id: true, mobile: true, whatsappNumber: true, email: true },
    });
    const superAdminIds = new Set(superAdmins.map((user) => user.id));
    superAdmins.forEach((superAdmin) => {
      void dispatchRecruitmentWhatsApp({
        eventCode: 'RECRUITMENT_NEW_APPLICATION_SUPERADMIN',
        relatedEntityType: 'JOB_APPLICATION',
        relatedEntityId: applicationId,
        recipientType: 'SUPER_ADMIN',
        recipientPhone: superAdmin.whatsappNumber || superAdmin.mobile,
        recipientEmail: superAdmin.email,
        payloadSnapshot: { applicationRef, candidateName: candidate.fullName, jobId: job.id, jobTitle: job.title },
      });
    });

    if (!job.createdById || superAdminIds.has(job.createdById)) return;
    const recruiter = await prisma.user.findFirst({
      where: { id: job.createdById, status: 'ACTIVE' },
      select: { mobile: true, whatsappNumber: true, email: true },
    });
    if (!recruiter) return;
    void dispatchRecruitmentWhatsApp({
      eventCode: 'RECRUITMENT_NEW_APPLICATION_RECRUITER',
      relatedEntityType: 'JOB_APPLICATION',
      relatedEntityId: applicationId,
      recipientType: 'RECRUITER',
      recipientPhone: recruiter.whatsappNumber || recruiter.mobile,
      recipientEmail: recruiter.email,
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
  let uploadedResumeFileId: string | null = null;

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
    const email = validateField('email', body.email, 'Email', { field: 'email' });
    const mobile = validateField('mobile', body.mobile, 'Mobile number', { field: 'mobile' });

    if (!fullName || !email || !mobile) {
      return res.status(400).json({
        success: false,
        error: 'Full name, email, and mobile number are required.',
      });
    }

    if (job.resumeRequired && !req.file) {
      return res.status(400).json({
        success: false,
        error: 'Resume document is required to apply for this job.',
      });
    }

    if (job.coverLetterRequired && !(typeof body.coverLetter === 'string' && body.coverLetter.trim().length >= 20)) {
      return res.status(400).json({
        success: false,
        error: 'A cover letter (at least 20 characters) is required to apply for this job.',
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

    // What the applicant typed this time. It is kept on the application; the shared candidate row is only filled
    // where it is empty, so nobody can rewrite another person's profile through the public form.
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '') || null;
    const decimal = (value: unknown) => {
      const parsed = typeof value === 'string' && value.trim() ? Number.parseFloat(value) : NaN;
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };
    const submitted = {
      fullName,
      email,
      mobile,
      currentCity: text(body.currentCity),
      state: text(body.state),
      address: text(body.address),
      currentCompany: text(body.currentCompany),
      currentDesignation: text(body.currentDesignation),
      totalExperience: decimal(body.totalExperience),
      relevantExperience: decimal(body.relevantExperience),
      currentCtc: decimal(body.currentCtc),
      expectedCtc: decimal(body.expectedCtc),
      noticePeriod: text(body.noticePeriod),
      employmentStatus: (text(body.employmentStatus) as CandidateEmploymentStatus | null),
      linkedInUrl: text(body.linkedInUrl),
      portfolioUrl: text(body.portfolioUrl),
      coverLetter: text(body.coverLetter),
    };

    // One person = one candidate row. An email of one person with the mobile of another is refused instead of
    // silently merging two people.
    const [byEmail, byMobile] = await Promise.all([
      prisma.candidate.findUnique({ where: { email } }),
      prisma.candidate.findUnique({ where: { mobile } }),
    ]);
    if (byEmail && byMobile && byEmail.id !== byMobile.id) {
      return res.status(409).json({
        success: false,
        error: 'This email and mobile number belong to different applicants. Use the email and mobile you applied with before, or contact HR.',
      });
    }
    const existingCandidate = byEmail ?? byMobile;

    if (existingCandidate) {
      const existingApp = await prisma.jobApplication.findUnique({
        where: { jobId_candidateId: { jobId: job.id, candidateId: existingCandidate.id } },
      });
      if (existingApp) {
        return res.status(400).json({
          success: false,
          error: 'You have already submitted an application for this position.',
          alreadyApplied: true,
          applicationRef: existingApp.applicationRef,
        });
      }
    }

    let resumeFileUrl: string | null = null;
    let resumeFileName: string = 'Resume.pdf';
    let resumeFileSize: number | null = null;
    let resumeMimeType: string = 'application/pdf';

    if (req.file) {
      const { fileId } = await uploadFileToDrive(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        undefined,
        { access: 'private' },
      );
      uploadedResumeFileId = fileId;
      resumeFileUrl = getSecureDocumentUrl(fileId);
      resumeFileName = req.file.originalname;
      resumeFileSize = req.file.size;
      resumeMimeType = req.file.mimetype;
    }

    const applicationRef = await generateApplicationRef();
    const validQuestionIds = new Set(job.customQuestions.map((question) => question.id));

    const { candidate, application } = await prisma.$transaction(async (transaction) => {
      const candidateRow = existingCandidate
        ? await transaction.candidate.update({
          where: { id: existingCandidate.id },
          // Only empty fields are filled; what is already on file stays as it is.
          data: Object.fromEntries(Object.entries({
            currentCity: submitted.currentCity, state: submitted.state, address: submitted.address,
            currentCompany: submitted.currentCompany, currentDesignation: submitted.currentDesignation,
            totalExperience: submitted.totalExperience, relevantExperience: submitted.relevantExperience,
            currentCtc: submitted.currentCtc, expectedCtc: submitted.expectedCtc, noticePeriod: submitted.noticePeriod,
            employmentStatus: submitted.employmentStatus, linkedInUrl: submitted.linkedInUrl,
            portfolioUrl: submitted.portfolioUrl, coverLetter: submitted.coverLetter,
          }).filter(([key, value]) => value !== null && (existingCandidate as Record<string, unknown>)[key] == null)) as Prisma.CandidateUpdateInput,
        })
        : await transaction.candidate.create({ data: submitted });

      const applicationRow = await transaction.jobApplication.create({
        data: {
          applicationRef,
          jobId: job.id,
          candidateId: candidateRow.id,
          currentStage: 'NEW',
          isDuplicateOverride: false,
          applicantSnapshot: submitted as Prisma.InputJsonValue,
        },
      });

      for (const [questionId, ansValue] of Object.entries(customAnswers)) {
        if (validQuestionIds.has(questionId) && hasApplicationAnswerValue(ansValue)) {
          await transaction.applicationAnswer.create({
            data: {
              applicationId: applicationRow.id,
              questionId,
              answerText: stringifyApplicationAnswer(ansValue),
              answerJson: typeof ansValue !== 'string' ? (ansValue as Prisma.InputJsonValue) : Prisma.JsonNull,
            },
          });
        }
      }

      if (resumeFileUrl) {
        await transaction.candidateDocument.create({
          data: {
            candidateId: candidateRow.id,
            applicationId: applicationRow.id,
            category: 'RESUME',
            fileName: resumeFileName,
            fileUrl: resumeFileUrl,
            fileSize: resumeFileSize,
            mimeType: resumeMimeType,
          },
        });
      }

      await transaction.applicationStageHistory.create({
        data: { applicationId: applicationRow.id, toStage: 'NEW', notes: 'Application submitted by candidate' },
      });
      return { candidate: candidateRow, application: applicationRow };
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
    if (uploadedResumeFileId) {
      await deleteFileFromDrive(uploadedResumeFileId);
    }
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

    const application = await prisma.jobApplication.findFirst({
      where: {
        candidateId: candidate.id,
        OR: [{ id: applicationId }, { applicationRef: applicationId }],
      },
      select: { id: true },
    });
    if (!application) return res.status(404).json({ success: false, error: 'Application not found.' });

    const document = await prisma.candidateDocument.findFirst({
      where: { id: documentId, applicationId: application.id, candidateId: candidate.id },
      select: { fileName: true, fileUrl: true, mimeType: true },
    });
    if (!document) return res.status(404).json({ success: false, error: 'Document not found.' });

    const fileName = path.basename(document.fileName || document.fileUrl);
    res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    const driveFileId = extractDriveFileId(document.fileUrl);
    if (driveFileId) {
      if (!document.fileUrl.includes('/api/documents/secure/drive-')) {
        await makeDriveFilePrivate(driveFileId);
      }

      const stream = await streamFileFromDrive(driveFileId);
      stream.on('error', next);
      stream.pipe(res);
      return;
    }

    const absolutePath = path.join(secureUploadDir, fileName);
    await fs.access(absolutePath);
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

    // Applications (with their interviews, offers and notes) are candidate history, so a job that
    // has any is closed or archived instead of deleted.
    const applications = await prisma.jobApplication.count({ where: { jobId: id } });
    if (applications > 0) {
      return res.status(409).json({
        success: false,
        error: `This job has ${applications} application(s), so it cannot be deleted. Close or archive the job instead.`,
        code: 'APPLICATIONS_EXIST',
      });
    }

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
    await ensureDefaultRecruitmentData();
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

    // The HRM employee code of an accepted offer, for the Offer tab's "In HRM · EMP-0007".
    const hrmIds = application.offers.map((offer) => offer.hrmEmployeeId).filter((value): value is string => Boolean(value));
    const codes = new Map(hrmIds.length
      ? (await prisma.hrmEmployee.findMany({ where: { id: { in: hrmIds } }, select: { id: true, employeeCode: true } })).map((row) => [row.id, row.employeeCode])
      : []);

    res.status(200).json({
      success: true,
      application: { ...application, offers: application.offers.map((offer) => ({ ...offer, hrmEmployeeCode: offer.hrmEmployeeId ? codes.get(offer.hrmEmployeeId) ?? null : null })) },
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

    // An offer is accepted by the candidate (offer link) or recorded by HR on the Offers page, with its evidence.
    // Hiring must not flip a pending offer to accepted on the side.
    if (targetStage === 'HIRED') {
      const pendingOffer = await prisma.offer.findFirst({ where: { applicationId: id, status: 'SENT' }, select: { id: true } });
      if (pendingOffer) {
        return res.status(409).json({ success: false, error: 'The offer is still waiting for the candidate. Record the acceptance on the Offers page first, then mark the application as hired.' });
      }
    }

    const updatedApp = await prisma.jobApplication.update({
      where: { id },
      data: {
        currentStage: targetStage || previousStage,
        terminalStatus: terminalStatus !== undefined ? terminalStatus : previousTerminal,
      },
    });

    if (targetStage === 'HIRED') {
      await prisma.interview.updateMany({
        where: { applicationId: id, status: 'SCHEDULED' },
        data: { status: 'COMPLETED' },
      });
    }

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

// Interviews must be scheduled for a real future time (5 minutes of clock skew allowed).
const interviewTimeError = (value: unknown): string | null => {
  const at = new Date(String(value));
  if (Number.isNaN(at.getTime())) return 'Enter a valid interview date and time.';
  if (at.getTime() < Date.now() - 5 * 60 * 1000) return 'Interview date and time must be in the future.';
  return null;
};

export const scheduleInterview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { applicationId, scheduledAt, durationMinutes, type, interviewerId, meetingUrl, location, notes } = req.body;
    const userId = req.user?.id || null;

    if (!applicationId || !scheduledAt) {
      return res.status(400).json({ success: false, error: 'Application and scheduled date/time are required.' });
    }
    const scheduleError = interviewTimeError(scheduledAt);
    if (scheduleError) {
      return res.status(400).json({ success: false, error: scheduleError });
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
      payloadSnapshot: { applicationId, applicationRef: application.applicationRef, jobTitle: application.job.title, scheduledAt: interview.scheduledAt.toISOString(), interviewType: interview.type, status: interview.status },
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

    // Only a changed time must be in the future: completing a past interview resends its original time.
    if (scheduledAt && new Date(String(scheduledAt)).getTime() !== interview.scheduledAt.getTime()) {
      const scheduleError = interviewTimeError(scheduledAt);
      if (scheduleError) {
        return res.status(400).json({ success: false, error: scheduleError });
      }
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
      payloadSnapshot: { applicationId: interview.applicationId, applicationRef: interview.application.applicationRef, jobTitle: interview.job.title, scheduledAt: interview.scheduledAt.toISOString(), interviewType: interview.type, status: 'CANCELLED' },
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

type OfferHrmFields = {
  placement: OfferPlacement | null;
  components: SalaryComponent[] | undefined;
  annualCtc: number;
};

const sameText = (a: unknown, b: unknown) => String(a ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Reads the HRM placement (department, designation, office, manager) and the salary breakup sent with an offer and
 * checks them against the letter that was generated: the letter must name the same department and designation, and
 * the salary on the letter must equal the breakup total. Throws HrmHttpError for a bad placement; returns a message
 * for a letter / breakup mismatch.
 */
const readOfferHrmFields = async (
  body: Record<string, unknown>,
  offerData: OfferLetterData,
  existing?: { components: SalaryComponent[] },
): Promise<OfferHrmFields | { error: string }> => {
  const placement = await resolveOfferPlacement({
    hrmOrgUnitId: body.hrmOrgUnitId,
    designation: offerData.designation,
    locationType: body.locationType,
    stateId: body.stateId,
    cityId: body.cityId,
    isOfficeManager: body.isOfficeManager,
    employmentType: body.employmentType,
    reportingManagerEmployeeId: body.reportingManagerEmployeeId,
  });
  if (placement) {
    if (!sameText(offerData.department, placement.departmentName)) {
      return { error: `The letter says department "${offerData.department}" but the selected HRM department is "${placement.departmentName}". Regenerate the letter.` };
    }
    if (!sameText(offerData.designation, placement.designation)) {
      return { error: `The letter says designation "${offerData.designation}" but the designation list has "${placement.designation}". Regenerate the letter.` };
    }
  }

  let components: SalaryComponent[] | undefined;
  if (body.salaryComponents !== undefined) {
    const parsed = normalizeSalaryComponents(body.salaryComponents);
    if ('error' in parsed) return { error: parsed.error };
    components = parsed.components;
  }
  const breakup = components ?? existing?.components ?? [];
  const amount = Number(String(offerData.salaryAmount).replace(/,/g, ''));
  if (breakup.length) {
    const totals = totalSalaryComponents(breakup);
    const expected = offerData.salaryPeriod === 'month' ? totals.ctcMonthly : totals.annualCtc;
    if (!Number.isFinite(amount) || Math.abs(amount - expected) > 1) {
      return { error: `The salary on the letter (${offerData.salaryAmount} per ${offerData.salaryPeriod}) does not match the salary breakup total (${expected} per ${offerData.salaryPeriod}). Regenerate the letter.` };
    }
    return { placement, components, annualCtc: totals.annualCtc };
  }
  return { placement, components, annualCtc: annualCtcFrom(Number.isFinite(amount) ? amount : 0, offerData.salaryPeriod) };
};

/** The offer columns written from the HRM fields. Without a placement in the request, an existing one is kept. */
const offerHrmColumns = (fields: OfferHrmFields, keepExistingPlacement: boolean): Prisma.OfferUncheckedUpdateInput => ({
  ...(fields.placement || !keepExistingPlacement ? {
    hrmOrgUnitId: fields.placement?.hrmOrgUnitId ?? null,
    locationType: fields.placement?.locationType ?? null,
    stateId: fields.placement?.stateId ?? null,
    cityId: fields.placement?.cityId ?? null,
    isOfficeManager: fields.placement?.isOfficeManager ?? false,
    employmentType: fields.placement?.employmentType ?? null,
    reportingManagerEmployeeId: fields.placement?.reportingManagerEmployeeId ?? null,
    ...(fields.placement ? { reportingManager: fields.placement.reportingManagerName } : {}),
  } : {}),
  ...(fields.components !== undefined ? { salaryComponents: fields.components.length ? (fields.components as unknown as Prisma.InputJsonValue) : Prisma.JsonNull } : {}),
  annualCtc: fields.annualCtc,
});

const readStoredComponents = (value: unknown): SalaryComponent[] => {
  const parsed = normalizeSalaryComponents(value ?? null);
  return 'error' in parsed ? [] : parsed.components;
};

class OfferConflict extends Error {}

/**
 * A live offer: a draft, a sent one, or an accepted one that is still on its way into HRM. An accepted offer whose
 * joining HR cancelled (no-show) or whose HRM review HR dismissed stays ACCEPTED - the candidate did accept and the
 * evidence stays viewable - but it is closed, so the candidate can be offered again.
 */
const LIVE_OFFER_WHERE: Prisma.OfferWhereInput = {
  OR: [
    { status: { in: ['DRAFT', 'SENT'] } },
    { status: 'ACCEPTED', OR: [{ hrmHandoffStatus: null }, { hrmHandoffStatus: { notIn: ['DISMISSED', 'CANCELLED'] } }] },
  ],
};

/**
 * One live offer per application. Checked inside the writing transaction under a per-application lock, so two
 * tabs or a re-send of an older offer cannot leave two working links (and two HRM records if both were accepted).
 */
const assertNoOtherLiveOffer = async (transaction: Prisma.TransactionClient, applicationId: string, exceptOfferId?: string) => {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'recruitment-offer:' + applicationId}))`;
  const other = await transaction.offer.findFirst({
    where: { applicationId, AND: [LIVE_OFFER_WHERE], ...(exceptOfferId ? { NOT: { id: exceptOfferId } } : {}) },
    select: { status: true },
  });
  if (other) {
    throw new OfferConflict(other.status === 'ACCEPTED'
      ? 'This application already has an accepted offer.'
      : 'This application already has another open offer. Withdraw it first.');
  }
};

/**
 * HR records an acceptance signed on paper (at the office, or returned by email / post): the signed copy is required,
 * with the date it was signed and an optional note. The same evidence, certificate and HRM handoff as an online
 * acceptance follow.
 */
export const acceptOfferOffline = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const offer = await prisma.offer.findUnique({ where: { id }, include: { candidate: true, job: true, application: true } });
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found.' });
    if (offer.status !== 'SENT') {
      return res.status(409).json({ success: false, error: offer.status === 'ACCEPTED' ? 'This offer is already accepted.' : 'Only an offer that is waiting for the candidate can be recorded as accepted. Resend it first.' });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'Upload the signed offer letter (PDF, JPG or PNG).' });
    const signedOn = typeof req.body?.signedOn === 'string' ? req.body.signedOn.trim() : '';
    // Dates are compared as Indian calendar days (YYYY-MM-DD strings).
    const istDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const signedDate = /^\d{4}-\d{2}-\d{2}$/.test(signedOn) ? new Date(`${signedOn}T12:00:00.000Z`) : null;
    if (!signedDate || Number.isNaN(signedDate.getTime()) || istDay(signedDate) !== signedOn || signedOn > istDay(new Date())) {
      return res.status(400).json({ success: false, error: 'Enter the date the candidate signed (not in the future).' });
    }
    if (offer.sentAt && signedOn < istDay(offer.sentAt)) {
      return res.status(400).json({ success: false, error: 'The signing date cannot be before the offer was sent.' });
    }
    const typedPlace = typeof req.body?.place === 'string' ? req.body.place.trim().replace(/\s+/g, ' ') : '';
    const place = (typedPlace || offer.joiningLocation || 'Office').slice(0, 120);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
    const actor = req.user?.id ? await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true } }) : null;

    let updated;
    try {
      updated = await recordOfferAcceptance({
        offer,
        tokenVersion: null,
        method: 'OFFLINE_HR',
        acceptedName: offer.candidate.fullName,
        place,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        file: { buffer: req.file.buffer, mimeType: req.file.mimetype, originalName: req.file.originalname },
        note: note || null,
        acceptedById: actor?.id ?? null,
        recordedByName: actor ? (actor.name || actor.email || actor.id) : null,
        acceptedAt: signedDate,
      });
    } catch (error) {
      if (error instanceof OfferAcceptanceConflict) return res.status(409).json({ success: false, error: error.message });
      throw error;
    }
    res.status(200).json({ success: true, offer: updated, message: 'The signed offer was recorded and the candidate is moving to HRM onboarding.' });
    void (async () => {
      await handOfferToHrmSafely(offer, req.ip);
      await notifyOfferResponseSafely(offer, 'ACCEPTED');
      await dispatchOfferAcceptedMessages({ ...offer, ...updated, candidate: offer.candidate, application: offer.application, job: offer.job });
    })().catch((error) => console.error('[recruitment] follow-up after offline acceptance failed:', error instanceof Error ? error.message : error));
  } catch (error) {
    next(error);
  }
};

/** Acceptance evidence for HR: the certificate, or the signed copy / drawn signature. */
export const downloadOfferAcceptanceFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const kind = getParamString(req.params.kind);
    const offer = await prisma.offer.findUnique({ where: { id }, include: { application: { select: { applicationRef: true } } } });
    if (!offer || offer.status !== 'ACCEPTED') return res.status(404).json({ success: false, error: 'No acceptance is recorded for this offer.' });
    if (kind === 'certificate') {
      await streamOfferFile(req, res, offer.acceptanceCertificateUrl, `Offer_Acceptance_${offer.application.applicationRef}.pdf`, 'application/pdf', 'attachment');
      return;
    }
    if (kind === 'signature') {
      const document = offer.signatureFileUrl
        ? await prisma.candidateDocument.findFirst({ where: { fileUrl: offer.signatureFileUrl }, select: { fileName: true, mimeType: true } })
        : null;
      const mimeType = document?.mimeType || (offer.acceptanceMethod === 'DRAWN' ? 'image/png' : 'application/octet-stream');
      await streamOfferFile(req, res, offer.signatureFileUrl, document?.fileName || `Offer_Signature_${offer.application.applicationRef}`, mimeType, 'attachment');
      return;
    }
    res.status(404).json({ success: false, error: 'Unknown file.' });
  } catch (error) {
    next(error);
  }
};

/** HRM masters for the offer form (department, designation, states, head office, managers). */
export const getOfferFormOptions = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ success: true, options: await loadOfferFormOptions() });
  } catch (error) {
    next(error);
  }
};

/** Working employees the new joiner could report to. */
export const getOfferManagerOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    res.status(200).json({ success: true, managers: await searchOfferReportingManagers(search) });
  } catch (error) {
    next(error);
  }
};

export const getAdminOffers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.OfferWhereInput = {};
    if (status && typeof status === 'string' && status.trim()) {
      if (!isOfferStatus(status.trim())) return res.status(400).json({ success: false, error: 'Invalid offer status filter.' });
      where.status = status.trim() as OfferStatus;
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
    if (search) {
      where.OR = [
        { designation: { contains: search, mode: 'insensitive' } },
        { application: { applicationRef: { contains: search, mode: 'insensitive' } } },
        { candidate: { fullName: { contains: search, mode: 'insensitive' } } },
        { candidate: { email: { contains: search, mode: 'insensitive' } } },
        { candidate: { mobile: { contains: search } } },
        { job: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const selectCandidateBasic = {
      select: { id: true, fullName: true, email: true, mobile: true },
    };

    const [offersRaw, total, statusGroups] = await Promise.all([
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
          offerLetterUrl: true,
          offerLetterFileName: true,
          offerLetterData: true,
          department: true,
          probationPeriod: true,
          reportingManager: true,
          additionalTerms: true,
          hrmOrgUnitId: true,
          locationType: true,
          stateId: true,
          cityId: true,
          isOfficeManager: true,
          employmentType: true,
          reportingManagerEmployeeId: true,
          annualCtc: true,
          salaryComponents: true,
          acceptanceMethod: true,
          acceptedName: true,
          acceptedPlace: true,
          respondedAt: true,
          documentHash: true,
          acceptanceCertificateUrl: true,
          signatureFileUrl: true,
          hrmHandoffStatus: true,
          hrmHandoffError: true,
          hrmHandoffAttempts: true,
          hrmEmployeeId: true,
          status: true,
          createdAt: true,
          candidate: selectCandidateBasic,
          job: { select: { id: true, title: true, jobCode: true } },
          application: { select: { id: true, applicationRef: true, currentStage: true } },
        },
      }),
      prisma.offer.count({ where }),
      // Counts for the status chips, for the same search (all statuses).
      prisma.offer.groupBy({ by: ['status'], where: search ? { OR: where.OR! } : {}, _count: { _all: true } }),
    ]);
    const hrmIds = offersRaw.map((offer) => offer.hrmEmployeeId).filter((value): value is string => Boolean(value));
    const hrmCodes = new Map(hrmIds.length
      ? (await prisma.hrmEmployee.findMany({ where: { id: { in: hrmIds } }, select: { id: true, employeeCode: true } })).map((row) => [row.id, row.employeeCode])
      : []);
    const statusCounts = Object.fromEntries(statusGroups.map((group) => [group.status, (group._count as { _all?: number } | undefined)?._all ?? 0]));

    const offers = offersRaw.map((offer, index) => {
      const letter = (offer.offerLetterData && typeof offer.offerLetterData === 'object' ? offer.offerLetterData : {}) as Partial<OfferLetterData>;
      const salaryPeriod = letter.salaryPeriod === 'month' ? 'month' : 'annum';
      return {
      id: offer.id,
      offerRef: `OFFER-${new Date(offer.createdAt).getFullYear()}-${String(skip + index + 1).padStart(4, '0')}`,
      designation: offer.designation,
      department: offer.department,
      // Always per year (an amount stated per month on the letter is multiplied by 12).
      annualCtc: offer.annualCtc !== null ? Number(offer.annualCtc) : annualCtcFrom(Number(offer.ctc), salaryPeriod),
      salaryAmount: Number(offer.ctc),
      salaryPeriod,
      offerLetterData: offer.offerLetterData,
      probationPeriod: offer.probationPeriod,
      reportingManager: offer.reportingManager,
      additionalTerms: offer.additionalTerms,
      placement: offer.hrmOrgUnitId ? {
        hrmOrgUnitId: offer.hrmOrgUnitId,
        locationType: offer.locationType,
        stateId: offer.stateId,
        cityId: offer.cityId,
        isOfficeManager: offer.isOfficeManager,
        employmentType: offer.employmentType,
        reportingManagerEmployeeId: offer.reportingManagerEmployeeId,
      } : null,
      salaryComponents: readStoredComponents(offer.salaryComponents),
      acceptance: offer.status === 'ACCEPTED' ? {
        method: offer.acceptanceMethod,
        name: offer.acceptedName,
        place: offer.acceptedPlace,
        acceptedAt: offer.respondedAt,
        documentHash: offer.documentHash,
        hasCertificate: Boolean(offer.acceptanceCertificateUrl),
        hasSignatureFile: Boolean(offer.signatureFileUrl),
      } : null,
      // Where the accepted offer stands in HRM (pre-joining record), for the "Open in HRM" / Retry actions.
      hrm: offer.status === 'ACCEPTED' ? {
        status: offer.hrmHandoffStatus,
        note: offer.hrmHandoffError,
        attempts: offer.hrmHandoffAttempts,
        employeeId: offer.hrmEmployeeId,
        employeeCode: offer.hrmEmployeeId ? hrmCodes.get(offer.hrmEmployeeId) ?? null : null,
      } : null,
      workLocation: offer.joiningLocation,
      joiningDate: offer.joiningDate,
      expiryDate: offer.offerValidUntil,
      offerLetterUrl: offer.offerLetterUrl || null,
      offerLetterFileName: offer.offerLetterFileName || null,
      status: offer.status,
      createdAt: offer.createdAt,
      application: {
        ...offer.application,
        candidate: offer.candidate,
        job: offer.job,
      },
    };
    });

    res.status(200).json({
      success: true,
      offers,
      statusCounts,
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

export const downloadAdminOfferPdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        candidate: { select: { fullName: true } },
        application: { select: { applicationRef: true } },
      },
    });

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found.' });
    }

    const driveFileId = extractDriveFileId(offer.offerLetterUrl);
    if (!driveFileId) {
      return res.status(404).json({ success: false, error: 'Offer letter PDF is unavailable.' });
    }

    const { stream, totalSize, byteRange, headers } = await streamDriveMediaWithHeaders(
      driveFileId,
      typeof req.headers.range === 'string' ? req.headers.range : undefined,
    );
    const candidateNameClean = (offer.candidate?.fullName || 'Candidate').replace(/[^a-z0-9]+/gi, '_');
    const defaultFileName = `Offer_Letter_${offer.application?.applicationRef || id}_${candidateNameClean}.pdf`;
    const fileName = path.basename(offer.offerLetterFileName || defaultFileName).replace(/[\r\n"]/g, '_');

    res.status(byteRange ? 206 : 200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (headers['content-length']) res.setHeader('Content-Length', String(headers['content-length']));
    else if (totalSize !== null) res.setHeader('Content-Length', String(totalSize));
    if (headers['content-range']) res.setHeader('Content-Range', String(headers['content-range']));
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const createOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { applicationId, designation, department, joiningLocation, ctc, joiningDate, probationPeriod, reportingManager, offerValidUntil, additionalTerms } = req.body;
    const userId = req.user?.id || null;
    const uploadedOfferPdf = req.file;

    if (!applicationId) {
      return res.status(400).json({ success: false, error: 'Application is required.' });
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { candidate: true, job: { include: { department: true } } },
    });

    if (!application) {
      return res.status(404).json({ success: false, error: 'Application record not found.' });
    }

    let submittedOfferData: Partial<OfferLetterData> = {};
    if (typeof req.body.offerData === 'string' && req.body.offerData.trim()) {
      try {
        submittedOfferData = JSON.parse(req.body.offerData) as Partial<OfferLetterData>;
      } catch {
        return res.status(400).json({ success: false, error: 'Offer letter data must be valid JSON.' });
      }
    }

    const actor = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
      : null;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const offerData = normalizeOfferLetterData({
      ...submittedOfferData,
      letterDate: submittedOfferData.letterDate || today,
      offerLetterNo: submittedOfferData.offerLetterNo || `JCB/OFFER/${now.getFullYear()}/${application.applicationRef}`,
      employeeName: submittedOfferData.employeeName || application.candidate.fullName,
      employeeAddress: submittedOfferData.employeeAddress || [application.candidate.address, application.candidate.currentCity, application.candidate.state].filter(Boolean).join(', '),
      companyName: submittedOfferData.companyName || 'JCB Exchange',
      companyAddress: submittedOfferData.companyAddress || application.job.locationAddress || [application.job.locationCity, application.job.locationState].filter(Boolean).join(', '),
      designation: submittedOfferData.designation || designation || application.job.title,
      department: submittedOfferData.department || department || application.job.department.name,
      placeOfPosting: submittedOfferData.placeOfPosting || joiningLocation || [application.job.locationCity, application.job.locationState].filter(Boolean).join(', '),
      salaryAmount: submittedOfferData.salaryAmount || (ctc ? String(ctc) : ''),
      salaryPeriod: submittedOfferData.salaryPeriod || 'annum',
      joiningDate: submittedOfferData.joiningDate || joiningDate || '',
      probationPeriod: submittedOfferData.probationPeriod || probationPeriod || '',
      noticePeriod: submittedOfferData.noticePeriod || '30',
      signatoryName: submittedOfferData.signatoryName || actor?.name || '',
      signatoryDesignation: submittedOfferData.signatoryDesignation || 'Authorized Signatory',
      signatoryDate: submittedOfferData.signatoryDate || today,
      signatoryPlace: submittedOfferData.signatoryPlace || joiningLocation || application.job.locationCity,
      additionalTerms: submittedOfferData.additionalTerms || additionalTerms || '',
    });
    const validationErrors = validateOfferLetterData(offerData);
    if (validationErrors.length) {
      return res.status(400).json({ success: false, error: validationErrors[0], errors: validationErrors });
    }
    if (!uploadedOfferPdf || uploadedOfferPdf.mimetype !== 'application/pdf') {
      return res.status(400).json({ success: false, error: 'A generated PDF offer letter is required.' });
    }
    // One open offer per application: a second one would leave two links and two answers.
    const openOffer = await prisma.offer.findFirst({ where: { applicationId, AND: [LIVE_OFFER_WHERE] }, select: { status: true } });
    if (openOffer) {
      return res.status(409).json({ success: false, error: openOffer.status === 'ACCEPTED' ? 'This application already has an accepted offer.' : 'This application already has an open offer. Edit or withdraw it instead.' });
    }
    const hrmFields = await readOfferHrmFields(req.body as Record<string, unknown>, offerData);
    if ('error' in hrmFields) return res.status(400).json({ success: false, error: hrmFields.error });

    const fileName = `Offer_Letter_${application.applicationRef}_${offerData.employeeName.replace(/[^a-z0-9]+/gi, '_')}.pdf`;
    const uploadedDriveFile = await uploadFileToDrive(
      uploadedOfferPdf.buffer,
      'application/pdf',
      fileName,
      undefined,
      { access: 'private' },
    );
    const secureOfferUrl = getSecureDocumentUrl(uploadedDriveFile.fileId);
    const salaryValue = Number(offerData.salaryAmount.replace(/,/g, ''));
    const offerCtc = Number.isFinite(salaryValue) && salaryValue > 0 ? salaryValue : Number(ctc);

    let offer;
    try {
      offer = await prisma.$transaction(async (transaction) => {
      await assertNoOtherLiveOffer(transaction, applicationId);
      const createdOffer = await transaction.offer.create({
        data: {
          applicationId,
          candidateId: application.candidateId,
          jobId: application.jobId,
          designation: offerData.designation,
          department: offerData.department,
          joiningLocation: offerData.placeOfPosting,
          ctc: offerCtc,
          joiningDate: offerData.joiningDate ? new Date(offerData.joiningDate) : null,
          probationPeriod: offerData.probationPeriod,
          reportingManager: reportingManager?.trim() || null,
          offerValidUntil: offerValidUntil ? new Date(offerValidUntil) : null,
          additionalTerms: offerData.additionalTerms || null,
          offerLetterUrl: secureOfferUrl,
          offerLetterFileName: fileName,
          offerLetterData: offerData as Prisma.InputJsonValue,
          ...(offerHrmColumns(hrmFields, false) as Partial<Prisma.OfferUncheckedCreateInput>),
          status: 'SENT',
          createdById: userId,
          sentAt: now,
        },
      });

      await transaction.candidateDocument.create({
        data: {
          candidateId: application.candidateId,
          applicationId,
          category: 'OFFER_LETTER',
          fileName,
          fileUrl: secureOfferUrl,
          fileSize: uploadedOfferPdf.size,
          mimeType: 'application/pdf',
        },
      });

      await transaction.jobApplication.update({
        where: { id: applicationId },
        data: { currentStage: 'OFFER_SENT', terminalStatus: null },
      });

      return createdOffer;
      });
    } catch (error) {
      if (error instanceof OfferConflict) {
        await deleteFileFromDrive(uploadedDriveFile.fileId).catch(() => undefined);
        return res.status(409).json({ success: false, error: error.message });
      }
      throw error;
    }

    await logRecruitmentActivity({
      candidateId: application.candidateId,
      applicationId,
      actorId: userId,
      action: 'OFFER_CREATED',
      title: 'Employment Offer Sent',
      details: `Offer created for designation "${offerData.designation}" with CTC ₹${offerCtc}`,
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

    const communications = await dispatchOfferCommunications({
      ...offer,
      candidate: application.candidate,
      application: { id: application.id, applicationRef: application.applicationRef },
      job: { title: application.job.title },
    });

    res.status(201).json({
      success: true,
      offer,
      communications,
      message: 'Offer sent successfully.',
    });
  } catch (error) {
    if (sendHrmError(res, error)) return;
    next(error);
  }
};

const TERMINAL_STATUS_FOR_OFFER: Partial<Record<OfferStatus, string>> = {
  DECLINED: 'Offer Declined',
  EXPIRED: 'No Response',
  WITHDRAWN: 'Offer Withdrawn',
};
const STAGE_FOR_OFFER: Partial<Record<OfferStatus, string>> = {
  SENT: 'OFFER_SENT',
  ACCEPTED: 'OFFER_ACCEPTED',
  DECLINED: 'OFFER_DECLINED',
};

/**
 * HR changes an offer's status by hand: resend (SENT), record the candidate's answer (ACCEPTED / DECLINED), close it
 * (EXPIRED) or take it back (WITHDRAWN). Only the moves in offerRules are allowed; resend, expire and withdraw close
 * the current link. An accepted offer goes to HRM pre-joining exactly like a candidate's own acceptance.
 */
export const updateOfferStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const status = req.body?.status;
    const userId = req.user?.id || null;

    if (!isOfferStatus(status) || status === 'DRAFT') {
      return res.status(400).json({ success: false, error: 'Invalid offer status.' });
    }

    const offer = await prisma.offer.findUnique({
      where: { id },
      include: { application: true, candidate: true, job: true },
    });
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found.' });
    }
    const blocked = describeOfferStatusChangeBlock(offer.status, status);
    if (blocked) return res.status(409).json({ success: false, error: blocked });
    if (status === 'ACCEPTED') {
      // An acceptance always carries evidence: the candidate signs on the link, or HR uploads the signed copy.
      return res.status(400).json({ success: false, error: 'Record an acceptance with the signed copy (Record signed acceptance), so the evidence is kept.', code: 'USE_OFFLINE_ACCEPTANCE' });
    }
    if (status === 'SENT' && !offer.offerLetterUrl) {
      return res.status(400).json({ success: false, error: 'A generated PDF offer letter is required before sending.' });
    }
    const rawReason = typeof req.body?.reason === 'string' ? req.body.reason : typeof req.body?.declineReason === 'string' ? req.body.declineReason : '';
    const reason = rawReason.trim().slice(0, 1000);
    // A (re)send can go out on chosen channels only; every send gives a new link, so the old one closes everywhere.
    const channels = status === 'SENT' ? parseOfferChannels(req.body?.channels) : undefined;
    if (channels && !channels.length) return res.status(400).json({ success: false, error: 'Choose at least one channel: email, WhatsApp or SMS.' });
    if ((status === 'DECLINED' || status === 'WITHDRAWN') && reason.length < 3) {
      return res.status(400).json({ success: false, error: status === 'DECLINED' ? 'Give the reason the candidate declined.' : 'Give the reason the offer is withdrawn.' });
    }

    const now = new Date();
    // A resend issues a new link (the old one stops). Expired / withdrawn offers keep their link so the candidate
    // sees that the offer is closed; only a SENT offer can be answered.
    const closesLink = status === 'SENT';
    const targetStage = STAGE_FOR_OFFER[status] ?? offer.application.currentStage;
    const targetTerminal = status in TERMINAL_STATUS_FOR_OFFER ? TERMINAL_STATUS_FOR_OFFER[status]! : null;

    let updatedOffer;
    try {
      updatedOffer = await prisma.$transaction(async (transaction) => {
      if (status === 'SENT' && offer.status !== 'SENT') await assertNoOtherLiveOffer(transaction, offer.applicationId, id);
      // Only from the status we read: two people changing the same offer cannot both win.
      const result = await transaction.offer.updateMany({
        // ...and from the link version we read: two resends at once cannot both bump it (one wins, one gets 409).
        where: { id, status: offer.status, responseTokenVersion: offer.responseTokenVersion },
        data: {
          status,
          sentAt: status === 'SENT' ? now : offer.sentAt,
          respondedAt: status === 'DECLINED' ? now : status === 'SENT' ? null : offer.respondedAt,
          declineReason: status === 'DECLINED' ? reason : status === 'SENT' ? null : offer.declineReason,
          ...(closesLink ? { responseTokenVersion: { increment: 1 } } : {}),
        },
      });
      if (result.count !== 1) return null;
      await transaction.jobApplication.update({
        where: { id: offer.applicationId },
        data: { currentStage: targetStage, terminalStatus: targetTerminal },
      });
      await transaction.applicationStageHistory.create({
        data: {
          applicationId: offer.applicationId,
          fromStage: offer.application.currentStage,
          toStage: targetStage,
          fromTerminalStatus: offer.application.terminalStatus,
          toTerminalStatus: targetTerminal,
          changedById: userId,
          notes: reason || `Offer marked ${status.toLowerCase()} by HR.`,
        },
      });
      return transaction.offer.findUnique({ where: { id } });
      });
    } catch (error) {
      if (error instanceof OfferConflict) return res.status(409).json({ success: false, error: error.message });
      throw error;
    }
    if (!updatedOffer) return res.status(409).json({ success: false, error: 'This offer was changed a moment ago. Refresh and try again.' });

    await logRecruitmentActivity({
      candidateId: offer.candidateId,
      applicationId: offer.applicationId,
      actorId: userId,
      action: 'OFFER_STATUS_UPDATED',
      title: `Offer Status: ${status}`,
      details: reason ? `Offer state changed to ${status}: ${reason}` : `Offer state changed to ${status}`,
    });


    const communications = status === 'SENT'
      ? await dispatchOfferCommunications({
        ...updatedOffer,
        candidate: offer.candidate,
        application: { id: offer.applicationId, applicationRef: offer.application.applicationRef },
        job: { title: offer.job.title },
      }, `version-${updatedOffer.responseTokenVersion}`, { channels })
      : undefined;

    if (status !== 'SENT') {
      dispatchRecruitmentCandidateWhatsApp({
        eventCode: 'RECRUITMENT_OFFER_STATUS_UPDATED',
        relatedEntityType: 'OFFER_STATUS',
        relatedEntityId: `${offer.id}:${status}`,
        candidate: offer.candidate,
        payloadSnapshot: { applicationId: offer.applicationId, applicationRef: offer.application.applicationRef, jobTitle: offer.job.title, offerStatus: status },
      });
    }

    res.status(200).json({
      success: true,
      offer: updatedOffer,
      ...(communications ? { communications } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/** POST /admin/offers/:id/resend { channels?: ['email','whatsapp','sms'] }: a new link on the chosen channels. */
export const resendOffer = (req: Request, res: Response, next: NextFunction) => {
  req.body = { ...(req.body && typeof req.body === 'object' ? req.body : {}), status: 'SENT' };
  return updateOfferStatus(req, res, next);
};

/**
 * GET /public/offer-links/:code: where a short link (https://<site>/o/<code>) leads. The current link version opens
 * the offer page; a link from before a resend answers 410 (closed), an unknown code 404.
 */
export const getPublicOfferShortLink = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const found = await lookupOfferShortLink(getParamString(req.params.code));
    if (found.status === 'OPEN') return res.status(200).json({ success: true, path: found.path });
    if (found.status === 'CLOSED') return res.status(410).json({ success: false, status: 'CLOSED', error: 'This offer link has been replaced by a newer one. Please use the latest message from JCB Exchange.' });
    return res.status(404).json({ success: false, status: 'NOT_FOUND', error: 'This offer link is not valid.' });
  } catch (error) {
    next(error);
  }
};

export const updateOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const existing = await prisma.offer.findUnique({
      where: { id },
      include: { application: { include: { candidate: true, job: { include: { department: true } } } } },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Offer not found.' });
    if (!canEditOffer(existing.status)) {
      return res.status(409).json({ success: false, error: existing.status === 'ACCEPTED' ? 'This offer is accepted and the person is in HRM onboarding, so it can no longer be edited.' : 'This offer was withdrawn. Create a new offer instead.' });
    }

    const { designation, department, joiningLocation, ctc, joiningDate, offerValidUntil, probationPeriod, reportingManager, additionalTerms } = req.body;
    if (!designation || !ctc) return res.status(400).json({ success: false, error: 'Designation and CTC are required.' });

    let submittedOfferData: Partial<OfferLetterData> = {};
    if (typeof req.body.offerData === 'string' && req.body.offerData.trim()) {
      try {
        submittedOfferData = JSON.parse(req.body.offerData) as Partial<OfferLetterData>;
      } catch {
        return res.status(400).json({ success: false, error: 'Offer letter data must be valid JSON.' });
      }
    }

    const existingOfferData = existing.offerLetterData && typeof existing.offerLetterData === 'object'
      ? existing.offerLetterData as Partial<OfferLetterData>
      : {};
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const actor = req.user?.id
      ? await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } })
      : null;
    const offerData = normalizeOfferLetterData({
      ...existingOfferData,
      ...submittedOfferData,
      letterDate: submittedOfferData.letterDate || existingOfferData.letterDate || today,
      offerLetterNo: submittedOfferData.offerLetterNo || existingOfferData.offerLetterNo || `JCB/OFFER/${now.getFullYear()}/${existing.application.applicationRef}`,
      employeeName: submittedOfferData.employeeName || existingOfferData.employeeName || existing.application.candidate.fullName,
      employeeAddress: submittedOfferData.employeeAddress || existingOfferData.employeeAddress || [existing.application.candidate.address, existing.application.candidate.currentCity, existing.application.candidate.state].filter(Boolean).join(', '),
      companyName: submittedOfferData.companyName || existingOfferData.companyName || 'JCB Exchange',
      companyAddress: submittedOfferData.companyAddress || existingOfferData.companyAddress || existing.application.job.locationAddress || [existing.application.job.locationCity, existing.application.job.locationState].filter(Boolean).join(', '),
      designation: submittedOfferData.designation || String(designation),
      department: submittedOfferData.department || String(department ?? existing.department),
      placeOfPosting: submittedOfferData.placeOfPosting || String(joiningLocation ?? existing.joiningLocation),
      salaryAmount: submittedOfferData.salaryAmount || String(ctc),
      salaryPeriod: submittedOfferData.salaryPeriod || existingOfferData.salaryPeriod || 'annum',
      joiningDate: submittedOfferData.joiningDate || (joiningDate ? String(joiningDate).slice(0, 10) : existing.joiningDate?.toISOString().slice(0, 10) || ''),
      probationPeriod: submittedOfferData.probationPeriod || String(probationPeriod ?? existing.probationPeriod ?? ''),
      noticePeriod: submittedOfferData.noticePeriod || existingOfferData.noticePeriod || '30',
      signatoryName: submittedOfferData.signatoryName || existingOfferData.signatoryName || actor?.name || '',
      signatoryDesignation: submittedOfferData.signatoryDesignation || existingOfferData.signatoryDesignation || 'Authorized Signatory',
      signatoryDate: submittedOfferData.signatoryDate || existingOfferData.signatoryDate || today,
      signatoryPlace: submittedOfferData.signatoryPlace || existingOfferData.signatoryPlace || String(joiningLocation ?? existing.joiningLocation),
      acceptanceDate: submittedOfferData.acceptanceDate || existingOfferData.acceptanceDate || '',
      acceptancePlace: submittedOfferData.acceptancePlace || existingOfferData.acceptancePlace || '',
      additionalTerms: submittedOfferData.additionalTerms ?? additionalTerms ?? existing.additionalTerms ?? '',
    });
    const validationErrors = validateOfferLetterData(offerData);
    if (validationErrors.length) {
      return res.status(400).json({ success: false, error: validationErrors[0], errors: validationErrors });
    }

    const uploadedOfferPdf = req.file;
    if (uploadedOfferPdf && uploadedOfferPdf.mimetype !== 'application/pdf') {
      return res.status(400).json({ success: false, error: 'Offer letter must be a PDF.' });
    }
    const hrmFields = await readOfferHrmFields(req.body as Record<string, unknown>, offerData, { components: readStoredComponents(existing.salaryComponents) });
    if ('error' in hrmFields) return res.status(400).json({ success: false, error: hrmFields.error });

    let offerLetterUrl = existing.offerLetterUrl;
    let offerLetterFileName = existing.offerLetterFileName;
    let offerLetterSize: number | null = null;
    if (uploadedOfferPdf) {
      const fileName = `Offer_Letter_${existing.application.applicationRef}_${offerData.employeeName.replace(/[^a-z0-9]+/gi, '_')}.pdf`;
      const uploadedDriveFile = await uploadFileToDrive(
        uploadedOfferPdf.buffer,
        'application/pdf',
        fileName,
        undefined,
        { access: 'private' },
      );
      offerLetterUrl = getSecureDocumentUrl(uploadedDriveFile.fileId);
      offerLetterFileName = fileName;
      offerLetterSize = uploadedOfferPdf.size;
    }

    if (!offerLetterUrl) {
      return res.status(400).json({ success: false, error: 'A generated PDF offer letter is required.' });
    }

    const salaryValue = Number(offerData.salaryAmount.replace(/,/g, ''));
    const offerCtc = Number.isFinite(salaryValue) && salaryValue > 0 ? salaryValue : Number(ctc);

    let offer;
    try {
      offer = await prisma.$transaction(async (transaction) => {
      if (existing.status !== 'SENT') await assertNoOtherLiveOffer(transaction, existing.applicationId, id);
      // Only if nobody (the candidate through the link, another HR user) changed the offer since it was read.
      const written = await transaction.offer.updateMany({
        where: { id, status: existing.status, responseTokenVersion: existing.responseTokenVersion },
        data: {
        designation: offerData.designation,
        department: offerData.department,
        joiningLocation: offerData.placeOfPosting,
        ctc: offerCtc,
        joiningDate: offerData.joiningDate ? new Date(offerData.joiningDate) : null,
        offerValidUntil: offerValidUntil ? new Date(offerValidUntil) : null,
        probationPeriod: offerData.probationPeriod || null,
        reportingManager: reportingManager !== undefined ? String(reportingManager).trim() || null : existing.reportingManager,
        additionalTerms: offerData.additionalTerms || null,
        offerLetterUrl,
        offerLetterFileName,
        offerLetterData: offerData as Prisma.InputJsonValue,
        ...(offerHrmColumns(hrmFields, true) as Prisma.OfferUpdateManyMutationInput),
        status: 'SENT',
        sentAt: new Date(),
        respondedAt: null,
        declineReason: null,
        responseTokenVersion: { increment: 1 },
        },
      });
      if (written.count !== 1) throw new OfferConflict('This offer was answered or changed a moment ago. Refresh and check it before sending again.');
      const updatedOffer = await transaction.offer.findUniqueOrThrow({ where: { id } });

      // The offer is live again: the application shows "offer sent" and is no longer closed.
      if (existing.application.currentStage !== 'OFFER_SENT' || existing.application.terminalStatus) {
        await transaction.jobApplication.update({ where: { id: existing.applicationId }, data: { currentStage: 'OFFER_SENT', terminalStatus: null } });
        await transaction.applicationStageHistory.create({
          data: {
            applicationId: existing.applicationId,
            fromStage: existing.application.currentStage,
            toStage: 'OFFER_SENT',
            fromTerminalStatus: existing.application.terminalStatus,
            toTerminalStatus: null,
            changedById: req.user?.id || null,
            notes: 'Offer edited and sent again.',
          },
        });
      }

      if (uploadedOfferPdf) {
        const currentDocument = await transaction.candidateDocument.findFirst({
          where: { applicationId: existing.applicationId, category: 'OFFER_LETTER' },
          orderBy: { uploadedAt: 'desc' },
        });
        if (currentDocument) {
          await transaction.candidateDocument.update({
            where: { id: currentDocument.id },
            data: { fileName: offerLetterFileName || currentDocument.fileName, fileUrl: offerLetterUrl, fileSize: offerLetterSize, mimeType: 'application/pdf' },
          });
        } else {
          await transaction.candidateDocument.create({
            data: {
              candidateId: existing.candidateId,
              applicationId: existing.applicationId,
              category: 'OFFER_LETTER',
              fileName: offerLetterFileName || 'Offer_Letter.pdf',
              fileUrl: offerLetterUrl,
              fileSize: offerLetterSize,
              mimeType: 'application/pdf',
            },
          });
        }
      }

      return updatedOffer;
      });
    } catch (error) {
      if (error instanceof OfferConflict) {
        if (uploadedOfferPdf && offerLetterUrl && offerLetterUrl !== existing.offerLetterUrl) {
          const newFileId = extractDriveFileId(offerLetterUrl);
          if (newFileId) await deleteFileFromDrive(newFileId).catch(() => undefined);
        }
        return res.status(409).json({ success: false, error: error.message });
      }
      throw error;
    }

    const communications = await dispatchOfferCommunications({
      ...offer,
      candidate: existing.application.candidate,
      application: { id: existing.applicationId, applicationRef: existing.application.applicationRef },
      job: { title: existing.application.job.title },
    }, `version-${offer.responseTokenVersion}`);
    res.status(200).json({ success: true, offer, communications, message: 'Offer updated successfully.' });
  } catch (error) {
    if (sendHrmError(res, error)) return;
    next(error);
  }
};

export const deleteOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const offer = await prisma.offer.findUnique({ where: { id } });
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found.' });
    if (!canDeleteOffer(offer.status)) {
      return res.status(409).json({ success: false, error: 'An accepted offer is part of the employee record in HRM and cannot be deleted.' });
    }

    if (offer.offerLetterUrl) {
      const fileId = extractDriveFileId(offer.offerLetterUrl);
      if (fileId) {
        await deleteFileFromDrive(fileId).catch(err => {
          console.warn(`Failed to delete Offer Letter ${fileId} from Drive:`, err);
        });
      }
    }

    await prisma.offer.delete({ where: { id } });
    await prisma.candidateDocument.deleteMany({
      where: { applicationId: offer.applicationId, category: 'OFFER_LETTER', ...(offer.offerLetterUrl ? { fileUrl: offer.offerLetterUrl } : {}) },
    });
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
        select: { id: true, name: true, code: true, eventCode: true, subject: true, bodyHtml: true, variables: true, enabled: true, attachmentMode: true, isSystem: true, archived: true },
    });
    const fetchEmailRules = () => prisma.emailAutomationRule.findMany({
      select: { eventCode: true, enabled: true, templateId: true },
    });

    const [departments, stages, templates, emailRules] = await Promise.all([
      section === 'all' || section === 'departments' ? fetchDepartments() : Promise.resolve([]),
      section === 'all' || section === 'pipeline' ? fetchStages() : Promise.resolve([]),
      section === 'all' || section === 'templates' ? fetchTemplates() : Promise.resolve([]),
      section === 'all' || section === 'templates' ? fetchEmailRules() : Promise.resolve([]),
    ]);

    // Older recruitment templates use short legacy codes (for example
    // APPLICATION_RECEIVED). If a previous seed created the full WhatsApp
    // event code as well, expose only the canonical template so one event has
    // exactly one editable Email rule in the UI.
    const canonicalTemplates = templates.filter((template) => {
      if (template.archived) return false;
      const eventCode = template.eventCode || getEmailEventCodeForTemplateCode(template.code);
      return Boolean(eventCode);
    });

    const emailTemplates = canonicalTemplates.map((template) => ({
      eventCode: template.eventCode || getEmailEventCodeForTemplateCode(template.code) || template.code,
      id: template.id,
      name: template.name,
      type: template.code,
      subject: template.subject,
      body: template.bodyHtml,
      variables: template.variables,
      enabled: template.enabled,
      attachmentMode: template.attachmentMode,
      attachmentSupported: template.attachmentMode !== 'NONE',
      isDefault: template.isSystem,
    }));

    const emailEvents = communicationEventRegistry.map((event) => {
      const eventTemplates = emailTemplates.filter((template) => template.eventCode === event.eventCode);
      const rule = emailRules.find((item) => item.eventCode === event.eventCode);
      const selectedTemplateId = rule?.templateId || eventTemplates.find((template) => template.isDefault)?.id || eventTemplates[0]?.id || null;
      return {
        eventCode: event.eventCode,
        name: event.name,
        variables: event.variables,
        attachmentMode: event.emailAttachmentMode,
        templates: eventTemplates,
        selectedTemplateId,
        enabled: rule?.enabled ?? eventTemplates.find((template) => template.id === selectedTemplateId)?.enabled ?? true,
      };
    });

    res.status(200).json({
      success: true,
      departments,
      stages,
      templates: emailTemplates,
      emailEvents,
      data: {
        departments: departments.map((department) => ({
          ...department,
          isActive: true,
        })),
        stages,
        emailTemplates,
        emailEvents,
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

const extractEmailTemplateVariables = (subject: string, bodyHtml: string) => Array.from(new Set(
  [...`${subject}\n${bodyHtml}`.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)]
    .map((match) => match[1]?.trim())
    .filter((variable): variable is string => Boolean(variable)),
));

const validateEmailTemplateContent = (eventCode: string, subject: string, bodyHtml: string) => {
  const event = getCommunicationEvent(eventCode);
  if (!event) return { error: 'This email event is not supported.' } as const;
  const variables = extractEmailTemplateVariables(subject, bodyHtml);
  const unsupported = variables.filter((variable) => !event.variables.includes(variable));
  if (unsupported.length) {
    return { error: `Unsupported merge tag(s) for this event: ${unsupported.map((variable) => `{{${variable}}}`).join(', ')}` } as const;
  }
  if (eventCode === 'RECRUITMENT_OFFER_SENT' && !variables.includes('offer_response_url') && !variables.includes('offer_short_url')) {
    return { error: 'Offer templates must include {{offer_short_url}} or {{offer_response_url}} for the secure Accept/Decline link.' } as const;
  }
  // The subject is stored in the delivery log: a link there would put the candidate's secret link in the log.
  const subjectVariables = extractEmailTemplateVariables(subject, '');
  if (subjectVariables.some((variable) => /url|link/i.test(variable) || variable === 'offer_short_code')) {
    return { error: 'Links cannot be used in the subject. Put {{offer_short_url}} / {{offer_response_url}} in the body.' } as const;
  }
  return { variables } as const;
};

const normalizeTemplateCode = (eventCode: string, name: string) => {
  const slug = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'CUSTOM';
  return `EMAIL_${eventCode}_${slug}_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
};

export const createEmailTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventCode, name, subject, bodyHtml, enabled, select } = req.body as Record<string, unknown>;
    if (typeof eventCode !== 'string' || !getCommunicationEvent(eventCode)) {
      return res.status(400).json({ success: false, error: 'A valid communication event is required.' });
    }
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
      return res.status(400).json({ success: false, error: 'A template name is required and must be under 120 characters.' });
    }
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 998) {
      return res.status(400).json({ success: false, error: 'A valid email subject is required.' });
    }
    if (typeof bodyHtml !== 'string' || !bodyHtml.trim() || bodyHtml.length > 100_000) {
      return res.status(400).json({ success: false, error: 'Email body is required and must be under 100,000 characters.' });
    }
    const validation = validateEmailTemplateContent(eventCode, subject, bodyHtml);
    if ('error' in validation) return res.status(400).json({ success: false, error: validation.error });
    const event = getCommunicationEvent(eventCode)!;
    const template = await prisma.recruitmentEmailTemplate.create({
      data: {
        name: name.trim(),
        code: normalizeTemplateCode(eventCode, name),
        eventCode,
        subject: subject.trim().replace(/[\r\n]+/g, ' '),
        bodyHtml: sanitizeEmailHtml(bodyHtml),
        variables: validation.variables,
        enabled: enabled !== false,
        attachmentMode: event.emailAttachmentMode,
        isSystem: false,
        archived: false,
      },
    });
    await prisma.emailAutomationRule.upsert({
      where: { eventCode },
      update: select === true ? { templateId: template.id, enabled: enabled !== false } : {},
      create: { eventCode, templateId: template.id, enabled: enabled !== false },
    });
    res.status(201).json({ success: true, template, message: 'Email template created successfully.' });
  } catch (error) {
    next(error);
  }
};

export const updateEmailAutomationRule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventCode = getParamString(req.params.eventCode);
    const { templateId, enabled } = req.body as Record<string, unknown>;
    const event = getCommunicationEvent(eventCode);
    if (!event) return res.status(400).json({ success: false, error: 'Unsupported communication event.' });
    if (templateId !== undefined && templateId !== null && typeof templateId !== 'string') {
      return res.status(400).json({ success: false, error: 'templateId must be a string or null.' });
    }
    let selectedTemplateId: string | null | undefined = templateId === null ? null : templateId as string | undefined;
    if (selectedTemplateId) {
      const template = await prisma.recruitmentEmailTemplate.findFirst({ where: { id: selectedTemplateId, eventCode, archived: false }, select: { id: true } });
      if (!template) return res.status(400).json({ success: false, error: 'Selected template does not belong to this event.' });
    }
    const rule = await prisma.emailAutomationRule.upsert({
      where: { eventCode },
      update: {
        ...(selectedTemplateId !== undefined ? { templateId: selectedTemplateId } : {}),
        ...(typeof enabled === 'boolean' ? { enabled } : {}),
      },
      create: {
        eventCode,
        templateId: selectedTemplateId || null,
        enabled: typeof enabled === 'boolean' ? enabled : true,
      },
    });
    res.status(200).json({ success: true, rule });
  } catch (error) {
    next(error);
  }
};

export const updateEmailTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const { name, subject, bodyHtml, enabled, attachmentMode } = req.body;
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 998) {
      return res.status(400).json({ success: false, error: 'A valid email subject is required.' });
    }
    if (typeof bodyHtml !== 'string' || !bodyHtml.trim() || bodyHtml.length > 100_000) {
      return res.status(400).json({ success: false, error: 'Email body is required and must be under 100,000 characters.' });
    }
    const existingTemplate = await prisma.recruitmentEmailTemplate.findUnique({
      where: { id },
      select: { name: true, code: true, eventCode: true, attachmentMode: true, enabled: true, archived: true, isSystem: true },
    });
    if (!existingTemplate) return res.status(404).json({ success: false, error: 'Email template not found.' });
    if (existingTemplate.archived) return res.status(400).json({ success: false, error: 'Archived email templates cannot be edited.' });
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 120)) {
      return res.status(400).json({ success: false, error: 'A template name is required and must be under 120 characters.' });
    }
    if (existingTemplate.isSystem && typeof name === 'string' && name.trim() !== existingTemplate.name) {
      return res.status(400).json({ success: false, error: 'Default system template names cannot be changed.' });
    }
    const eventCode = existingTemplate.eventCode || getEmailEventCodeForTemplateCode(existingTemplate.code) || existingTemplate.code;
    const event = getCommunicationEvent(eventCode);
    if (!event) return res.status(400).json({ success: false, error: 'This email template is not linked to a supported communication event.' });
    const normalizedAttachmentMode = getEmailAttachmentModeForEvent(eventCode);
    if (attachmentMode !== undefined && attachmentMode !== normalizedAttachmentMode) {
      return res.status(400).json({ success: false, error: 'Attachment policy is fixed by the WhatsApp event and cannot be changed here.' });
    }
    const validation = validateEmailTemplateContent(eventCode, subject, bodyHtml);
    if ('error' in validation) return res.status(400).json({ success: false, error: validation.error });

    if (typeof name === 'string' && name.trim() !== existingTemplate.name) {
      const duplicate = await prisma.recruitmentEmailTemplate.findFirst({
        where: { eventCode, name: name.trim(), archived: false, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) return res.status(409).json({ success: false, error: 'A template with this name already exists for the event.' });
    }

    const tpl = await prisma.recruitmentEmailTemplate.update({
      where: { id },
      data: {
        ...(!existingTemplate.isSystem && typeof name === 'string' ? { name: name.trim() } : {}),
        subject: subject.trim().replace(/[\r\n]+/g, ' '),
        bodyHtml: sanitizeEmailHtml(bodyHtml),
        variables: validation.variables,
        enabled: enabled === undefined ? existingTemplate.enabled : enabled === true,
        attachmentMode: normalizedAttachmentMode,
      },
    });

    res.status(200).json({ success: true, template: tpl });
  } catch (error) {
    next(error);
  }
};

/**
 * Archive a custom template instead of hard-deleting it. Delivery history keeps
 * its template relation, while active automation is moved back to the event's
 * system template so a delete can never break future notifications.
 */
export const deleteEmailTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getParamString(req.params.id);
    const template = await prisma.recruitmentEmailTemplate.findUnique({
      where: { id },
      select: { id: true, eventCode: true, isSystem: true, archived: true },
    });
    if (!template) return res.status(404).json({ success: false, error: 'Email template not found.' });
    if (template.isSystem) {
      return res.status(400).json({ success: false, error: 'Default system templates cannot be deleted.' });
    }
    if (template.archived) return res.status(404).json({ success: false, error: 'Email template not found.' });

    const fallback = await prisma.recruitmentEmailTemplate.findFirst({
      where: { eventCode: template.eventCode, isSystem: true, archived: false },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      const currentRule = await tx.emailAutomationRule.findUnique({
        where: { eventCode: template.eventCode },
        select: { enabled: true, templateId: true },
      });
      const plan = buildEmailTemplateDeletePlan({
        templateId: id,
        eventCode: template.eventCode,
        fallbackTemplateId: fallback?.id ?? null,
        ...(currentRule ? { currentRule } : {}),
      });

      await tx.recruitmentEmailTemplate.update({
        where: { id },
        data: plan.template,
      });
      await tx.emailAutomationRule.upsert({
        where: { eventCode: plan.rule.eventCode },
        update: { templateId: plan.rule.templateId },
        create: plan.rule,
      });
    });

    res.status(200).json({
      success: true,
      fallbackTemplateId: fallback?.id ?? null,
      message: 'Email template deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};
