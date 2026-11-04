import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRetryWhatsAppOutbox,
  getNextWhatsAppAttemptAt,
  isWhatsAppOutboxDue,
} from './outboxRetryPolicy';

test('allows a failed WhatsApp outbox message to retry until the attempt limit', () => {
  assert.equal(canRetryWhatsAppOutbox({ status: 'FAILED', attempts: 1 }), true);
  assert.equal(canRetryWhatsAppOutbox({ status: 'FAILED', attempts: 2 }), true);
});

test('blocks retry for non-failed or exhausted WhatsApp outbox messages', () => {
  assert.equal(canRetryWhatsAppOutbox({ status: 'SENT', attempts: 1 }), false);
  assert.equal(canRetryWhatsAppOutbox({ status: 'FAILED', attempts: 3 }), false);
});

test('schedules WhatsApp retries with bounded exponential backoff', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');
  assert.equal(getNextWhatsAppAttemptAt({ attempts: 1, now })!.toISOString(), '2026-11-04T12:00:30.000Z');
  assert.equal(getNextWhatsAppAttemptAt({ attempts: 2, now })!.toISOString(), '2026-11-04T12:05:00.000Z');
  assert.equal(getNextWhatsAppAttemptAt({ attempts: 3, now }), null);
});

test('only treats a WhatsApp retry as due once its schedule has arrived', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');
  assert.equal(isWhatsAppOutboxDue({ status: 'FAILED', attempts: 1, nextAttemptAt: new Date('2026-11-04T11:59:59.000Z'), now }), true);
  assert.equal(isWhatsAppOutboxDue({ status: 'FAILED', attempts: 1, nextAttemptAt: new Date('2026-11-04T12:00:01.000Z'), now }), false);
  assert.equal(isWhatsAppOutboxDue({ status: 'SENT', attempts: 1, nextAttemptAt: now, now }), false);
});
