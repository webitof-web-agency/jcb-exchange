import crypto from 'node:crypto';

export const EMAIL_OTP_COOLDOWN_SECONDS = 45;
export const EMAIL_OTP_RESEND_WINDOW_SECONDS = 10 * 60;
export const EMAIL_OTP_MAX_RESENDS = 5;
export const EMAIL_OTP_MAX_VERIFY_ATTEMPTS = 5;
export const EMAIL_OTP_DEFAULT_EXPIRY_MINUTES = 10;
export const EMAIL_OTP_DEFAULT_LENGTH = 6;

export type EmailOtpPublicConfig = {
  enabled: boolean;
  otpLength: number;
  otpExpirySeconds: number;
  resendCooldownSeconds: number;
};

export const normalizeEmailOtpAddress = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() || '';
  if (!normalized || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }

  return normalized;
};

export const maskEmailOtpAddress = (email: string) => {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return email;
  }

  const visibleLocalPart = localPart.length <= 2 ? localPart[0] || '*' : localPart.slice(0, 2);
  return `${visibleLocalPart}${'*'.repeat(Math.max(1, localPart.length - visibleLocalPart.length))}@${domain}`;
};

export const generateEmailOtp = (length = EMAIL_OTP_DEFAULT_LENGTH) => {
  if (!Number.isInteger(length) || length < 4 || length > 10) {
    throw new Error('Email OTP length must be between 4 and 10 digits.');
  }

  const minimum = 10 ** (length - 1);
  const maximumExclusive = 10 ** length;
  return String(crypto.randomInt(minimum, maximumExclusive));
};

export const hashEmailOtp = (email: string, otp: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(`${email}:${otp}`).digest('hex');

export const matchesEmailOtp = (email: string, otp: string, expectedHash: string, secret: string) => {
  const actualHash = hashEmailOtp(email, otp, secret);
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(actualHash, 'hex');

  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

export const canVerifyEmailOtpChallenge = (challenge: {
  status: string;
  attemptCount: number;
  expiresAt: Date | string;
}) =>
  challenge.status === 'PENDING' &&
  new Date(challenge.expiresAt).getTime() > Date.now() &&
  challenge.attemptCount < EMAIL_OTP_MAX_VERIFY_ATTEMPTS;

export const canResendEmailOtpChallenge = (challenge: {
  status: string;
  resendCount: number;
  createdAt: Date | string;
}) =>
  challenge.status === 'PENDING' &&
  new Date(challenge.createdAt).getTime() + EMAIL_OTP_RESEND_WINDOW_SECONDS * 1000 > Date.now() &&
  challenge.resendCount < EMAIL_OTP_MAX_RESENDS;
