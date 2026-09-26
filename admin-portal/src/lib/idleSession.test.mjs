import assert from 'node:assert/strict';
import test from 'node:test';
import { getIdleSessionState } from './idleSession.mjs';

test('marks the admin session for logout once the idle deadline is reached', () => {
  assert.equal(
    getIdleSessionState(1_000, 901_000, 15 * 60 * 1000, 60 * 1000).shouldLogout,
    true,
  );
});
