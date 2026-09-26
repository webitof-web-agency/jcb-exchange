import assert from 'node:assert/strict';
import test from 'node:test';
import { isAuthVersionCurrent } from './authVersion';

test('accepts a token when its auth version matches the current user version', () => {
  assert.equal(isAuthVersionCurrent(3, 3), true);
});

test('rejects a token after the user auth version is incremented', () => {
  assert.equal(isAuthVersionCurrent(2, 3), false);
});

test('accepts legacy tokens without a version only for users still on version zero', () => {
  assert.equal(isAuthVersionCurrent(undefined, 0), true);
  assert.equal(isAuthVersionCurrent(undefined, 1), false);
});

test('rejects malformed token versions', () => {
  assert.equal(isAuthVersionCurrent(-1, 0), false);
  assert.equal(isAuthVersionCurrent(1.5, 1), false);
  assert.equal(isAuthVersionCurrent('1' as unknown as number, 1), false);
});
