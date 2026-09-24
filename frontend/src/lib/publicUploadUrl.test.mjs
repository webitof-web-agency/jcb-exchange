import test from 'node:test';
import assert from 'node:assert/strict';
import { getDriveMediaProxyPath, normalizePublicUploadUrl } from './publicUploadUrl.mjs';

test('normalizes legacy API-prefixed public upload URLs', () => {
  assert.equal(
    normalizePublicUploadUrl('https://api.jcbexchange.com/api/uploads/public/site-logo/logo.webp'),
    'https://api.jcbexchange.com/uploads/public/site-logo/logo.webp',
  );
  assert.equal(normalizePublicUploadUrl('/api/uploads/public/site-logo/logo.webp'), '/uploads/public/site-logo/logo.webp');
});

test('maps public Google Drive media to the backend streaming proxy', () => {
  assert.equal(
    getDriveMediaProxyPath('https://drive.google.com/uc?id=video-file-id'),
    '/api/documents/upload/public/listing-media/drive/video-file-id',
  );
  assert.equal(getDriveMediaProxyPath('/uploads/public/listing-media/video.mp4'), null);
});
