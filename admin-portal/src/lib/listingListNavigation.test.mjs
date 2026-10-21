import test from 'node:test';
import assert from 'node:assert/strict';
import { buildListingListUrl, isHighlightedListing } from './listingListNavigation.mjs';

test('builds a listing list URL that preserves the exact listing highlight target', () => {
  assert.equal(
    buildListingListUrl('/employee/listings', 'listing-770'),
    '/employee/listings?highlightId=listing-770'
  );
});

test('matches only the requested listing id for row highlighting', () => {
  const listing = { id: 'listing-770', title: 'CASE 770 2023' };

  assert.equal(isHighlightedListing(listing, 'listing-770'), true);
  assert.equal(isHighlightedListing(listing, 'sell-770'), false);
  assert.equal(isHighlightedListing(listing, ''), false);
});
