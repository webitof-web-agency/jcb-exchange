import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '@/store/languageStore';
import { normalizeApiBaseUrl } from './apiBaseUrl.mjs';
import { notifyApiBillingSummaryChanged } from './apiBilling';
import { getAuthorizationToken, isCurrentAuthToken, isDefinitiveSessionFailure } from './sessionAccessPolicy.mjs';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

if (!configuredApiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL is not set');
}

export const API_BASE_URL = normalizeApiBaseUrl(configuredApiUrl);
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');


const DIRECT_PROVIDER_REQUEST_PATHS = [
  '/pan-verification/verify',
  '/pan-verification/to-aadhaar',
  '/pan-verification/contact',
  '/pan-verification/comprehensive',
  '/gst-verification/verify',
  '/mobile-to-pan/lookup',
  '/aadhaar-verification/initialize',
  '/driving-license-verification/verify',
  '/rc-owner-history/verify',
  '/rc-full/verify',
  '/rc-challan-verification/verify',
  '/chassis-to-rc/verify',
  '/rc-to-mobile/verify',
  '/mobile-to-rc/lookup',
] as const;

const isDirectProviderRequest = (config: { method?: string; url?: string } | undefined) => {
  if (config?.method?.toLowerCase() !== 'post' || !config.url) return false;
  const requestPath = config.url.split('?')[0];
  return DIRECT_PROVIDER_REQUEST_PATHS.some((path) => requestPath === path || requestPath.endsWith(path));
};
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => {
    if (isDirectProviderRequest(response.config)) {
      notifyApiBillingSummaryChanged();
    }
    return response;
  },
  (error) => {
    if (isDirectProviderRequest(error?.config)) {
      notifyApiBillingSummaryChanged();
    }
    const requestHeaders = error?.config?.headers;
    const sentAuthToken = getAuthorizationToken(requestHeaders);

    if (axios.isAxiosError(error) && isDefinitiveSessionFailure(error)) {
      const authStore = useAuthStore.getState();
      // Profile/password changes rotate authVersion and return a fresh token.
      // An older request may finish with 401 after that handoff; it must not
      // invalidate the already refreshed admin session.
      if (isCurrentAuthToken(sentAuthToken, authStore.token)) {
        authStore.logout();
      }
    }

    return Promise.reject(error);
  },
);

// Request interceptor to attach JWT token
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
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
