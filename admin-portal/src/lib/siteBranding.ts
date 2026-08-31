export type SiteBranding = {
  logoUrl: string | null;
  faviconUrl: string | null;
  manifestIconUrl: string | null;
  pwaBackgroundColor: string | null;
  pwaThemeColor: string | null;
  updatedAt: string | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';
export const DEFAULT_PWA_BACKGROUND_COLOR = '#1f1f1f';
export const DEFAULT_PWA_THEME_COLOR = '#1f1f1f';

const toAbsoluteUrl = (value?: string | null) => {
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${API_BASE_URL.replace(/\/api\/?$/, '')}${value}`;
};

const appendVersionToUrl = (value: string | null, version?: string | null) => {
  if (!value || !version) {
    return value;
  }

  const separator = value.includes('?') ? '&' : '?';
  return `${value}${separator}v=${encodeURIComponent(version)}`;
};

export const getPortalBranding = async (): Promise<SiteBranding> => {
  try {
    const response = await fetch(`${API_BASE_URL}/master/site-logo`, {
      cache: 'no-store',
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
        updatedAt?: string | null;
      };
    };

    const updatedAt = payload.data?.updatedAt || null;

    return {
      logoUrl: appendVersionToUrl(toAbsoluteUrl(payload.data?.imageUrl), updatedAt),
      faviconUrl: appendVersionToUrl(toAbsoluteUrl(payload.data?.faviconUrl), updatedAt),
      manifestIconUrl: appendVersionToUrl(toAbsoluteUrl(payload.data?.manifestIconUrl), updatedAt),
      pwaBackgroundColor: payload.data?.pwaBackgroundColor || null,
      pwaThemeColor: payload.data?.pwaThemeColor || null,
      updatedAt,
    };
  } catch {
    return {
      logoUrl: null,
      faviconUrl: null,
      manifestIconUrl: null,
      pwaBackgroundColor: null,
      pwaThemeColor: null,
      updatedAt: null,
    };
  }
};
