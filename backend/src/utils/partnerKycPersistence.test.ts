import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVerifiedKycDocumentState,
  mergeVerifiedKycResponseState,
} from './partnerKycPersistence';

test('persists verified PAN, GST, and Aadhaar records even before template upload', () => {
  for (const documentType of ['PAN_CARD', 'GST_CERTIFICATE', 'AADHAAR_CARD'] as const) {
    const state = buildVerifiedKycDocumentState({
      documentType,
      recordId: `${documentType}-record`,
      documentNumber: ' ABC123 ',
      nameOnDocument: '  Example Partner  ',
      templateSaved: false,
      cacheHit: true,
      completedAt: '2026-10-30T10:00:00.000Z',
    });

    assert.equal(state.documentNumber, 'ABC123');
    assert.equal(state.nameOnDocument, 'Example Partner');
    assert.equal(state.verificationRecordId, `${documentType}-record`);
    assert.equal(state.verificationStatus, 'VERIFIED');
    assert.equal(state.status, 'NOT_UPLOADED');
    assert.equal(state.verificationCacheHit, true);
  }
});

test('keeps verified state after refresh when the template is not uploaded', () => {
  const state = mergeVerifiedKycResponseState({
    base: {
      documentType: 'GST_CERTIFICATE',
      verificationRecordId: '',
      verificationStatus: 'NOT_STARTED',
      verificationResult: null,
      verificationTemplate: null,
      verificationMessage: '',
    },
    recordId: 'gst-record',
    recordStatus: 'SUCCESS',
    result: null,
    template: null,
    rawDataExpiresAt: '2026-10-30T10:05:00.000Z',
  });

  assert.equal(state.verificationRecordId, 'gst-record');
  assert.equal(state.verificationStatus, 'VERIFIED');
  assert.equal(state.verificationTemplate, null);
  assert.equal(state.verificationRawDataExpiresAt, '2026-10-30T10:05:00.000Z');
});

test('marks a recovered verification document as uploaded when its template is saved', () => {
  const state = mergeVerifiedKycResponseState({
    base: {
      documentType: 'GST_CERTIFICATE',
      status: 'NOT_UPLOADED',
      verificationRecordId: 'current-record',
      verificationStatus: 'VERIFIED',
      verificationResult: null,
      verificationTemplate: null,
      verificationMessage: '',
    },
    recordId: 'saved-template-record',
    recordStatus: 'SUCCESS',
    result: null,
    template: { id: 'template-1' },
  });

  assert.equal(state.status, 'UPLOADED');
  assert.equal(state.verificationRecordId, 'saved-template-record');
});
