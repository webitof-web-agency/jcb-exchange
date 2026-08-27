import type { MetadataRoute } from 'next';
import { getPortalBranding } from '@/lib/siteBranding';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getPortalBranding();

  return {
    name: 'JCB Exchange Portal',
    short_name: 'JCB Portal',
    description: 'Internal operations and partner management portal for JCB Exchange.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1e293b',
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
