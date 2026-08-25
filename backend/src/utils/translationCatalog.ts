import fs from 'fs';
import path from 'path';

export const SUPPORTED_TRANSLATION_APPS = ['frontend', 'admin-portal'] as const;
export const SUPPORTED_TRANSLATION_LOCALES = ['en', 'hi', 'mr', 'gu', 'te'] as const;

export type TranslationApp = (typeof SUPPORTED_TRANSLATION_APPS)[number];
export type TranslationLocale = (typeof SUPPORTED_TRANSLATION_LOCALES)[number];

type TranslationNode = Record<string, unknown>;
type TranslationCatalogCacheEntry = {
  catalog: Record<string, string>;
  cacheToken: string | null;
};

const catalogCache = new Map<string, TranslationCatalogCacheEntry>();

const isObjectRecord = (value: unknown): value is TranslationNode =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const flattenTranslations = (
  input: TranslationNode,
  prefix = '',
  accumulator: Record<string, string> = {},
) => {
  Object.entries(input).forEach(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      accumulator[nextKey] = value;
      return;
    }

    if (isObjectRecord(value)) {
      flattenTranslations(value, nextKey, accumulator);
    }
  });

  return accumulator;
};

const getRepositoryRoot = () => {
  const candidates = [
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd()),
  ];

  const matchedRoot = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'frontend', 'src', 'locales', 'en.json')),
  );

  return matchedRoot || path.resolve(process.cwd(), '..');
};

const getLocaleFilePath = (app: TranslationApp, locale: TranslationLocale) =>
  path.join(getRepositoryRoot(), app, 'src', 'locales', `${locale}.json`);

const getFileMtimeMs = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.statSync(filePath).mtimeMs;
};

export const isSupportedTranslationApp = (value: unknown): value is TranslationApp =>
  typeof value === 'string' &&
  (SUPPORTED_TRANSLATION_APPS as readonly string[]).includes(value);

export const isSupportedTranslationLocale = (value: unknown): value is TranslationLocale =>
  typeof value === 'string' &&
  (SUPPORTED_TRANSLATION_LOCALES as readonly string[]).includes(value);

export const getTranslationLocaleCatalog = (
  app: TranslationApp,
  locale: TranslationLocale,
): Record<string, string> => {
  const cacheKey = `locale:${app}:${locale}`;
  const localeFilePath = getLocaleFilePath(app, locale);
  const fileMtimeMs = getFileMtimeMs(localeFilePath);
  const cacheToken = fileMtimeMs === null ? 'missing' : String(fileMtimeMs);
  const cachedEntry = catalogCache.get(cacheKey);

  if (cachedEntry && cachedEntry.cacheToken === cacheToken) {
    return cachedEntry.catalog;
  }

  const catalog = fs.existsSync(localeFilePath)
    ? flattenTranslations(JSON.parse(fs.readFileSync(localeFilePath, 'utf-8')) as TranslationNode)
    : {};

  catalogCache.set(cacheKey, {
    catalog,
    cacheToken,
  });

  return catalog;
};

export const getTranslationEnglishCatalog = (app: TranslationApp) =>
  getTranslationLocaleCatalog(app, 'en');

export const getTranslationBaseCatalog = (
  app: TranslationApp,
  locale: TranslationLocale,
): Record<string, string> => {
  const cacheKey = `merged:${app}:${locale}`;
  const englishCatalog = getTranslationEnglishCatalog(app);
  const localizedCatalog = getTranslationLocaleCatalog(app, locale);
  const localeFilePath = getLocaleFilePath(app, locale);
  const englishFilePath = getLocaleFilePath(app, 'en');
  const cacheVersion = `${getFileMtimeMs(englishFilePath) ?? 0}:${getFileMtimeMs(localeFilePath) ?? 0}`;
  const cachedEntry = catalogCache.get(cacheKey);

  if (cachedEntry && cachedEntry.cacheToken === cacheVersion) {
    return cachedEntry.catalog;
  }

  const mergedCatalog = {
    ...englishCatalog,
    ...localizedCatalog,
  };

  catalogCache.set(cacheKey, {
    catalog: mergedCatalog,
    cacheToken: cacheVersion,
  });

  return mergedCatalog;
};

export const getTranslationJsonCatalog = (
  app: TranslationApp,
  locale: TranslationLocale,
): Record<string, string> => getTranslationBaseCatalog(app, locale);
