import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPublishedBroadcastAudience,
  shouldDispatchPublishedBroadcast,
} from './publishedBroadcastPolicy';

test('only dispatches a published broadcast when the entity becomes public', () => {
  assert.equal(shouldDispatchPublishedBroadcast({ previousStatus: 'DRAFT', nextStatus: 'PUBLISHED' }), true);
  assert.equal(shouldDispatchPublishedBroadcast({ previousStatus: 'PENDING_APPROVAL', nextStatus: 'PUBLISHED' }), true);
  assert.equal(shouldDispatchPublishedBroadcast({ previousStatus: 'PUBLISHED', nextStatus: 'PUBLISHED' }), false);
  assert.equal(shouldDispatchPublishedBroadcast({ previousStatus: 'PUBLISHED', nextStatus: 'CLOSED' }), false);
});

test('maps public content events to consent audiences and WhatsApp recipients', () => {
  assert.deepEqual(getPublishedBroadcastAudience('MARKETPLACE_NEW_LISTING_PUBLISHED'), {
    consentCategory: 'MARKETING',
    recipientType: 'CUSTOMER',
  });
  assert.deepEqual(getPublishedBroadcastAudience('RECRUITMENT_NEW_JOB_PUBLISHED'), {
    consentCategory: 'JOB_ALERTS',
    recipientType: 'CANDIDATE',
  });
});
