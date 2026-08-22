"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMobileOtpExpiryMinutes = exports.canAttemptMobileOtpVerification = exports.isMobileOtpSessionExpired = exports.invalidateMobileOtpSession = exports.recordMobileOtpAttempt = exports.getMobileOtpSessionById = exports.createMobileOtpSession = exports.getMobileOtpCooldownSeconds = exports.maskMobileNumber = exports.toInternationalMobileNumber = exports.normalizeLoginMobileNumber = exports.normalizeMobileOtpSettings = exports.defaultMobileOtpSettings = exports.defaultMobileOtpTemplateMessage = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const OTP_EXPIRY_MINUTES = 5;
const OTP_COOLDOWN_SECONDS = 45;
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const sessionDirectory = path_1.default.resolve(process.cwd(), 'runtime');
const sessionFilePath = path_1.default.join(sessionDirectory, 'mobile-otp-sessions.json');
exports.defaultMobileOtpTemplateMessage = 'Your OTP for JCB Exchange is {#var#}. Validity 5 mins.';
exports.defaultMobileOtpSettings = {
    enabled: false,
    apiKey: null,
    senderId: null,
    templateId: null,
    templateMessage: exports.defaultMobileOtpTemplateMessage,
    updatedAt: null,
    updatedByUserId: null,
};
const normalizeTrimmedValue = (value) => {
    const trimmedValue = value?.trim();
    return trimmedValue ? trimmedValue : null;
};
const normalizeMobileOtpSettings = (settings) => ({
    enabled: settings?.enabled === true,
    apiKey: normalizeTrimmedValue(settings?.apiKey) || null,
    senderId: normalizeTrimmedValue(settings?.senderId)?.toUpperCase() || null,
    templateId: normalizeTrimmedValue(settings?.templateId) || null,
    templateMessage: normalizeTrimmedValue(settings?.templateMessage) || exports.defaultMobileOtpTemplateMessage,
    updatedAt: settings?.updatedAt || null,
    updatedByUserId: settings?.updatedByUserId || null,
});
exports.normalizeMobileOtpSettings = normalizeMobileOtpSettings;
const ensureSessionFile = async () => {
    await fs_1.promises.mkdir(sessionDirectory, { recursive: true });
    try {
        await fs_1.promises.access(sessionFilePath);
    }
    catch {
        const defaultStore = { sessions: [] };
        await fs_1.promises.writeFile(sessionFilePath, JSON.stringify(defaultStore, null, 2), 'utf8');
    }
};
const readSessionStore = async () => {
    await ensureSessionFile();
    try {
        const content = await fs_1.promises.readFile(sessionFilePath, 'utf8');
        const parsed = JSON.parse(content);
        return {
            sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        };
    }
    catch {
        return { sessions: [] };
    }
};
const writeSessionStore = async (store) => {
    await ensureSessionFile();
    await fs_1.promises.writeFile(sessionFilePath, JSON.stringify(store, null, 2), 'utf8');
};
const pruneExpiredSessions = (sessions) => {
    const now = Date.now();
    return sessions.filter((session) => {
        const expiresAt = new Date(session.expiresAt).getTime();
        return session.verifiedAt || expiresAt > now;
    });
};
const normalizeLoginMobileNumber = (value) => {
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
exports.normalizeLoginMobileNumber = normalizeLoginMobileNumber;
const toInternationalMobileNumber = (mobile) => {
    if (mobile.startsWith('91') && mobile.length === 12) {
        return mobile;
    }
    return `91${mobile}`;
};
exports.toInternationalMobileNumber = toInternationalMobileNumber;
const maskMobileNumber = (mobile) => mobile.length < 4 ? mobile : `${'*'.repeat(Math.max(0, mobile.length - 4))}${mobile.slice(-4)}`;
exports.maskMobileNumber = maskMobileNumber;
const getMobileOtpCooldownSeconds = async (mobile) => {
    const store = await readSessionStore();
    const activeSessions = pruneExpiredSessions(store.sessions);
    const latestSession = activeSessions
        .filter((session) => session.mobile === mobile)
        .sort((left, right) => new Date(right.lastSentAt).getTime() - new Date(left.lastSentAt).getTime())[0];
    if (!latestSession) {
        return 0;
    }
    const cooldownEndsAt = new Date(latestSession.lastSentAt).getTime() + OTP_COOLDOWN_SECONDS * 1000;
    const secondsRemaining = Math.ceil((cooldownEndsAt - Date.now()) / 1000);
    return secondsRemaining > 0 ? secondsRemaining : 0;
};
exports.getMobileOtpCooldownSeconds = getMobileOtpCooldownSeconds;
const createMobileOtpSession = async ({ mobile, userId, }) => {
    const store = await readSessionStore();
    const activeSessions = pruneExpiredSessions(store.sessions);
    const now = new Date();
    const session = {
        id: (0, crypto_1.randomUUID)(),
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
exports.createMobileOtpSession = createMobileOtpSession;
const getMobileOtpSessionById = async (sessionId) => {
    const store = await readSessionStore();
    const activeSessions = pruneExpiredSessions(store.sessions);
    if (activeSessions.length !== store.sessions.length) {
        await writeSessionStore({ sessions: activeSessions });
    }
    return activeSessions.find((session) => session.id === sessionId) || null;
};
exports.getMobileOtpSessionById = getMobileOtpSessionById;
const recordMobileOtpAttempt = async ({ sessionId, verified, }) => {
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
exports.recordMobileOtpAttempt = recordMobileOtpAttempt;
const invalidateMobileOtpSession = async (sessionId) => {
    const store = await readSessionStore();
    const nextSessions = store.sessions.filter((session) => session.id !== sessionId);
    await writeSessionStore({ sessions: nextSessions });
};
exports.invalidateMobileOtpSession = invalidateMobileOtpSession;
const isMobileOtpSessionExpired = (session) => new Date(session.expiresAt).getTime() <= Date.now();
exports.isMobileOtpSessionExpired = isMobileOtpSessionExpired;
const canAttemptMobileOtpVerification = (session) => session.attemptCount < OTP_MAX_VERIFY_ATTEMPTS;
exports.canAttemptMobileOtpVerification = canAttemptMobileOtpVerification;
const getMobileOtpExpiryMinutes = () => OTP_EXPIRY_MINUTES;
exports.getMobileOtpExpiryMinutes = getMobileOtpExpiryMinutes;
//# sourceMappingURL=mobileOtp.js.map