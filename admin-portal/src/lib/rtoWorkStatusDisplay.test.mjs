import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRtoCurrency } from './rtoWorkStatusDisplay.mjs';

test('formats RTO expenses with a real INR symbol and Indian grouping', () => {
  assert.equal(formatRtoCurrency(5000), '₹5,000.00');
});

test('renders invalid RTO amounts as zero instead of exposing NaN', () => {
  assert.equal(formatRtoCurrency('not-a-number'), '₹0.00');
});
