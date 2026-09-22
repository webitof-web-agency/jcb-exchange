import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSiteBrandingMedia } from './siteBrandingSettings';

test('preserves saved branding media when a partial settings update omits a field', () => {
  const current = {
    imageUrl: 'https://drive.google.com/uc?id=logo',
    darkLogoUrl: 'https://drive.google.com/uc?id=dark-logo',
    faviconUrl: 'https://drive.google.com/uc?id=favicon',
    manifestIconUrl: 'https://drive.google.com/uc?id=manifest',
  };

  assert.deepEqual(
    mergeSiteBrandingMedia(current, { imageUrl: 'https://drive.google.com/uc?id=new-logo' }),
    {
      imageUrl: 'https://drive.google.com/uc?id=new-logo',
      darkLogoUrl: current.darkLogoUrl,
      faviconUrl: current.faviconUrl,
      manifestIconUrl: current.manifestIconUrl,
    },
  );
});

test('allows an explicit clear but never keeps a legacy local upload URL', () => {
  const current = {
    imageUrl: 'https://drive.google.com/uc?id=logo',
    darkLogoUrl: 'https://drive.google.com/uc?id=dark-logo',
    faviconUrl: 'https://drive.google.com/uc?id=favicon',
    manifestIconUrl: 'https://drive.google.com/uc?id=manifest',
  };

  assert.deepEqual(
    mergeSiteBrandingMedia(current, {
      faviconUrl: null,
      manifestIconUrl: 'https://api.jcbexchange.com/uploads/public/site-manifest-icon/legacy.png',
    }),
    {
      imageUrl: current.imageUrl,
      darkLogoUrl: current.darkLogoUrl,
      faviconUrl: null,
      manifestIconUrl: null,
    },
  );
});
