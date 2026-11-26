import { Readable } from 'node:stream';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { extractDriveFileId, streamFileFromDrive } from './googleDrive.service';
import { decryptTransactionalEmailCredential } from './transactionalEmailCredentialCrypto';
import { verifyOfferResponseToken } from '../utils/offerResponseToken';
import { offerValidUntilDay } from '../utils/offerRules';
import { maskOfferLinks } from '../utils/offerShortCode';
import { signedLetterUrlOf } from '../utils/offerAcceptanceEvidence';
import { ensureOfferShortLink, resolveOfferLinkForDelivery, type OfferLinkForDelivery } from './offerShortLink.service';
import {
  sendTransactionalEmailMessage,
  type TransactionalEmailAttachment,
} from './transactionalEmail.service';
import { sanitizeEmailHtml } from '../utils/htmlSanitizer';
import { getCommunicationEvent, getEmailAttachmentModeForEvent, type EmailAttachmentMode } from './communicationEventRegistry';
import { buildCustomerPrimeInvoicePdfForSubscription } from './customerPrimeInvoice.service';
import { buildVehicleSaleInvoicePdf, buildVehicleSalePaymentReceiptPdf } from './vehicleSaleInvoice.service';

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

const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEventVariables = (payload: Record<string, unknown>) => Object.entries(payload).reduce<Record<string, unknown>>((result, [key, value]) => {
  const snakeKey = key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
  result[key] = value;
  result[snakeKey] = value;
  return result;
}, {});

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

const secretForOutbox = () => {
  const secret = process.env.EMAIL_SETTINGS_SECRET?.trim();
  if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret)) {
    throw new Error('Transactional email encryption is not configured.');
  }
  return secret;
};

const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : '');

export type OfferEmailSource = {
  designation: string;
  joiningDate: Date | null;
  offerValidUntil: Date | null;
  /** Its offerValidUntil is the fallback when the column is empty (same as WhatsApp / SMS and the offer page). */
  offerLetterData?: unknown;
  candidate: { fullName: string };
  application: { applicationRef: string };
  job: { title: string };
};

export type OfferEmailLinks = { offerResponseUrl: string; offerShortUrl?: string | null };

/**
 * The merge values of the offer email. The same builder runs when the email is queued (the subject kept in the log,
 * with masked links) and when it is delivered (with the links of that moment), so the two never drift apart.
 * {{offer_short_url}} falls back to the long link when no short link exists: a template using either variable always
 * gets a working link.
 */
export const buildOfferEmailVariables = (offer: OfferEmailSource, links: OfferEmailLinks) => ({
  candidate_name: offer.candidate.fullName,
  job_title: offer.job.title,
  designation: offer.designation,
  joining_date: day(offer.joiningDate),
  offer_valid_until: offerValidUntilDay(offer.offerValidUntil, offer.offerLetterData),
  // Candidate-facing, so the reference rather than the internal id (older templates use application_id for it).
  application_id: offer.application.applicationRef,
  application_ref: offer.application.applicationRef,
  company_name: 'JCB Exchange',
  offer_response_url: links.offerResponseUrl,
  offer_short_url: links.offerShortUrl || links.offerResponseUrl,
});

/** What the log keeps instead of links: delivery builds the real ones (late binding). */
const MASKED_OFFER_LINKS: OfferEmailLinks = { offerResponseUrl: '****', offerShortUrl: '****' };

/** Why a queued offer email was not sent (stored as the log's reason). */
export const OFFER_LINK_SKIP_REASONS = {
  LINK_SUPERSEDED: 'Offer link superseded by a resend',
  OFFER_NOT_OPEN: 'Offer is no longer open',
  OFFER_NOT_FOUND: 'Offer no longer exists',
} as const;

/**
 * Send or skip, from the link check made just before delivery: an email written for an older link version (the
 * offer was resent since) or for an offer that is no longer waiting for an answer is never sent.
 */
