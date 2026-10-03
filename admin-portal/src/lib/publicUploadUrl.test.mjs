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

test('maps Google Drive URLs to the public backend media proxy', () => {
  assert.equal(
    getDriveMediaProxyPath('https://drive.google.com/file/d/blog-cover-file-123/view'),
    '/api/documents/upload/public/drive/blog-cover-file-123',
  );
  assert.equal(
    getDriveMediaProxyPath('https://drive.google.com/uc?id=blog-cover-file-123'),
    '/api/documents/upload/public/drive/blog-cover-file-123',
  );
});
