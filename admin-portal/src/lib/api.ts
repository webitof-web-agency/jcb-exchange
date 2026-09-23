import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '@/store/languageStore';
import { normalizeApiBaseUrl } from './apiBaseUrl.mjs';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

if (!configuredApiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL is not set');
}

export const API_BASE_URL = normalizeApiBaseUrl(configuredApiUrl);
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestHeaders = error?.config?.headers;
    const sentAuthHeader = Boolean(requestHeaders?.Authorization || requestHeaders?.authorization);
    const responseCode = error?.response?.data?.code;
    const revokedSession = responseCode === 'ACCOUNT_REVOKED' || responseCode === 'ACCOUNT_INACTIVE';
    const isAuthenticationFailure = error?.response?.status === 401 || (error?.response?.status === 403 && revokedSession);

    if (axios.isAxiosError(error) && isAuthenticationFailure && sentAuthHeader) {
      useAuthStore.getState().logout();
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
