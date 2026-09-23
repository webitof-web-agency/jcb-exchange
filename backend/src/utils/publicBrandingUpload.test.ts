import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublicBrandingFileName,
  buildPublicBrandingFileUrl,
} from './publicBrandingUpload';

test('branding filenames are generated from a safe UUID and the validated mime type', () => {
  assert.equal(
    buildPublicBrandingFileName('hero-image', 'hero image.webp', '12345678-1234-1234-1234-123456789012', 'image/webp'),
    'hero-image-12345678-1234-1234-1234-123456789012.webp',
  );
  assert.equal(
    buildPublicBrandingFileName('site-logo', 'logo.jpg', 'abc', 'image/jpeg'),
    'site-logo-abc.jpg',
  );
});

test('branding URLs always point to the public upload mount', () => {
  assert.equal(
    buildPublicBrandingFileUrl('site-logo', 'site-logo-abc.png'),
    '/uploads/public/site-logo/site-logo-abc.png',
  );
});

test('unsupported extensions cannot leak into a public branding URL', () => {
  assert.equal(
    buildPublicBrandingFileName('site-logo', 'logo.exe', 'abc', 'image/png'),
    'site-logo-abc.png',
  );
});
