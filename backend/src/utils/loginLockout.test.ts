import assert from 'node:assert/strict';
import test from 'node:test';
import { clearLoginFailures, LOCK_MS, loginLockRemainingMs, MAX_FAILURES, recordLoginFailure } from './loginLockout';

test('locks password login after the maximum wrong passwords, per email', () => {
  const now = 1_000_000;
  for (let attempt = 1; attempt < MAX_FAILURES; attempt += 1) recordLoginFailure('staff@example.com', now);
  assert.equal(loginLockRemainingMs('staff@example.com', now), 0);
  recordLoginFailure('STAFF@example.com ', now);
  assert.equal(loginLockRemainingMs('staff@example.com', now), LOCK_MS);
  assert.equal(loginLockRemainingMs('other@example.com', now), 0);
});

test('the lock expires, and a correct password clears the count', () => {
  const now = 5_000_000;
  for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) recordLoginFailure('a@example.com', now);
  assert.ok(loginLockRemainingMs('a@example.com', now + LOCK_MS - 1) > 0);
  assert.equal(loginLockRemainingMs('a@example.com', now + LOCK_MS), 0);

  recordLoginFailure('b@example.com', now);
  recordLoginFailure('b@example.com', now);
  clearLoginFailures('b@example.com');
  for (let attempt = 1; attempt < MAX_FAILURES; attempt += 1) recordLoginFailure('b@example.com', now);
  assert.equal(loginLockRemainingMs('b@example.com', now), 0);
});

test('failures spread wider than the window do not add up', () => {
  const start = 9_000_000;
  for (let attempt = 0; attempt < MAX_FAILURES - 1; attempt += 1) recordLoginFailure('c@example.com', start);
  recordLoginFailure('c@example.com', start + LOCK_MS + 1);
  assert.equal(loginLockRemainingMs('c@example.com', start + LOCK_MS + 1), 0);
});
