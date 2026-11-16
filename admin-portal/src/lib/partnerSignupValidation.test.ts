import test from 'node:test';
import assert from 'node:assert/strict';
import { getPartnerGstVerificationReadiness } from './partnerSignupValidation';

test('enables GST verification when GSTIN is valid even before other signup fields', () => {
  const gstFirst = getPartnerGstVerificationReadiness({
    gstin: '22AAHCJ5752E1ZR',
    email: '',
    mobile: '',
    countryId: '',
    stateId: '',
    cityId: '',
  });

  assert.deepEqual(gstFirst, { ready: true, missing: [] });
});

test('keeps GST verification enabled when all signup values are already valid', () => {
  const readiness = getPartnerGstVerificationReadiness({
    gstin: '22AAHCJ5752E1ZR',
    email: 'dealer@company.example',
    mobile: '9876543210',
    countryId: '1',
    stateId: '2',
    cityId: '3',
  });

  assert.deepEqual(readiness, { ready: true, missing: [] });
});

test('does not enable verification for an invalid GSTIN', () => {
  const readiness = getPartnerGstVerificationReadiness({
    gstin: 'invalid',
    email: 'dealer@gmail.com',
    mobile: '123',
    countryId: '1',
    stateId: '2',
    cityId: '3',
  });

  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missing, ['GSTIN']);
});
