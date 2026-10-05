import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutoApprovedPrimeSubscriptionData, normalizeCustomerPrimeSettings } from './customerPrime';

test('preserves independent Prime feature toggles', () => {
  const settings = normalizeCustomerPrimeSettings({
    enabled: true,
    requireForCall: false,
    requireForWhatsapp: true,
    requireForSellListing: false,
  });

  assert.equal(settings.requireForCall, false);
  assert.equal(settings.requireForWhatsapp, true);
  assert.equal(settings.requireForSellListing, false);
});

test('builds an immediately active Prime subscription without a manual approver', () => {
  const submittedAt = new Date('2026-10-05T10:00:00.000Z');
  const activatedAt = new Date('2026-10-05T10:00:03.000Z');

  assert.deepEqual(
    buildAutoApprovedPrimeSubscriptionData({
      submittedAt,
      activatedAt,
      settingsSnapshot: {
        validityValue: 30,
        validityUnit: 'DAYS',
      },
    }),
    {
      status: 'ACTIVE',
      startedAt: submittedAt,
      expiresAt: new Date('2026-11-04T10:00:00.000Z'),
      approvedByUserId: null,
      approvedAt: activatedAt,
      rejectedByUserId: null,
      rejectedAt: null,
      rejectionReason: null,
    },
  );
});
