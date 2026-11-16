import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTING_COMPLETION_MEDIA_SLOTS,
  isListingCompletionMediaSlot,
} from './listingCompletionMediaPolicy';

test('completion media policy matches the listing form slots', () => {
  assert.equal(LISTING_COMPLETION_MEDIA_SLOTS.length, 14);
  assert.equal(LISTING_COMPLETION_MEDIA_SLOTS.at(-1)?.kind, 'VIDEO');
  assert.equal(isListingCompletionMediaSlot('front-view'), true);
  assert.equal(isListingCompletionMediaSlot('walkaround-video'), true);
  assert.equal(isListingCompletionMediaSlot('unknown-slot'), false);
});
