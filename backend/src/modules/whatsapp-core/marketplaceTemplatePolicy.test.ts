import assert from 'node:assert/strict';
import test from 'node:test';
import { getMarketplaceTemplateComponents } from './marketplaceTemplatePolicy';

test('maps marketplace event payloads into the selected Meta template body order', () => {
  assert.deepEqual(
    getMarketplaceTemplateComponents('LISTING_PAYMENT_APPROVED', {
      paymentId: 'payment-1',
      listingId: 'listing-1',
      listingTitle: 'JCB 3DX',
      status: 'APPROVED',
      paymentStatus: 'PAID',
      recipientRole: 'CUSTOMER',
    }, [{ type: 'BODY', text: 'Payment {{1}} for {{2}} is {{3}}.' }]),
    [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'payment-1' },
        { type: 'text', text: 'listing-1' },
        { type: 'text', text: 'JCB 3DX' },
      ],
    }],
  );
});

test('returns no body component when a selected template has no body variables', () => {
  assert.deepEqual(
    getMarketplaceTemplateComponents('MARKETPLACE_NEW_PAYMENT_SUPERADMIN', { paymentId: 'payment-1' }, [{ type: 'BODY', text: 'New payment received.' }]),
    [],
  );
});
