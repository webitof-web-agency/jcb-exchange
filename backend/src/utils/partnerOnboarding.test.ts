import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPartnerDocumentDraftData, isPartnerProfileComplete } from './partnerOnboarding';

const completeProfileWithoutDistrict = {
  ownerName: 'Har',
  businessName: 'Har Authorized Place',
  partnerType: 'SHOWROOM',
  primaryContact: '9689345678',
  whatsappNumber: '9689345678',
  state: 'Gujarat',
  city: 'Ahmedabad',
  pinCode: '380001',
  businessAddress: 'Complete address',
  businessExperience: '6 years',
};

test('allows a complete partner profile without a district field', () => {
  assert.equal(isPartnerProfileComplete(completeProfileWithoutDistrict), true);
});

test('requires partner type before a profile can be complete', () => {
  assert.equal(isPartnerProfileComplete({ ...completeProfileWithoutDistrict, partnerType: '' }), false);
});

test('keeps a KYC document draft when only its identifier is entered', () => {
  assert.equal(hasPartnerDocumentDraftData({ documentNumber: 'ABCDE1234F' }), true);
});

test('does not create a KYC document record for an untouched empty placeholder', () => {
  assert.equal(hasPartnerDocumentDraftData({}), false);
});
