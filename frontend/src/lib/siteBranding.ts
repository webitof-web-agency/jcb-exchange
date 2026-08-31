import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

export type SiteBranding = {
  logoUrl: string | null;
  faviconUrl: string | null;
  manifestIconUrl: string | null;
  pwaBackgroundColor: string | null;
  pwaThemeColor: string | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';

const toAbsoluteUrl = (value?: string | null) => {
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${API_BASE_URL.replace(/\/api\/?$/, '')}${value}`;
};

export const getSiteBranding = async (): Promise<SiteBranding> => {
  try {
    const response = await fetch(`${API_BASE_URL}/master/site-logo`, {
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch site branding.');
    }

    const payload = (await response.json()) as {
      data?: {
        imageUrl?: string | null;
        faviconUrl?: string | null;
        manifestIconUrl?: string | null;
        pwaBackgroundColor?: string | null;
        pwaThemeColor?: string | null;
      };
    };

    return {
      logoUrl: toAbsoluteUrl(payload.data?.imageUrl),
      faviconUrl: toAbsoluteUrl(payload.data?.faviconUrl),
      manifestIconUrl: toAbsoluteUrl(payload.data?.manifestIconUrl),
      pwaBackgroundColor: payload.data?.pwaBackgroundColor || null,
      pwaThemeColor: payload.data?.pwaThemeColor || null,
    };
  } catch {
    return {
      logoUrl: null,
      faviconUrl: null,
      manifestIconUrl: null,
      pwaBackgroundColor: null,
      pwaThemeColor: null,
    };
  }
};

export const getDefaultSiteMetadata = () => ({
  title: {
    default: `${SITE_NAME} | Find the Right Machine`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  category: 'marketplace',
});
