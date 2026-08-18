import assert from 'node:assert/strict';
import { isPublicMarketplaceListingVisible } from '../src/utils/publicListingVisibility';

assert.equal(
  isPublicMarketplaceListingVisible({
    status: 'PUBLISHED',
    partner: {
      role: 'CUSTOMER',
      status: 'ACTIVE',
      partnerProfile: null,
    },
  }),
  true,
  'published customer listings should be visible publicly',
);

assert.equal(
  isPublicMarketplaceListingVisible({
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
  }),
  true,
  'approved partner listings should remain visible publicly',
);

assert.equal(
  isPublicMarketplaceListingVisible({
    status: 'DRAFT',
    partner: {
      role: 'CUSTOMER',
      status: 'ACTIVE',
      partnerProfile: null,
    },
  }),
  false,
  'draft customer listings should not be visible publicly',
);

assert.equal(
  isPublicMarketplaceListingVisible({
    status: 'PUBLISHED',
    partner: {
      role: 'PARTNER',
      status: 'ACTIVE',
      partnerProfile: {
        onboardingStatus: 'REVIEW_PENDING',
        accountStatus: 'PENDING',
        kycStatus: 'SUBMITTED',
      },
    },
  }),
  false,
  'unapproved partner listings should not be visible publicly',
);

console.log('public listing visibility checks passed.');
