"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarketplaceSellerPresentation = exports.isPublicMarketplaceListingVisible = exports.getPublicMarketplaceListingWhere = exports.getPublicSellerWhere = exports.getApprovedPartnerProfileWhere = exports.getPublicListingStatuses = void 0;
const publicListingStatuses = ['PUBLISHED', 'RESERVED', 'PAUSED', 'SOLD'];
const approvedPartnerProfileWhere = {
    onboardingStatus: 'APPROVED',
    accountStatus: 'ACTIVE',
    kycStatus: 'APPROVED',
};
const getPublicListingStatuses = () => [...publicListingStatuses];
exports.getPublicListingStatuses = getPublicListingStatuses;
const getApprovedPartnerProfileWhere = () => ({ ...approvedPartnerProfileWhere });
exports.getApprovedPartnerProfileWhere = getApprovedPartnerProfileWhere;
const getPublicSellerWhere = () => ({
    OR: [
        {
            role: 'CUSTOMER',
            status: 'ACTIVE',
        },
        {
            partnerProfile: (0, exports.getApprovedPartnerProfileWhere)(),
        },
    ],
});
exports.getPublicSellerWhere = getPublicSellerWhere;
const getPublicMarketplaceListingWhere = () => ({
    status: {
        in: (0, exports.getPublicListingStatuses)(),
    },
    partner: (0, exports.getPublicSellerWhere)(),
});
exports.getPublicMarketplaceListingWhere = getPublicMarketplaceListingWhere;
const isPublicMarketplaceListingVisible = (listing) => {
    const normalizedStatus = String(listing.status || '').toUpperCase();
    if (!publicListingStatuses.includes(normalizedStatus)) {
        return false;
    }
    if (listing.partner?.role === 'CUSTOMER' && listing.partner?.status === 'ACTIVE') {
        return true;
    }
    return (listing.partner?.partnerProfile?.onboardingStatus === approvedPartnerProfileWhere.onboardingStatus &&
        listing.partner?.partnerProfile?.accountStatus === approvedPartnerProfileWhere.accountStatus &&
        listing.partner?.partnerProfile?.kycStatus === approvedPartnerProfileWhere.kycStatus);
};
exports.isPublicMarketplaceListingVisible = isPublicMarketplaceListingVisible;
const getMarketplaceSellerPresentation = (seller) => {
    const isPartnerSeller = seller?.role === 'PARTNER';
    const hasActivePrimeSubscription = seller?.role === 'CUSTOMER' &&
        !!seller.customerPrimeSubscriptions?.some((subscription) => {
            return !!subscription.expiresAt && subscription.expiresAt >= new Date();
        });
    return {
        displayName: seller?.partnerProfile?.businessName ||
            seller?.name ||
            (isPartnerSeller ? 'Verified Partner' : 'Marketplace Seller'),
        partnerType: isPartnerSeller
            ? seller?.partnerProfile?.partnerType || null
            : hasActivePrimeSubscription
                ? 'PRIME_CUSTOMER'
                : null,
    };
};
exports.getMarketplaceSellerPresentation = getMarketplaceSellerPresentation;
//# sourceMappingURL=publicListingVisibility.js.map