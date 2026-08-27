import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';
import { getSiteBranding } from '@/lib/siteBranding';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getSiteBranding();

  return {
    name: SITE_NAME,
    short_name: 'JCB Exchange',
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#121212',
    theme_color: '#ffbf00',
    icons: branding.manifestIconUrl ? [
      {
        src: branding.manifestIconUrl,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ] : branding.faviconUrl ? [
      {
        src: branding.faviconUrl,
        sizes: '512x512',
        type: 'image/png',
      },
    ] : undefined,
  };
}
