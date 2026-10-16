import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKycReviewDocument } from './kycReviewPresentation';

const baseDocument = {
  id: 'document-1',
  documentType: 'PAN_CARD',
  fileUrl: '/api/secure-documents/pan-1',
  fileName: 'pan-card.pdf',
  documentNumber: 'RZGPS0438N',
  nameOnDocument: 'HARSH SAHU',
  issueDate: null,
  expiryDate: null,
  submittedNote: null,
  status: 'UPLOADED',
  reviewComment: null,
  verificationRecordId: 'verification-1',
  verificationStatus: 'VERIFIED',
  verificationCacheHit: false,
  verificationMessage: null,
  verificationCompletedAt: null,
};

test('review document preserves the file and exposes verified safe result metadata', () => {
  const completedAt = new Date('2026-10-16T10:30:00.000Z');
  const result = {
    pan: 'RZGPS****N',
    panDetails: {
      fullName: 'HARSH SAHU',
      panStatusDescription: 'Existing and valid',
      category: 'Individual',
    },
  };

  const reviewDocument = buildKycReviewDocument(baseDocument, {
    record: { status: 'SUCCESS', createdAt: new Date('2026-10-16T10:29:00.000Z'), completedAt },
    result,
  });

  assert.equal(reviewDocument.fileUrl, baseDocument.fileUrl);
  assert.equal(reviewDocument.verificationStatus, 'VERIFIED');
  assert.equal(reviewDocument.verificationCompletedAt, completedAt.toISOString());
  assert.deepEqual(reviewDocument.verificationResult, result);
});

test('review document preserves a failed provider status when the stored result is unavailable', () => {
  const reviewDocument = buildKycReviewDocument(baseDocument, {
    record: { status: 'FAILED', createdAt: null, completedAt: null },
    result: null,
  });

  assert.equal(reviewDocument.verificationStatus, 'FAILED');
  assert.equal(reviewDocument.verificationResult, null);
});
