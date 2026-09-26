import assert from 'node:assert/strict';
import test from 'node:test';
import { getIdleSessionState } from './idleSession.mjs';

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
