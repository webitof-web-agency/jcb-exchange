import test from 'node:test';
import assert from 'node:assert/strict';
import { getGeneratedKycDocumentKey, getGeneratedKycUploadLabel } from '../src/lib/kycGeneratedDocument.mjs';

test('maps a purchase PAN preview to the purchase PAN document slot', () => {
  assert.equal(getGeneratedKycDocumentKey({ side: 'purchase', kind: 'pan' }), 'purchasePanCard');
});

test('maps a sale Aadhaar preview to the sale Aadhaar document slot', () => {
  assert.equal(getGeneratedKycDocumentKey({ side: 'sell', kind: 'aadhaar' }), 'sellAadhaarCard');
});

test('maps GST previews to the GST certificate document slot', () => {
  assert.equal(getGeneratedKycDocumentKey({ side: 'purchase', kind: 'gst' }), 'purchaseGstCertificate');
  assert.equal(getGeneratedKycDocumentKey({ side: 'sell', kind: 'gst' }), 'sellGstCertificate');
});

test('uses Upload as the KYC action label before the document is uploaded', () => {
  assert.equal(getGeneratedKycUploadLabel({ uploading: false, hasUploadedDocument: false }), 'Upload');
});
