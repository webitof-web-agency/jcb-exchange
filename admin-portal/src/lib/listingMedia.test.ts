import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeListingPayload } from './listingMedia';

const driveUrl = 'https://drive.google.com/uc?id=1Q8mluWQeWxKb91VwauI1Xfu1F6LmtcbH';

test('normalizes media nested inside the listing response', () => {
  const payload = normalizeListingPayload({
    listing: {
      id: 'listing-1',
      media: [{ id: 'media-1', url: driveUrl, type: 'image', isFeatured: true }],
    },
  });

  assert.equal(payload.id, 'listing-1');
  assert.deepEqual(payload.media, [{
    id: 'media-1',
    url: driveUrl,
    type: 'IMAGE',
    isFeatured: true,
  }]);
});

test('falls back to legacy top-level media when listing.media is absent', () => {
  const payload = normalizeListingPayload({
    listing: { id: 'listing-2', media: [] },
    media: [{ fileUrl: driveUrl, type: 'VIDEO' }],
  });

  assert.equal(payload.id, 'listing-2');
  assert.deepEqual(payload.media, [{
    fileUrl: driveUrl,
    url: driveUrl,
    type: 'VIDEO',
    id: 'media-0',
    isFeatured: false,
  }]);
});
