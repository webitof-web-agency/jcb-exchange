import assert from 'node:assert/strict';
import test from 'node:test';
import { isSelfPurchase } from './listingPurchasePolicy';

test('blocks a purchase when listing owner and buyer are the same user', () => {
  assert.equal(isSelfPurchase('user-1', 'user-1'), true);
});

test('allows a purchase when listing owner and buyer are different users', () => {
  assert.equal(isSelfPurchase('user-1', 'user-2'), false);
});

test('does not treat missing identities as a self purchase', () => {
  assert.equal(isSelfPurchase(null, 'user-1'), false);
  assert.equal(isSelfPurchase('user-1', null), false);
});
