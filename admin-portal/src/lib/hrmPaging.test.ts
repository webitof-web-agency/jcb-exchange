import assert from 'node:assert/strict';
import test from 'node:test';

import { clampPage, describePageRange, totalPagesOf } from './hrmPaging';

test('page range label and page clamping', () => {
  assert.equal(describePageRange({ page: 1, limit: 50, total: 135 }, 50), '1–50 of 135');
  assert.equal(describePageRange({ page: 3, limit: 50, total: 135 }, 35), '101–135 of 135');
  assert.equal(describePageRange({ page: 1, limit: 50, total: 0 }, 0), '0 of 0');
  assert.equal(totalPagesOf({ page: 1, limit: 50, total: 135 }), 3);
  assert.equal(totalPagesOf({ page: 1, limit: 50, total: 0 }), 1);
  assert.equal(clampPage({ page: 4, limit: 50, total: 135 }), 3, 'the last page shrank away');
  assert.equal(clampPage({ page: 2, limit: 50, total: 135 }), null);
  assert.equal(clampPage({ page: 2, limit: 50, total: 0, totalPages: 1 }), 1);
});
