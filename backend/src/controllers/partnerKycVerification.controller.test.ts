import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPartnerKycRole } from './partnerKycVerification.controller';

test('only partner onboarding roles can use partner KYC verification routes', () => {
  assert.equal(isPartnerKycRole('PARTNER'), true);
  assert.equal(isPartnerKycRole('CUSTOMER'), true);
  assert.equal(isPartnerKycRole('SUPER_ADMIN'), false);
  assert.equal(isPartnerKycRole(undefined), false);
});
