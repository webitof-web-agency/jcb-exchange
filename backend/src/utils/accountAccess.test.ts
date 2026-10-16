import assert from 'node:assert/strict';
import test from 'node:test';
import { getAccountAccessState, resolveEffectiveUserRole } from './accountAccess';

test('treats a deleted customer record as revoked access', () => {
  assert.equal(getAccountAccessState({ status: 'CLOSED', role: 'CUSTOMER' }), 'revoked');
});

test('keeps active customers authenticated', () => {
  assert.equal(getAccountAccessState({ status: 'ACTIVE', role: 'CUSTOMER' }), 'active');
});

test('routes an incomplete customer partner application back to partner onboarding', () => {
  assert.equal(
    resolveEffectiveUserRole({
      role: 'CUSTOMER',
      partnerProfile: {
        onboardingStatus: 'PROFILE_PENDING',
        accountStatus: 'PENDING',
        kycStatus: 'NOT_STARTED',
      },
    }),
    'PARTNER',
  );
});

test('keeps a customer without a partner application as a customer', () => {
  assert.equal(resolveEffectiveUserRole({ role: 'CUSTOMER' }), 'CUSTOMER');
});
