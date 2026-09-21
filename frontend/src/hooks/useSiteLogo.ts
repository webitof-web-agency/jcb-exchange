'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL, getRemoteMediaUrl } from '@/lib/api';

// ── Cached result type ─────────────────────────────────────────────────────
type LogoData = {
  logoUrl:     string | null;   // light background logo (site logo)
  darkLogoUrl: string | null;   // dark background logo
};

declare global {
  interface Window {
    __JCB_SITE_LOGO__?: Partial<LogoData>;
  }
}

// Module-level cache — fetched once, shared across all BrandLoader instances
let cachedData: LogoData | undefined = undefined;
const listeners: Array<(data: LogoData) => void> = [];
let fetchPromise: Promise<LogoData> | null = null;

async function fetchLogos(): Promise<LogoData> {
  try {
    const res = await fetch(`${API_BASE_URL}/master/site-logo`, { cache: 'no-store' });
    if (!res.ok) return { logoUrl: null, darkLogoUrl: null };
    const json = (await res.json()) as {
      data?: {
        imageUrl?:     string | null;
        darkLogoUrl?:  string | null;
      };
    };
    return {
      logoUrl:     json?.data?.imageUrl    ? getRemoteMediaUrl(json.data.imageUrl)    : null,
      darkLogoUrl: json?.data?.darkLogoUrl ? getRemoteMediaUrl(json.data.darkLogoUrl) : null,
    };
  } catch {
    return { logoUrl: null, darkLogoUrl: null };
  }
}

function ensureFetched() {
  if (cachedData !== undefined || fetchPromise) return;
  fetchPromise = fetchLogos().then((data) => {
    cachedData = data;
    listeners.forEach((cb) => cb(data));
    listeners.length = 0;
    return data;
  });
}

const EMPTY: LogoData = { logoUrl: null, darkLogoUrl: null };

const getInitialLogoData = (): LogoData => {
  if (typeof window === 'undefined' || !window.__JCB_SITE_LOGO__) {
    return EMPTY;
  }

  return {
    logoUrl: window.__JCB_SITE_LOGO__.logoUrl || null,
    darkLogoUrl: window.__JCB_SITE_LOGO__.darkLogoUrl || null,
  };
};

export function useSiteLogo() {
  const [data, setData] = useState<LogoData>(() => cachedData ?? getInitialLogoData());
  const [isLoading, setIsLoading] = useState(cachedData === undefined);

  useEffect(() => {
    if (cachedData !== undefined) {
      return;
    }

    let mounted = true;
    const onFetched = (d: LogoData) => {
      if (mounted) {
        setData(d);
        setIsLoading(false);
      }
    };

    listeners.push(onFetched);
    ensureFetched();

    return () => {
      mounted = false;
      const idx = listeners.indexOf(onFetched);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);

  return { ...data, isLoading };
}
