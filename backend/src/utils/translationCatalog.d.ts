export declare const SUPPORTED_TRANSLATION_APPS: readonly ['frontend', 'admin-portal'];
export declare const SUPPORTED_TRANSLATION_LOCALES: readonly ['en', 'hi', 'mr', 'gu', 'te'];
export type TranslationApp = (typeof SUPPORTED_TRANSLATION_APPS)[number];
export type TranslationLocale = (typeof SUPPORTED_TRANSLATION_LOCALES)[number];
export declare const isSupportedTranslationApp: (value: unknown) => value is TranslationApp;
export declare const isSupportedTranslationLocale: (value: unknown) => value is TranslationLocale;
export declare const getTranslationLocaleCatalog: (app: TranslationApp, locale: TranslationLocale) => Record<string, string>;
export declare const getTranslationEnglishCatalog: (app: TranslationApp) => Record<string, string>;
export declare const getTranslationBaseCatalog: (app: TranslationApp, locale: TranslationLocale) => Record<string, string>;
export declare const getTranslationJsonCatalog: (app: TranslationApp, locale: TranslationLocale) => Record<string, string>;
//# sourceMappingURL=translationCatalog.d.ts.map