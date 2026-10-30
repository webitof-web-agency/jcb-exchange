import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPartnerInventoryDisplay } from './partnerInventoryDisplay.mjs';

test('shows published inventory without applying a quota', () => {
  assert.deepEqual(
    getPartnerInventoryDisplay({ listingCount: 3, listingLimit: 5 }),
    { listingCount: 3, listingLimit: null, percentage: null, hasLimit: false }
  );
});

test('keeps inventory display quota-free when no limit is configured', () => {
  assert.deepEqual(
    getPartnerInventoryDisplay({ listingCount: 2, listingLimit: null }),
    { listingCount: 2, listingLimit: null, percentage: null, hasLimit: false }
  );
});

test('does not calculate quota progress for any published inventory count', () => {
  assert.deepEqual(
    getPartnerInventoryDisplay({ listingCount: 7, listingLimit: 5 }),
    { listingCount: 7, listingLimit: null, percentage: null, hasLimit: false }
  );
});
