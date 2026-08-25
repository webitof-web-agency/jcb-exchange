import type { TranslationApp } from '../utils/translationCatalog';
export type TranslationRegistryRecord = {
    translationKey: string;
    baseValue: string;
    namespace: string;
    firstSeenAt: Date;
    lastSeenAt: Date;
};
export declare const deriveTranslationNamespace: (translationKey: string) => string;
export declare const loadTranslationRegistryEntries: (app: TranslationApp) => Promise<Record<string, TranslationRegistryRecord>>;
export declare const upsertTranslationRegistryEntry: ({ app, translationKey, baseValue, }: {
    app: TranslationApp;
    translationKey: string;
    baseValue: string;
}) => Promise<any>;
export declare const syncTranslationRegistryEntries: ({ app, entries, }: {
    app: TranslationApp;
    entries: Array<{
        key: string;
        baseValue: string;
    }>;
}) => Promise<{
    createdCount: number;
    refreshedCount: number;
    skippedCount: number;
    conflictCount: number;
}>;
//# sourceMappingURL=translationRegistry.service.d.ts.map