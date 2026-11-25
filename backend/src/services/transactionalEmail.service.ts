import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import prisma from '../lib/prisma';
import { normalizeEmailOtpAddress } from '../utils/emailOtp';
import { maskOfferLinks } from '../utils/offerShortCode';
import {
  decryptTransactionalEmailCredential,
  encryptTransactionalEmailCredential,
} from './transactionalEmailCredentialCrypto';

export const TRANSACTIONAL_EMAIL_MASKED_SECRET = '********';
const SETTINGS_ID = 'default';

export class TransactionalEmailSettingsError extends Error {
  statusCode = 400;
}

export type TransactionalEmailSettingsInput = {
  enabled?: boolean;
  smtpHost?: string;
  smtpPort?: number | string;
  smtpSecure?: boolean;
  senderEmail?: string | null;
  senderName?: string | null;
  replyToEmail?: string | null;
  smtpPassword?: string | null;
  updatedByUserId?: string | null;
};

type StoredTransactionalEmailSettings = {
  id: string;
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  senderEmail: string | null;
  senderName: string;
  replyToEmail: string | null;
  encryptedSmtpPassword: string | null;
  lastTestedAt: Date | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  updatedAt: Date;
  updatedByUserId: string | null;
};

export type TransactionalEmailRuntimeSettings = {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  senderEmail: string;
  senderName: string;
  replyToEmail: string | null;
  smtpPassword: string;
};

const defaults = {
  enabled: false,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpSecure: true,
  senderEmail: null as string | null,
  senderName: 'JCB Exchange',
  replyToEmail: null as string | null,
};

const isUsableEncryptionSecret = (secret = process.env.EMAIL_SETTINGS_SECRET?.trim()) =>
  Boolean(secret && /^[a-fA-F0-9]{64}$/.test(secret));

const getEncryptionSecret = (): string => {
  const secret = process.env.EMAIL_SETTINGS_SECRET?.trim();
  if (!isUsableEncryptionSecret(secret)) {
    throw new TransactionalEmailSettingsError('EMAIL_SETTINGS_SECRET must be configured as a 64-character hexadecimal value before saving SMTP credentials.');
  }
  return secret!;
};

const normalizePort = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new TransactionalEmailSettingsError('SMTP port must be a whole number between 1 and 65535.');
  }
  return parsed;
};

const normalizeHost = (value: unknown, fallback: string) => {
  if (value === undefined) return fallback;
  const host = String(value).trim();
  if (!host || host.length > 255 || /\s/.test(host) || !/^[a-zA-Z0-9.-]+$/.test(host)) {
    throw new TransactionalEmailSettingsError('Enter a valid SMTP host, for example smtp.gmail.com.');
  }
  return host;
};

const normalizeEmail = (value: unknown, field: string, current: string | null) => {
  if (value === undefined) return current;
  if (value === null || value === '') return null;
  const normalized = normalizeEmailOtpAddress(String(value));
  if (!normalized) throw new TransactionalEmailSettingsError(`Enter a valid ${field}.`);
  return normalized;
};

export const normalizeTransactionalEmailInput = (
  input: TransactionalEmailSettingsInput,
  current: Pick<StoredTransactionalEmailSettings, 'enabled' | 'smtpHost' | 'smtpPort' | 'smtpSecure' | 'senderEmail' | 'senderName' | 'replyToEmail'>,
) => {
  const senderEmail = normalizeEmail(input.senderEmail, 'sender email address', current.senderEmail);
  const replyToEmail = normalizeEmail(input.replyToEmail, 'reply-to email address', current.replyToEmail);
  const senderName = input.senderName === undefined
    ? current.senderName
    : String(input.senderName || '').trim();
  if (!senderName || senderName.length > 120) {
    throw new TransactionalEmailSettingsError('Sender name is required and must be 120 characters or fewer.');
  }

  return {
    enabled: input.enabled === undefined ? current.enabled : input.enabled === true,
    smtpHost: normalizeHost(input.smtpHost, current.smtpHost),
    smtpPort: input.smtpPort === undefined ? current.smtpPort : normalizePort(input.smtpPort, current.smtpPort),
    smtpSecure: input.smtpSecure === undefined ? current.smtpSecure : input.smtpSecure === true,
    senderEmail,
    senderName,
    replyToEmail,
  };
};

