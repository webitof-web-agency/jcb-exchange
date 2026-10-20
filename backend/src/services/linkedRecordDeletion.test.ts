import assert from 'node:assert/strict';
import test from 'node:test';
import { getLinkedRecordDeletionPolicy } from './linkedRecordDeletion';

test('blocks direct Sell Account deletion when it has an RTO handoff', () => {
  assert.deepEqual(getLinkedRecordDeletionPolicy({ source: 'SELL_ACCOUNT', hasLinkedRto: true, isLocked: false }), {
    action: 'BLOCK',
    code: 'RTO_HANDOFF_REQUIRED',
    message: 'This Sold Vehicle was transferred to RTO Work. Delete it from the RTO Work section first.',
  });
});

test('allows an unlinked Sell Account to be deleted by itself', () => {
  assert.deepEqual(getLinkedRecordDeletionPolicy({ source: 'SELL_ACCOUNT', hasLinkedRto: false, isLocked: false }), {
    action: 'DELETE_SELL_ACCOUNT',
  });
});

test('deletes an unlocked linked RTO and Sell Account as one pair', () => {
  assert.deepEqual(getLinkedRecordDeletionPolicy({ source: 'RTO', hasLinkedRto: true, isLocked: false }), {
    action: 'DELETE_LINKED_PAIR',
  });
});

test('blocks deletion when either connected record is locked', () => {
  assert.deepEqual(getLinkedRecordDeletionPolicy({ source: 'RTO', hasLinkedRto: true, isLocked: true }), {
    action: 'BLOCK',
    code: 'RECORD_LOCKED',
    message: 'This record is locked and can only be viewed. Delete it from the RTO Work section.',
  });
});
