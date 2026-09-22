import { cache } from 'react';

export type SiteBranding = {
  logoUrl: string | null;
  darkLogoUrl: string | null;
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
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return null;
  }

  if (/^\/uploads\/public\//i.test(normalizedValue)) {
    return `${API_BASE_URL.replace(/\/api\/?$/, '')}${normalizedValue}`;
  }

  if (/^\/?(?:api\/)?uploads(?:\/|$)/i.test(normalizedValue)) {
    return null;
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    try {
      const parsed = new URL(normalizedValue);
      return /^\/uploads(?:\/|$)/i.test(parsed.pathname) && !/^\/uploads\/public\//i.test(parsed.pathname) ? null : normalizedValue;
    } catch {
      return null;
    }
  }

  return `${API_BASE_URL.replace(/\/api\/?$/, '')}${normalizedValue.startsWith('/') ? '' : '/'}${normalizedValue}`;
};

const appendVersionToUrl = (value: string | null, version?: string | null) => {
  if (!value || !version) {
    return value;
  }

  const separator = value.includes('?') ? '&' : '?';
  return `${value}${separator}v=${encodeURIComponent(version)}`;
};

// Branding is used by both generateMetadata and the root layout. React's
// request cache prevents those two consumers from issuing duplicate requests
// during the same render, while Next's short revalidation window keeps normal
// navigations from waiting on the API every time.
export const getPortalBranding = cache(async (): Promise<SiteBranding> => {
  try {
    const response = await fetch(`${API_BASE_URL}/master/site-logo`, {
      next: {
        revalidate: 60,
        tags: ['portal-branding'],
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch site branding.');
    }

    const payload = (await response.json()) as {
      data?: {
        imageUrl?: string | null;
        darkLogoUrl?: string | null;
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
      darkLogoUrl: appendVersionToUrl(toAbsoluteUrl(payload.data?.darkLogoUrl), updatedAt),
      faviconUrl: appendVersionToUrl(toAbsoluteUrl(payload.data?.faviconUrl), updatedAt),
      manifestIconUrl: appendVersionToUrl(toAbsoluteUrl(payload.data?.manifestIconUrl), updatedAt),
      pwaBackgroundColor: payload.data?.pwaBackgroundColor || null,
      pwaThemeColor: payload.data?.pwaThemeColor || null,
      updatedAt,
    };
  } catch {
    return {
      logoUrl: null,
      darkLogoUrl: null,
      faviconUrl: null,
      manifestIconUrl: null,
      pwaBackgroundColor: null,
      pwaThemeColor: null,
      updatedAt: null,
    };
  }
});
