import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createApiBillingWebhookSignature,
  formatRupeesFromPaise,
  rupeesToPaise,
  verifyApiBillingWebhookSignature,
} from './apiWalletBilling.service';

test('accepts rupee-form amounts exactly and formats them for display', () => {
  assert.equal(rupeesToPaise('0.2'), 20);
  assert.equal(rupeesToPaise('0.20'), 20);
  assert.equal(rupeesToPaise('125'), 12_500);
  assert.equal(formatRupeesFromPaise(20), '0.20');
  assert.equal(formatRupeesFromPaise(12_500), '125.00');
});

test('rejects unsafe rupee amounts instead of rounding them', () => {
  for (const amount of ['', '-1', '0.001', '1e2', 'abc', 0.2]) {
    assert.throws(() => rupeesToPaise(amount));
  }
});

test('accepts only an exact signed webhook payload', () => {
  const secret = 'wallet-webhook-secret';
  const body = Buffer.from('{"eventId":"evt-1"}', 'utf8');
  const signature = createApiBillingWebhookSignature(body, secret);

  assert.equal(verifyApiBillingWebhookSignature(body, signature, secret), true);
  assert.equal(verifyApiBillingWebhookSignature(Buffer.from('{"eventId":"evt-2"}', 'utf8'), signature, secret), false);
  assert.equal(verifyApiBillingWebhookSignature(body, signature, undefined), false);
});
