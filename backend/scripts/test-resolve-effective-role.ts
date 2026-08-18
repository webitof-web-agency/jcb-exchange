import assert from 'node:assert/strict';
import { resolveEffectiveUserRole } from '../src/utils/accountAccess';

const verifiedPartnerRole = resolveEffectiveUserRole({
  role: 'CUSTOMER',
  partnerProfile: {
    onboardingStatus: 'APPROVED',
    accountStatus: 'ACTIVE',
    kycStatus: 'APPROVED',
  },
});

assert.equal(
  verifiedPartnerRole,
  'PARTNER',
  'verified partner accounts should resolve to PARTNER',
);

const customerRole = resolveEffectiveUserRole({
  role: 'CUSTOMER',
  partnerProfile: null,
});

assert.equal(
  customerRole,
  'CUSTOMER',
  'standard customers should remain CUSTOMER',
);

const pendingPartnerRole = resolveEffectiveUserRole({
  role: 'CUSTOMER',
  partnerProfile: {
    onboardingStatus: 'PROFILE_PENDING',
    accountStatus: 'PENDING',
    kycStatus: 'NOT_STARTED',
  },
});

assert.equal(
  pendingPartnerRole,
  'CUSTOMER',
  'pending partner onboarding should not elevate the public role',
);

console.log('resolveEffectiveUserRole checks passed.');
