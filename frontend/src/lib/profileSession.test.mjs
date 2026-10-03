import assert from 'node:assert/strict';
import test from 'node:test';
import { getProfileSessionToken } from './profileSession.mjs';

test('uses the refreshed profile token when the backend returns one', () => {
  assert.equal(getProfileSessionToken('refreshed-token', 'old-token'), 'refreshed-token');
});

test('keeps the current token when a legacy backend response has no token', () => {
  assert.equal(getProfileSessionToken('', 'old-token'), 'old-token');
});
