import assert from 'node:assert/strict';
import test from 'node:test';
import { getProfileSessionToken } from './profileSession.mjs';

test('uses a renewed profile token when the backend returns one', () => {
  assert.equal(getProfileSessionToken('renewed-token', 'current-token'), 'renewed-token');
});

test('keeps the current token for legacy profile responses', () => {
  assert.equal(getProfileSessionToken('', 'current-token'), 'current-token');
});
