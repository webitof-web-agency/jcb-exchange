import { Readable } from 'node:stream';
import prisma from '../lib/prisma';
import { extractDriveFileId, streamFileFromDrive } from './googleDrive.service';
import {
  decryptTransactionalEmailCredential,
  encryptTransactionalEmailCredential,
} from './transactionalEmailCredentialCrypto';
import {
  buildOfferResponseUrl,
  createOfferResponseToken,
} from '../utils/offerResponseToken';
import {
  sendTransactionalEmailMessage,
  type TransactionalEmailAttachment,
} from './transactionalEmail.service';
import { sanitizeEmailHtml } from '../utils/htmlSanitizer';

export const OFFER_EMAIL_EVENT = 'RECRUITMENT_OFFER_SENT';
export const OFFER_EMAIL_TEMPLATE_CODE = 'OFFER_SENT';
export const DYNAMIC_OFFER_PDF_ATTACHMENT = 'DYNAMIC_OFFER_PDF';
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_OUTBOX_ATTEMPTS = 5;

const htmlEscape = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const getEmailAttachmentMode = (value: unknown): 'NONE' | 'DYNAMIC_OFFER_PDF' =>
  value === DYNAMIC_OFFER_PDF_ATTACHMENT ? DYNAMIC_OFFER_PDF_ATTACHMENT : 'NONE';

export const renderRecruitmentEmail = (
  template: { subject: string; bodyHtml: string },
  variables: Record<string, unknown>,
) => {
  const replace = (value: string, escape: boolean) => value.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    const variable = variables[key];
    return escape ? htmlEscape(variable) : String(variable ?? '');
  });

  return {
    subject: replace(template.subject, false).replace(/[\r\n]+/g, ' ').trim().slice(0, 998),
    bodyHtml: sanitizeEmailHtml(replace(template.bodyHtml, true)),
  };
};

const textFromHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const getOfferExpiryTimestamp = (offerValidUntil: Date | null) => {
  const expiry = offerValidUntil ? offerValidUntil.getTime() : Date.now() + 30 * 24 * 60 * 60 * 1000;
  return Math.floor(expiry / 1000);
};

const secretForOutbox = () => {
  const secret = process.env.EMAIL_SETTINGS_SECRET?.trim();
  if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret)) {
    throw new Error('Transactional email encryption is not configured.');
  }
  return secret;
};

export type OfferEmailPayload = {
  offerId: string;
  responseTokenCiphertext: string;
};

export const enqueueOfferEmail = async (offerId: string) => {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { candidate: true, application: true, job: true },
  });
  if (!offer) return { queued: false, reason: 'OFFER_NOT_FOUND' as const };

  const template = await prisma.recruitmentEmailTemplate.findUnique({ where: { code: OFFER_EMAIL_TEMPLATE_CODE } });
  if (!template?.enabled) return { queued: false, reason: 'TEMPLATE_DISABLED' as const };
  if (!offer.candidate.email) return { queued: false, reason: 'RECIPIENT_MISSING' as const };

  const token = createOfferResponseToken(
    offer.id,
    offer.responseTokenVersion,
    getOfferExpiryTimestamp(offer.offerValidUntil),
  );
  const responseTokenCiphertext = encryptTransactionalEmailCredential(token, secretForOutbox());
  const dedupeKey = `${OFFER_EMAIL_EVENT}:${offer.id}:${offer.responseTokenVersion}`;

  const variables = {
    candidate_name: offer.candidate.fullName,
    job_title: offer.job.title,
    joining_date: offer.joiningDate?.toISOString().slice(0, 10) || '',
    application_id: offer.application.applicationRef,
    application_ref: offer.application.applicationRef,
    designation: offer.designation,
    company_name: 'JCB Exchange',
    offer_response_url: buildOfferResponseUrl(token),
  };
  const rendered = renderRecruitmentEmail(template, variables);

  try {
    const log = await prisma.transactionalEmailLog.create({
      data: {
        eventCode: OFFER_EMAIL_EVENT,
        templateId: template.id,
        relatedEntityType: 'OFFER',
        relatedEntityId: offer.id,
        recipientEmail: offer.candidate.email,
        subject: rendered.subject,
        status: 'QUEUED',
        payloadSnapshot: { offerId: offer.id, templateCode: template.code, attachmentMode: getEmailAttachmentMode(template.attachmentMode) },
        dedupeKey,
        outbox: {
          create: {
            payload: { offerId: offer.id, responseTokenCiphertext } as object,
          },
        },
      },
      select: { id: true },
    });
    return { queued: true, logId: log.id };
  } catch (error: unknown) {
    if (error instanceof Error && /unique constraint/i.test(error.message)) {
      return { queued: false, reason: 'ALREADY_QUEUED' as const };
    }
    throw error;
  }
};

