import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBillingLocation } from './billingLocation';

test('requires both a non-empty billing city and state', () => {
  assert.deepEqual(normalizeBillingLocation({ city: ' Pune ', state: ' Maharashtra ' }), {
    city: 'Pune',
    state: 'Maharashtra',
  });
  assert.throws(() => normalizeBillingLocation({ city: '', state: 'Maharashtra' }), /city/i);
  assert.throws(() => normalizeBillingLocation({ city: 'Pune', state: '  ' }), /state/i);
});
