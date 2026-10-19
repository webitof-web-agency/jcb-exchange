import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSellAccountDraftId,
  isSellAccountDraft,
  mergeSellAccountRecords,
} from './sellAccountDrafts.mjs';

test('creates a stable draft id for a listing and a unique id for a fresh form', () => {
  assert.equal(createSellAccountDraftId('listing-1', 123), 'DRAFT-SELL-listing-1');
  assert.equal(createSellAccountDraftId('', 123), 'DRAFT-SELL-123');
});

test('keeps server records and unsynced drafts without resurrecting deleted records', () => {
  const serverRecords = [{ id: 'server-1', listingId: 'listing-1' }];
  const localRecords = [
    { id: 'DRAFT-SELL-listing-2', listingId: 'listing-2', isDraft: true },
    { id: 'DRAFT-SELL-listing-1', listingId: 'listing-1', isDraft: true },
    { id: 'offline-1', listingId: 'listing-3', isDraft: false },
  ];

  const merged = mergeSellAccountRecords(serverRecords, localRecords);

  assert.deepEqual(merged, [
    serverRecords[0],
    localRecords[0],
  ]);
  assert.equal(isSellAccountDraft(localRecords[0]), true);
  assert.equal(isSellAccountDraft(serverRecords[0]), false);
});

test('recognizes a database draft returned with its persisted draft status', () => {
  assert.equal(isSellAccountDraft({ status: 'DRAFT' }), true);
  assert.equal(isSellAccountDraft({ isDraft: true }), true);
  assert.equal(isSellAccountDraft({ status: 'OPEN', isDraft: false }), false);
});
