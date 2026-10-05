import assert from 'node:assert/strict';
import test from 'node:test';
import { getListingPaymentOutcome } from './listingPaymentPolicy';

test('auto-approves RTGS payment receipts after the required receipt proof is submitted', () => {
  assert.deepEqual(getListingPaymentOutcome('RTGS'), {
    status: 'PAID',
    requiresManualReview: false,
  });
});

test('marks Razorpay and PhonePe payments paid after gateway verification', () => {
  assert.deepEqual(getListingPaymentOutcome('RAZORPAY'), {
    status: 'PAID',
    requiresManualReview: false,
  });
  assert.deepEqual(getListingPaymentOutcome('PHONEPE'), {
    status: 'PAID',
    requiresManualReview: false,
  });
});

test('auto-approves every supported listing payment method without manual review', () => {
  for (const method of ['RTGS', 'RAZORPAY', 'PHONEPE'] as const) {
    assert.deepEqual(getListingPaymentOutcome(method), {
      status: 'PAID',
      requiresManualReview: false,
    });
  }
});
