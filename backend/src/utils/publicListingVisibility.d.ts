export declare const getPublicListingStatuses: () => ("PAUSED" | "PUBLISHED" | "RESERVED")[];
export declare const getApprovedPartnerProfileWhere: () => {
    onboardingStatus: 'APPROVED';
    accountStatus: 'ACTIVE';
    kycStatus: 'APPROVED';
};
export declare const getPublicSellerWhere: () => {
    OR: ({
        role: string;
        status: string;
        partnerProfile?: never;
    } | {
        role?: never;
        status?: never;
        partnerProfile: {
            onboardingStatus: 'APPROVED';
            accountStatus: 'ACTIVE';
            kycStatus: 'APPROVED';
        };
    })[];
};
export declare const getPublicMarketplaceListingWhere: () => {
    status: {
        in: ("PAUSED" | "PUBLISHED" | "RESERVED")[];
    };
    partner: {
        OR: ({
            role: string;
            status: string;
            partnerProfile?: never;
        } | {
            role?: never;
            status?: never;
            partnerProfile: {
                onboardingStatus: 'APPROVED';
                accountStatus: 'ACTIVE';
                kycStatus: 'APPROVED';
            };
        })[];
    };
};
export declare const isPublicMarketplaceListingVisible: (listing: {
    status?: string | null;
    partner?: {
        role?: string | null;
        status?: string | null;
        partnerProfile?: {
            onboardingStatus?: string | null;
            accountStatus?: string | null;
            kycStatus?: string | null;
        } | null;
    } | null;
}) => boolean;
export declare const getMarketplaceSellerPresentation: (seller?: {
    role?: string | null;
    name?: string | null;
    customerPrimeSubscriptions?: Array<{
        expiresAt?: Date | null;
    }> | null;
    partnerProfile?: {
        businessName?: string | null;
        partnerType?: string | null;
    } | null;
}) => {
    displayName: string;
    partnerType: string | null;
};
//# sourceMappingURL=publicListingVisibility.d.ts.map