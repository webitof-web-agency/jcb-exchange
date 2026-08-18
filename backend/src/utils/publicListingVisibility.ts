const publicListingStatuses = ['PUBLISHED', 'RESERVED', 'PAUSED'] as const;

const approvedPartnerProfileWhere = {
  onboardingStatus: 'APPROVED',
  accountStatus: 'ACTIVE',
  kycStatus: 'APPROVED',
} as const;

export const getPublicListingStatuses = () => [...publicListingStatuses];

export const getApprovedPartnerProfileWhere = () => ({ ...approvedPartnerProfileWhere });

export const getPublicSellerWhere = () => ({
  OR: [
    {
      role: 'CUSTOMER',
      status: 'ACTIVE',
    },
    {
      partnerProfile: getApprovedPartnerProfileWhere(),
    },
  ],
});

export const getPublicMarketplaceListingWhere = () => ({
  status: {
    in: getPublicListingStatuses(),
  },
  partner: getPublicSellerWhere(),
});

export const isPublicMarketplaceListingVisible = (listing: {
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
}) => {
  const normalizedStatus = String(listing.status || '').toUpperCase();
  if (!publicListingStatuses.includes(normalizedStatus as (typeof publicListingStatuses)[number])) {
    return false;
  }

  if (listing.partner?.role === 'CUSTOMER' && listing.partner?.status === 'ACTIVE') {
    return true;
  }

  return (
    listing.partner?.partnerProfile?.onboardingStatus === approvedPartnerProfileWhere.onboardingStatus &&
    listing.partner?.partnerProfile?.accountStatus === approvedPartnerProfileWhere.accountStatus &&
    listing.partner?.partnerProfile?.kycStatus === approvedPartnerProfileWhere.kycStatus
  );
};

export const getMarketplaceSellerPresentation = (seller?: {
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
  const isPartnerSeller = seller?.role === 'PARTNER';
  const hasActivePrimeSubscription =
    seller?.role === 'CUSTOMER' &&
    !!seller.customerPrimeSubscriptions?.some((subscription) => {
      return !!subscription.expiresAt && subscription.expiresAt >= new Date();
    });

  return {
    displayName:
      seller?.partnerProfile?.businessName ||
      seller?.name ||
      (isPartnerSeller ? 'Verified Partner' : 'Marketplace Seller'),
    partnerType: isPartnerSeller
      ? seller?.partnerProfile?.partnerType || null
      : hasActivePrimeSubscription
        ? 'PRIME_CUSTOMER'
        : null,
  };
};
