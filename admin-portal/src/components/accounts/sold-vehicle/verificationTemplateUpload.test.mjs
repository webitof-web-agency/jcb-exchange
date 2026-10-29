import assert from 'node:assert/strict';
import test from 'node:test';
import { getVerificationTemplateUpload } from './verificationTemplateUpload.mjs';
import { getGeneratedKycDocumentFileName, getGeneratedKycDocumentKey } from '../../../lib/kycGeneratedDocument.mjs';

test('builds the correct private template endpoint and MIME contract per verification kind', () => {
  assert.deepEqual(getVerificationTemplateUpload('pan', { response: { record: { id: 'pan-1', maskedPan: 'XXXXXP1234' } } }), {
    recordId: 'pan-1',
    endpoint: '/pan-verification/pan-1/template',
    mimeType: 'image/png',
    extension: 'png',
  });
  assert.deepEqual(getVerificationTemplateUpload('gst', { response: { record: { id: 'gst-1', maskedGstin: '07AB********123' } } }), {
    recordId: 'gst-1',
    endpoint: '/gst-verification/gst-1/template',
    mimeType: 'application/pdf',
    extension: 'pdf',
  });
  assert.deepEqual(getVerificationTemplateUpload('aadhaar', { response: { record: { id: 'aadhaar-1', maskedAadhaar: 'XXXXXXXX1231' } } }), {
    recordId: 'aadhaar-1',
    endpoint: '/aadhaar-verification/aadhaar-1/template',
    mimeType: 'image/png',
    extension: 'png',
  });
});

test('does not treat another verification record as a template record', () => {
  assert.equal(getVerificationTemplateUpload('gst', { response: { record: { id: 'pan-1', maskedPan: 'XXXXXP1234' } } }), null);
  assert.equal(getVerificationTemplateUpload('pan', { response: { record: { id: 'gst-1', maskedGstin: '07AB********123' } } }), null);
  assert.equal(getVerificationTemplateUpload('aadhaar', { response: { record: { id: 'aadhaar-1' } } }), null);
});

test('maps GST verification uploads to the correct side-specific KYC certificate slot', () => {
  assert.equal(getGeneratedKycDocumentKey({ side: 'purchase', kind: 'gst' }), 'purchaseGstCertificate');
  assert.equal(getGeneratedKycDocumentKey({ side: 'sell', kind: 'gst' }), 'sellGstCertificate');
  assert.equal(getGeneratedKycDocumentFileName({ kind: 'gst', number: '07ABCDE1234F1Z5' }), 'GST-07ABCDE1234F1Z5-verification.pdf');
});
