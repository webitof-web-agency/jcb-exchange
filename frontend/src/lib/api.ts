import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { useLanguageStore } from '@/store/languageStore';
import { normalizePublicUploadUrl } from '@/lib/publicUploadUrl.mjs';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

export const isLegacyLocalUploadUrl = (url?: string | null) => {
  const normalizedUrl = normalizePublicUploadUrl(url);
  if (!normalizedUrl) return false;

  // /uploads/public/ is now actively used for branding images — not legacy.
  // Only treat /uploads/secure/ and bare /uploads/ as legacy/blocked paths.
  if (/^\/uploads\/public\//i.test(normalizedUrl)) {
    return false;
  }

  if (/^\/?(?:api\/)?uploads(?:\/|$)/i.test(normalizedUrl)) {
    return true;
  }

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return false;
  }

  try {
    const pathname = new URL(normalizedUrl).pathname;
    // Only block if it's NOT a public upload path
    return /^\/uploads(?:\/|$)/i.test(pathname) && !/^\/uploads\/public\//i.test(pathname);
  } catch {
    return true;
  }
};

export const getAbsoluteMediaUrl = (url?: string | null) => {
  const normalizedUrl = normalizePublicUploadUrl(url);
  if (!normalizedUrl || isLegacyLocalUploadUrl(normalizedUrl)) return '';
  if (/^https?:\/\//i.test(normalizedUrl)) return normalizedUrl;
  // Convert server-local /uploads/public/ paths to full API origin URL
  return `${API_ORIGIN}${normalizedUrl.startsWith('/') ? '' : '/'}${normalizedUrl}`;
};

/**
 * Resolve a stored media URL to an absolute displayable URL.
 *
 * Accepts:
 *  - Absolute https:// remote URLs (CDN / Google Drive)
 *  - Server-local /uploads/public/ paths (hero image, site logo, certification)
 *
 * Returns null for null/empty values, legacy blocked paths, or invalid URLs.
 */
export const getRemoteMediaUrl = (url?: string | null) => {
  const normalizedUrl = normalizePublicUploadUrl(url);
  if (!normalizedUrl) return null;

  // Server-local branding image — convert to absolute URL using API origin
  if (/^\/uploads\/public\//i.test(normalizedUrl)) {
    return `${API_ORIGIN}${normalizedUrl}`;
  }

  if (!/^https?:\/\//i.test(normalizedUrl) || isLegacyLocalUploadUrl(normalizedUrl)) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    if (!parsedUrl.hostname) {
      return null;
    }

    return normalizedUrl;
  } catch {
    return null;
  }
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    const locale = useLanguageStore.getState().locale;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['Accept-Language'] = locale;

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = String(error?.config?.url || '');
    const requestHeaders = error?.config?.headers;
    const sentAuthHeader = Boolean(requestHeaders?.Authorization || requestHeaders?.authorization);

    if (axios.isAxiosError(error) && error.response?.status === 401 && sentAuthHeader) {
      const authStore = useAuthStore.getState();
      authStore.logout();

      if (!requestUrl.includes('/auth/login') && !requestUrl.includes('/auth/register')) {
        authStore.setAuthModalOpen(true);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
