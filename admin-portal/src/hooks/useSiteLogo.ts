'use client';

import { createContext, createElement, type ReactNode, useContext, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';

const getAbsoluteMediaUrl = (url?: string | null) => {
  const normalizedUrl = url?.trim();
  if (!normalizedUrl) return '';

  if (/^\/uploads\/public\//i.test(normalizedUrl)) {
    return `${API_BASE_URL.replace(/\/api\/?$/, '')}${normalizedUrl}`;
  }

  if (/^\/?(?:api\/)?uploads(?:\/|$)/i.test(normalizedUrl)) {
    return '';
  }

  if (/^https?:\/\//i.test(normalizedUrl)) {
    try {
      const pathname = new URL(normalizedUrl).pathname;
      return /^\/uploads(?:\/|$)/i.test(pathname) && !/^\/uploads\/public\//i.test(pathname) ? '' : normalizedUrl;
    } catch {
      return '';
    }
  }

  return `${API_BASE_URL.replace(/\/api\/?$/, '')}${normalizedUrl.startsWith('/') ? '' : '/'}${normalizedUrl}`;
};

export type LogoData = {
  logoUrl: string | null;
  darkLogoUrl: string | null;
};

const SiteLogoContext = createContext<LogoData | null>(null);

export function SiteLogoProvider({ value, children }: { value: LogoData; children: ReactNode }) {
  return createElement(SiteLogoContext.Provider, { value }, children);
}

declare global {
  interface Window {
    __JCB_PORTAL_LOGO__?: Partial<LogoData>;
  }
}

let cachedData: LogoData | undefined;
const listeners: Array<(data: LogoData) => void> = [];
let fetchPromise: Promise<LogoData> | null = null;

const EMPTY: LogoData = { logoUrl: null, darkLogoUrl: null };

const getInitialLogoData = (): LogoData => {
  if (typeof window === 'undefined' || !window.__JCB_PORTAL_LOGO__) {
    return EMPTY;
  }

  return {
    logoUrl: window.__JCB_PORTAL_LOGO__.logoUrl || null,
    darkLogoUrl: window.__JCB_PORTAL_LOGO__.darkLogoUrl || null,
  };
};

async function fetchLogos(): Promise<LogoData> {
  try {
    const response = await fetch(`${API_BASE_URL}/master/site-logo`, { cache: 'no-store' });
    if (!response.ok) return EMPTY;

    const payload = (await response.json()) as {
      data?: { imageUrl?: string | null; darkLogoUrl?: string | null };
    };

    return {
      logoUrl: payload.data?.imageUrl ? getAbsoluteMediaUrl(payload.data.imageUrl) : null,
      darkLogoUrl: payload.data?.darkLogoUrl ? getAbsoluteMediaUrl(payload.data.darkLogoUrl) : null,
    };
  } catch {
    return EMPTY;
  }
}

function ensureFetched() {
  if (cachedData !== undefined || fetchPromise) return;

  fetchPromise = fetchLogos().then((data) => {
    cachedData = data;
    listeners.forEach((listener) => listener(data));
    listeners.length = 0;
    return data;
  });
}

export function useSiteLogo() {
  const serverLogoData = useContext(SiteLogoContext);
  const [data, setData] = useState<LogoData>(() => cachedData ?? serverLogoData ?? getInitialLogoData());

  useEffect(() => {
    // RootLayout already fetched branding on the server and passes it through
    // context. Reusing that value avoids a client-side logo request on every
    // page/layout mount.
    if (serverLogoData) {
      cachedData = serverLogoData;
      return;
    }

    if (cachedData !== undefined) return;

    let mounted = true;
    const onFetched = (nextData: LogoData) => {
      if (mounted) setData(nextData);
    };

    listeners.push(onFetched);
    ensureFetched();

    return () => {
      mounted = false;
      const index = listeners.indexOf(onFetched);
      if (index !== -1) listeners.splice(index, 1);
    };
  }, [serverLogoData]);

  return data;
}
