import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAbsoluteMediaUrl } from './mediaUrl.mjs';

test('uses the API Drive media proxy for public Google Drive media', () => {
  assert.equal(
    resolveAbsoluteMediaUrl(
      'https://drive.google.com/uc?id=1AbCdEfGhIjKlMnOpQrStUvWxYz',
      'https://api.jcbexchange.com',
    ),
    'https://api.jcbexchange.com/api/documents/upload/public/drive/1AbCdEfGhIjKlMnOpQrStUvWxYz',
  );
});

test('preserves existing public local and remote media URLs', () => {
  assert.equal(
    resolveAbsoluteMediaUrl('/uploads/public/listing-media-old.mp4', 'http://localhost:5002'),
    'http://localhost:5002/uploads/public/listing-media-old.mp4',
  );
  assert.equal(
    resolveAbsoluteMediaUrl('https://cdn.example.com/listing.mp4', 'http://localhost:5002'),
    'https://cdn.example.com/listing.mp4',
  );
});

test('does not re-enable legacy non-public upload paths', () => {
  assert.equal(resolveAbsoluteMediaUrl('/uploads/secure/private.mp4', 'http://localhost:5002'), '');
});
