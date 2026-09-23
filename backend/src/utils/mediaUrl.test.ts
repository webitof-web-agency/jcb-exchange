import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRenderableMediaUrl,
  normalizeListingMedia,
  normalizeRemoteMediaUrl,
} from './mediaUrl';

test('keeps a public Drive uc URL renderable', () => {
  const url = 'https://drive.google.com/uc?id=1Q8mluWQeWxKb91VwauI1Xfu1F6LmtcbH';

  assert.equal(normalizeRemoteMediaUrl(url), url);
  assert.equal(getRenderableMediaUrl({ url }), url);
});

test('converts Drive file view links and ids to browser-renderable URLs', () => {
  const expected = 'https://drive.google.com/uc?id=1Q8mluWQeWxKb91VwauI1Xfu1F6LmtcbH';

  assert.equal(
    getRenderableMediaUrl({ fileUrl: 'https://drive.google.com/file/d/1Q8mluWQeWxKb91VwauI1Xfu1F6LmtcbH/view' }),
    expected,
  );
  assert.equal(getRenderableMediaUrl({ driveFileId: '1Q8mluWQeWxKb91VwauI1Xfu1F6LmtcbH' }), expected);
});

test('normalizes every listing media record without dropping legacy aliases', () => {
  const normalized = normalizeListingMedia([
    { id: 'one', fileUrl: 'https://drive.google.com/uc?id=1Q8mluWQeWxKb91VwauI1Xfu1F6LmtcbH' },
    { id: 'two', absoluteUrl: 'https://cdn.example.com/listing.webp' },
    { id: 'invalid', url: '/uploads/private/listing.webp' },
  ]);

  assert.deepEqual(normalized, [
    { id: 'one', fileUrl: 'https://drive.google.com/uc?id=1Q8mluWQeWxKb91VwauI1Xfu1F6LmtcbH', url: 'https://drive.google.com/uc?id=1Q8mluWQeWxKb91VwauI1Xfu1F6LmtcbH' },
    { id: 'two', absoluteUrl: 'https://cdn.example.com/listing.webp', url: 'https://cdn.example.com/listing.webp' },
  ]);
});
