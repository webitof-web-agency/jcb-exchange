import assert from 'node:assert/strict';
import test from 'node:test';
import { mapGstVerificationToCertificate } from './gstCertificateMapper';

test('maps normalized GST Advanced values and principal contact address into the certificate template', () => {
  const certificate = mapGstVerificationToCertificate({
    result: {
      gstin: '22AAHCJ5752E1ZR',
      businessName: 'JCB EXCHANGE (OPC) PRIVATE LIMITED',
      legalName: 'JCB EXCHANGE (OPC) PRIVATE LIMITED',
      constitutionOfBusiness: 'One person company',
      taxpayerType: 'Regular',
      dateOfRegistration: '2026-10-02',
      gstinStatus: 'Active',
      centerJurisdiction: 'RAIPUR',
      contactDetails: {
        principal: {
          address: '1, SHOP NO 8, HOUSING BOARD COMPLEX, SHANKAR NAGAR, Raipur, Chhattisgarh, 492004',
        },
      },
      promoters: [],
      providerData: {
        promoters: [],
      },
    },
  });

  assert.equal(certificate.gstin, '22AAHCJ5752E1ZR');
  assert.equal(certificate.legalName, 'JCB EXCHANGE (OPC) PRIVATE LIMITED');
  assert.equal(certificate.tradeName, 'JCB EXCHANGE (OPC) PRIVATE LIMITED');
  assert.equal(certificate.constitutionOfBusiness, 'One person company');
  assert.equal(certificate.typeOfRegistration, 'Regular');
  assert.equal(certificate.validityFrom, '02/10/2026');
  assert.equal(certificate.dateOfLiability, '02/10/2026');
  assert.equal(certificate.jurisdiction, 'RAIPUR');
  assert.equal(certificate.address.fullText, '1, SHOP NO 8, HOUSING BOARD COMPLEX, SHANKAR NAGAR, Raipur, Chhattisgarh, 492004');
  assert.equal(certificate.promoters.length, 0);
});

test('does not invent registration type or person-in-charge data when the provider omits them', () => {
  const certificate = mapGstVerificationToCertificate({
    result: {
      gstin: '22AAHCJ5752E1ZR',
      legalName: 'JCB EXCHANGE (OPC) PRIVATE LIMITED',
      promoters: [],
      providerData: { promoters: [] },
    },
  });

  assert.equal(certificate.typeOfRegistration, '');
  assert.equal(certificate.tradeName, '');
  assert.equal(certificate.promoters.length, 0);
});
