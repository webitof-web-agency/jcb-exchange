export const DEFAULT_LOCALE = 'en' as const;

export const SUPPORTED_LOCALES = ['en', 'hi', 'mr', 'gu', 'te'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_COOKIE_NAME = 'jcb_locale';
export const LOCALE_STORAGE_KEY = 'jcb_locale';

export const LOCALE_LABELS: Record<AppLocale, { englishName: string; nativeName: string }> = {
  en: { englishName: 'English', nativeName: 'English' },
  hi: { englishName: 'Hindi', nativeName: 'हिंदी' },
  mr: { englishName: 'Marathi', nativeName: 'मराठी' },
  gu: { englishName: 'Gujarati', nativeName: 'ગુજરાતી' },
  te: { englishName: 'Telugu', nativeName: 'తెలుగు' },
};

export const isSupportedLocale = (value: unknown): value is AppLocale =>
  typeof value === 'string' && SUPPORTED_LOCALES.includes(value as AppLocale);

export const normalizeLocale = (value?: string | null): AppLocale => {
  if (!value) {
    return DEFAULT_LOCALE;
  }

  const normalized = value.trim().toLowerCase().split('-')[0];
  return isSupportedLocale(normalized) ? normalized : DEFAULT_LOCALE;
};