export const decideOfferEmailDelivery = (link: OfferLinkForDelivery) => (link.open
  ? { send: true as const, links: { offerResponseUrl: link.offerResponseUrl, offerShortUrl: link.offerShortUrl } }
  : { send: false as const, reason: OFFER_LINK_SKIP_REASONS[link.reason] });

type OfferLinkRef = { offerId: string; tokenVersion: number };

/** The outbox row of an offer email: which offer and link version, never the link itself. */
export type OfferEmailOutboxPayload = {
  kind: 'OFFER';
  offerId: string;
  offerLink: OfferLinkRef;
};

/** Rows queued before late binding held the encrypted signed token: only its version is read from it now. */
const decodeLegacyOfferToken = (ciphertext: string) => {
  try {
    // now = 0: only the signed version is needed here (expiry is no reason to cancel - HR expires offers by hand);
    // the version and the offer's state are then checked against the database.
    const decoded = verifyOfferResponseToken(decryptTransactionalEmailCredential(ciphertext, secretForOutbox()), undefined, 0);
    return decoded ? { offerId: decoded.offerId, version: decoded.version } : null;
  } catch {
    return null;
  }
};

/** The link version an offer email (outbox payload or log snapshot) was written for; null when it cannot be told. */
export const offerEmailLinkVersion = (
  value: unknown,
  decodeLegacy: (ciphertext: string) => { offerId: string; version: number } | null = decodeLegacyOfferToken,
): number | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const link = record.offerLink;
  if (link && typeof link === 'object') {
    const version = (link as Record<string, unknown>).tokenVersion;
    if (typeof version === 'number' && Number.isInteger(version) && version >= 1) return version;
  }
  if (typeof record.responseTokenCiphertext === 'string') {
    const decoded = decodeLegacy(record.responseTokenCiphertext);
    return decoded && decoded.offerId === record.offerId ? decoded.version : null;
  }
  return null;
};

export type ConfiguredEmailDispatchInput = {
  eventCode: string;
  relatedEntityType: string;
  relatedEntityId: string;
  recipientEmail?: string | null;
  payloadSnapshot?: Record<string, unknown>;
  dedupeSuffix?: string;
};

type ConfiguredEmailPayload = {
  kind: 'CONFIGURED_EVENT';
  eventCode: string;
  relatedEntityType: string;
  relatedEntityId: string;
  recipientEmail: string;
  payloadSnapshot: Record<string, unknown>;
  attachmentMode: EmailAttachmentMode;
};

const buildConfiguredEmailDedupeKey = (input: ConfiguredEmailDispatchInput, recipientEmail: string) =>
  `${input.eventCode}:${input.relatedEntityType}:${input.relatedEntityId}:${recipientEmail}${input.dedupeSuffix ? `:${input.dedupeSuffix}` : ''}`;

const getSelectedEmailTemplate = async (eventCode: string) => {
  const rule = await prisma.emailAutomationRule.findUnique({
    where: { eventCode },
    include: { template: true },
  });
  if (rule && !rule.enabled) return { template: null, disabled: true } as const;
  if (rule?.template && !rule.template.archived) return { template: rule.template, disabled: false } as const;
  const fallback = await prisma.recruitmentEmailTemplate.findFirst({
    where: { eventCode, archived: false },
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
  });
  return { template: fallback, disabled: !fallback?.enabled } as const;
};

/**
 * Configured events never carry an offer link (the offer invitation goes through enqueueOfferEmail), so the outbox
 * keeps the values the email is rendered from; the log copy is still masked in case a caller ever adds one.
 */
