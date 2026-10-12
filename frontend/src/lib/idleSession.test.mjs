import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getActivityStorageKey,
  getIdleSessionState,
  getStoredActivityAt,
  shouldAcceptActivityAt,
} from './idleSession.mjs';

test('marks the session for logout once the idle deadline is reached', () => {
  assert.deepEqual(
    getIdleSessionState(1_000, 901_000, 15 * 60 * 1000, 60 * 1000),
    { remainingMs: 0, shouldWarn: false, shouldLogout: true },
  );
});

test('marks the warning window without logging out early', () => {
  assert.deepEqual(
    getIdleSessionState(1_000, 841_000, 15 * 60 * 1000, 60 * 1000),
    { remainingMs: 60_000, shouldWarn: true, shouldLogout: false },
  );
});

test('uses a namespaced activity key so token removal cannot clear activity state accidentally', () => {
  assert.equal(getActivityStorageKey('frontend_portal_token'), 'frontend_portal_token:last_activity');
});

test('restores a valid shared activity timestamp and ignores invalid values', () => {
  assert.equal(getStoredActivityAt('12345', 999), 12345);
  assert.equal(getStoredActivityAt('not-a-time', 999), 999);
});

test('accepts only newer activity timestamps from another tab', () => {
  assert.equal(shouldAcceptActivityAt(10_000, 10_001), true);
  assert.equal(shouldAcceptActivityAt(10_000, 10_000), false);
  assert.equal(shouldAcceptActivityAt(10_000, 9_999), false);
});
