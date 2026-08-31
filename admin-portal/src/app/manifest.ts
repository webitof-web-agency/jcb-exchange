import type { MetadataRoute } from 'next';
import { getPortalBranding } from '@/lib/siteBranding';

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
    background_color: branding.pwaBackgroundColor || '#121212',
    theme_color: branding.pwaThemeColor || '#1e293b',
    icons,
  };
}
