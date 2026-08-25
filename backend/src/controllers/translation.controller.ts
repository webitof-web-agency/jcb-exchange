import { Prisma } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { syncTranslationRegistryEntries } from '../services/translationRegistry.service';
import { isSupportedTranslationApp, type TranslationApp } from '../utils/translationCatalog';

const SUPPORTED_LOCALES = new Set(['en', 'hi', 'mr', 'gu', 'te']);

const normalizeQueryValue = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const getTranslationOverrides = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const app = normalizeQueryValue(req.query.app);
    const locale = normalizeQueryValue(req.query.locale);

    if (!isSupportedTranslationApp(app)) {
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
      const rows = await prisma.$queryRaw<
        Array<{ translationKey: string; value: string; updatedAt: Date }>
      >(Prisma.sql`
        SELECT
          "translation_key" AS "translationKey",
          "value",
          "updated_at" AS "updatedAt"
        FROM "translation_overrides"
        WHERE "app" = ${app} AND "locale" = ${locale}
        ORDER BY "translation_key" ASC
      `);

      const messages = rows.reduce(
        (accumulator: Record<string, string>, row) => {
          accumulator[row.translationKey] = row.value;
          return accumulator;
        },
        {}
      );

      const lastUpdatedAt =
        rows.length > 0
          ? rows.reduce<Date | null>((latest, row) => {
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
    } catch (error) {
      const databaseError = error as { code?: string; message?: string };

      if (
        databaseError.code === 'P2021' ||
        databaseError.code === 'P2010' ||
        databaseError.message?.includes('translation_overrides')
      ) {
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
  } catch (error) {
    next(error);
  }
};

export const registerMissingTranslationKeys = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload = req.body as {
      app?: string;
      entries?: Array<{
        key?: string;
        baseValue?: string;
      }>;
    };

    if (!isSupportedTranslationApp(payload?.app)) {
      return res.status(400).json({
        success: false,
        error: 'A supported app is required.',
      });
    }

    const app = payload.app as TranslationApp;
    const entries = Array.isArray(payload.entries) ? payload.entries.slice(0, 50) : [];

    const normalizedEntries = Array.from(
      new Map(
        entries
          .map((entry) => ({
            key: typeof entry.key === 'string' ? entry.key.trim() : '',
            baseValue: typeof entry.baseValue === 'string' ? entry.baseValue.trim() : '',
          }))
          .filter(
            (entry) =>
              entry.key &&
              entry.baseValue &&
              entry.key.length <= 180 &&
              entry.baseValue.length <= 2000 &&
              /^[a-z0-9]+(\.[a-z0-9]+)+$/i.test(entry.key)
          )
          .map((entry) => [entry.key, entry] as const)
      ).values()
    );

    if (!normalizedEntries.length) {
      return res.status(202).json({
        success: true,
        data: {
          app,
          registeredCount: 0,
        },
      });
    }

    const syncResult = await syncTranslationRegistryEntries({
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
  } catch (error) {
    next(error);
  }
};
