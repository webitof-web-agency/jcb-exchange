import assert from 'node:assert/strict';
import test from 'node:test';
import { getListingPaymentOutcome } from './listingPaymentPolicy';

test('keeps RTGS payment receipts pending for manual review', () => {
  assert.deepEqual(getListingPaymentOutcome('RTGS'), {
    status: 'PENDING_VERIFICATION',
    requiresManualReview: true,
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
