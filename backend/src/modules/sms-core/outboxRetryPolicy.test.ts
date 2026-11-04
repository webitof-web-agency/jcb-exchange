import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRetrySmsOutbox,
  getNextSmsAttemptAt,
  isSmsOutboxDue,
} from './outboxRetryPolicy';

test('allows SMS retries until the attempt limit and blocks exhausted messages', () => {
  assert.equal(canRetrySmsOutbox({ status: 'FAILED', attempts: 1 }), true);
  assert.equal(canRetrySmsOutbox({ status: 'FAILED', attempts: 3 }), false);
  assert.equal(canRetrySmsOutbox({ status: 'SENT', attempts: 1 }), false);
});

test('schedules SMS retries with the same bounded backoff policy', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');
  assert.equal(getNextSmsAttemptAt({ attempts: 1, now })!.toISOString(), '2026-11-04T12:00:30.000Z');
  assert.equal(getNextSmsAttemptAt({ attempts: 2, now })!.toISOString(), '2026-11-04T12:05:00.000Z');
  assert.equal(getNextSmsAttemptAt({ attempts: 3, now }), null);
});

test('only treats a scheduled SMS retry as due at or after its due time', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');
  assert.equal(isSmsOutboxDue({ status: 'FAILED', attempts: 1, nextAttemptAt: new Date('2026-11-04T12:00:00.000Z'), now }), true);
  assert.equal(isSmsOutboxDue({ status: 'FAILED', attempts: 1, nextAttemptAt: new Date('2026-11-04T12:00:01.000Z'), now }), false);
  assert.equal(isSmsOutboxDue({ status: 'CANCELLED', attempts: 1, nextAttemptAt: now, now }), false);
});
