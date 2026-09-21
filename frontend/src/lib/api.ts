import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { useLanguageStore } from '@/store/languageStore';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

export const getAbsoluteMediaUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

/**
 * Public uploaded media is Drive-backed. Legacy relative /uploads URLs point
 * to files that are not part of a database backup, so do not request them.
 */
export const getRemoteMediaUrl = (url?: string | null) => {
  const normalizedUrl = url?.trim();
  if (!normalizedUrl || !/^https?:\/\//i.test(normalizedUrl)) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    if (!parsedUrl.hostname || /^\/uploads(?:\/|$)/i.test(parsedUrl.pathname)) {
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
