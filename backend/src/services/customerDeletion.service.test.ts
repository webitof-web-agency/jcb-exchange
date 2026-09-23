import assert from 'node:assert/strict';
import test from 'node:test';
import { canHardDeleteCustomer, getCustomerDeletionBlockers } from './customerDeletion.service';

const emptyCounts = {
  listings: 0,
  customerLeads: 0,
  assignedLeads: 0,
  teamMemberships: 0,
  listingPaymentSubmissions: 0,
  customerPrimeSubscriptions: 0,
  createdUsers: 0,
  auditLogs: 0,
};

test('allows permanent deletion when a customer has no linked business records', () => {
  assert.equal(canHardDeleteCustomer(emptyCounts), true);
});

test('blocks permanent deletion when linked customer data must be preserved', () => {
  assert.deepEqual(
    getCustomerDeletionBlockers({ ...emptyCounts, customerLeads: 1, customerPrimeSubscriptions: 1 }),
    ['customer leads', 'prime subscriptions'],
  );
  assert.equal(canHardDeleteCustomer({ ...emptyCounts, customerLeads: 1 }), false);
});
