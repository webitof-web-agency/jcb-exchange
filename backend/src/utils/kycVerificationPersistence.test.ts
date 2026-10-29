import assert from 'node:assert/strict';
import test from 'node:test';
import { createVerificationFingerprint } from '../services/verificationCache';
import { isKycVerificationRecordPersistable, isKycVerificationRecordValid } from './kycVerificationPersistence';

const freshSuccess = (requestFingerprint: string, requestedById = 'partner-1') => ({
  status: 'SUCCESS',
  requestedById,
  requestFingerprint,
  encryptedResult: 'encrypted-safe-result',
  completedAt: new Date(),
});

test('accepts a saved template after the encrypted verification result is purged', () => {
  const record = {
    ...freshSuccess(createVerificationFingerprint('PAN_COMPREHENSIVE_V2', { id_number: 'ABCDE1234F' })),
    encryptedResult: null,
    template: { id: 'template-1' },
  };

  assert.equal(
    isKycVerificationRecordPersistable({
      documentType: 'PAN_CARD',
      documentNumber: 'ABCDE1234F',
      requestedById: 'partner-1',
      record,
    }),
    true,
  );
});

test('accepts a fresh successful PAN record for the same partner and number', () => {
  const record = freshSuccess(createVerificationFingerprint('PAN_COMPREHENSIVE_V2', { id_number: 'ABCDE1234F' }));

  assert.equal(
    isKycVerificationRecordValid({
      documentType: 'PAN_CARD',
      documentNumber: 'ABCDE1234F',
      requestedById: 'partner-1',
      record,
    }),
    true,
  );
});

test('accepts a valid PAN record from shared cache or admin request', () => {
  const record = freshSuccess(
    createVerificationFingerprint('PAN_COMPREHENSIVE_V2', { id_number: 'ABCDE1234F' }),
    'super-admin-id'
  );

  assert.equal(
    isKycVerificationRecordPersistable({
      documentType: 'PAN_CARD',
      documentNumber: 'ABCDE1234F',
      requestedById: 'partner-1',
      record,
    }),
    true,
  );
});

test('rejects a saved verification record when the document number changes', () => {
  const record = freshSuccess(createVerificationFingerprint('PAN_COMPREHENSIVE_V2', { id_number: 'ABCDE1234F' }));

  assert.equal(
    isKycVerificationRecordValid({
      documentType: 'PAN_CARD',
      documentNumber: 'ZZZZZ9999Z',
      requestedById: 'partner-1',
      record,
    }),
    false,
  );
});

test('keeps a successful historical result persistable after the cache TTL', () => {
  const record = freshSuccess(createVerificationFingerprint('PAN_COMPREHENSIVE_V2', { id_number: 'ABCDE1234F' }));
  record.completedAt = new Date(Date.now() - (25 * 60 * 60 * 1000));

  assert.equal(
    isKycVerificationRecordPersistable({
      documentType: 'PAN_CARD',
      documentNumber: 'ABCDE1234F',
      requestedById: 'partner-1',
      record,
    }),
    true,
  );
  assert.equal(
    isKycVerificationRecordValid({
      documentType: 'PAN_CARD',
      documentNumber: 'ABCDE1234F',
      requestedById: 'partner-1',
      record,
    }),
    false,
  );
});
