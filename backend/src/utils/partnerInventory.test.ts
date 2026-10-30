import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePartnerInventory } from './partnerInventory';

test('normalizes published inventory against the configured partner limit', () => {
  assert.deepEqual(
    normalizePartnerInventory({ publishedListings: 3, listingLimit: 5 }),
    { listingCount: 3, listingLimit: 5 }
  );
});

test('does not represent an absent inventory limit as unlimited', () => {
  assert.deepEqual(
    normalizePartnerInventory({ publishedListings: 2, listingLimit: null }),
    { listingCount: 2, listingLimit: null }
  );
});

test('normalizes invalid counts to safe zero values', () => {
  assert.deepEqual(
    normalizePartnerInventory({ publishedListings: -4, listingLimit: 0 }),
    { listingCount: 0, listingLimit: null }
  );
});
