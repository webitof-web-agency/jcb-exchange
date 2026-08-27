'use client';

import { useDeferredValue, useEffect, useMemo, useState, useRef } from 'react';
import type { AxiosError } from 'axios';
import {
  Check,
  ChevronDown,
  Copy,
  Database,
  Globe2,
  Languages,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type AppLocale } from '@/lib/i18n/config';
import { useLanguageStore } from '@/store/languageStore';

type TranslationApp = 'admin-portal' | 'frontend';
type TranslationView = 'registry' | 'json';

type TranslationCatalogItem = {
  key: string;
  namespace: string;
  baseValue: string;
  overrideValue: string | null;
  effectiveValue: string;
  isOverridden: boolean;
  source: 'json' | 'registry';
  isPendingTranslation: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  updatedAt: string | null;
};

type TranslationCatalogResponse = {
  success: boolean;
  data: {
    app: TranslationApp;
    locale: AppLocale;
    stats: {
      totalKeys: number;
      overrideCount: number;
      registryCount: number;
      pendingTranslationCount: number;
    };
    items: TranslationCatalogItem[];
  };
};

const TRANSLATION_APP_OPTIONS: Array<{
  value: TranslationApp;
  label: string;
  description: string;
}> = [
    {
      value: 'admin-portal',
      label: 'Admin Portal',
      description: 'Dashboard, settings, listings, and operator flows',
    },
    {
      value: 'frontend',
      label: 'Public Frontend',
      description: 'Marketplace, buyer journey, and public pages',
    },
  ];

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || fallbackMessage;
};