const getStoredSettings = async (): Promise<StoredTransactionalEmailSettings> => {
  return prisma.transactionalEmailSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: {
      id: SETTINGS_ID,
      enabled: defaults.enabled,
      smtpHost: defaults.smtpHost,
      smtpPort: defaults.smtpPort,
      smtpSecure: defaults.smtpSecure,
      senderEmail: defaults.senderEmail,
      senderName: defaults.senderName,
      replyToEmail: defaults.replyToEmail,
    },
  });
};

export const getTransactionalEmailReadiness = (settings: Pick<StoredTransactionalEmailSettings, 'senderEmail' | 'encryptedSmtpPassword'>) => ({
  senderConfigured: Boolean(settings.senderEmail),
  passwordConfigured: Boolean(settings.encryptedSmtpPassword),
  encryptionKeyConfigured: isUsableEncryptionSecret(),
  ready: Boolean(settings.senderEmail && settings.encryptedSmtpPassword && isUsableEncryptionSecret()),
});

const maskEmail = (email: string | null) => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
};

const serializeSettings = (settings: StoredTransactionalEmailSettings) => ({
  enabled: settings.enabled,
  ready: getTransactionalEmailReadiness(settings).ready,
  smtpHost: settings.smtpHost,
  smtpPort: settings.smtpPort,
  smtpSecure: settings.smtpSecure,
  senderEmail: settings.senderEmail || '',
  senderEmailMasked: maskEmail(settings.senderEmail),
  senderName: settings.senderName,
  replyToEmail: settings.replyToEmail || '',
  smtpPassword: settings.encryptedSmtpPassword ? TRANSACTIONAL_EMAIL_MASKED_SECRET : '',
  credentials: getTransactionalEmailReadiness(settings),
  lastTestedAt: settings.lastTestedAt,
  lastTestStatus: settings.lastTestStatus,
  lastTestError: settings.lastTestError,
  updatedAt: settings.updatedAt,
  updatedByUserId: settings.updatedByUserId,
});

export const getTransactionalEmailSettings = async () => serializeSettings(await getStoredSettings());

export const getTransactionalEmailRuntimeSettings = async (): Promise<TransactionalEmailRuntimeSettings> => {
  const settings = await getStoredSettings();
  if (!settings.senderEmail || !settings.encryptedSmtpPassword) {
    throw new TransactionalEmailSettingsError('Transactional SMTP is not configured. Add a sender email and SMTP password first.');
  }
  const smtpPassword = decryptTransactionalEmailCredential(settings.encryptedSmtpPassword, getEncryptionSecret());
  return {
    enabled: settings.enabled,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    senderEmail: settings.senderEmail,
    senderName: settings.senderName,
    replyToEmail: settings.replyToEmail,
    smtpPassword,
  };
};

export const updateTransactionalEmailSettings = async (input: TransactionalEmailSettingsInput) => {
  const current = await getStoredSettings();
  const next = normalizeTransactionalEmailInput(input, current);
  const suppliedPassword = input.smtpPassword !== undefined && input.smtpPassword !== TRANSACTIONAL_EMAIL_MASKED_SECRET
    ? String(input.smtpPassword || '').trim()
    : '';
  const encryptedSmtpPassword = suppliedPassword
    ? encryptTransactionalEmailCredential(suppliedPassword, getEncryptionSecret())
    : current.encryptedSmtpPassword;

  if (next.enabled && (!next.senderEmail || !encryptedSmtpPassword || !isUsableEncryptionSecret())) {
    throw new TransactionalEmailSettingsError('Sender email and SMTP password are required before enabling transactional email.');
  }

  await prisma.transactionalEmailSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      ...next,
      encryptedSmtpPassword,
      updatedByUserId: input.updatedByUserId || null,
    },
    update: {
      ...next,
      ...(input.smtpPassword !== undefined && input.smtpPassword !== TRANSACTIONAL_EMAIL_MASKED_SECRET
        ? { encryptedSmtpPassword: encryptedSmtpPassword || null }
        : {}),
      updatedByUserId: input.updatedByUserId || null,
    },
  });

  return getTransactionalEmailSettings();
};

type EmailTransport = Pick<Transporter, 'sendMail' | 'verify'>;

