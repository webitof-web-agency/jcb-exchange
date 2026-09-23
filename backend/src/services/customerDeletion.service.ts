export type CustomerDeletionCounts = {
  listings: number;
  customerLeads: number;
  assignedLeads: number;
  teamMemberships: number;
  listingPaymentSubmissions: number;
  customerPrimeSubscriptions: number;
  createdUsers: number;
  auditLogs: number;
};

const deletionBlockers = [
  ['listings', 'listings'],
  ['customerLeads', 'customer leads'],
  ['assignedLeads', 'assigned leads'],
  ['teamMemberships', 'team memberships'],
  ['listingPaymentSubmissions', 'listing payment submissions'],
  ['customerPrimeSubscriptions', 'prime subscriptions'],
  ['createdUsers', 'created users'],
  ['auditLogs', 'audit records'],
] as const;

export const getCustomerDeletionBlockers = (counts: CustomerDeletionCounts) =>
  deletionBlockers
    .filter(([key]) => counts[key] > 0)
    .map(([, label]) => label);

export const canHardDeleteCustomer = (counts: CustomerDeletionCounts) =>
  getCustomerDeletionBlockers(counts).length === 0;
