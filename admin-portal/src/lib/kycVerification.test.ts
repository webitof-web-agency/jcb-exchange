import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getKycVerificationFields,
  getKycVerificationDisplay,
  normalizeKycDocumentNumber,
  validateKycDocumentNumber,
} from './kycVerification';

test('validates and normalizes PAN and GST KYC inputs', () => {
  assert.equal(normalizeKycDocumentNumber('PAN_CARD', ' abcdE1234f '), 'ABCDE1234F');
  assert.equal(validateKycDocumentNumber('PAN_CARD', 'ABCDE1234F'), null);
  assert.match(validateKycDocumentNumber('PAN_CARD', 'BAD') || '', /PAN/);

  assert.equal(normalizeKycDocumentNumber('GST_CERTIFICATE', '08akwpj1234h1zn'), '08AKWPJ1234H1ZN');
  assert.equal(validateKycDocumentNumber('GST_CERTIFICATE', '08AKWPJ1234H1ZN'), null);
  assert.match(validateKycDocumentNumber('GST_CERTIFICATE', 'BAD') || '', /GSTIN/);
});

test('maps safe PAN Advanced V2 and GST verification summaries for the KYC card', () => {
  assert.deepEqual(
    getKycVerificationDisplay('PAN_CARD', {
      pan: 'EKRPR****F',
      panDetails: {
        fullName: 'VISHAL RATHORE',
        title: 'Shri',
        status: 'EXISTING AND VALID',
        panStatus: 'E',
        aadhaarSeedingStatus: 'Y',
        category: 'person',
      },
    }),
    {
      maskedNumber: 'EKRPR****F',
      displayName: 'VISHAL RATHORE',
      status: 'EXISTING AND VALID',
      category: 'person',
      extra: 'Aadhaar seeded',
    },
  );

  assert.deepEqual(
    getKycVerificationDisplay('GST_CERTIFICATE', {
      maskedGstin: '08AK********1ZN',
      businessName: 'TRADING NAME',
      legalName: 'LEGAL NAME',
      gstinStatus: 'Active',
      taxpayerType: 'Regular',
    }),
    {
      maskedNumber: '08AK********1ZN',
      displayName: 'LEGAL NAME',
      status: 'Active',
      category: 'Regular',
      extra: 'TRADING NAME',
    },
  );
});

test('maps verified PAN and GST results into review-safe fields', () => {
  assert.deepEqual(
    getKycVerificationFields('PAN_CARD', {
      pan: 'RZGPS****N',
      panDetails: {
        fullName: 'HARSH SAHU',
        panStatusDescription: 'Existing and valid',
        category: 'Individual',
        aadhaarSeedingStatus: 'Y',
      },
    }),
    [
      { label: 'Masked PAN', value: 'RZGPS****N' },
      { label: 'Name', value: 'HARSH SAHU' },
      { label: 'PAN status', value: 'Existing and valid' },
      { label: 'Category', value: 'Individual' },
      { label: 'Aadhaar seeding', value: 'Seeded' },
    ],
  );

  assert.deepEqual(
    getKycVerificationFields('GST_CERTIFICATE', {
      maskedGstin: '27AB********1Z5',
      legalName: 'LEGAL NAME',
      businessName: 'TRADE NAME',
      gstinStatus: 'Active',
      dateOfRegistration: '2020-01-15',
      taxpayerType: 'Regular',
      address: 'Main Road, City',
    }),
    [
      { label: 'Masked GSTIN', value: '27AB********1Z5' },
      { label: 'Legal name', value: 'LEGAL NAME' },
      { label: 'Trade name', value: 'TRADE NAME' },
      { label: 'GST status', value: 'Active' },
      { label: 'Registration date', value: '2020-01-15' },
      { label: 'Taxpayer type', value: 'Regular' },
      { label: 'Address', value: 'Main Road, City' },
    ],
  );
});
