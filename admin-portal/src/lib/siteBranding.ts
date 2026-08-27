export type SiteBranding = {
  logoUrl: string | null;
  faviconUrl: string | null;
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

export const getPortalBranding = async (): Promise<SiteBranding> => {
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
      logoUrl: toAbsoluteUrl(payload.data?.imageUrl),
      faviconUrl: toAbsoluteUrl(payload.data?.faviconUrl),
    };
  } catch {
    return {
      logoUrl: null,
      faviconUrl: null,
    };
  }
};
