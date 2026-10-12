import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveListingContactNumber } from './listingContact';

test('resolves the listing owner primary mobile number first', () => {
  assert.equal(
    resolveListingContactNumber({
      mobile: ' 9876543210 ',
      whatsappNumber: '9999999999',
      partnerProfile: { alternateMobile: '8888888888' },
    }),
    '9876543210',
  );
});

test('falls back to alternate and WhatsApp numbers when primary mobile is missing', () => {
  assert.equal(resolveListingContactNumber({ partnerProfile: { alternateMobile: '8888888888' } }), '8888888888');
  assert.equal(resolveListingContactNumber({ whatsappNumber: '9999999999' }), '9999999999');
  assert.equal(resolveListingContactNumber(null), null);
});
