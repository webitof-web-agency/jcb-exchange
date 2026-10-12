import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getActivityStorageKey,
  getIdleSessionState,
  getStoredActivityAt,
  shouldAcceptActivityAt,
} from './idleSession.mjs';

test('marks the admin session for logout once the idle deadline is reached', () => {
  assert.equal(
    getIdleSessionState(1_000, 901_000, 15 * 60 * 1000, 60 * 1000).shouldLogout,
    true,
  );
});

test('uses a namespaced activity key for the admin portal', () => {
  assert.equal(getActivityStorageKey('portal_token'), 'portal_token:last_activity');
});

test('restores only valid shared activity timestamps', () => {
  assert.equal(getStoredActivityAt('12345', 999), 12345);
  assert.equal(getStoredActivityAt('', 999), 999);
});

test('accepts only newer activity timestamps from another admin tab', () => {
  assert.equal(shouldAcceptActivityAt(10_000, 10_001), true);
  assert.equal(shouldAcceptActivityAt(10_000, 10_000), false);
  assert.equal(shouldAcceptActivityAt(10_000, 9_999), false);
});
