import assert from 'node:assert/strict';
import { isPublicMarketplaceListingVisible } from '../src/utils/publicListingVisibility';

const approvedPartnerListing = isPublicMarketplaceListingVisible({
  status: 'PUBLISHED',
  partner: {
    role: 'PARTNER',
    status: 'ACTIVE',
    partnerProfile: {
      onboardingStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      kycStatus: 'APPROVED',
    },
  },
});

assert.equal(
  approvedPartnerListing,
  true,
  'approved verified partners should remain visible on detail pages',
);

const incompletePartnerListing = isPublicMarketplaceListingVisible({
  status: 'PUBLISHED',
  partner: {
    role: 'PARTNER',
    status: 'ACTIVE',
    partnerProfile: {
      onboardingStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      kycStatus: null,
    },
  },
});

assert.equal(
  incompletePartnerListing,
  false,
  'partners missing required verification state should stay hidden',
);

console.log('public listing detail visibility checks passed.');