export const enqueueConfiguredEmail = async (input: ConfiguredEmailDispatchInput) => {
  const recipientEmail = String(input.recipientEmail || '').trim().toLowerCase();
  if (!recipientEmail || !emailAddressPattern.test(recipientEmail)) return { queued: false, reason: 'RECIPIENT_MISSING' as const };
  const event = getCommunicationEvent(input.eventCode);
  if (!event) return { queued: false, reason: 'UNSUPPORTED_EVENT' as const };
  if (input.eventCode === OFFER_EMAIL_EVENT) return { queued: false, reason: 'USE_OFFER_DISPATCH' as const };

  const selected = await getSelectedEmailTemplate(input.eventCode);
  const template = selected.template;
  if (selected.disabled || !template?.enabled) return { queued: false, reason: 'TEMPLATE_DISABLED' as const };
  const payloadSnapshot = input.payloadSnapshot || {};
  const rendered = renderRecruitmentEmail(template, normalizeEventVariables(payloadSnapshot));
  const attachmentMode = getEmailAttachmentModeForEvent(input.eventCode);
  const dedupeKey = buildConfiguredEmailDedupeKey(input, recipientEmail);

  try {
    const log = await prisma.transactionalEmailLog.create({
      data: {
        eventCode: input.eventCode,
        templateId: template.id,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        recipientEmail,
        subject: maskOfferLinks(rendered.subject),
        status: 'QUEUED',
        payloadSnapshot: maskOfferLinks({ ...payloadSnapshot, attachmentMode }) as Prisma.InputJsonObject,
        dedupeKey,
        outbox: {
          create: {
            payload: {
              kind: 'CONFIGURED_EVENT',
              eventCode: input.eventCode,
              relatedEntityType: input.relatedEntityType,
              relatedEntityId: input.relatedEntityId,
              recipientEmail,
              payloadSnapshot: payloadSnapshot as Prisma.InputJsonObject,
              attachmentMode,
            } satisfies ConfiguredEmailPayload,
          },
        },
      },
      select: { id: true },
    });
    return { queued: true, logId: log.id };
  } catch (error) {
    if (error instanceof Error && /unique constraint/i.test(error.message)) return { queued: false, reason: 'ALREADY_QUEUED' as const };
    throw error;
  }
};

export const buildOfferEmailDedupeKey = (offerId: string, responseTokenVersion: number, dedupeSuffix?: string) =>
  `${OFFER_EMAIL_EVENT}:${offerId}:${responseTokenVersion}${dedupeSuffix ? `:${dedupeSuffix}` : ''}`;

/**
 * Queues the offer invitation for the offer's current link version. Neither the log nor the outbox holds a link:
 * the outbox names the version and delivery checks it and builds the links then (see deliverOfferEmail).
 */
