import crypto from 'node:crypto';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import prisma from '../lib/prisma';
import {
  EMAIL_OTP_DEFAULT_EXPIRY_MINUTES,
  EMAIL_OTP_DEFAULT_LENGTH,
  normalizeEmailOtpAddress,
} from '../utils/emailOtp';

const prismaAny = prisma as any;
export const EMAIL_OTP_MASKED_SECRET = '********';
const EMAIL_OTP_SETTINGS_ID = 'default';

export class EmailOtpSettingsError extends Error {
  statusCode = 400;
}

export type EmailOtpSettings = {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  senderEmail: string | null;
  senderName: string;
  appPassword: string | null;
  otpExpiryMinutes: number;
  otpLength: number;
  updatedAt: Date | null;
  updatedByUserId: string | null;
};

type EmailOtpSettingsInput = {
  enabled?: boolean;
  senderEmail?: string | null;
  senderName?: string | null;
  appPassword?: string | null;
  otpExpiryMinutes?: number | string;
  otpLength?: number | string;
  updatedByUserId?: string | null;
};

const normalizeInteger = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};

const getEncryptionSecret = () =>
  process.env.EMAIL_OTP_SETTINGS_SECRET?.trim() ||
  process.env.JWT_SECRET?.trim() ||
  'jcbexchange_super_secret_key_123';

const getEncryptionKey = () => crypto.createHash('sha256').update(getEncryptionSecret()).digest();

const encryptAppPassword = (value: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
};

const decryptAppPassword = (value?: string | null) => {
  if (!value) {
    return null;
  }

  try {
    const [version, iv, authTag, ciphertext] = value.split('.');
    if (version !== 'v1' || !iv || !authTag || !ciphertext) {
      throw new Error('Invalid encrypted email credential.');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new EmailOtpSettingsError('Unable to decrypt Gmail App Password. Check EMAIL_OTP_SETTINGS_SECRET.');
  }
};

const defaults: EmailOtpSettings = {
  enabled: false,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpSecure: true,
  senderEmail: null,
  senderName: 'JCB Exchange',
  appPassword: null,
  otpExpiryMinutes: EMAIL_OTP_DEFAULT_EXPIRY_MINUTES,
  otpLength: EMAIL_OTP_DEFAULT_LENGTH,
  updatedAt: null,
  updatedByUserId: null,
};

const normalizeStoredSettings = (record?: any | null): EmailOtpSettings => ({
  enabled: record?.enabled === true,
  smtpHost: String(record?.smtpHost || defaults.smtpHost).trim() || defaults.smtpHost,
  smtpPort: normalizeInteger(record?.smtpPort, 1, 65535, defaults.smtpPort),
  smtpSecure: record?.smtpSecure !== false,
  senderEmail: normalizeEmailOtpAddress(record?.senderEmail),
  senderName: String(record?.senderName || defaults.senderName).trim() || defaults.senderName,
  appPassword: decryptAppPassword(record?.encryptedAppPassword),
  otpExpiryMinutes: normalizeInteger(record?.otpExpiryMinutes, 1, 60, defaults.otpExpiryMinutes),
  otpLength: normalizeInteger(record?.otpLength, 4, 10, defaults.otpLength),
  updatedAt: record?.updatedAt || null,
  updatedByUserId: record?.updatedByUserId || null,
});

export const getEmailOtpSettings = async (): Promise<EmailOtpSettings> => {
  const record = await prismaAny.emailOtpIntegrationSettings.findUnique({
    where: { id: EMAIL_OTP_SETTINGS_ID },
  });
  return record ? normalizeStoredSettings(record) : defaults;
};

export const isEmailOtpConfigured = (settings: EmailOtpSettings) =>
  Boolean(settings.senderEmail && settings.appPassword);

export const getEmailOtpPublicConfig = async () => {
  const settings = await getEmailOtpSettings();
  return {
    enabled: settings.enabled && isEmailOtpConfigured(settings),
    otpLength: settings.otpLength,
    otpExpirySeconds: settings.otpExpiryMinutes * 60,
    resendCooldownSeconds: 45,
  };
};

export const getEmailOtpAdminSettings = async () => {
  const settings = await getEmailOtpSettings();
  return {
    enabled: settings.enabled,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    senderEmail: settings.senderEmail || '',
    senderName: settings.senderName,
    appPassword: settings.appPassword ? EMAIL_OTP_MASKED_SECRET : '',
    appPasswordConfigured: isEmailOtpConfigured(settings),
    otpExpiryMinutes: settings.otpExpiryMinutes,
    otpLength: settings.otpLength,
    updatedAt: settings.updatedAt,
    updatedByUserId: settings.updatedByUserId,
  };
};

export const updateEmailOtpSettings = async (input: EmailOtpSettingsInput) => {
  const current = await getEmailOtpSettings();
  const senderEmail = input.senderEmail !== undefined
    ? normalizeEmailOtpAddress(input.senderEmail)
    : current.senderEmail;
  const senderName = input.senderName !== undefined
    ? String(input.senderName || '').trim() || defaults.senderName
    : current.senderName;
  const nextAppPassword = input.appPassword !== undefined && input.appPassword !== EMAIL_OTP_MASKED_SECRET
    ? String(input.appPassword || '').replace(/\s+/g, '') || current.appPassword
    : current.appPassword;
  const enabled = input.enabled !== undefined ? input.enabled === true : current.enabled;

  if (input.senderEmail !== undefined && input.senderEmail && !senderEmail) {
    throw new EmailOtpSettingsError('Enter a valid Gmail sender email address.');
  }

  if (enabled && (!senderEmail || !nextAppPassword)) {
    throw new EmailOtpSettingsError('Gmail sender email and App Password are required before enabling Email OTP.');
  }

  const nextOtpExpiryMinutes = normalizeInteger(
    input.otpExpiryMinutes,
    1,
    60,
    current.otpExpiryMinutes,
  );
  const nextOtpLength = normalizeInteger(input.otpLength, 4, 10, current.otpLength);
  const updatedAt = new Date();

  await prismaAny.emailOtpIntegrationSettings.upsert({
    where: { id: EMAIL_OTP_SETTINGS_ID },
    create: {
      id: EMAIL_OTP_SETTINGS_ID,
      enabled,
      smtpHost: defaults.smtpHost,
      smtpPort: defaults.smtpPort,
      smtpSecure: defaults.smtpSecure,
      senderEmail,
      senderName,
      encryptedAppPassword: nextAppPassword ? encryptAppPassword(nextAppPassword) : null,
      otpExpiryMinutes: nextOtpExpiryMinutes,
      otpLength: nextOtpLength,
      updatedAt,
      updatedByUserId: input.updatedByUserId || null,
    },
    update: {
      enabled,
      senderEmail,
      senderName,
      ...(input.appPassword !== undefined && input.appPassword !== EMAIL_OTP_MASKED_SECRET
        ? { encryptedAppPassword: nextAppPassword ? encryptAppPassword(nextAppPassword) : null }
        : {}),
      otpExpiryMinutes: nextOtpExpiryMinutes,
      otpLength: nextOtpLength,
      updatedAt,
      updatedByUserId: input.updatedByUserId || null,
    },
  });

  return getEmailOtpAdminSettings();
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] || character);

