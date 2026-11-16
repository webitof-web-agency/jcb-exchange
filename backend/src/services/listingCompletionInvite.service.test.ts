import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createListingCompletionToken,
  hashListingCompletionToken,
  isListingCompletionInviteUsable,
} from './listingCompletionInvite.service';

test('completion token is high entropy and only its hash is persisted', () => {
  const token = createListingCompletionToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(hashListingCompletionToken(token), token);
  assert.equal(hashListingCompletionToken(token), hashListingCompletionToken(token));
});

test('only active, unexpired invites can be used', () => {
  const now = new Date('2026-11-16T12:00:00.000Z');
  assert.equal(isListingCompletionInviteUsable({ status: 'ACTIVE', expiresAt: new Date('2026-11-16T12:01:00.000Z') }, now), true);
  assert.equal(isListingCompletionInviteUsable({ status: 'ACTIVE', expiresAt: new Date('2026-11-16T11:59:59.000Z') }, now), false);
  assert.equal(isListingCompletionInviteUsable({ status: 'SUBMITTED', expiresAt: new Date('2026-11-16T12:01:00.000Z') }, now), false);
  assert.equal(isListingCompletionInviteUsable({ status: 'REVOKED', expiresAt: new Date('2026-11-16T12:01:00.000Z') }, now), false);
});
