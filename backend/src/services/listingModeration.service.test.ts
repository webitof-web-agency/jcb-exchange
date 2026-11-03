import assert from 'node:assert/strict';
import test from 'node:test';
import { availableModerationActions, isModeratedListingStatus } from './listingModeration.service';

const admin = { isAdmin: true, isOwner: false };
const owner = { isAdmin: false, isOwner: true };
const stranger = { isAdmin: false, isOwner: false };

test('a live listing can be unlisted by its seller and unlisted, suspended or blocked by an admin', () => {
  assert.deepEqual(availableModerationActions('PUBLISHED', owner), ['UNLIST']);
  assert.deepEqual(availableModerationActions('PUBLISHED', admin), ['UNLIST', 'SUSPEND', 'BLOCK']);
  assert.deepEqual(availableModerationActions('PUBLISHED', stranger), []);
});

test('each hidden status has its own way back', () => {
  assert.deepEqual(availableModerationActions('UNLISTED', owner), ['RELIST']);
  assert.deepEqual(availableModerationActions('SUSPENDED', owner), ['REQUEST_REVIEW']);
  assert.deepEqual(availableModerationActions('SUSPENDED', admin), ['RESTORE', 'BLOCK']);
  assert.deepEqual(availableModerationActions('BLOCKED', owner), []);
  assert.deepEqual(availableModerationActions('BLOCKED', admin), ['UNBLOCK']);
});

test('sold listings are never moderated and drafts cannot be unlisted', () => {
  assert.deepEqual(availableModerationActions('SOLD', admin), []);
  assert.deepEqual(availableModerationActions('DRAFT', owner), []);
  assert.deepEqual(availableModerationActions('DRAFT', admin), ['SUSPEND', 'BLOCK']);
});

test('only the three hidden statuses count as moderated', () => {
  assert.equal(isModeratedListingStatus('unlisted'), true);
  assert.equal(isModeratedListingStatus('BLOCKED'), true);
  assert.equal(isModeratedListingStatus('PAUSED'), false);
});
