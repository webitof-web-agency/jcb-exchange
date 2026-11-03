import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePublishedBroadcastRecipients, type PublishedBroadcastRecipient } from './publishedBroadcastAudience';

test('merges logged-in customer and candidate job-alert recipients without duplicate phones', () => {
  const candidate: PublishedBroadcastRecipient = {
    recipientType: 'CANDIDATE',
    recipientPhone: '9876543210',
    sourceEntityType: 'CANDIDATE',
    sourceEntityId: 'candidate-1',
  };
  const customer: PublishedBroadcastRecipient = {
    recipientType: 'CUSTOMER',
    recipientPhone: '9876543210',
    sourceEntityType: 'USER',
    sourceEntityId: 'user-1',
  };
  const secondCustomer: PublishedBroadcastRecipient = {
    recipientType: 'CUSTOMER',
    recipientPhone: '9123456789',
    sourceEntityType: 'USER',
    sourceEntityId: 'user-2',
  };

  assert.deepEqual(mergePublishedBroadcastRecipients([[candidate], [customer, secondCustomer]]), [candidate, secondCustomer]);
});
