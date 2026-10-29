const MIN_OTP_LENGTH = 4;
const MAX_OTP_LENGTH = 10;
const MIN_OTP_EXPIRY_SECONDS = 60;
const MIN_RESEND_COOLDOWN_SECONDS = 1;

const toFiniteNumber = (value: number | undefined, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return value;
};

export const normalizeOtpLength = (value: number | undefined, fallback = 6) => {
  const safeFallback = Math.min(MAX_OTP_LENGTH, Math.max(MIN_OTP_LENGTH, Math.floor(fallback)));
  const safeValue = Math.floor(toFiniteNumber(value, safeFallback));
  return Math.min(MAX_OTP_LENGTH, Math.max(MIN_OTP_LENGTH, safeValue));
};

export const normalizeOtpExpirySeconds = (value: number | undefined, fallback = 900) => {
  const safeFallback = Math.max(MIN_OTP_EXPIRY_SECONDS, Math.floor(fallback));
  const safeValue = Math.floor(toFiniteNumber(value, safeFallback));
  return Math.max(MIN_OTP_EXPIRY_SECONDS, safeValue);
};

export const normalizeOtpCooldownSeconds = (value: number | undefined, fallback = 45) => {
  const safeFallback = Math.max(MIN_RESEND_COOLDOWN_SECONDS, Math.floor(fallback));
  const safeValue = Math.floor(toFiniteNumber(value, safeFallback));
  return Math.max(MIN_RESEND_COOLDOWN_SECONDS, safeValue);
};

export const normalizeOtpInput = (value: string, maxLength: number) =>
  value.replace(/\D/g, '').slice(0, normalizeOtpLength(maxLength, maxLength));

export const getOtpSecondsRemaining = (expiresAt: number, now = Date.now()) =>
  Math.max(0, Math.ceil((expiresAt - now) / 1000));

export const getOtpResendSecondsRemaining = (availableAt: number, now = Date.now()) =>
  availableAt > now ? Math.ceil((availableAt - now) / 1000) : 0;
