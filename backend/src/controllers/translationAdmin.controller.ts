import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import {
  deriveTranslationNamespace,
  loadTranslationRegistryEntries,
} from '../services/translationRegistry.service';
import {
  getTranslationBaseCatalog,
  getTranslationEnglishCatalog,
  getTranslationLocaleCatalog,
  isSupportedTranslationApp,
  isSupportedTranslationLocale,
  type TranslationApp,
  type TranslationLocale,
} from '../utils/translationCatalog';

const prismaAny = prisma as any;

const isMissingTranslationStorageError = (error: unknown) => {
  const databaseError = error as { code?: string; message?: string };

  return (
    databaseError?.code === 'P2021' ||
    databaseError?.code === 'P2010' ||
    databaseError?.message?.includes('translation_overrides') ||
    databaseError?.message?.includes('translation_key_registry') ||
    databaseError?.message?.includes('translationKeyRegistry') ||
    databaseError?.message?.includes('findMany')
  );
};

const normalizeQueryValue = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const getValidatedScope = (req: Request, res: Response) => {
  const app = normalizeQueryValue(req.query.app);
  const locale = normalizeQueryValue(req.query.locale);

  if (!isSupportedTranslationApp(app)) {
    res.status(400).json({ error: 'A supported app is required.' });
    return null;
  }

  if (!isSupportedTranslationLocale(locale)) {
    res.status(400).json({ error: 'A supported locale is required.' });
    return null;
  }

  return {
    app,
    locale,
  } satisfies {
    app: TranslationApp;
    locale: TranslationLocale;
  };
};

const loadOverrideMap = async (app: TranslationApp, locale: TranslationLocale) => {
  if (!prismaAny.translationOverride) {
    return {};
  }

  let rows: Array<{
    translationKey: string;
    value: string;
    updatedAt: Date;
  }> = [];

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
  } catch (error) {
    if (isMissingTranslationStorageError(error)) {
      return {};
    }

    throw error;
  }

  return rows.reduce(
    (
      accumulator: Record<
        string,
        {
          value: string;
          updatedAt: Date;
        }
      >,
      row: {
        translationKey: string;
        value: string;
        updatedAt: Date;
      },
    ) => {
      accumulator[row.translationKey] = {
        value: row.value,
        updatedAt: row.updatedAt,
      };
      return accumulator;
    },
    {},
  );
};

export const getTranslationCatalog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = getValidatedScope(req, res);
    if (!scope) {
      return;
    }

    const [baseCatalog, englishCatalog, localizedCatalog, registryEntries, overrideMap] = await Promise.all([
      Promise.resolve(getTranslationBaseCatalog(scope.app, scope.locale)),
      Promise.resolve(getTranslationEnglishCatalog(scope.app)),
      Promise.resolve(getTranslationLocaleCatalog(scope.app, scope.locale)),
      loadTranslationRegistryEntries(scope.app),
      loadOverrideMap(scope.app, scope.locale),
    ]);

    const allKeys = Array.from(
      new Set([...Object.keys(baseCatalog), ...Object.keys(registryEntries), ...Object.keys(overrideMap)]),
    ).sort((left, right) => left.localeCompare(right));

    const items = allKeys.map((key) => {
      const registryEntry = registryEntries[key];
      const englishJsonValue = englishCatalog[key] ?? '';
      const localizedJsonValue = localizedCatalog[key] ?? '';
      const mergedJsonValue = baseCatalog[key] ?? '';
      const baseValue = registryEntry?.baseValue ?? englishJsonValue ?? mergedJsonValue;
      const overrideEntry = overrideMap[key];
      const source = Object.prototype.hasOwnProperty.call(englishCatalog, key) ? 'json' : 'registry';
      const isPendingTranslation =
        scope.locale !== 'en' &&
        source === 'registry' &&
        !overrideEntry;

      return {
        key,
        namespace: registryEntry?.namespace ?? deriveTranslationNamespace(key),
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
  } catch (error) {
    next(error);
  }
};

export const saveTranslationCatalog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { app, locale, entries } = req.body as {
      app?: string;
      locale?: string;
      entries?: Array<{
        key?: string;
        value?: string;
      }>;
    };

    if (!isSupportedTranslationApp(app)) {
      return res.status(400).json({ error: 'A supported app is required.' });
    }

    if (!isSupportedTranslationLocale(locale)) {
      return res.status(400).json({ error: 'A supported locale is required.' });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'At least one translation change is required.' });
    }

    const [baseCatalog, registryEntries] = await Promise.all([
      Promise.resolve(getTranslationBaseCatalog(app, locale)),
      loadTranslationRegistryEntries(app),
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

    await prisma.$transaction(
      normalizedEntries.map((entry) => {
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
      }),
    );

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
  } catch (error) {
    next(error);
  }
};
