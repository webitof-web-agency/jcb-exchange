const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');
const DEFAULT_FAVICON_URL = '/icon.svg';

const toAbsoluteUrl = (value?: string | null) => {
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${API_ORIGIN}${value}`;
};

export const getPortalBranding = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/master/site-logo`, {
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch portal branding.');
    }

    const payload = (await response.json()) as {
      data?: {
        faviconUrl?: string | null;
      };
    };

    return {
      faviconUrl: toAbsoluteUrl(payload.data?.faviconUrl) || DEFAULT_FAVICON_URL,
    };
  } catch {
    return {
      faviconUrl: DEFAULT_FAVICON_URL,
    };
  }
};
