import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptySellAccountKyc,
  createFailedVerificationState,
  createVerificationState,
  normalizeSellAccountKyc,
  normalizeSellAccountKycNumber,
} from './sellAccountKyc.mjs';

test('normalizes PAN, GSTIN, and Aadhaar/VID inputs without changing their meaning', () => {
  assert.equal(normalizeSellAccountKycNumber('PAN', ' ab cde1234f '), 'ABCDE1234F');
  assert.equal(normalizeSellAccountKycNumber('GST', ' 08abcde1234f1zN '), '08ABCDE1234F1ZN');
  assert.equal(normalizeSellAccountKycNumber('AADHAAR', ' 1234 5678 9012 '), '123456789012');
});

test('stores only safe verification metadata and never the provider result', () => {
  const state = createVerificationState({
    kind: 'PAN',
    number: 'ABCDE1234F',
    response: {
      success: true,
      cacheHit: true,
      result: { pan: 'ABCDE1234F', providerData: { secret: 'must not persist' } },
      record: { id: 'pan-record-1', status: 'SUCCESS', completedAt: '2026-10-16T10:00:00.000Z' },
    },
  });

  assert.deepEqual(state, {
    number: 'ABCDE1234F',
    status: 'VERIFIED',
    verificationRecordId: 'pan-record-1',
    verifiedAt: '2026-10-16T10:00:00.000Z',
    cacheHit: true,
    error: '',
  });
  assert.equal('result' in state, false);
});

test('failed verification is editable and can be retried', () => {
  assert.deepEqual(
    createFailedVerificationState('GST', '08ABCDE1234F1ZN', 'Provider unavailable.'),
    {
      number: '08ABCDE1234F1ZN',
      status: 'FAILED',
      verificationRecordId: '',
      verifiedAt: '',
      cacheHit: false,
      error: 'Provider unavailable.',
    },
  );
});

test('normalizes legacy and persisted KYC data independently for purchase and sell sides', () => {
  const normalized = normalizeSellAccountKyc({
    documents: {
      kyc: {
        purchase: { pan: { number: 'abcde1234f', status: 'VERIFIED' } },
        sell: { aadhaar: { number: '1234 5678 9012' } },
      },
    },
  });

  assert.equal(normalized.purchase.pan.number, 'ABCDE1234F');
  assert.equal(normalized.purchase.pan.status, 'VERIFIED');
  assert.equal(normalized.sell.aadhaar.number, '123456789012');
  assert.deepEqual(normalized.sell.gst, createEmptySellAccountKyc().sell.gst);
});
