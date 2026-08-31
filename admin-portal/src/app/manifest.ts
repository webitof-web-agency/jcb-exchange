import type { MetadataRoute } from 'next';
import {
  DEFAULT_PWA_BACKGROUND_COLOR,
  DEFAULT_PWA_THEME_COLOR,
  getPortalBranding,
} from '@/lib/siteBranding';

export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getPortalBranding();
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
          src: '/icon.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icon.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
      ];

  return {
    id: '/',
    name: 'JCB Exchange Portal',
    short_name: 'JCB Portal',
    description: 'Internal operations and partner management portal for JCB Exchange.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    prefer_related_applications: false,
    background_color: branding.pwaBackgroundColor || DEFAULT_PWA_BACKGROUND_COLOR,
    theme_color: branding.pwaThemeColor || DEFAULT_PWA_THEME_COLOR,
    icons,
  };
}
