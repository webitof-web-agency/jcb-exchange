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
export declare const defaultMobileOtpTemplateMessage = "Your OTP for JCB Exchange is {#var#}. Validity 5 mins.";
export declare const defaultMobileOtpSettings: MobileOtpSettings;
export declare const normalizeMobileOtpSettings: (settings?: Partial<MobileOtpSettings> | null) => MobileOtpSettings;
export declare const normalizeLoginMobileNumber: (value?: string | null) => string | null;
export declare const toInternationalMobileNumber: (mobile: string) => string;
export declare const maskMobileNumber: (mobile: string) => string;
export declare const getMobileOtpCooldownSeconds: (mobile: string) => Promise<number>;
export declare const createMobileOtpSession: ({ mobile, userId, }: {
    mobile: string;
    userId?: string | null;
}) => Promise<MobileOtpSession>;
export declare const getMobileOtpSessionById: (sessionId: string) => Promise<MobileOtpSession | null>;
export declare const recordMobileOtpAttempt: ({ sessionId, verified, }: {
    sessionId: string;
    verified: boolean;
}) => Promise<MobileOtpSession | null>;
export declare const invalidateMobileOtpSession: (sessionId: string) => Promise<void>;
export declare const isMobileOtpSessionExpired: (session: MobileOtpSession) => boolean;
export declare const canAttemptMobileOtpVerification: (session: MobileOtpSession) => boolean;
export declare const getMobileOtpExpiryMinutes: () => number;
export {};
//# sourceMappingURL=mobileOtp.d.ts.map