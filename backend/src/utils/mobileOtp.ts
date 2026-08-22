import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type MobileOtpSettings = {
  enabled: boolean;
  apiKey: string | null;
  senderId: string | null;
  templateId: string | null;
  templateMessage: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

type MobileOtpSession = {
  id: string;
  mobile: string;
  userId: string | null;
  createdAt: string;
  expiresAt: string;
  lastSentAt: string;
  attemptCount: number;
  verifiedAt: string | null;
};

type MobileOtpSessionStore = {
  sessions: MobileOtpSession[];
};

const OTP_EXPIRY_MINUTES = 5;
const OTP_COOLDOWN_SECONDS = 45;
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const sessionDirectory = path.resolve(process.cwd(), 'runtime');
const sessionFilePath = path.join(sessionDirectory, 'mobile-otp-sessions.json');

export const defaultMobileOtpTemplateMessage =
  'Your OTP for JCB Exchange is {#var#}. Validity 5 mins.';

export const defaultMobileOtpSettings: MobileOtpSettings = {
  enabled: false,
  apiKey: null,
  senderId: null,
  templateId: null,
  templateMessage: defaultMobileOtpTemplateMessage,
  updatedAt: null,
  updatedByUserId: null,
};

const normalizeTrimmedValue = (value?: string | null) => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
};

export const normalizeMobileOtpSettings = (
  settings?: Partial<MobileOtpSettings> | null,
): MobileOtpSettings => ({
  enabled: settings?.enabled === true,
  apiKey: normalizeTrimmedValue(settings?.apiKey) || null,
  senderId: normalizeTrimmedValue(settings?.senderId)?.toUpperCase() || null,
  templateId: normalizeTrimmedValue(settings?.templateId) || null,
  templateMessage:
    normalizeTrimmedValue(settings?.templateMessage) || defaultMobileOtpTemplateMessage,
  updatedAt: settings?.updatedAt || null,
  updatedByUserId: settings?.updatedByUserId || null,
});

const ensureSessionFile = async () => {
  await fs.mkdir(sessionDirectory, { recursive: true });

  try {
    await fs.access(sessionFilePath);
  } catch {
    const defaultStore: MobileOtpSessionStore = { sessions: [] };
    await fs.writeFile(sessionFilePath, JSON.stringify(defaultStore, null, 2), 'utf8');
  }
};

const readSessionStore = async (): Promise<MobileOtpSessionStore> => {
  await ensureSessionFile();

  try {
    const content = await fs.readFile(sessionFilePath, 'utf8');
    const parsed = JSON.parse(content) as Partial<MobileOtpSessionStore>;

    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { sessions: [] };
  }
};

const writeSessionStore = async (store: MobileOtpSessionStore) => {
  await ensureSessionFile();
  await fs.writeFile(sessionFilePath, JSON.stringify(store, null, 2), 'utf8');
};

const pruneExpiredSessions = (sessions: MobileOtpSession[]) => {
  const now = Date.now();
  return sessions.filter((session) => {
    const expiresAt = new Date(session.expiresAt).getTime();
    return session.verifiedAt || expiresAt > now;
  });
};

export const normalizeLoginMobileNumber = (value?: string | null) => {
  const digitsOnly = value?.replace(/\D/g, '') || '';

  if (digitsOnly.length === 10) {
    return digitsOnly;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return digitsOnly.slice(1);
  }

  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return digitsOnly.slice(2);
  }

  return null;
};

export const toInternationalMobileNumber = (mobile: string) => {
  if (mobile.startsWith('91') && mobile.length === 12) {
    return mobile;
  }

  return `91${mobile}`;
};

export const maskMobileNumber = (mobile: string) =>
  mobile.length < 4 ? mobile : `${'*'.repeat(Math.max(0, mobile.length - 4))}${mobile.slice(-4)}`;

export const getMobileOtpCooldownSeconds = async (mobile: string) => {
  const store = await readSessionStore();
  const activeSessions = pruneExpiredSessions(store.sessions);

  const latestSession = activeSessions
    .filter((session) => session.mobile === mobile)
    .sort((left, right) => new Date(right.lastSentAt).getTime() - new Date(left.lastSentAt).getTime())[0];

  if (!latestSession) {
    return 0;
  }

  const cooldownEndsAt =
    new Date(latestSession.lastSentAt).getTime() + OTP_COOLDOWN_SECONDS * 1000;
  const secondsRemaining = Math.ceil((cooldownEndsAt - Date.now()) / 1000);

  return secondsRemaining > 0 ? secondsRemaining : 0;
};

export const createMobileOtpSession = async ({
  mobile,
  userId,
}: {
  mobile: string;
  userId?: string | null;
}) => {
  const store = await readSessionStore();
  const activeSessions = pruneExpiredSessions(store.sessions);
  const now = new Date();
  const session: MobileOtpSession = {
    id: randomUUID(),
    mobile,
    userId: userId || null,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString(),
    lastSentAt: now.toISOString(),
    attemptCount: 0,
    verifiedAt: null,
  };

  activeSessions.push(session);
  await writeSessionStore({ sessions: activeSessions });

  return session;
};

export const getMobileOtpSessionById = async (sessionId: string) => {
  const store = await readSessionStore();
  const activeSessions = pruneExpiredSessions(store.sessions);

  if (activeSessions.length !== store.sessions.length) {
    await writeSessionStore({ sessions: activeSessions });
  }

  return activeSessions.find((session) => session.id === sessionId) || null;
};

export const recordMobileOtpAttempt = async ({
  sessionId,
  verified,
}: {
  sessionId: string;
  verified: boolean;
}) => {
  const store = await readSessionStore();
  const activeSessions = pruneExpiredSessions(store.sessions);
  const nextSessions = activeSessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    return {
      ...session,
      attemptCount: verified ? session.attemptCount : session.attemptCount + 1,
      verifiedAt: verified ? new Date().toISOString() : session.verifiedAt,
    };
  });

  await writeSessionStore({ sessions: nextSessions });

  return nextSessions.find((session) => session.id === sessionId) || null;
};

export const invalidateMobileOtpSession = async (sessionId: string) => {
  const store = await readSessionStore();
  const nextSessions = store.sessions.filter((session) => session.id !== sessionId);
  await writeSessionStore({ sessions: nextSessions });
};

export const isMobileOtpSessionExpired = (session: MobileOtpSession) =>
  new Date(session.expiresAt).getTime() <= Date.now();

export const canAttemptMobileOtpVerification = (session: MobileOtpSession) =>
  session.attemptCount < OTP_MAX_VERIFY_ATTEMPTS;

export const getMobileOtpExpiryMinutes = () => OTP_EXPIRY_MINUTES;
