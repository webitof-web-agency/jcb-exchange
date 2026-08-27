import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, LOCALE_STORAGE_KEY, type AppLocale, normalizeLocale } from './config';

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

const readCookieLocale = () => {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookieValue = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=');

  return cookieValue ? normalizeLocale(decodeURIComponent(cookieValue)) : null;
};

export const readPersistedLocale = (): AppLocale => {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  const storageLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (storageLocale) {
    return normalizeLocale(storageLocale);
  }

  const cookieLocale = readCookieLocale();
  if (cookieLocale) {
    return cookieLocale;
  }

  return normalizeLocale(window.navigator.language);
};

export const persistLocale = (locale: AppLocale) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
  document.documentElement.lang = locale;
};
