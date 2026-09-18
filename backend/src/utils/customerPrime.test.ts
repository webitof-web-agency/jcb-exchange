import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCustomerPrimeSettings } from './customerPrime';

test('preserves independent Prime feature toggles', () => {
  const settings = normalizeCustomerPrimeSettings({
    enabled: true,
    requireForCall: false,
    requireForWhatsapp: true,
    requireForSellListing: false,
  });

  assert.equal(settings.requireForCall, false);
  assert.equal(settings.requireForWhatsapp, true);
  assert.equal(settings.requireForSellListing, false);
});
