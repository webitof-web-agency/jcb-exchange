"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTranslationJsonCatalog = exports.getTranslationBaseCatalog = exports.getTranslationEnglishCatalog = exports.getTranslationLocaleCatalog = exports.isSupportedTranslationLocale = exports.isSupportedTranslationApp = exports.SUPPORTED_TRANSLATION_LOCALES = exports.SUPPORTED_TRANSLATION_APPS = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.SUPPORTED_TRANSLATION_APPS = ['frontend', 'admin-portal'];
exports.SUPPORTED_TRANSLATION_LOCALES = ['en', 'hi', 'mr', 'gu', 'te'];
const catalogCache = new Map();
const isObjectRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const flattenTranslations = (input, prefix = '', accumulator = {}) => {
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
        path_1.default.resolve(process.cwd(), '..'),
        path_1.default.resolve(process.cwd()),
    ];
    const matchedRoot = candidates.find((candidate) => fs_1.default.existsSync(path_1.default.join(candidate, 'frontend', 'src', 'locales', 'en.json')));
    return matchedRoot || path_1.default.resolve(process.cwd(), '..');
};
const getLocaleFilePath = (app, locale) => path_1.default.join(getRepositoryRoot(), app, 'src', 'locales', `${locale}.json`);
const getFileMtimeMs = (filePath) => {
    if (!fs_1.default.existsSync(filePath)) {
        return null;
    }
    return fs_1.default.statSync(filePath).mtimeMs;
};
const isSupportedTranslationApp = (value) => typeof value === 'string' &&
    exports.SUPPORTED_TRANSLATION_APPS.includes(value);
exports.isSupportedTranslationApp = isSupportedTranslationApp;
const isSupportedTranslationLocale = (value) => typeof value === 'string' &&
    exports.SUPPORTED_TRANSLATION_LOCALES.includes(value);
exports.isSupportedTranslationLocale = isSupportedTranslationLocale;
const getTranslationLocaleCatalog = (app, locale) => {
    const cacheKey = `locale:${app}:${locale}`;
    const localeFilePath = getLocaleFilePath(app, locale);
    const fileMtimeMs = getFileMtimeMs(localeFilePath);
    const cacheToken = fileMtimeMs === null ? 'missing' : String(fileMtimeMs);
    const cachedEntry = catalogCache.get(cacheKey);
    if (cachedEntry && cachedEntry.cacheToken === cacheToken) {
        return cachedEntry.catalog;
    }
    const catalog = fs_1.default.existsSync(localeFilePath)
        ? flattenTranslations(JSON.parse(fs_1.default.readFileSync(localeFilePath, 'utf-8')))
        : {};
    catalogCache.set(cacheKey, {
        catalog,
        cacheToken,
    });
    return catalog;
};
exports.getTranslationLocaleCatalog = getTranslationLocaleCatalog;
const getTranslationEnglishCatalog = (app) => (0, exports.getTranslationLocaleCatalog)(app, 'en');
exports.getTranslationEnglishCatalog = getTranslationEnglishCatalog;
const getTranslationBaseCatalog = (app, locale) => {
    const cacheKey = `merged:${app}:${locale}`;
    const englishCatalog = (0, exports.getTranslationEnglishCatalog)(app);
    const localizedCatalog = (0, exports.getTranslationLocaleCatalog)(app, locale);
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
exports.getTranslationBaseCatalog = getTranslationBaseCatalog;
const getTranslationJsonCatalog = (app, locale) => (0, exports.getTranslationBaseCatalog)(app, locale);
exports.getTranslationJsonCatalog = getTranslationJsonCatalog;
//# sourceMappingURL=translationCatalog.js.map