import test from 'node:test';
import assert from 'node:assert/strict';
import { getMediaAssetDisplayName, getMediaPreviewSource } from './listingMediaSlotPresentation';

test('uses the playable uploaded source for an existing video slot', () => {
  assert.equal(
    getMediaPreviewSource({
      kind: 'video',
      previewUrl: 'poster-frame',
      absoluteUrl: 'https://api.example.test/api/documents/upload/public/drive/video-file-id',
      fileUrl: 'https://drive.google.com/uc?id=video-file-id',
    }),
    'https://api.example.test/api/documents/upload/public/drive/video-file-id',
  );
});

test('does not expose a raw Drive URL as the uploaded media name', () => {
  assert.equal(
    getMediaAssetDisplayName({
      kind: 'video',
      originalName: 'uc?id=video-file-id',
      fileUrl: 'https://drive.google.com/uc?id=video-file-id',
    }),
    'Vehicle video',
  );
});

test('keeps a real uploaded filename when it is safe to display', () => {
  assert.equal(
    getMediaAssetDisplayName({
      kind: 'image',
      originalName: 'front-view.webp',
      fileUrl: '/api/documents/upload/public/listing-media/front-view.webp',
    }),
    'front-view.webp',
  );
});
