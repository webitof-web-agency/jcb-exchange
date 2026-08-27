'use client';

import { useEffect } from 'react';
import { useLanguageStore } from '@/store/languageStore';

export default function LocaleSync() {
  const { locale, hasHydrated, hydrateLocale, ensureTranslationOverrides } = useLanguageStore();

  useEffect(() => {
    if (!hasHydrated) {
      hydrateLocale();
    }
  }, [hasHydrated, hydrateLocale]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    document.documentElement.lang = locale;
    void ensureTranslationOverrides(locale);
  }, [ensureTranslationOverrides, hasHydrated, locale]);

  return null;
}
