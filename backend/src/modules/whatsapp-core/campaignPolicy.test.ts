import assert from 'node:assert/strict';
import test from 'node:test';
import { canConfirmWhatsAppCampaign } from './campaignPolicy';

test('allows only a draft campaign with opted-in recipients to be confirmed', () => {
  assert.equal(canConfirmWhatsAppCampaign({ status: 'DRAFT', recipientCount: 1 }), true);
  assert.equal(canConfirmWhatsAppCampaign({ status: 'DRAFT', recipientCount: 100 }), true);
});

test('blocks empty or already processed campaigns from confirmation', () => {
  assert.equal(canConfirmWhatsAppCampaign({ status: 'DRAFT', recipientCount: 0 }), false);
  assert.equal(canConfirmWhatsAppCampaign({ status: 'SENDING', recipientCount: 10 }), false);
  assert.equal(canConfirmWhatsAppCampaign({ status: 'COMPLETED', recipientCount: 10 }), false);
});
