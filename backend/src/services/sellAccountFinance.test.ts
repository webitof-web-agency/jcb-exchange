import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveSellAccountDealStatus } from './sellAccountFinance';

test('marks a linked pending RTO record as RTO work in progress', () => {
  assert.equal(deriveSellAccountDealStatus('FULL', 'PENDING', true), 'RTO_WORK_IN_PROGRESS');
});

test('does not mark a fully paid Sell Account as RTO started without an explicit link', () => {
  assert.equal(deriveSellAccountDealStatus('FULL', 'PENDING', false), 'FULL_PAYMENT');
});
