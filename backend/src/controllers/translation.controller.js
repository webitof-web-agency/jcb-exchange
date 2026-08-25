"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMissingTranslationKeys = exports.getTranslationOverrides = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const translationRegistry_service_1 = require("../services/translationRegistry.service");
const translationCatalog_1 = require("../utils/translationCatalog");
const SUPPORTED_LOCALES = new Set(['en', 'hi', 'mr', 'gu', 'te']);
const normalizeQueryValue = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const getTranslationOverrides = async (req, res, next) => {
    try {
        const app = normalizeQueryValue(req.query.app);
        const locale = normalizeQueryValue(req.query.locale);
        if (!(0, translationCatalog_1.isSupportedTranslationApp)(app)) {
            return res.status(400).json({
                success: false,
                error: 'A supported app is required.',
            });
        }
        if (!SUPPORTED_LOCALES.has(locale)) {
            return res.status(400).json({
                success: false,
                error: 'A supported locale is required.',
            });
        }
        try {
            const rows = await prisma_1.default.$queryRaw(client_1.Prisma.sql `
        SELECT
          "translation_key" AS "translationKey",
          "value",
          "updated_at" AS "updatedAt"
        FROM "translation_overrides"
        WHERE "app" = ${app} AND "locale" = ${locale}
        ORDER BY "translation_key" ASC
      `);
            const messages = rows.reduce((accumulator, row) => {
                accumulator[row.translationKey] = row.value;
                return accumulator;
            }, {});
            const lastUpdatedAt = rows.length > 0
                ? rows.reduce((latest, row) => {
                    if (!latest || row.updatedAt > latest) {
                        return row.updatedAt;
                    }
                    return latest;
                }, null)
                : null;
            res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
            return res.status(200).json({
                success: true,
                data: {
                    app,
                    locale,
                    messages,
                    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
                },
            });
        }
        catch (error) {
            const databaseError = error;
            if (databaseError.code === 'P2021' ||
                databaseError.code === 'P2010' ||
                databaseError.message?.includes('translation_overrides')) {
                res.setHeader('Cache-Control', 'public, max-age=60');
                return res.status(200).json({
                    success: true,
                    data: {
                        app,
                        locale,
                        messages: {},
                        lastUpdatedAt: null,
                    },
                });
            }
            throw error;
        }
    }
    catch (error) {
        next(error);
    }
};
exports.getTranslationOverrides = getTranslationOverrides;
const registerMissingTranslationKeys = async (req, res, next) => {
    try {
        const payload = req.body;
        if (!(0, translationCatalog_1.isSupportedTranslationApp)(payload?.app)) {
            return res.status(400).json({
                success: false,
                error: 'A supported app is required.',
            });
        }
        const app = payload.app;
        const entries = Array.isArray(payload.entries) ? payload.entries.slice(0, 50) : [];
        const normalizedEntries = Array.from(new Map(entries
            .map((entry) => ({
            key: typeof entry.key === 'string' ? entry.key.trim() : '',
            baseValue: typeof entry.baseValue === 'string' ? entry.baseValue.trim() : '',
        }))
            .filter((entry) => entry.key &&
            entry.baseValue &&
            entry.key.length <= 180 &&
            entry.baseValue.length <= 2000 &&
            /^[a-z0-9]+(\.[a-z0-9]+)+$/i.test(entry.key))
            .map((entry) => [entry.key, entry])).values());
        if (!normalizedEntries.length) {
            return res.status(202).json({
                success: true,
                data: {
                    app,
                    registeredCount: 0,
                },
            });
        }
        const syncResult = await (0, translationRegistry_service_1.syncTranslationRegistryEntries)({
            app,
            entries: normalizedEntries,
        });
        return res.status(202).json({
            success: true,
            data: {
                app,
                registeredCount: normalizedEntries.length,
                createdCount: syncResult.createdCount,
                refreshedCount: syncResult.refreshedCount,
                skippedCount: syncResult.skippedCount,
                conflictCount: syncResult.conflictCount,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.registerMissingTranslationKeys = registerMissingTranslationKeys;
//# sourceMappingURL=translation.controller.js.map