export const buildEmailOtpMessage = ({
  otp,
  senderName,
  expiryMinutes,
}: {
  otp: string;
  senderName: string;
  expiryMinutes: number;
}) => ({
  subject: `${senderName} login verification code`,
  text: `Your ${senderName} login OTP is ${otp}. It expires in ${expiryMinutes} minutes. Do not share this code with anyone.`,
  html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937"><h2>${escapeHtml(senderName)} login verification</h2><p>Your one-time password is:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${escapeHtml(otp)}</p><p>This code expires in ${expiryMinutes} minutes. Do not share it with anyone.</p></div>`,
});

type EmailTransport = Pick<Transporter, 'sendMail'>;

export const sendEmailOtp = async ({
  to,
  otp,
  settings,
  transport,
}: {
  to: string;
  otp: string;
  settings: EmailOtpSettings;
  transport?: EmailTransport;
}) => {
  if (!settings.senderEmail || !settings.appPassword) {
    throw new EmailOtpSettingsError('Gmail SMTP is not configured.');
  }

  const mailTransport = transport || nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: {
      user: settings.senderEmail,
      pass: settings.appPassword,
    },
  });
  const message = buildEmailOtpMessage({
    otp,
    senderName: settings.senderName,
    expiryMinutes: settings.otpExpiryMinutes,
  });
  const mailOptions: SendMailOptions = {
    from: {
      name: settings.senderName,
      address: settings.senderEmail,
    },
    to,
    ...message,
  };

  await mailTransport.sendMail(mailOptions);
};

export const getEmailOtpHashSecret = () =>
  process.env.EMAIL_OTP_HASH_SECRET?.trim() ||
  process.env.JWT_SECRET?.trim() ||
  'jcbexchange_email_otp_hash_secret';
