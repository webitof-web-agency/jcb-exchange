"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOtpResendSecondsRemaining = exports.getOtpSecondsRemaining = exports.normalizeOtpInput = exports.normalizeOtpCooldownSeconds = exports.normalizeOtpExpirySeconds = exports.normalizeOtpLength = void 0;
const MIN_OTP_LENGTH = 4;
const MAX_OTP_LENGTH = 10;
const MIN_OTP_EXPIRY_SECONDS = 60;
const MIN_RESEND_COOLDOWN_SECONDS = 1;
const toFiniteNumber = (value, fallback) => {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    return value;
};
const normalizeOtpLength = (value, fallback = 6) => {
    const safeFallback = Math.min(MAX_OTP_LENGTH, Math.max(MIN_OTP_LENGTH, Math.floor(fallback)));
    const safeValue = Math.floor(toFiniteNumber(value, safeFallback));
    return Math.min(MAX_OTP_LENGTH, Math.max(MIN_OTP_LENGTH, safeValue));
};
exports.normalizeOtpLength = normalizeOtpLength;
const normalizeOtpExpirySeconds = (value, fallback = 900) => {
    const safeFallback = Math.max(MIN_OTP_EXPIRY_SECONDS, Math.floor(fallback));
    const safeValue = Math.floor(toFiniteNumber(value, safeFallback));
    return Math.max(MIN_OTP_EXPIRY_SECONDS, safeValue);
};
exports.normalizeOtpExpirySeconds = normalizeOtpExpirySeconds;
const normalizeOtpCooldownSeconds = (value, fallback = 45) => {
    const safeFallback = Math.max(MIN_RESEND_COOLDOWN_SECONDS, Math.floor(fallback));
    const safeValue = Math.floor(toFiniteNumber(value, safeFallback));
    return Math.max(MIN_RESEND_COOLDOWN_SECONDS, safeValue);
};
exports.normalizeOtpCooldownSeconds = normalizeOtpCooldownSeconds;
const normalizeOtpInput = (value, maxLength) => value.replace(/\D/g, '').slice(0, (0, exports.normalizeOtpLength)(maxLength, maxLength));
exports.normalizeOtpInput = normalizeOtpInput;
const getOtpSecondsRemaining = (expiresAt, now = Date.now()) => Math.max(0, Math.ceil((expiresAt - now) / 1000));
exports.getOtpSecondsRemaining = getOtpSecondsRemaining;
const getOtpResendSecondsRemaining = (availableAt, now = Date.now()) => availableAt > now ? Math.ceil((availableAt - now) / 1000) : 0;
exports.getOtpResendSecondsRemaining = getOtpResendSecondsRemaining;
