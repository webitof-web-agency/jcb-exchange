import assert from 'node:assert/strict';
import test from 'node:test';
import { canRetryWhatsAppOutbox } from './outboxRetryPolicy';

test('allows a failed WhatsApp outbox message to retry until the attempt limit', () => {
  assert.equal(canRetryWhatsAppOutbox({ status: 'FAILED', attempts: 1 }), true);
  assert.equal(canRetryWhatsAppOutbox({ status: 'FAILED', attempts: 2 }), true);
});

test('blocks retry for non-failed or exhausted WhatsApp outbox messages', () => {
  assert.equal(canRetryWhatsAppOutbox({ status: 'SENT', attempts: 1 }), false);
  assert.equal(canRetryWhatsAppOutbox({ status: 'FAILED', attempts: 3 }), false);
});
