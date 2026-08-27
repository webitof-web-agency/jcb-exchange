import { create } from 'zustand';
import { DEFAULT_LOCALE, type AppLocale } from '@/lib/i18n/config';
import { persistLocale, readPersistedLocale } from '@/lib/i18n/localePersistence';
import { fetchTranslationOverrides } from '@/lib/i18n/translationOverrides';

type TranslationOverridesMap = Partial<Record<AppLocale, Record<string, string>>>;
type LocaleStatusMap = Partial<Record<AppLocale, boolean>>;

interface LanguageState {
  locale: AppLocale;
  hasHydrated: boolean;
  translationOverrides: TranslationOverridesMap;
  loadedOverrideLocales: LocaleStatusMap;
  loadingOverrideLocales: LocaleStatusMap;
  hydrateLocale: () => void;
  setLocale: (locale: AppLocale) => void;
  ensureTranslationOverrides: (locale: AppLocale, options?: { force?: boolean }) => Promise<void>;
  refreshTranslationOverrides: (locale: AppLocale) => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  locale: DEFAULT_LOCALE,
  hasHydrated: false,
  translationOverrides: {},
  loadedOverrideLocales: {},
  loadingOverrideLocales: {},
  hydrateLocale: () => {
    const locale = readPersistedLocale();
    persistLocale(locale);
    set({
      locale,
      hasHydrated: true,
    });
  },
  setLocale: (locale) => {
    persistLocale(locale);
    set({
      locale,
      hasHydrated: true,
    });
  },
  ensureTranslationOverrides: async (locale, options) => {
    const { loadedOverrideLocales, loadingOverrideLocales } = get();
    const forceRefresh = options?.force === true;

    if ((!forceRefresh && loadedOverrideLocales[locale]) || loadingOverrideLocales[locale]) {
      return;
    }

    set((state) => ({
      loadingOverrideLocales: {
        ...state.loadingOverrideLocales,
        [locale]: true,
      },
    }));

    try {
      const messages = await fetchTranslationOverrides('admin-portal', locale);

      set((state) => ({
        translationOverrides: {
          ...state.translationOverrides,
          [locale]: messages,
        },
        loadedOverrideLocales: {
          ...state.loadedOverrideLocales,
          [locale]: true,
        },
        loadingOverrideLocales: {
          ...state.loadingOverrideLocales,
          [locale]: false,
        },
      }));
    } catch {
      set((state) => ({
        loadedOverrideLocales: {
          ...state.loadedOverrideLocales,
          [locale]: true,
        },
        loadingOverrideLocales: {
          ...state.loadingOverrideLocales,
          [locale]: false,
        },
      }));
    }
  },
  refreshTranslationOverrides: async (locale) => {
    await get().ensureTranslationOverrides(locale, { force: true });
  },
}));
