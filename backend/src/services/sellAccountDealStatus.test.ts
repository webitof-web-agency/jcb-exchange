import test from 'node:test';
import assert from 'node:assert/strict';
import { SellAccountDealStatus } from '@prisma/client';

test('keeps the legacy CANCELLED Sold Vehicle status readable', () => {
  assert.equal(SellAccountDealStatus.CANCELLED, 'CANCELLED');
});
