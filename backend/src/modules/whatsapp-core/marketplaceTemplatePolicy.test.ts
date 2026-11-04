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

test('keeps marketplace parameters aligned with approved template placeholder meaning', () => {
  assert.deepEqual(
    getMarketplaceTemplateComponents('PARTNER_KYC_STATUS_UPDATED', { partnerId: 'partner-1', kycStatus: 'APPROVED' }, [{ type: 'BODY', text: 'KYC status {{1}}' }]),
    [{ type: 'body', parameters: [{ type: 'text', text: 'APPROVED' }] }],
  );
  assert.deepEqual(
    getMarketplaceTemplateComponents('MARKETPLACE_NEW_LISTING_PUBLISHED', { listingId: 'listing-1', vehicleShortTitle: '2020 JCB 3DX', listingStatus: 'PUBLISHED' }, [{ type: 'BODY', text: 'Listing {{2}} (ID: {{1}}) Status {{3}}' }]),
    [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'listing-1' },
        { type: 'text', text: '2020 JCB 3DX' },
        { type: 'text', text: 'PUBLISHED' },
      ],
    }],
  );
  assert.deepEqual(
    getMarketplaceTemplateComponents('MARKETPLACE_NEW_PAYMENT_SUPERADMIN', { listingTitle: 'JCB 3DX', method: 'UPI', paymentId: 'payment-1' }, [{ type: 'BODY', text: 'Vehicle {{1}} Method {{2}}' }]),
    [{ type: 'body', parameters: [{ type: 'text', text: 'JCB 3DX' }, { type: 'text', text: 'UPI' }] }],
  );
});
