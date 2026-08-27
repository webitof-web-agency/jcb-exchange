import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';
import { getSiteBranding } from '@/lib/siteBranding';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getSiteBranding();
  const manifestIconUrl = branding.manifestIconUrl || branding.faviconUrl;
  const icons: NonNullable<MetadataRoute.Manifest['icons']> = manifestIconUrl
    ? [
        {
          src: manifestIconUrl,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: manifestIconUrl,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ]
    : [
        {
          src: '/icon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
        },
      ];

  return {
    id: '/',
    name: SITE_NAME,
    short_name: 'JCB Exchange',
    description: SITE_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    prefer_related_applications: false,
    background_color: '#121212',
    theme_color: '#ffbf00',
    icons,
  };
}