export const enqueueOfferEmail = async (offerId: string, options: { dedupeSuffix?: string } = {}) => {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { candidate: true, application: true, job: true },
  });
  if (!offer) return { queued: false, reason: 'OFFER_NOT_FOUND' as const };

  const selected = await getSelectedEmailTemplate(OFFER_EMAIL_EVENT);
  const template = selected.template;
  if (selected.disabled || !template?.enabled) return { queued: false, reason: 'TEMPLATE_DISABLED' as const };
  if (!offer.candidate.email) return { queued: false, reason: 'RECIPIENT_MISSING' as const };

  const offerLink: OfferLinkRef = { offerId: offer.id, tokenVersion: offer.responseTokenVersion };
  // Made now so the email, WhatsApp and SMS of this send share one short link. Not fatal: delivery makes it again.
  await ensureOfferShortLink(offer.id, offer.responseTokenVersion).catch((error) => {
    console.error('[offer email] short link could not be created:', error instanceof Error ? error.message : error);
  });
  const rendered = renderRecruitmentEmail(template, buildOfferEmailVariables(offer, MASKED_OFFER_LINKS));
  const dedupeKey = buildOfferEmailDedupeKey(offer.id, offer.responseTokenVersion, options.dedupeSuffix);

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
        payloadSnapshot: maskOfferLinks({ offerId: offer.id, templateCode: template.code, attachmentMode: getEmailAttachmentMode(template.attachmentMode), offerLink }),
        dedupeKey,
        outbox: {
          create: {
            payload: { kind: 'OFFER', offerId: offer.id, offerLink } satisfies OfferEmailOutboxPayload,
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

const REQUEUE_REFUSALS: Record<string, string> = {
  OFFER_NOT_FOUND: 'The offer no longer exists.',
  TEMPLATE_DISABLED: 'This email is switched off or has no active template (Settings > Email).',
  RECIPIENT_MISSING: 'The recipient no longer has a valid email address.',
  UNSUPPORTED_EVENT: 'This email event is no longer supported.',
  ALREADY_QUEUED: 'This email is already queued.',
};

/**
 * Retry / Resend from the delivery log, for offer emails and configured events alike. An offer email goes through the
 * same link check as delivery, so a superseded link or a closed offer is refused instead of sent. A failed or queued
 * email is retried in place (one row, so the worker cannot later send a second copy); a sent one gets a new row.
 */
export const retryTransactionalEmailLog = async (emailLogId: string) => {
  const log = await prisma.transactionalEmailLog.findUnique({
    where: { id: emailLogId },
    select: {
      id: true, eventCode: true, relatedEntityId: true, status: true, payloadSnapshot: true,
      outbox: { select: { id: true, status: true, attempts: true, payload: true } },
    },
  });
  if (!log) throw new Error('Email delivery record not found.');
  if (log.outbox?.status === 'PROCESSING') throw new Error('This email is currently being delivered.');
  const outboxPayload = log.outbox?.payload && typeof log.outbox.payload === 'object' && !Array.isArray(log.outbox.payload)
    ? log.outbox.payload as Record<string, unknown>
    : null;
  const configured = outboxPayload?.kind === 'CONFIGURED_EVENT' ? outboxPayload as unknown as ConfiguredEmailPayload : null;

  if (!configured) {
    if (log.eventCode !== OFFER_EMAIL_EVENT || !log.relatedEntityId) {
      throw new Error('This email cannot be sent again from the delivery log: its delivery record is incomplete.');
    }
    const tokenVersion = offerEmailLinkVersion(outboxPayload) ?? offerEmailLinkVersion(log.payloadSnapshot);
    if (tokenVersion === null) throw new Error('This offer email cannot be checked against the current offer link. Send the offer again from the offer page.');
    const decision = decideOfferEmailDelivery(await resolveOfferLinkForDelivery(log.relatedEntityId, tokenVersion));
    if (!decision.send) throw new Error(`This offer email cannot be sent again: ${decision.reason.toLowerCase()}.`);
  }

  if (log.outbox && log.status !== 'SENT' && log.outbox.status !== 'SENT') {
    // One more attempt at least, keeping the count of the earlier ones.
    const claimed = await prisma.transactionalEmailOutbox.updateMany({
      where: { id: log.outbox.id, status: { in: ['PENDING', 'FAILED', 'CANCELLED'] } },
      data: { status: 'PENDING', nextAttemptAt: new Date(), lockedAt: null, attempts: Math.min(log.outbox.attempts, MAX_OUTBOX_ATTEMPTS - 1) },
    });
    if (claimed.count !== 1) throw new Error('This email is currently being delivered.');
    await prisma.transactionalEmailLog.update({ where: { id: log.id }, data: { status: 'QUEUED', errorMessage: null } });
    return { queued: true, logId: log.id, requeued: true };
  }

  const dedupeSuffix = `manual-${emailLogId}-${Date.now()}`;
  const result = configured
    ? await enqueueConfiguredEmail({
      eventCode: configured.eventCode,
      relatedEntityType: configured.relatedEntityType,
      relatedEntityId: configured.relatedEntityId,
      recipientEmail: configured.recipientEmail,
      payloadSnapshot: configured.payloadSnapshot,
      dedupeSuffix,
    })
    : await enqueueOfferEmail(log.relatedEntityId!, { dedupeSuffix });
  if (!result.queued) {
    const reason = 'reason' in result ? result.reason : '';
    throw new Error(REQUEUE_REFUSALS[reason] ?? 'The email could not be queued again.');
  }
  return result;
};

/** Thrown during delivery when the email must not go out at all: the outbox row is CANCELLED and the log SKIPPED. */
export class EmailDeliveryCancelled extends Error {}

export type EmailDeliveryOutcome =
  | { status: 'SENT' }
  | { status: 'CANCELLED'; reason: string }
  | { status: 'FAILED'; error: string };

export const classifyEmailDeliveryError = (error: unknown): EmailDeliveryOutcome => (error instanceof EmailDeliveryCancelled
  ? { status: 'CANCELLED', reason: error.message.slice(0, 500) }
  : { status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed.' });

const retryAt = (attempts: number, now = new Date()) => new Date(now.getTime() + Math.min(60, 2 ** Math.max(0, attempts)) * 60 * 1000);

/** The outbox and log updates for one delivery attempt: sent, cancelled (never retried) or failed (retried later). */
export const emailOutcomeUpdates = (outcome: EmailDeliveryOutcome, attempts: number, now = new Date()) => {
  switch (outcome.status) {
    case 'SENT':
      return {
        outbox: { status: 'SENT' as const, processedAt: now, lockedAt: null, lastError: null },
        log: { status: 'SENT' as const, sentAt: now, errorMessage: null },
      };
    case 'CANCELLED':
      return {
        outbox: { status: 'CANCELLED' as const, processedAt: now, lockedAt: null, nextAttemptAt: null, lastError: outcome.reason },
        log: { status: 'SKIPPED' as const, errorMessage: outcome.reason },
      };
    default:
      return {
        outbox: { status: 'FAILED' as const, processedAt: now, lockedAt: null, nextAttemptAt: retryAt(attempts + 1, now), lastError: outcome.error },
        log: { status: 'FAILED' as const, errorMessage: outcome.error },
      };
  }
};

const toBuffer = async (stream: Readable, label: string) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_ATTACHMENT_BYTES) throw new Error(`${label} is too large to attach (limit 10 MB).`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

/** A private Drive file read with the service account (the URL needs a signed-in user, it is no bearer link). */
const driveAttachment = async (fileUrl: string | null, filename: string, contentType: string, label: string) => {
  const driveFileId = extractDriveFileId(fileUrl);
  if (!driveFileId) throw new Error(`${label} is unavailable.`);
  return {
    filename,
    content: await toBuffer(await streamFileFromDrive(driveFileId), label),
    contentType,
  } satisfies TransactionalEmailAttachment;
};

const SIGNED_COPY_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * The content type of a signed offer copy (the candidate's scan or HR's paper copy): the stored mime type when it is
 * one the upload accepts, else the file extension; null for anything else, which is then not attached.
 */
export const signedCopyContentType = (document: { fileName?: string | null; mimeType?: string | null } | null) => {
  const mime = document?.mimeType?.trim().toLowerCase();
  if (mime && Object.values(SIGNED_COPY_TYPES).includes(mime)) return mime;
  const extension = document?.fileName?.includes('.') ? document.fileName.split('.').pop()?.toLowerCase() : undefined;
  return (extension && SIGNED_COPY_TYPES[extension]) || null;
};

const resolveOfferAcceptanceAttachments = async (offerId: string) => {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: {
      status: true, acceptanceMethod: true, acceptanceCertificateUrl: true, signatureFileUrl: true, signedLetterUrl: true,
      application: { select: { applicationRef: true } },
    },
  });
  if (!offer) throw new EmailDeliveryCancelled(OFFER_LINK_SKIP_REASONS.OFFER_NOT_FOUND);
  // Never confirm an acceptance that is no longer recorded on the offer.
  if (offer.status !== 'ACCEPTED') throw new EmailDeliveryCancelled('Offer is no longer accepted');
  const ref = offer.application.applicationRef;
  const attachments: TransactionalEmailAttachment[] = [
    await driveAttachment(offer.acceptanceCertificateUrl, `Offer_Acceptance_${ref}.pdf`, 'application/pdf', 'The offer acceptance certificate'),
  ];
  // The signed offer letter: signed on the link, uploaded by the candidate, or recorded by HR.
  const signedLetterUrl = signedLetterUrlOf(offer);
  if (signedLetterUrl) {
    // Name and type come from the document row, as for HR's download of the same file (PDF or image).
    const document = await prisma.candidateDocument.findFirst({ where: { fileUrl: signedLetterUrl }, select: { fileName: true, mimeType: true } });
    const contentType = signedCopyContentType(document);
    if (document && contentType) {
      attachments.push(await driveAttachment(signedLetterUrl, document.fileName, contentType, 'The signed offer copy'));
    } else {
      console.warn(`[offer email] signed copy of offer ${offerId} has no known file type; sending the certificate only.`);
    }
  }
  return attachments;
};

const resolveConfiguredEventAttachment = async (payload: ConfiguredEmailPayload): Promise<TransactionalEmailAttachment[]> => {
  switch (payload.attachmentMode) {
    case 'DYNAMIC_OFFER_ACCEPTANCE_PDF':
      return resolveOfferAcceptanceAttachments(payload.relatedEntityId);
    case 'DYNAMIC_VEHICLE_INVOICE_PDF': {
      const document = await buildVehicleSaleInvoicePdf(payload.relatedEntityId);
      return [{ filename: document.fileName, content: document.buffer, contentType: 'application/pdf' }];
    }
    case 'DYNAMIC_PAYMENT_RECEIPT_PDF': {
      const document = await buildVehicleSalePaymentReceiptPdf(payload.relatedEntityId);
      return [{ filename: document.fileName, content: document.buffer, contentType: 'application/pdf' }];
    }
    case 'DYNAMIC_PRIME_INVOICE_PDF': {
      const document = await buildCustomerPrimeInvoicePdfForSubscription(payload.relatedEntityId);
      return [{ filename: document.fileName, content: document.buffer, contentType: 'application/pdf' }];
    }
    default:
      return [];
  }
};

/**
 * Late binding: the link version named by the outbox row is checked now, and only an open, current link is filled
 * in and sent. Anything else is cancelled, never retried.
 */
const deliverOfferEmail = async (template: { subject: string; bodyHtml: string; attachmentMode: string }, payload: Record<string, unknown>) => {
  const offerId = typeof payload.offerId === 'string' ? payload.offerId : '';
  const tokenVersion = offerEmailLinkVersion(payload);
  if (!offerId || tokenVersion === null) throw new EmailDeliveryCancelled('Offer link could not be checked; send the offer again');
  const decision = decideOfferEmailDelivery(await resolveOfferLinkForDelivery(offerId, tokenVersion));
  if (!decision.send) throw new EmailDeliveryCancelled(decision.reason);

  const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: { candidate: true, application: true, job: true } });
  if (!offer?.candidate.email) throw new Error('Offer recipient email is no longer available.');
  const rendered = renderRecruitmentEmail(template, buildOfferEmailVariables(offer, decision.links));
  const attachments = getEmailAttachmentMode(template.attachmentMode) === DYNAMIC_OFFER_PDF_ATTACHMENT
    ? [await driveAttachment(offer.offerLetterUrl, offer.offerLetterFileName || 'offer-letter.pdf', 'application/pdf', 'The current offer letter PDF')]
    : [];

  await sendTransactionalEmailMessage({
    to: offer.candidate.email,
    subject: rendered.subject,
    html: rendered.bodyHtml,
    text: textFromHtml(rendered.bodyHtml),
    attachments,
  });
};

