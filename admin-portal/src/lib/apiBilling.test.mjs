import assert from 'node:assert/strict';
import test from 'node:test';

import { formatApiWalletBalance, getApiServicePrice } from './apiBilling.ts';

test('returns a configured rupee price only for an active billing service', () => {
  const summary = {
    wallet: { currency: 'INR', balanceRupees: '99.80', mode: 'ACTIVE' },
    services: [
      { serviceKey: 'PAN_VERIFICATION', displayName: 'PAN Verification', priceRupees: '0.20', active: true, version: 1 },
      { serviceKey: 'GST_VERIFICATION', displayName: 'GST Verification', priceRupees: null, active: false, version: null },
    ],
  };

  assert.equal(getApiServicePrice(summary, 'PAN_VERIFICATION'), '0.20');
  assert.equal(getApiServicePrice(summary, 'GST_VERIFICATION'), null);
});

test('formats wallet balances as Indian rupee amounts for the portal header', () => {
  assert.equal(formatApiWalletBalance('50000.00'), '₹50,000.00');
  assert.equal(formatApiWalletBalance('0.20'), '₹0.20');
});
