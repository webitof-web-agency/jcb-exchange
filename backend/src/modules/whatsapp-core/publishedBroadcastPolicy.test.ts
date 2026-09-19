import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getWhatsAppPublishedBroadcastAudience,
  getWhatsAppPublishedBroadcastConsentCategory,
  getWhatsAppPublishedBroadcastRecipientType,
  getWhatsAppPublishedTemplateComponents,
  type WhatsAppPublishedBroadcastEvent,
} from './publishedBroadcastPolicy';

test('maps published WhatsApp events to the opted-in audience', () => {
  assert.equal(getWhatsAppPublishedBroadcastAudience('MARKETPLACE_NEW_LISTING_PUBLISHED'), 'MARKETPLACE');
  assert.equal(getWhatsAppPublishedBroadcastAudience('RECRUITMENT_NEW_JOB_PUBLISHED'), 'RECRUITMENT');
  assert.equal(getWhatsAppPublishedBroadcastConsentCategory('MARKETPLACE_NEW_LISTING_PUBLISHED'), 'MARKETING');
  assert.equal(getWhatsAppPublishedBroadcastConsentCategory('RECRUITMENT_NEW_JOB_PUBLISHED'), 'JOB_ALERTS');
  assert.equal(getWhatsAppPublishedBroadcastRecipientType('MARKETPLACE_NEW_LISTING_PUBLISHED'), 'CUSTOMER');
  assert.equal(getWhatsAppPublishedBroadcastRecipientType('RECRUITMENT_NEW_JOB_PUBLISHED'), 'CANDIDATE');
});

test('builds Meta body parameters in the approved template order', () => {
  const listingComponents = getWhatsAppPublishedTemplateComponents('MARKETPLACE_NEW_LISTING_PUBLISHED', {
    vehicleShortTitle: '2023 JCB 3DX',
    listingTitle: 'Long title must not be preferred',
  });
  assert.deepEqual(listingComponents, [{
    type: 'body',
    parameters: [{ type: 'text', text: '2023 JCB 3DX' }],
  }]);

  const jobComponents = getWhatsAppPublishedTemplateComponents('RECRUITMENT_NEW_JOB_PUBLISHED', {
    jobTitle: 'Service Engineer',
  });
  assert.deepEqual(jobComponents, [{
    type: 'body',
    parameters: [{ type: 'text', text: 'Service Engineer' }],
  }]);
});

test('uses safe fallback text when a published payload is incomplete', () => {
  const event: WhatsAppPublishedBroadcastEvent = 'MARKETPLACE_NEW_LISTING_PUBLISHED';
  assert.deepEqual(getWhatsAppPublishedTemplateComponents(event, {}), [{
    type: 'body',
    parameters: [{ type: 'text', text: 'Vehicle listing' }],
  }]);
});
