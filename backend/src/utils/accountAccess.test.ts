import assert from 'node:assert/strict';
import test from 'node:test';
import { getAccountAccessState } from './accountAccess';

test('treats a deleted customer record as revoked access', () => {
  assert.equal(getAccountAccessState({ status: 'CLOSED', role: 'CUSTOMER' }), 'revoked');
});

test('keeps active customers authenticated', () => {
  assert.equal(getAccountAccessState({ status: 'ACTIVE', role: 'CUSTOMER' }), 'active');
});
