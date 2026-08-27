import { SITE_DESCRIPTION, SITE_LOGO_URL, SITE_NAME, SITE_URL } from '@/lib/site';

export type SiteBranding = {
  logoUrl: string;
  faviconUrl: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';
const DEFAULT_FAVICON_URL = `${SITE_URL}/icon.svg`;

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
      };
    };

    return {
      logoUrl: toAbsoluteUrl(payload.data?.imageUrl) || SITE_LOGO_URL,
      faviconUrl: toAbsoluteUrl(payload.data?.faviconUrl) || DEFAULT_FAVICON_URL,
    };
  } catch {
    return {
      logoUrl: SITE_LOGO_URL,
      faviconUrl: DEFAULT_FAVICON_URL,
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
