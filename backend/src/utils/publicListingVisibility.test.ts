import assert from 'node:assert/strict';
import test from 'node:test';

import { getPublicMarketplaceAvailableListingWhere } from './publicListingVisibility';

test('available marketplace feed excludes sold listings', () => {
  const where = getPublicMarketplaceAvailableListingWhere() as { status?: unknown };

  assert.deepEqual(where.status, {
    in: ['PUBLISHED', 'RESERVED', 'PAUSED'],
  });
});