function CustomSelect({
  value,
  onChange,
  options,
  className,
  buttonClassName,
}: {
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  buttonClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className || ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClassName || "w-full flex items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 cursor-pointer"}
      >
        <span className="truncate">{selectedOption?.label || value}</span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-full min-w-[200px] max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left rounded-lg px-3.5 py-2 text-xs sm:text-sm font-bold transition cursor-pointer ${
                  isSelected
                    ? 'bg-slate-100 text-slate-950 font-extrabold'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TranslationSettingsPanel() {
  const activeAdminPortalLocale = useLanguageStore((state) => state.locale);
  const refreshTranslationOverrides = useLanguageStore((state) => state.refreshTranslationOverrides);
  const [selectedApp, setSelectedApp] = useState<TranslationApp>('admin-portal');
  const [selectedLocale, setSelectedLocale] = useState<AppLocale>('en');
  const [selectedView, setSelectedView] = useState<TranslationView>('registry');
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [items, setItems] = useState<TranslationCatalogItem[]>([]);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [overrideCount, setOverrideCount] = useState(0);
  const [registryCount, setRegistryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const catalogCount = useMemo(
    () => items.filter((item) => item.source === 'json').length,
    [items],
  );

  useEffect(() => {
    let isActive = true;

    const loadCatalog = async () => {
      setLoading(true);
      setLoadingError(null);

      try {
        const response = await api.get<TranslationCatalogResponse>('/superadmin/translations/catalog', {
          params: {
            app: selectedApp,
            locale: selectedLocale,
          },
        });

        if (!isActive) {
          return;
        }

        setItems(response.data.data.items);
        setOverrideCount(response.data.data.stats.overrideCount);
        setRegistryCount(response.data.data.stats.registryCount);
        setDraftValues({});
        setSelectedNamespace('all');
      } catch (error: unknown) {
        if (!isActive) {
          return;
        }

        setLoadingError(getApiErrorMessage(error, 'Unable to load translation catalog.'));
        setItems([]);
        setDraftValues({});
        setRegistryCount(0);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      isActive = false;
    };
  }, [selectedApp, selectedLocale]);

  const namespaceSummary = useMemo(() => {
    const namespaceMap = new Map<string, number>();

    items
      .filter((item) => item.source === selectedView)
      .forEach((item) => {
        namespaceMap.set(item.namespace, (namespaceMap.get(item.namespace) || 0) + 1);
      });

    return Array.from(namespaceMap.entries())
      .map(([namespace, count]) => ({ namespace, count }))
      .sort((left, right) => left.namespace.localeCompare(right.namespace));
  }, [items, selectedView]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = deferredSearchTerm.trim().toLowerCase();

    return items.filter((item) => {
      if (item.source !== selectedView) {
        return false;
      }

      if (selectedNamespace !== 'all' && item.namespace !== selectedNamespace) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        item.key.toLowerCase().includes(normalizedQuery) ||
        item.baseValue.toLowerCase().includes(normalizedQuery) ||
        item.effectiveValue.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [deferredSearchTerm, items, selectedNamespace, selectedView]);

  const visibleItemCount = selectedView === 'registry' ? registryCount : catalogCount;
  const isRegistryView = selectedView === 'registry';
  const viewHeading = isRegistryView ? 'Auto-registered keys' : 'Existing catalog keys';
  const emptyStateTitle = isRegistryView
    ? 'No auto-registered keys found'
    : 'No existing catalog keys found';
  const emptyStateDescription = isRegistryView
    ? "New keys appear here automatically when a page uses t('namespace.key') for a key that does not exist in JSON or DB yet."
    : 'This tab shows keys already present in your JSON catalog so they can also be reviewed and edited from the same page.';

  const changedEntries = useMemo(
    () =>
      Object.entries(draftValues).filter(([key, value]) => {
        const matchingItem = items.find((item) => item.key === key);
        return matchingItem && value !== matchingItem.effectiveValue;
      }),
    [draftValues, items],
  );

  const handleValueChange = (key: string, nextValue: string) => {
    setDraftValues((currentDrafts) => {
      const matchingItem = items.find((item) => item.key === key);

      if (!matchingItem) {
        return currentDrafts;
      }

      if (nextValue === matchingItem.effectiveValue) {
        const remainingDrafts = { ...currentDrafts };
        delete remainingDrafts[key];
        return remainingDrafts;
      }

      return {
        ...currentDrafts,
        [key]: nextValue,
      };
    });
  };

  const handleResetToBase = (item: TranslationCatalogItem) => {
    setDraftValues((currentDrafts) => ({
      ...currentDrafts,
      [item.key]: item.baseValue,
    }));
  };

  const handleDiscardDraft = (key: string) => {
    setDraftValues((currentDrafts) => {
      const remainingDrafts = { ...currentDrafts };
      delete remainingDrafts[key];
      return remainingDrafts;
    });
  };

  const handleDiscardAll = () => {
    setDraftValues({});
    toast.info('All unsaved draft changes discarded.');
  };

  const handleCopyKey = (key: string) => {
    void navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSave = async () => {
    if (!changedEntries.length) {
      toast.info('No translation changes to save.');
      return;
    }

    setSaving(true);

    try {
      await api.put('/superadmin/translations/catalog', {
        app: selectedApp,
        locale: selectedLocale,
        entries: changedEntries.map(([key, value]) => ({
          key,
          value,
        })),
      });

      toast.success('Translation changes saved successfully.');

      const response = await api.get<TranslationCatalogResponse>('/superadmin/translations/catalog', {
        params: {
          app: selectedApp,
          locale: selectedLocale,
        },
      });

      setItems(response.data.data.items);
      setOverrideCount(response.data.data.stats.overrideCount);
      setRegistryCount(response.data.data.stats.registryCount);
      setDraftValues({});

      if (selectedApp === 'admin-portal' && selectedLocale === activeAdminPortalLocale) {
        await refreshTranslationOverrides(selectedLocale);
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save translation changes.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Sleek Top Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-slate-900 p-6 shadow-lg sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,193,7,0.25),transparent_50%),linear-gradient(135deg,#0f172a_0%,#1e293b_100%)]" />

        <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-xl space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#FFC107]">
              <Sparkles className="h-4 w-4" />
              <span>Live Localization Control</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Translation Catalog Manager
            </h1>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5 w-full sm:w-auto">
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 sm:px-3.5 sm:py-2.5 backdrop-blur-md border border-white/10">
                <Database className="h-4 w-4 text-[#FFC107] flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[9px] uppercase font-bold text-slate-300 tracking-wider truncate">Auto Keys</div>
                  <div className="text-sm sm:text-base font-extrabold text-white">{registryCount}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 sm:px-3.5 sm:py-2.5 backdrop-blur-md border border-white/10">
                <Globe2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[9px] uppercase font-bold text-slate-300 tracking-wider truncate">Overrides</div>
                  <div className="text-sm sm:text-base font-extrabold text-white">{overrideCount}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 sm:px-3.5 sm:py-2.5 backdrop-blur-md border border-white/10">
                <Languages className="h-4 w-4 text-sky-300 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[9px] uppercase font-bold text-slate-300 tracking-wider truncate">Catalog Keys</div>
                  <div className="text-sm sm:text-base font-extrabold text-white">{catalogCount}</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !changedEntries.length}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-6 py-2.5 text-xs sm:text-sm font-bold text-slate-950 shadow-md transition hover:bg-[#e6ad00] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap flex-shrink-0"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving...' : `Save ${changedEntries.length ? `(${changedEntries.length}) Changes` : 'Changes'}`}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Controls Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-5">
        {/* App Selector Tabs & Language Dropdown */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5">
          {/* App Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1.5 border border-slate-200 w-full md:w-auto">
            {TRANSLATION_APP_OPTIONS.map((option) => {
              const isActive = selectedApp === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedApp(option.value)}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-2 sm:px-4 py-2 text-xs sm:text-sm font-bold transition ${isActive
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                >
                  <Languages className={`h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 ${isActive ? 'text-[#FFC107]' : 'text-slate-400'}`} />
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>

          {/* Language Selector */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <label htmlFor="translation-language-select" className="text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
              Target Language:
            </label>
            <CustomSelect
              value={selectedLocale}
              onChange={(val) => setSelectedLocale(val as AppLocale)}
              options={SUPPORTED_LOCALES.map((locale) => ({
                value: locale,
                label: `${LOCALE_LABELS[locale].englishName} — ${LOCALE_LABELS[locale].nativeName}`,
              }))}
              className="w-full md:w-auto"
              buttonClassName="w-full md:w-auto min-w-[180px] flex items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 cursor-pointer"
            />
          </div>
        </div>

        {/* View Switcher Tabs (Missing vs Existing) */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-50 p-1.5 border border-slate-200 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setSelectedView('registry');
              setSelectedNamespace('all');
            }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-2 sm:px-4 py-2 text-xs sm:text-sm font-bold transition ${
              isRegistryView
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Sparkles className={`h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 ${isRegistryView ? 'text-[#FFC107]' : 'text-slate-400'}`} />
            <span className="truncate">Missing Translations</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedView('json');
              setSelectedNamespace('all');
            }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-2 sm:px-4 py-2 text-xs sm:text-sm font-bold transition ${
              !isRegistryView
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Languages className={`h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 ${!isRegistryView ? 'text-[#FFC107]' : 'text-slate-400'}`} />
            <span className="truncate">Existing Translations</span>
          </button>
        </div>

        {/* Search Bar & Filters */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-12 items-center">
          <div className="relative md:col-span-8 lg:col-span-8 xl:col-span-9">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search translation key, English fallback, or current value..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-xs sm:text-sm font-medium text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 placeholder:text-slate-400"
            />
          </div>

          <div className="md:col-span-4 lg:col-span-4 xl:col-span-3">
            <CustomSelect
              value={selectedNamespace}
              onChange={(val) => setSelectedNamespace(val)}
              options={[
                { value: 'all', label: `All Namespaces (${visibleItemCount})` },
                ...namespaceSummary.map((entry) => ({
                  value: entry.namespace,
                  label: `${entry.namespace} (${entry.count})`,
                })),
              ]}
              className="w-full"
              buttonClassName="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 cursor-pointer"
            />
          </div>
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-500 border-t border-slate-100">
          <div>
            Showing <span className="font-bold text-slate-900">{filteredItems.length}</span> of{' '}
            <span className="font-bold text-slate-900">{visibleItemCount}</span> {viewHeading.toLowerCase()}
            {(searchTerm || selectedNamespace !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedNamespace('all');
                }}
                className="ml-3 font-semibold text-[#FFC107] hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Error Alert */}
      {loadingError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <X className="h-5 w-5 text-red-500 flex-shrink-0" />
          <span>{loadingError}</span>
        </div>
      )}

      {/* Translation Keys List */}
      <section className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent" />
            <p className="text-sm font-semibold text-slate-600">Loading translation catalog...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm space-y-3">
            <Search className="h-10 w-10 text-slate-300" />
            <p className="text-base font-bold text-slate-800">{emptyStateTitle}</p>
            <p className="text-xs text-slate-500 max-w-md">
              {emptyStateDescription}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedNamespace('all');
              }}
              className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredItems.map((item) => {
            const currentDraftValue = draftValues[item.key];
            const textareaValue = currentDraftValue ?? item.effectiveValue;
            const hasPendingChange =
              currentDraftValue !== undefined && currentDraftValue !== item.effectiveValue;

            return (
              <article
                key={item.key}
                className={`group rounded-2xl border bg-white p-4 sm:p-5 shadow-sm transition hover:shadow-md ${hasPendingChange
                    ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-300/50'
                    : item.isOverridden
                      ? 'border-slate-200 hover:border-emerald-200'
                      : 'border-slate-200'
                  }`}
              >
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 xl:gap-6 items-start xl:items-center">
                  {/* Left Column: Key Metadata & Base Value */}
                  <div className="xl:col-span-6 space-y-2.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Namespace Badge */}
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 border border-slate-200/60">
                        {item.namespace}
                      </span>

                      {/* DB Override / Custom Base Badge */}
                      {item.isOverridden ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 border border-emerald-200">
                          <Database className="h-3 w-3" />
                          DB Override
                        </span>
                      ) : item.source === 'registry' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-700 border border-sky-200">
                          <Sparkles className="h-3 w-3" />
                          Custom Base
                        </span>
                      ) : null}

                      {/* Unsaved Badge */}
                      {hasPendingChange && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800 border border-amber-300">
                          <Sparkles className="h-3 w-3" />
                          Unsaved Draft
                        </span>
                      )}
                    </div>

                    {/* Translation Key Path */}
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs font-bold text-slate-900 border border-slate-200 break-all select-all min-w-0">
                        {item.key}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyKey(item.key)}
                        title="Copy Key Path"
                        className="text-slate-400 hover:text-slate-700 p-1 transition flex-shrink-0"
                      >
                        {copiedKey === item.key ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* English Base Fallback Display */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">
                        Base (English):
                      </span>
                      <span className="text-slate-800 font-semibold break-words min-w-0">
                        {item.baseValue || <span className="italic text-slate-400">No base value defined</span>}
                      </span>
                    </div>
                  </div>

                  {/* Right Column (6 cols): Target Language Translation Textarea */}
                  <div className="xl:col-span-6 space-y-2 w-full">
                    <div className="flex items-center justify-between">
                      <label htmlFor={`textarea-${item.key}`} className="text-xs font-bold text-slate-700">
                        {LOCALE_LABELS[selectedLocale].englishName} ({LOCALE_LABELS[selectedLocale].nativeName}) Value:
                      </label>

                      {hasPendingChange && (
                        <button
                          type="button"
                          onClick={() => handleDiscardDraft(item.key)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Discard</span>
                        </button>
                      )}
                    </div>

                    <textarea
                      id={`textarea-${item.key}`}
                      value={textareaValue}
                      onChange={(event) => handleValueChange(item.key, event.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 placeholder:text-slate-400 leading-relaxed"
                      placeholder="Enter translation text..."
                    />

                    {/* Action buttons footer */}
                    {item.isOverridden && (
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => handleResetToBase(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                        >
                          <RefreshCcw className="h-3 w-3" />
                          <span>Reset to Base JSON</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      {/* Floating Sticky Unsaved Bar */}
      {changedEntries.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-2xl bg-slate-900 px-6 py-3.5 shadow-2xl border border-slate-800 text-white animate-in fade-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <span className="text-xs sm:text-sm font-bold">
              {changedEntries.length} unsaved {changedEntries.length === 1 ? 'change' : 'changes'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscardAll}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition"
            >
              Discard All
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#FFC107] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#e6ad00] transition disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
