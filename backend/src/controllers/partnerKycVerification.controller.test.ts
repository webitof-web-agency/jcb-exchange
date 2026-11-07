import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPartnerGstDetailsRole, isPartnerKycRole } from './partnerKycVerification.controller';

test('only partner onboarding roles can use partner KYC verification routes', () => {
  assert.equal(isPartnerKycRole('PARTNER'), true);
  assert.equal(isPartnerKycRole('CUSTOMER'), true);
  assert.equal(isPartnerKycRole('SUPER_ADMIN'), false);
  assert.equal(isPartnerKycRole(undefined), false);
});

test('GST details are restricted to authenticated partner accounts', () => {
  assert.equal(isPartnerGstDetailsRole('PARTNER'), true);
  assert.equal(isPartnerGstDetailsRole('CUSTOMER'), false);
  assert.equal(isPartnerGstDetailsRole('EMPLOYEE'), false);
  assert.equal(isPartnerGstDetailsRole(undefined), false);
});
