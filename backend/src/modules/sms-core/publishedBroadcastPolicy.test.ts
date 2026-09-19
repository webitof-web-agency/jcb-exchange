import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSmsPublishedBroadcastRecipientType,
  shouldDispatchSmsPublishedBroadcast,
} from './publishedBroadcastPolicy';

test('only dispatches an SMS broadcast when content becomes published', () => {
  assert.equal(shouldDispatchSmsPublishedBroadcast({ previousStatus: 'DRAFT', nextStatus: 'PUBLISHED' }), true);
  assert.equal(shouldDispatchSmsPublishedBroadcast({ previousStatus: 'PENDING_APPROVAL', nextStatus: 'PUBLISHED' }), true);
  assert.equal(shouldDispatchSmsPublishedBroadcast({ previousStatus: 'PUBLISHED', nextStatus: 'PUBLISHED' }), false);
  assert.equal(shouldDispatchSmsPublishedBroadcast({ previousStatus: 'PUBLISHED', nextStatus: 'CLOSED' }), false);
});

test('maps published SMS events to their recipient types', () => {
  assert.equal(getSmsPublishedBroadcastRecipientType('MARKETPLACE_NEW_LISTING_PUBLISHED'), 'CUSTOMER');
  assert.equal(getSmsPublishedBroadcastRecipientType('RECRUITMENT_NEW_JOB_PUBLISHED'), 'CANDIDATE');
});
