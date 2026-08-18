import assert from 'node:assert/strict';
import {
  buildPrimeSettingsSnapshot,
  buildUpiPaymentUri,
  calculatePrimeExpiryAt,
  getCustomerPrimeAccessState,
} from '../src/utils/customerPrime';

const baseSettings = {
  enabled: true,
  upiId: 'prime@upi',
  amount: 499,
  validityValue: 30,
  validityUnit: 'DAYS' as const,
  applyToCustomerRoleOnly: true,
  requireForCall: true,
  requireForWhatsapp: true,
  requireForSellListing: true,
  updatedAt: '2026-08-17T05:30:00.000Z',
  updatedByUserId: 'super-admin-1',
};

const snapshot = buildPrimeSettingsSnapshot(baseSettings);

assert.equal(snapshot.upiId, 'prime@upi');
assert.equal(snapshot.amount, 499);
assert.equal(snapshot.validityValue, 30);
assert.equal(snapshot.validityUnit, 'DAYS');

const expiryAt = calculatePrimeExpiryAt({
  paidAt: new Date('2026-08-17T00:00:00.000Z'),
  validityValue: 2,
  validityUnit: 'MONTHS',
});

assert.equal(expiryAt.toISOString(), '2026-10-17T00:00:00.000Z');

const paymentUri = buildUpiPaymentUri({
  upiId: 'prime@upi',
  amount: 499,
  payeeName: 'JCB Exchange',
  transactionNote: 'Prime customer subscription',
});

assert.equal(
  paymentUri,
  'upi://pay?pa=prime%40upi&pn=JCB%20Exchange&am=499.00&cu=INR&tn=Prime%20customer%20subscription',
);

const activeAccess = getCustomerPrimeAccessState({
  role: 'CUSTOMER',
  now: new Date('2026-08-20T00:00:00.000Z'),
  subscriptions: [
    {
      id: 'sub-active',
      status: 'ACTIVE',
      startedAt: new Date('2026-08-18T00:00:00.000Z'),
      expiresAt: new Date('2026-09-18T00:00:00.000Z'),
    },
  ],
});

assert.equal(activeAccess.isPrimeCustomer, true);
assert.equal(activeAccess.customerCategory, 'PRIME_CUSTOMER');
assert.equal(activeAccess.hasActiveSubscription, true);
assert.equal(activeAccess.activeSubscriptionId, 'sub-active');

const expiredAccess = getCustomerPrimeAccessState({
  role: 'CUSTOMER',
  now: new Date('2026-10-20T00:00:00.000Z'),
  subscriptions: [
    {
      id: 'sub-expired',
      status: 'ACTIVE',
      startedAt: new Date('2026-08-18T00:00:00.000Z'),
      expiresAt: new Date('2026-09-18T00:00:00.000Z'),
    },
  ],
});

assert.equal(expiredAccess.isPrimeCustomer, false);
assert.equal(expiredAccess.customerCategory, 'STANDARD_CUSTOMER');
assert.equal(expiredAccess.hasActiveSubscription, false);

console.log('Prime subscription utility tests passed.');
