export declare const ACCOUNT_REVOKED_CODE = "ACCOUNT_REVOKED";
export declare const ACCOUNT_REVOKED_MESSAGE = "This account has been deactivated or removed. Please contact the super admin for access.";
export declare const ACCOUNT_INACTIVE_CODE = "ACCOUNT_INACTIVE";
export declare const ACCOUNT_INACTIVE_MESSAGE = "This account is inactive right now. Please contact the super admin to reactivate access.";
export declare const authenticatedUserSelect: {
    readonly id: true;
    readonly email: true;
    readonly name: true;
    readonly role: true;
    readonly status: true;
    readonly mobile: true;
    readonly whatsappNumber: true;
    readonly city: true;
    readonly state: true;
    readonly partnerProfile: {
        readonly select: {
            readonly onboardingStatus: true;
            readonly accountStatus: true;
            readonly kycStatus: true;
            readonly partnerType: true;
            readonly ownerName: true;
            readonly businessName: true;
            readonly businessAddress: true;
            readonly district: true;
            readonly pinCode: true;
            readonly contactPreference: true;
        };
    };
};
export declare const fetchAuthenticatedUserById: (userId: string) => Promise<any>;
export declare const resolveEffectiveUserRole: (user: {
    role?: string | null;
    partnerProfile?: {
        onboardingStatus?: string | null;
        accountStatus?: string | null;
        kycStatus?: string | null;
    } | null;
} | null) => string;
export declare const getAccountAccessState: (user: {
    status?: string | null;
    role?: string | null;
    partnerProfile?: {
        onboardingStatus?: string | null;
        accountStatus?: string | null;
        kycStatus?: string | null;
    } | null;
} | null) => "active" | "inactive" | "revoked";
export declare const isAccountRevoked: (user: Parameters<typeof getAccountAccessState>[0]) => boolean;
export declare const isAccountInactive: (user: Parameters<typeof getAccountAccessState>[0]) => boolean;
export declare const isPortalStatusBlocked: (status?: string | null) => boolean;
//# sourceMappingURL=accountAccess.d.ts.map