const deliverEmailOutbox = async (emailLogId: string) => {
  const emailLog = await prisma.transactionalEmailLog.findUnique({
    where: { id: emailLogId },
    include: { outbox: true, template: true },
  });
  if (!emailLog?.outbox || !emailLog.template) throw new Error('Email delivery record is incomplete.');
  const payload = (emailLog.outbox.payload ?? {}) as Record<string, unknown>;
  if (payload.kind === 'CONFIGURED_EVENT') {
    const eventPayload = payload as unknown as ConfiguredEmailPayload;
    const rendered = renderRecruitmentEmail(emailLog.template, normalizeEventVariables(eventPayload.payloadSnapshot));
    await sendTransactionalEmailMessage({
      to: eventPayload.recipientEmail,
      subject: rendered.subject,
      html: rendered.bodyHtml,
      text: textFromHtml(rendered.bodyHtml),
      attachments: await resolveConfiguredEventAttachment(eventPayload),
    });
    return;
  }
  // Offer emails: rows with kind 'OFFER' and rows queued before it (which have no kind).
  await deliverOfferEmail(emailLog.template, payload);
};

const recoverStaleOutbox = async (now: Date) => {
  const stale = await prisma.transactionalEmailOutbox.findMany({
    where: { status: 'PROCESSING', lockedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
    select: { id: true, emailLogId: true, attempts: true },
  });
  await prisma.$transaction(stale.flatMap((item) => [
    prisma.transactionalEmailOutbox.update({ where: { id: item.id }, data: { status: 'FAILED', lockedAt: null, processedAt: now, nextAttemptAt: retryAt(item.attempts, now), lastError: 'Delivery lease expired; retry scheduled.' } }),
    prisma.transactionalEmailLog.update({ where: { id: item.emailLogId }, data: { status: 'FAILED', errorMessage: 'Delivery lease expired; retry scheduled.' } }),
  ]));
  return stale.length;
};

export const processTransactionalEmailOutbox = async ({ limit = 25 }: { limit?: number } = {}) => {
  const settings = await prisma.transactionalEmailSettings.findUnique({
    where: { id: 'default' },
    select: { enabled: true },
  });
  if (!settings?.enabled) {
    return { recovered: 0, selected: 0, sent: 0, failed: 0, cancelled: 0, skipped: 'EMAIL_DISABLED' };
  }
  const now = new Date();
  const recovered = await recoverStaleOutbox(now);
  const pending = await prisma.transactionalEmailOutbox.findMany({
    where: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_OUTBOX_ATTEMPTS }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    orderBy: { createdAt: 'asc' },
    take: Math.min(100, Math.max(1, limit)),
    select: { id: true, emailLogId: true, attempts: true },
  });
  const counts = { sent: 0, failed: 0, cancelled: 0 };
  for (const item of pending) {
    const claimed = await prisma.transactionalEmailOutbox.updateMany({ where: { id: item.id, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'PROCESSING', attempts: { increment: 1 }, lockedAt: now } });
    if (claimed.count !== 1) continue;
    let outcome: EmailDeliveryOutcome;
    try {
      await deliverEmailOutbox(item.emailLogId);
      outcome = { status: 'SENT' };
    } catch (error: unknown) {
      outcome = classifyEmailDeliveryError(error);
    }
    const updates = emailOutcomeUpdates(outcome, item.attempts);
    try {
      await prisma.$transaction([
        prisma.transactionalEmailOutbox.update({ where: { id: item.id }, data: updates.outbox }),
        prisma.transactionalEmailLog.update({ where: { id: item.emailLogId }, data: updates.log }),
      ]);
    } catch (error) {
      // The row stays PROCESSING and is recovered by the lease check; the other rows still go out.
      console.error('[email] delivery outcome could not be saved:', error instanceof Error ? error.message : error);
    }
    if (outcome.status === 'SENT') counts.sent += 1;
    else if (outcome.status === 'CANCELLED') counts.cancelled += 1;
    else counts.failed += 1;
  }
  return { recovered, selected: pending.length, ...counts };
};
