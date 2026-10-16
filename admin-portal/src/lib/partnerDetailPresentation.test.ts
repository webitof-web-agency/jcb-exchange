import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatPartnerDocumentStatus,
  canPreviewPartnerDocument,
  getPartnerDocumentKind,
  maskPartnerDocumentNumber,
} from './partnerDetailPresentation';

test('masks partner document numbers before employee detail display', () => {
  assert.equal(maskPartnerDocumentNumber('RZGPS0438N'), 'RZ********N');
  assert.equal(maskPartnerDocumentNumber('27ABCDE1234F1Z5'), '27***********Z5');
  assert.equal(maskPartnerDocumentNumber(''), '');
});

test('normalizes document status for detail badges', () => {
  assert.equal(formatPartnerDocumentStatus(' verified '), 'VERIFIED');
  assert.equal(formatPartnerDocumentStatus(null), 'NOT_STARTED');
});

test('detects document type from the original file name', () => {
  assert.equal(getPartnerDocumentKind('pan-card.pdf', '/documents/secure/drive-pan'), 'pdf');
  assert.equal(getPartnerDocumentKind('passport.webp', '/documents/secure/image'), 'image');
  assert.equal(getPartnerDocumentKind('certificate.bin', '/documents/secure/file'), 'file');
});

test('allows preview only for image documents', () => {
  assert.equal(canPreviewPartnerDocument('photo.webp', '/documents/secure/photo'), true);
  assert.equal(canPreviewPartnerDocument('certificate.pdf', '/documents/secure/certificate'), false);
  assert.equal(canPreviewPartnerDocument('certificate.bin', '/documents/secure/certificate'), false);
});
