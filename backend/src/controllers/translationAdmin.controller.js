"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveTranslationCatalog = exports.getTranslationCatalog = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const translationRegistry_service_1 = require("../services/translationRegistry.service");
const translationCatalog_1 = require("../utils/translationCatalog");
const prismaAny = prisma_1.default;
const isMissingTranslationStorageError = (error) => {
    const databaseError = error;
    return (databaseError?.code === 'P2021' ||
        databaseError?.code === 'P2010' ||
        databaseError?.message?.includes('translation_overrides') ||
        databaseError?.message?.includes('translation_key_registry') ||
        databaseError?.message?.includes('translationKeyRegistry') ||
        databaseError?.message?.includes('findMany'));
};
const normalizeQueryValue = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const getValidatedScope = (req, res) => {
    const app = normalizeQueryValue(req.query.app);
    const locale = normalizeQueryValue(req.query.locale);
    if (!(0, translationCatalog_1.isSupportedTranslationApp)(app)) {
        res.status(400).json({ error: 'A supported app is required.' });
        return null;
    }
    if (!(0, translationCatalog_1.isSupportedTranslationLocale)(locale)) {
        res.status(400).json({ error: 'A supported locale is required.' });
        return null;
    }
    return {
        app,
        locale,
    };
};
const loadOverrideMap = async (app, locale) => {
    if (!prismaAny.translationOverride) {
        return {};
    }
    let rows = [];
    try {
        rows = await prismaAny.translationOverride.findMany({
            where: {
                app,
                locale,
            },
            select: {
                translationKey: true,
                value: true,
                updatedAt: true,
            },
            orderBy: {
                translationKey: 'asc',
            },
        });
    }
    catch (error) {
        if (isMissingTranslationStorageError(error)) {
            return {};
        }
        throw error;
    }
    return rows.reduce((accumulator, row) => {
        accumulator[row.translationKey] = {
            value: row.value,
            updatedAt: row.updatedAt,
        };
        return accumulator;
    }, {});
};
const getTranslationCatalog = async (req, res, next) => {
    try {
        const scope = getValidatedScope(req, res);
        if (!scope) {
            return;
        }
        const [baseCatalog, englishCatalog, localizedCatalog, registryEntries, overrideMap] = await Promise.all([
            Promise.resolve((0, translationCatalog_1.getTranslationBaseCatalog)(scope.app, scope.locale)),
            Promise.resolve((0, translationCatalog_1.getTranslationEnglishCatalog)(scope.app)),
            Promise.resolve((0, translationCatalog_1.getTranslationLocaleCatalog)(scope.app, scope.locale)),
            (0, translationRegistry_service_1.loadTranslationRegistryEntries)(scope.app),
            loadOverrideMap(scope.app, scope.locale),
        ]);
        const allKeys = Array.from(new Set([...Object.keys(baseCatalog), ...Object.keys(registryEntries), ...Object.keys(overrideMap)])).sort((left, right) => left.localeCompare(right));
        const items = allKeys.map((key) => {
            const registryEntry = registryEntries[key];
            const englishJsonValue = englishCatalog[key] ?? '';
            const localizedJsonValue = localizedCatalog[key] ?? '';
            const mergedJsonValue = baseCatalog[key] ?? '';
            const baseValue = registryEntry?.baseValue ?? englishJsonValue ?? mergedJsonValue;
            const overrideEntry = overrideMap[key];
            const source = Object.prototype.hasOwnProperty.call(englishCatalog, key) ? 'json' : 'registry';
            const isPendingTranslation = scope.locale !== 'en' &&
                source === 'registry' &&
                !overrideEntry;
            return {
                key,
                namespace: registryEntry?.namespace ?? (0, translationRegistry_service_1.deriveTranslationNamespace)(key),
                baseValue,
                overrideValue: overrideEntry?.value ?? null,
                effectiveValue: overrideEntry?.value ?? localizedJsonValue ?? mergedJsonValue ?? baseValue,
                isOverridden: Boolean(overrideEntry),
                source,
                isPendingTranslation,
                firstSeenAt: registryEntry?.firstSeenAt?.toISOString() ?? null,
                lastSeenAt: registryEntry?.lastSeenAt?.toISOString() ?? null,
                updatedAt: overrideEntry?.updatedAt?.toISOString() ?? null,
            };
        });
        const registryCount = items.filter((item) => item.source === 'registry').length;
        const pendingTranslationCount = items.filter((item) => item.isPendingTranslation).length;
        res.status(200).json({
            success: true,
            data: {
                app: scope.app,
                locale: scope.locale,
                stats: {
                    totalKeys: items.length,
                    overrideCount: items.filter((item) => item.isOverridden).length,
                    registryCount,
                    pendingTranslationCount,
                },
                items,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getTranslationCatalog = getTranslationCatalog;
const saveTranslationCatalog = async (req, res, next) => {
    try {
        const { app, locale, entries } = req.body;
        if (!(0, translationCatalog_1.isSupportedTranslationApp)(app)) {
            return res.status(400).json({ error: 'A supported app is required.' });
        }
        if (!(0, translationCatalog_1.isSupportedTranslationLocale)(locale)) {
            return res.status(400).json({ error: 'A supported locale is required.' });
        }
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ error: 'At least one translation change is required.' });
        }
        const [baseCatalog, registryEntries] = await Promise.all([
            Promise.resolve((0, translationCatalog_1.getTranslationBaseCatalog)(app, locale)),
            (0, translationRegistry_service_1.loadTranslationRegistryEntries)(app),
        ]);
        const normalizedEntries = entries
            .map((entry) => ({
            key: typeof entry.key === 'string' ? entry.key.trim() : '',
            value: typeof entry.value === 'string' ? entry.value : '',
        }))
            .filter((entry) => entry.key);
        if (!normalizedEntries.length) {
            return res.status(400).json({ error: 'At least one valid translation key is required.' });
        }
        await prisma_1.default.$transaction(normalizedEntries.map((entry) => {
            const baseValue = registryEntries[entry.key]?.baseValue ?? baseCatalog[entry.key] ?? '';
            const shouldResetOverride = entry.value.trim().length === 0 || entry.value === baseValue;
            if (shouldResetOverride) {
                return prismaAny.translationOverride.deleteMany({
                    where: {
                        app,
                        locale,
                        translationKey: entry.key,
                    },
                });
            }
            return prismaAny.translationOverride.upsert({
                where: {
                    app_locale_translationKey: {
                        app,
                        locale,
                        translationKey: entry.key,
                    },
                },
                update: {
                    value: entry.value,
                },
                create: {
                    app,
                    locale,
                    translationKey: entry.key,
                    value: entry.value,
                },
            });
        }));
        const overrideMap = await loadOverrideMap(app, locale);
        return res.status(200).json({
            success: true,
            message: 'Translations updated successfully.',
            data: {
                app,
                locale,
                overrideCount: Object.keys(overrideMap).length,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.saveTranslationCatalog = saveTranslationCatalog;
//# sourceMappingURL=translationAdmin.controller.js.map