const createTransport = (settings: TransactionalEmailRuntimeSettings): EmailTransport => nodemailer.createTransport({
  host: settings.smtpHost,
  port: settings.smtpPort,
  secure: settings.smtpSecure,
  auth: { user: settings.senderEmail, pass: settings.smtpPassword },
});

const updateTestState = async (status: 'SUCCESS' | 'FAILED', error?: string) => {
  await prisma.transactionalEmailSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      lastTestedAt: new Date(),
      lastTestStatus: status,
      lastTestError: error || null,
    },
  });
};

const smtpFailureMessage = 'SMTP connection failed. Check host, port, security mode and credentials.';

export const verifyTransactionalEmailConnection = async (transport?: EmailTransport) => {
  const settings = await getTransactionalEmailRuntimeSettings();
  try {
    await (transport || createTransport(settings)).verify();
    await updateTestState('SUCCESS');
    return { success: true, message: 'SMTP connection verified successfully.' };
  } catch {
    await updateTestState('FAILED', smtpFailureMessage);
    throw new TransactionalEmailSettingsError(smtpFailureMessage);
  }
};

export const buildTransactionalEmailTestMessage = (settings: TransactionalEmailRuntimeSettings, to: string): SendMailOptions => ({
  from: { name: settings.senderName, address: settings.senderEmail },
  ...(settings.replyToEmail ? { replyTo: settings.replyToEmail } : {}),
  to,
  subject: `${settings.senderName} SMTP test email`,
  text: `This is a test email from ${settings.senderName}. Your transactional email SMTP settings are working.`,
  html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937"><h2>${settings.senderName} SMTP test</h2><p>Your transactional email SMTP settings are working.</p></div>`,
});

export const sendTransactionalEmailTest = async ({ to, transport }: { to: string; transport?: EmailTransport }) => {
  const recipient = normalizeEmailOtpAddress(to);
  if (!recipient) throw new TransactionalEmailSettingsError('Enter a valid test recipient email address.');
  const settings = await getTransactionalEmailRuntimeSettings();
  try {
    await (transport || createTransport(settings)).sendMail(buildTransactionalEmailTestMessage(settings, recipient));
    await updateTestState('SUCCESS');
    return { success: true, message: `Test email sent to ${recipient}.` };
  } catch {
    await updateTestState('FAILED', 'Test email could not be sent. Check SMTP credentials and recipient address.');
    throw new TransactionalEmailSettingsError('Test email could not be sent. Check SMTP credentials and recipient address.');
  }
};

export type TransactionalEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type TransactionalEmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: TransactionalEmailAttachment[];
};

export const sendTransactionalEmailMessage = async (message: TransactionalEmailMessage) => {
  const settings = await getTransactionalEmailRuntimeSettings();
  if (!settings.enabled) {
    throw new TransactionalEmailSettingsError('Transactional email delivery is disabled.');
  }

  const recipient = normalizeEmailOtpAddress(message.to);
  if (!recipient) throw new TransactionalEmailSettingsError('Email recipient is invalid.');
  if (message.attachments && message.attachments.length > 5) {
    throw new TransactionalEmailSettingsError('Email attachment limit exceeded.');
  }

  await createTransport(settings).sendMail({
    from: { name: settings.senderName, address: settings.senderEmail },
    ...(settings.replyToEmail ? { replyTo: settings.replyToEmail } : {}),
    to: recipient,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments,
  });
  return { success: true };
};

export const getTransactionalEmailLogs = async ({ limit = 50, status }: { limit?: number; status?: string } = {}) => {
  const allowedStatuses = new Set(['QUEUED', 'SENT', 'FAILED', 'SKIPPED']);
  const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const where = status && allowedStatuses.has(status)
    ? { status: status as 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED' }
    : {};
  const logs = await prisma.transactionalEmailLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: normalizedLimit,
    select: {
      id: true,
      eventCode: true,
      recipientEmail: true,
      subject: true,
      status: true,
      errorMessage: true,
      sentAt: true,
      createdAt: true,
      payloadSnapshot: true,
      outbox: {
        select: {
          attempts: true,
          status: true,
          nextAttemptAt: true,
          processedAt: true,
          lastError: true,
        },
      },
    },
  });
  // New rows hold no offer link, but rows written before late binding (and any subject or error text that quoted
  // one) could: the delivery log is shown to every email reader, and a link there opens the candidate's offer.
  return { logs: logs.map((log) => maskOfferLinks(log)) };
};
