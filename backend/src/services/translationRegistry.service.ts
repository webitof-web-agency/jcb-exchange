import prisma from '../lib/prisma';
import type { TranslationApp } from '../utils/translationCatalog';

const prismaAny = prisma as any;
const LAST_SEEN_REFRESH_WINDOW_MS = 1000 * 60 * 60 * 6;

export type TranslationRegistryRecord = {
  translationKey: string;
  baseValue: string;
  namespace: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export const deriveTranslationNamespace = (translationKey: string) =>
  translationKey.split('.')[0]?.trim() || 'general';

const isRegistryUnavailable = (error: unknown) => {
  const databaseError = error as { code?: string; message?: string };

  return (
    !prismaAny.translationKeyRegistry ||
    databaseError?.code === 'P2021' ||
    databaseError?.code === 'P2010' ||
    databaseError?.message?.includes('translation_key_registry') ||
    databaseError?.message?.includes('translationKeyRegistry')
  );
};

export const loadTranslationRegistryEntries = async (
  app: TranslationApp,
): Promise<Record<string, TranslationRegistryRecord>> => {
  if (!prismaAny.translationKeyRegistry) {
    return {};
  }

  let rows: TranslationRegistryRecord[] = [];

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
  } catch (error) {
    if (isRegistryUnavailable(error)) {
      return {};
    }

    throw error;
  }

  return rows.reduce<Record<string, TranslationRegistryRecord>>((accumulator, row) => {
    accumulator[row.translationKey] = row;
    return accumulator;
  }, {});
};

export const upsertTranslationRegistryEntry = async ({
  app,
  translationKey,
  baseValue,
}: {
  app: TranslationApp;
  translationKey: string;
  baseValue: string;
}) => {
  if (!prismaAny.translationKeyRegistry) {
    return null;
  }

  const normalizedKey = translationKey.trim();
  const normalizedBaseValue = baseValue.trim();

  if (!normalizedKey || !normalizedBaseValue) {
    return null;
  }

  const namespace = deriveTranslationNamespace(normalizedKey);
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
  } catch (error) {
    if (isRegistryUnavailable(error)) {
      return null;
    }

    throw error;
  }
};

export const syncTranslationRegistryEntries = async ({
  app,
  entries,
}: {
  app: TranslationApp;
  entries: Array<{
    key: string;
    baseValue: string;
  }>;
}) => {
  if (!prismaAny.translationKeyRegistry) {
    return {
      createdCount: 0,
      refreshedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
    };
  }

  type NormalizedRegistryEntry = {
    key: string;
    baseValue: string;
  };

  const normalizedEntries = Array.from(
    new Map<string, NormalizedRegistryEntry>(
      entries
        .map((entry) => ({
          key: entry.key.trim(),
          baseValue: entry.baseValue.trim(),
        }))
        .filter((entry) => entry.key && entry.baseValue)
        .map((entry) => [entry.key, entry] as const)
    ).values()
  );

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

    const existingMap = new Map<
      string,
      {
        translationKey: string;
        baseValue: string;
        namespace: string;
        lastSeenAt: Date;
      }
    >(
      existingRows.map(
        (row: {
          translationKey: string;
          baseValue: string;
          namespace: string;
          lastSeenAt: Date;
        }) => [row.translationKey, row] as const
      )
    );

    const now = new Date();
    let createdCount = 0;
    let refreshedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;

    const operations = normalizedEntries.flatMap((entry) => {
      const existingEntry = existingMap.get(entry.key);
      const namespace = deriveTranslationNamespace(entry.key);

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
      const isLastSeenFresh =
        now.getTime() - new Date(existingEntry.lastSeenAt).getTime() < LAST_SEEN_REFRESH_WINDOW_MS;
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
      await prisma.$transaction(operations);
    }

    return {
      createdCount,
      refreshedCount,
      skippedCount,
      conflictCount,
    };
  } catch (error) {
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
