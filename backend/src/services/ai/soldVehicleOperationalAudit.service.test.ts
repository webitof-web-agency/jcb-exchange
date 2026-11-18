import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSoldVehicleOperationalAudit } from './soldVehicleOperationalAudit.service';

const actor = (id: string, name: string, role = 'EMPLOYEE') => ({ id, name, email: `${id}@jcb.example`, role });

test('builds the complete Sold Vehicle audit and operational projection with actor attribution', () => {
  const result = buildSoldVehicleOperationalAudit({
    actors: [actor('u1', 'Maker'), actor('u2', 'Checker', 'SUPER_ADMIN')],
    statusHistory: [{ id: 'status-1', oldStatus: 'OPEN', newStatus: 'PARTIAL_PAYMENT_RECEIVED', reason: 'Advance received', changedById: 'u1', createdAt: '2026-11-10T10:00:00.000Z' }],
    lockHistory: [{ id: 'lock-1', action: 'LOCK', actorId: 'u2', reason: 'Deal completed', createdAt: '2026-11-11T10:00:00.000Z' }],
    currentLock: { isLocked: true, lockedAt: '2026-11-11T10:00:00.000Z', lockedById: 'u2' },
    payments: [
      { id: 'payment-1', side: 'PURCHASER_RECEIPT', amount: 250000, paymentDate: '2026-11-10T10:00:00.000Z', method: 'BANK_TRANSFER', reference: 'UTR-123', drawnOn: 'HDFC Raipur', receiptStatus: 'ISSUED', issuedById: 'u1', cancelledById: null, createdById: 'u1', listingPaymentId: 'listing-payment-1' },
    ],
    refunds: [{ id: 'refund-1', status: 'APPROVED', amount: 5000, reason: 'EXCESS_PAYMENT', requestedById: 'u1', approvedById: 'u2', approvedAt: '2026-11-12T10:00:00.000Z', rejectedById: null, rejectedAt: null, paidById: null, paidAt: null, method: 'BANK_TRANSFER', reference: 'REF-1', drawnOn: 'ICICI Raipur', note: 'Checker approved' }],
    dealNotes: { remarks: 'Internal margin note', transferDetails: 'RC transfer pending by agent', rtoNoteSheet: 'RTO document note', financeNotes: 'Finance reconciliation note', saleNotes: 'Sale note' },
    communicationLogs: {
      whatsapp: [{ id: 'wa-1', eventCode: 'VEHICLE_SALE_INVOICE', relatedEntityType: 'SELL_ACCOUNT', relatedEntityId: 'deal-1', recipientType: 'CUSTOMER', recipientPhone: '9876543210', status: 'DELIVERED', errorCode: null, errorMessage: null, createdAt: '2026-11-10T11:00:00.000Z', sentAt: '2026-11-10T11:00:01.000Z', deliveredAt: '2026-11-10T11:00:02.000Z', readAt: null, outbox: { attempts: 1, status: 'SENT', processedAt: '2026-11-10T11:00:01.000Z', lastError: null } }],
      sms: [{ id: 'sms-1', eventCode: 'VEHICLE_SALE_PAYMENT_RECEIPT', relatedEntityType: 'SELL_ACCOUNT_PAYMENT', relatedEntityId: 'payment-1', recipientType: 'CUSTOMER', recipientPhone: '9876543210', status: 'FAILED', errorCode: 'DLR_FAILED', errorMessage: 'Provider rejected', createdAt: '2026-11-10T11:00:00.000Z', sentAt: null, deliveredAt: null, readAt: null, outbox: { attempts: 2, status: 'FAILED', processedAt: '2026-11-10T11:01:00.000Z', lastError: 'Provider rejected' } }],
    },
    listingPayments: [{ id: 'listing-payment-1', status: 'APPROVED', amount: 250000, method: 'PHONEPE', transactionRef: 'TXN-1', submittedAt: '2026-11-09T10:00:00.000Z' }],
  });

  assert.equal(result.statusHistory[0]?.changedBy?.name, 'Maker');
  assert.equal(result.lockHistory[0]?.actor?.role, 'SUPER_ADMIN');
  assert.equal(result.currentLock.isLocked, true);
  assert.equal(result.refundApprovals[0]?.requestedBy?.name, 'Maker');
  assert.equal(result.refundApprovals[0]?.approvedBy?.name, 'Checker');
  assert.equal(result.bankDetails.payments[0]?.drawnOn, 'HDFC Raipur');
  assert.equal(result.bankDetails.refunds[0]?.drawnOn, 'ICICI Raipur');
  assert.equal(result.internalNotes.dealRemarks, 'Internal margin note');
  assert.equal(result.internalNotes.transferDetails, 'RC transfer pending by agent');
  assert.equal(result.internalNotes.connectedNotes.rtoNoteSheet, 'RTO document note');
  assert.equal(result.internalNotes.connectedNotes.financeNotes, 'Finance reconciliation note');
  assert.equal(result.internalNotes.connectedNotes.saleNotes, 'Sale note');
  assert.equal(result.communications.summary.total, 2);
  assert.equal(result.communications.summary.delivered, 1);
  assert.equal(result.communications.summary.failed, 1);
  assert.equal(result.onlineAdvancePayments.links[0]?.matched, true);
  assert.equal(result.onlineAdvancePayments.unmatchedListingPaymentIds.length, 0);
});

test('reports missing actors and unmatched online advances without inventing audit history', () => {
  const result = buildSoldVehicleOperationalAudit({
    actors: [],
    statusHistory: [{ id: 'status-1', oldStatus: null, newStatus: 'OPEN', reason: null, changedById: 'missing-user', createdAt: '2026-11-10T10:00:00.000Z' }],
    lockHistory: [],
    currentLock: { isLocked: false, lockedAt: null, lockedById: null },
    payments: [],
    refunds: [],
    dealNotes: { remarks: null, transferDetails: null, rtoNoteSheet: null, financeNotes: null, saleNotes: null },
    communicationLogs: { whatsapp: [], sms: [] },
    listingPayments: [{ id: 'orphan-online-1', status: 'APPROVED', amount: 1000, method: 'RAZORPAY', transactionRef: null, submittedAt: null }],
  });

  assert.equal(result.statusHistory[0]?.changedBy, null);
  assert.equal(result.statusHistory[0]?.changedById, 'missing-user');
  assert.equal(result.onlineAdvancePayments.links[0]?.matched, false);
  assert.deepEqual(result.onlineAdvancePayments.unmatchedListingPaymentIds, ['orphan-online-1']);
  assert.ok(result.warnings.some((warning) => warning.includes('actor')));
  assert.ok(result.warnings.some((warning) => warning.includes('unmatched')));
});

test('uses the current lock snapshot as explicitly labelled evidence for legacy locked deals', () => {
  const result = buildSoldVehicleOperationalAudit({
    actors: [actor('u1', 'Legacy Locker')],
    statusHistory: [],
    lockHistory: [],
    currentLock: { isLocked: true, lockedAt: '2026-11-10T10:00:00.000Z', lockedById: 'u1' },
    payments: [],
    refunds: [],
    dealNotes: { remarks: null, transferDetails: null, rtoNoteSheet: null, financeNotes: null, saleNotes: null },
    communicationLogs: { whatsapp: [], sms: [] },
    listingPayments: [],
  });

  assert.equal(result.lockHistory[0]?.historySource, 'CURRENT_RECORD_SNAPSHOT');
  assert.equal(result.lockHistory[0]?.actor?.name, 'Legacy Locker');
});
