"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncTranslationRegistryEntries = exports.upsertTranslationRegistryEntry = exports.loadTranslationRegistryEntries = exports.deriveTranslationNamespace = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const prismaAny = prisma_1.default;
const LAST_SEEN_REFRESH_WINDOW_MS = 1000 * 60 * 60 * 6;
const deriveTranslationNamespace = (translationKey) => translationKey.split('.')[0]?.trim() || 'general';
exports.deriveTranslationNamespace = deriveTranslationNamespace;
const isRegistryUnavailable = (error) => {
    const databaseError = error;
    return (!prismaAny.translationKeyRegistry ||
        databaseError?.code === 'P2021' ||
        databaseError?.code === 'P2010' ||
        databaseError?.message?.includes('translation_key_registry') ||
        databaseError?.message?.includes('translationKeyRegistry'));
};
const loadTranslationRegistryEntries = async (app) => {
    if (!prismaAny.translationKeyRegistry) {
        return {};
    }
    let rows = [];
    try {
        rows = await prismaAny.translationKeyRegistry.findMany({
            where: { app },
            select: {
                translationKey: true,
                baseValue: true,
                namespace: true,
                firstSeenAt: true,
                lastSeenAt: true,
            },
            orderBy: {
                translationKey: 'asc',
            },
        });
    }
    catch (error) {
        if (isRegistryUnavailable(error)) {
            return {};
        }
        throw error;
    }
    return rows.reduce((accumulator, row) => {
        accumulator[row.translationKey] = row;
        return accumulator;
    }, {});
};
exports.loadTranslationRegistryEntries = loadTranslationRegistryEntries;
const upsertTranslationRegistryEntry = async ({ app, translationKey, baseValue, }) => {
    if (!prismaAny.translationKeyRegistry) {
        return null;
    }
    const normalizedKey = translationKey.trim();
    const normalizedBaseValue = baseValue.trim();
    if (!normalizedKey || !normalizedBaseValue) {
        return null;
    }
    const namespace = (0, exports.deriveTranslationNamespace)(normalizedKey);
    const now = new Date();
    try {
        return await prismaAny.translationKeyRegistry.upsert({
            where: {
                app_translationKey: {
                    app,
                    translationKey: normalizedKey,
                },
            },
            update: {
                namespace,
                lastSeenAt: now,
            },
            create: {
                app,
                translationKey: normalizedKey,
                baseValue: normalizedBaseValue,
                namespace,
                firstSeenAt: now,
                lastSeenAt: now,
            },
        });
    }
    catch (error) {
        if (isRegistryUnavailable(error)) {
            return null;
        }
        throw error;
    }
};
exports.upsertTranslationRegistryEntry = upsertTranslationRegistryEntry;
const syncTranslationRegistryEntries = async ({ app, entries, }) => {
    if (!prismaAny.translationKeyRegistry) {
        return {
            createdCount: 0,
            refreshedCount: 0,
            skippedCount: 0,
            conflictCount: 0,
        };
    }
    const normalizedEntries = Array.from(new Map(entries
        .map((entry) => ({
        key: entry.key.trim(),
        baseValue: entry.baseValue.trim(),
    }))
        .filter((entry) => entry.key && entry.baseValue)
        .map((entry) => [entry.key, entry])).values());
    if (!normalizedEntries.length) {
        return {
            createdCount: 0,
            refreshedCount: 0,
            skippedCount: 0,
            conflictCount: 0,
        };
    }
    try {
        const existingRows = await prismaAny.translationKeyRegistry.findMany({
            where: {
                app,
                translationKey: {
                    in: normalizedEntries.map((entry) => entry.key),
                },
            },
            select: {
                translationKey: true,
                baseValue: true,
                namespace: true,
                lastSeenAt: true,
            },
        });
        const existingMap = new Map(existingRows.map((row) => [row.translationKey, row]));
        const now = new Date();
        let createdCount = 0;
        let refreshedCount = 0;
        let skippedCount = 0;
        let conflictCount = 0;
        const operations = normalizedEntries.flatMap((entry) => {
            const existingEntry = existingMap.get(entry.key);
            const namespace = (0, exports.deriveTranslationNamespace)(entry.key);
            if (!existingEntry) {
                createdCount += 1;
                return [
                    prismaAny.translationKeyRegistry.create({
                        data: {
                            app,
                            translationKey: entry.key,
                            baseValue: entry.baseValue,
                            namespace,
                            firstSeenAt: now,
                            lastSeenAt: now,
                        },
                    }),
                ];
            }
            const hasBaseValueConflict = existingEntry.baseValue !== entry.baseValue;
            const isLastSeenFresh = now.getTime() - new Date(existingEntry.lastSeenAt).getTime() < LAST_SEEN_REFRESH_WINDOW_MS;
            const needsNamespaceRefresh = existingEntry.namespace !== namespace;
            if (hasBaseValueConflict) {
                conflictCount += 1;
            }
            if (isLastSeenFresh && !needsNamespaceRefresh) {
                skippedCount += 1;
                return [];
            }
            refreshedCount += 1;
            return [
                prismaAny.translationKeyRegistry.update({
                    where: {
                        app_translationKey: {
                            app,
                            translationKey: entry.key,
                        },
                    },
                    data: {
                        namespace,
                        lastSeenAt: now,
                    },
                }),
            ];
        });
        if (operations.length > 0) {
            await prisma_1.default.$transaction(operations);
        }
        return {
            createdCount,
            refreshedCount,
            skippedCount,
            conflictCount,
        };
    }
    catch (error) {
        if (isRegistryUnavailable(error)) {
            return {
                createdCount: 0,
                refreshedCount: 0,
                skippedCount: 0,
                conflictCount: 0,
            };
        }
        throw error;
    }
};
exports.syncTranslationRegistryEntries = syncTranslationRegistryEntries;
//# sourceMappingURL=translationRegistry.service.js.map