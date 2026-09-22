import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicUploadUrl } from './publicUploadUrl.mjs';

test('normalizes legacy API-prefixed public upload URLs', () => {
  assert.equal(
    normalizePublicUploadUrl('https://api.jcbexchange.com/api/uploads/public/site-logo/logo.webp'),
    'https://api.jcbexchange.com/uploads/public/site-logo/logo.webp',
  );
  assert.equal(normalizePublicUploadUrl('/api/uploads/public/site-logo/logo.webp'), '/uploads/public/site-logo/logo.webp');
});
