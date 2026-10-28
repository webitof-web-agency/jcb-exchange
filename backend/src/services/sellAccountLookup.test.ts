import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSellAccountLookup } from './sellAccountLookup';

test('resolves Sold Vehicle URLs by their linked listing id', () => {
  assert.deepEqual(buildSellAccountLookup('listing-123'), {
    OR: [
      { id: 'listing-123' },
      { recordNumber: 'listing-123' },
      { listingId: 'listing-123' },
    ],
    deletedAt: null,
  });
});
