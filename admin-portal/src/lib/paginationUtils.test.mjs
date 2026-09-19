import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPaginationItems } from './paginationUtils.js';

test('buildPaginationItems mirrors the compact enquiry pagination pattern', () => {
  assert.deepEqual(buildPaginationItems(1, 1), [1]);
  assert.deepEqual(buildPaginationItems(1, 4), [1, 2, 3, 4]);
  assert.deepEqual(buildPaginationItems(3, 8), [1, 2, 3, 4, '...', 8]);
  assert.deepEqual(buildPaginationItems(6, 10), [1, '...', 5, 6, 7, '...', 10]);
});
