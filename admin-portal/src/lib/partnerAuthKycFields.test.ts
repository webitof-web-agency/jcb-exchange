import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPartnerAuthGstSource, buildPartnerAuthKycFields, maskSensitiveValue } from './partnerAuthKycFields';

test('builds only the requested partner Auth fields from GST and onboarding data', () => {
  const fields = buildPartnerAuthKycFields({
    gst: {
      record: { legalName: 'GST LEGAL NAME' },
      result: {
        legalName: 'GST LEGAL NAME',
        panNumber: 'ABCDE1234F',
        address: 'GST registered address',
        contactDetails: {
          principal: {
            mobile_number: '9876543210',
            email: 'gst@example.com',
          },
        },
      },
    },
    profile: {
      email: 'partner@example.com',
      primaryContact: '9876543210',
      alternateMobile: '9123456780',
      businessAddress: 'Profile address',
    },
    documents: [
      { documentType: 'AADHAAR_CARD', documentNumber: '123456789012' },
      { documentType: 'PASSPORT_PHOTO', fileName: 'photo.jpg', fileUrl: '/secure/photo.jpg' },
    ],
  });

  assert.deepEqual(fields.map((field) => field.key), [
    'legalName',
    'aadhaar',
    'pan',
    'address',
    'photo',
    'email',
    'primaryMobile',
    'alternateMobile',
    'verifiedMobile',
    'verifiedEmail',
    'verifiedAddress',
  ]);
  assert.equal(fields.find((field) => field.key === 'legalName')?.value, 'GST LEGAL NAME');
  assert.equal(fields.find((field) => field.key === 'pan')?.value, 'ABCDE1234F');
  assert.equal(fields.find((field) => field.key === 'aadhaar')?.value, '********9012');
  assert.equal(fields.find((field) => field.key === 'address')?.value, 'GST registered address');
  assert.equal(fields.find((field) => field.key === 'primaryMobile')?.label, 'Mobile Number');
  assert.equal(fields.find((field) => field.key === 'verifiedMobile')?.value, '9876543210');
  assert.equal(fields.find((field) => field.key === 'verifiedEmail')?.value, 'gst@example.com');
  assert.equal(fields.find((field) => field.key === 'verifiedAddress')?.value, 'GST registered address');
  assert.equal(fields.find((field) => field.key === 'photo')?.value, 'photo.jpg');
});

test('uses onboarding values and preserves empty states when GST data is unavailable', () => {
  const fields = buildPartnerAuthKycFields({
    gst: null,
    profile: {
      email: '',
      primaryContact: '',
      alternateMobile: '',
      businessAddress: 'Profile address',
      businessName: 'Profile business',
    },
    documents: [],
  });

  assert.equal(fields.find((field) => field.key === 'legalName')?.value, 'Profile business');
  assert.equal(fields.find((field) => field.key === 'address')?.value, 'Profile address');
  assert.equal(fields.find((field) => field.key === 'email')?.value, '');
  assert.equal(fields.find((field) => field.key === 'photo')?.value, '');
  assert.equal(fields.find((field) => field.key === 'verifiedMobile')?.value, '');
  assert.equal(fields.find((field) => field.key === 'verifiedEmail')?.value, '');
  assert.equal(fields.find((field) => field.key === 'verifiedAddress')?.value, '');
});

test('reads GST contact fields from nested provider data without using signup profile fallbacks', () => {
  const fields = buildPartnerAuthKycFields({
    gst: {
      result: {
        providerData: {
          contact_details: {
            authorized_signatory: {
              phone_number: '9123456780',
              email_id: 'verified@provider.example',
            },
          },
        },
      },
    },
    profile: {
      primaryContact: '9999999999',
      email: 'signup@example.com',
      businessAddress: 'Signup address',
    },
    documents: [],
  });

  assert.equal(fields.find((field) => field.key === 'verifiedMobile')?.value, '9123456780');
  assert.equal(fields.find((field) => field.key === 'verifiedEmail')?.value, 'verified@provider.example');
  assert.equal(fields.find((field) => field.key === 'verifiedAddress')?.value, '');
});

test('keeps durable GST contact fields visible after the temporary result expires', () => {
  const fields = buildPartnerAuthKycFields({
    gst: { result: null },
    profile: {
      gstVerifiedMobile: '8319811884',
      gstVerifiedEmail: 'officialhitesh.aryan@gmail.com',
      gstVerifiedAddress: '3, 3033, Currency Tower, VIP Road, Raipur, Chhattisgarh, 492001',
    },
    documents: [],
  });

  assert.equal(fields.find((field) => field.key === 'verifiedMobile')?.value, '8319811884');
  assert.equal(fields.find((field) => field.key === 'verifiedEmail')?.value, 'officialhitesh.aryan@gmail.com');
  assert.equal(fields.find((field) => field.key === 'verifiedAddress')?.value, '3, 3033, Currency Tower, VIP Road, Raipur, Chhattisgarh, 492001');
});

test('reads the PAN from retained GST provider data when older records lack top-level panNumber', () => {
  const fields = buildPartnerAuthKycFields({
    gst: {
      record: { legalName: 'GST LEGAL NAME' },
      result: {
        providerData: { pan_number: 'ABCDE1234F' },
      },
    },
    profile: {},
    documents: [],
  });

  assert.equal(fields.find((field) => field.key === 'pan')?.value, 'ABCDE1234F');
});

test('reads a nested provider PAN and falls back to the PAN segment of the GSTIN', () => {
  const nestedFields = buildPartnerAuthKycFields({
    gst: {
      record: { legalName: 'GST LEGAL NAME' },
      result: { providerData: { response: { data: { pan_number: 'ABCDE1234F' } } } },
    },
    profile: {},
    documents: [],
  });
  assert.equal(nestedFields.find((field) => field.key === 'pan')?.value, 'ABCDE1234F');

  const derivedFields = buildPartnerAuthKycFields({
    gst: {
      gstNumber: '22ABCDE1234F1Z5',
      record: { legalName: 'GST LEGAL NAME' },
      result: null,
    },
    profile: {},
    documents: [],
  });
  assert.equal(derivedFields.find((field) => field.key === 'pan')?.value, 'ABCDE1234F');
});

test('builds the same Auth GST source from the admin onboarding payload', () => {
  const gst = buildPartnerAuthGstSource({
    profile: { gstNumber: '22ABCDE1234F1Z5' },
    documents: [{
      documentType: 'GST_CERTIFICATE',
      documentNumber: '22ABCDE1234F1Z5',
      nameOnDocument: 'DYNAMIC DEALER',
      verificationResult: {
        legalName: 'DYNAMIC DEALER',
        panNumber: 'ABCDE1234F',
        address: 'Verified GST address',
      },
    }],
  });

  const fields = buildPartnerAuthKycFields({
    gst,
    profile: { businessName: 'Signup name', businessAddress: 'Signup address' },
    documents: [],
  });

  assert.equal(fields.find((field) => field.key === 'legalName')?.value, 'DYNAMIC DEALER');
  assert.equal(fields.find((field) => field.key === 'pan')?.value, 'ABCDE1234F');
  assert.equal(fields.find((field) => field.key === 'address')?.value, 'Verified GST address');
});

test('does not expose a sensitive value when it is too short to mask safely', () => {
  assert.equal(maskSensitiveValue('1234', 4), '••••');
});