const toBuffer = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_ATTACHMENT_BYTES) throw new Error('Offer letter PDF is too large to attach.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

const resolveOfferPdfAttachment = async (offer: { offerLetterUrl: string | null; offerLetterFileName: string | null }) => {
  const driveFileId = extractDriveFileId(offer.offerLetterUrl);
  if (!driveFileId) throw new Error('The current offer letter PDF is unavailable.');
  const stream = await streamFileFromDrive(driveFileId);
  return {
    filename: offer.offerLetterFileName || 'offer-letter.pdf',
    content: await toBuffer(stream),
    contentType: 'application/pdf',
  } satisfies TransactionalEmailAttachment;
};

const retryAt = (attempts: number) => new Date(Date.now() + Math.min(60, 2 ** Math.max(0, attempts)) * 60 * 1000);

const deliverEmailOutbox = async (emailLogId: string) => {
  const emailLog = await prisma.transactionalEmailLog.findUnique({
    where: { id: emailLogId },
    include: { outbox: true, template: true },
  });
  if (!emailLog?.outbox || !emailLog.template) throw new Error('Email delivery record is incomplete.');
  const payload = emailLog.outbox.payload as unknown as OfferEmailPayload;
  const offer = await prisma.offer.findUnique({ where: { id: payload.offerId }, include: { candidate: true, application: true, job: true } });
  if (!offer?.candidate.email) throw new Error('Offer recipient email is no longer available.');

  const token = decryptTransactionalEmailCredential(payload.responseTokenCiphertext, secretForOutbox());
  const rendered = renderRecruitmentEmail(emailLog.template, {
    candidate_name: offer.candidate.fullName,
    job_title: offer.job.title,
    joining_date: offer.joiningDate?.toISOString().slice(0, 10) || '',
    application_id: offer.application.applicationRef,
    application_ref: offer.application.applicationRef,
    designation: offer.designation,
    company_name: 'JCB Exchange',
    offer_response_url: buildOfferResponseUrl(token),
  });
  const attachment = getEmailAttachmentMode(emailLog.template.attachmentMode) === DYNAMIC_OFFER_PDF_ATTACHMENT
    ? [await resolveOfferPdfAttachment(offer)]
    : [];

  await sendTransactionalEmailMessage({
    to: offer.candidate.email,
    subject: rendered.subject,
    html: rendered.bodyHtml,
    text: textFromHtml(rendered.bodyHtml),
    attachments: attachment,
  });
  return { sent: true };
};

const recoverStaleOutbox = async (now: Date) => {
  const stale = await prisma.transactionalEmailOutbox.findMany({
    where: { status: 'PROCESSING', lockedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
    select: { id: true, emailLogId: true, attempts: true },
  });
  await prisma.$transaction(stale.flatMap((item) => [
    prisma.transactionalEmailOutbox.update({ where: { id: item.id }, data: { status: 'FAILED', lockedAt: null, processedAt: now, nextAttemptAt: retryAt(item.attempts), lastError: 'Delivery lease expired; retry scheduled.' } }),
    prisma.transactionalEmailLog.update({ where: { id: item.emailLogId }, data: { status: 'FAILED', errorMessage: 'Delivery lease expired; retry scheduled.' } }),
  ]));
  return stale.length;
};

export const processTransactionalEmailOutbox = async ({ limit = 25 }: { limit?: number } = {}) => {
  const now = new Date();
  const recovered = await recoverStaleOutbox(now);
  const pending = await prisma.transactionalEmailOutbox.findMany({
    where: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_OUTBOX_ATTEMPTS }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    orderBy: { createdAt: 'asc' },
    take: Math.min(100, Math.max(1, limit)),
    select: { id: true, emailLogId: true, attempts: true },
  });
  let sent = 0;
  let failed = 0;
  for (const item of pending) {
    const claimed = await prisma.transactionalEmailOutbox.updateMany({ where: { id: item.id, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'PROCESSING', attempts: { increment: 1 }, lockedAt: now } });
    if (claimed.count !== 1) continue;
    try {
      await deliverEmailOutbox(item.emailLogId);
      await prisma.$transaction([
        prisma.transactionalEmailOutbox.update({ where: { id: item.id }, data: { status: 'SENT', processedAt: new Date(), lockedAt: null, lastError: null } }),
        prisma.transactionalEmailLog.update({ where: { id: item.emailLogId }, data: { status: 'SENT', sentAt: new Date(), errorMessage: null } }),
      ]);
      sent += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed.';
      await prisma.$transaction([
        prisma.transactionalEmailOutbox.update({ where: { id: item.id }, data: { status: 'FAILED', processedAt: new Date(), lockedAt: null, nextAttemptAt: retryAt(item.attempts + 1), lastError: message } }),
        prisma.transactionalEmailLog.update({ where: { id: item.emailLogId }, data: { status: 'FAILED', errorMessage: message } }),
      ]);
      failed += 1;
    }
  }
  return { recovered, selected: pending.length, sent, failed };
};
