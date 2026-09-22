import assert from 'node:assert/strict';
import test from 'node:test';
import { getLoaderLogoUrl, getLogoLoadErrorFallback } from './brandLoaderLogo';

test('prefers the dark logo when no explicit loader logo is supplied', () => {
  assert.equal(
    getLoaderLogoUrl({
      initialLogoUrl: null,
      darkLogoUrl: '/uploads/public/site-dark-logo/logo.webp',
      logoUrl: '/uploads/public/site-logo/logo.webp',
    }),
    '/uploads/public/site-dark-logo/logo.webp',
  );
});

test('does not replace a failed dark logo with the light site logo', () => {
  assert.equal(
    getLogoLoadErrorFallback('/uploads/public/site-dark-logo/logo.webp', {
      darkLogoUrl: '/uploads/public/site-dark-logo/logo.webp',
      logoUrl: '/uploads/public/site-logo/logo.webp',
    }),
    null,
  );
});

test('recognizes a cache-busted dark logo URL as the dark logo', () => {
  assert.equal(
    getLogoLoadErrorFallback('/uploads/public/site-dark-logo/logo.webp?v=123', {
      darkLogoUrl: '/uploads/public/site-dark-logo/logo.webp',
      logoUrl: '/uploads/public/site-logo/logo.webp',
    }),
    null,
  );
});
