"use client";

import Image from 'next/image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api, { API_ORIGIN } from '@/lib/api';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MapPin,
  Search,
  Settings2,
  X,
  Truck,
  ArrowUpDown,
} from 'lucide-react';
import DualRangeSlider from '@/components/ui/DualRangeSlider';
import { generateMachineSlugPath } from '@/lib/seoUtils';
import { useTranslation } from '@/hooks/useTranslation';
import { formatListingLocation } from '@/lib/listingLocation';
import { trackPublicAnalyticsEvent } from '@/lib/analytics';

interface MachineListing {
  id: string;
  title: string;
  price: number;
  isNegotiable: boolean;
  manufacturingYear: number;
  operatingHours: number | null;
  address?: string | null;
  locationCity: string;
  locationState: string;
  condition: string | null;
  description: string | null;
  status: string;
  category: {
    id: string;
    name: string;
  } | null;
  brand: {
    id: string;
    name: string;
  } | null;
  model: {
    id: string;
    name: string;
  } | null;
  partner: {
    id: string;
    name: string;
  } | null;
  featuredImage: string | null;
  mediaCount: number;
  createdAt: string;
}

const PAGE_SIZE = 12;

const formatPrice = (price: number) => {
  if (price >= 100000) {
    return `₹${(price / 100000).toFixed(2)} Lakh`;
  }
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'INR',
  }).format(price);
};

const getMediaUrl = (url: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
};

const getUniqueValues = (items: MachineListing[], selector: (item: MachineListing) => string) =>
  Array.from(new Set(items.map(selector).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const getAvailabilityBadge = (
  status: string,
  labels: { sold: string; reserved: string; available: string }
) => {
  const upperStatus = (status || '').toUpperCase();
  if (upperStatus === 'SOLD') {
    return <span className="bg-red-600 text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded shadow-sm">{labels.sold}</span>;
  }
  if (upperStatus === 'RESERVED') {
    return <span className="bg-amber-500 text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded shadow-sm">{labels.reserved}</span>;
  }
  return <span className="bg-green-600 text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded shadow-sm">{labels.available}</span>;
};

export default function MachinesPageClient() {
  const searchParams = useSearchParams();
  const urlCategoryId = searchParams.get('category') || '';
  const urlQuery = searchParams.get('q') || '';
  const urlLocation = searchParams.get('location') || '';
  const routeStateKey = `${urlCategoryId}::${urlQuery}::${urlLocation}`;

  return (
    <MachinesPageContent
      key={routeStateKey}
      initialCategoryId={urlCategoryId}
      initialQuery={urlQuery}
      initialLocation={urlLocation}
    />
  );
}

function MachinesPageContent({
  initialCategoryId,
  initialQuery,
  initialLocation,
}: {
  initialCategoryId: string;
  initialQuery: string;
  initialLocation: string;
}) {
  const { t } = useTranslation();
  const [machines, setMachines] = useState<MachineListing[]>([]);
  const [loading, setLoading] = useState(true);
  const hasAppliedInitialLocation = useRef(false);

  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialCategoryId ? [initialCategoryId] : []
  );
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [locationQuery, setLocationQuery] = useState(initialLocation);

  const maxAvailablePrice = useMemo(() => {
    if (machines.length === 0) return 10000000;
    return Math.max(...machines.map((m) => m.price), 10000000);
  }, [machines]);

  const [parsedMinPrice, setParsedMinPrice] = useState<number>(0);
  const [parsedMaxPrice, setParsedMaxPrice] = useState<number>(10000000);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState('relevance');
  const [page, setPage] = useState(1);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const activeFilterCount =
    selectedBrands.length +
    selectedCategories.length +
    selectedLocations.length +
    selectedConditions.length;
  const availabilityLabels = useMemo(
    () => ({
      sold: t('machines.sold'),
      reserved: t('machines.reserved'),
      available: t('machines.available'),
    }),
    [t]
  );

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const response = await api.get('/master/public-listings');
        if (response.data?.success) {
          const nextMachines = response.data.data as MachineListing[];
          const nextMaxPrice = nextMachines.length > 0
            ? Math.max(...nextMachines.map((machine) => machine.price), 10000000)
            : 10000000;

          setMachines(nextMachines);
          setParsedMaxPrice(nextMaxPrice);
        }
      } catch (error) {
        console.error('Failed to fetch public listings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMachines();
  }, []);

  const brands = useMemo(() => {
    const all = getUniqueValues(machines, (item) => item.brand?.name || '');
    return all
      .map((brand) => {
        const count = machines.filter((m) => {
          if (m.brand?.name !== brand) return false;
          const locLabel = [m.locationCity, m.locationState].filter(Boolean).join(', ');
          if (selectedCategories.length > 0 && (!m.category || !selectedCategories.includes(m.category.id))) return false;
          if (selectedLocations.length > 0 && !selectedLocations.includes(locLabel)) return false;
          if (selectedConditions.length > 0 && !selectedConditions.includes(m.condition || t('machines.unspecified'))) return false;
          if (parsedMinPrice > 0 && m.price < parsedMinPrice) return false;
          if (parsedMaxPrice < maxAvailablePrice && m.price > parsedMaxPrice) return false;
          return true;
        }).length;
        return { name: brand, count };
      })
      .filter((b) => b.count > 0);
  }, [machines, parsedMaxPrice, parsedMinPrice, maxAvailablePrice, selectedCategories, selectedConditions, selectedLocations, t]);

  const categories = useMemo(() => {
    const categoryMap = new Map<string, { id: string; name: string; count: number }>();

    machines.forEach((m) => {
      if (!m.category) return;
      const locLabel = [m.locationCity, m.locationState].filter(Boolean).join(', ');

      if (selectedBrands.length > 0 && (!m.brand || !selectedBrands.includes(m.brand.name))) return;
      if (selectedLocations.length > 0 && !selectedLocations.includes(locLabel)) return;
      if (selectedConditions.length > 0 && !selectedConditions.includes(m.condition || t('machines.unspecified'))) return;
      if (parsedMinPrice > 0 && m.price < parsedMinPrice) return;
      if (parsedMaxPrice < maxAvailablePrice && m.price > parsedMaxPrice) return;

      const existing = categoryMap.get(m.category.id);
      if (existing) existing.count += 1;
      else categoryMap.set(m.category.id, { id: m.category.id, name: m.category.name, count: 1 });
    });

    return Array.from(categoryMap.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [machines, parsedMaxPrice, parsedMinPrice, maxAvailablePrice, selectedBrands, selectedConditions, selectedLocations, t]);

  const locations = useMemo(() => {
    const all = getUniqueValues(machines, (item) => [item.locationCity, item.locationState].filter(Boolean).join(', '));
    return all
      .map((loc) => {
        const count = machines.filter((m) => {
          const locLabel = [m.locationCity, m.locationState].filter(Boolean).join(', ');
          if (locLabel !== loc) return false;
          if (selectedBrands.length > 0 && (!m.brand || !selectedBrands.includes(m.brand.name))) return false;
          if (selectedCategories.length > 0 && (!m.category || !selectedCategories.includes(m.category.id))) return false;
          if (selectedConditions.length > 0 && !selectedConditions.includes(m.condition || t('machines.unspecified'))) return false;
          if (parsedMinPrice > 0 && m.price < parsedMinPrice) return false;
          if (parsedMaxPrice < maxAvailablePrice && m.price > parsedMaxPrice) return false;
          return true;
        }).length;
        return { name: loc, count };
      })
      .filter((l) => l.count > 0);
  }, [machines, parsedMaxPrice, parsedMinPrice, maxAvailablePrice, selectedBrands, selectedCategories, selectedConditions, t]);

  useEffect(() => {
    if (hasAppliedInitialLocation.current) return;
    const normalizedInitialLocation = initialLocation.trim().toLowerCase();
    if (!normalizedInitialLocation || loading || machines.length === 0) return;

    const timer = window.setTimeout(() => {
      const exactLocation = locations.find((location) => location.name.toLowerCase() === normalizedInitialLocation);
      const matchingLocation = exactLocation || locations.find((location) => location.name.toLowerCase().includes(normalizedInitialLocation));

      if (matchingLocation) {
        setSelectedLocations([matchingLocation.name]);
        setLocationQuery(matchingLocation.name);
      } else {
        setLocationQuery(initialLocation.trim());
      }

      hasAppliedInitialLocation.current = true;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialLocation, loading, locations, machines.length]);

  const conditions = useMemo(() => {
    const all = getUniqueValues(machines, (item) => item.condition || t('machines.unspecified'));
    return all
      .map((condition) => {
        const count = machines.filter((m) => {
          const locLabel = [m.locationCity, m.locationState].filter(Boolean).join(', ');
          if ((m.condition || t('machines.unspecified')) !== condition) return false;
          if (selectedBrands.length > 0 && (!m.brand || !selectedBrands.includes(m.brand.name))) return false;
          if (selectedCategories.length > 0 && (!m.category || !selectedCategories.includes(m.category.id))) return false;
          if (selectedLocations.length > 0 && !selectedLocations.includes(locLabel)) return false;
          if (parsedMinPrice > 0 && m.price < parsedMinPrice) return false;
          if (parsedMaxPrice < maxAvailablePrice && m.price > parsedMaxPrice) return false;
          return true;
        }).length;
        return { name: condition, count };
      })
      .filter((condition) => condition.count > 0);
  }, [machines, parsedMaxPrice, parsedMinPrice, maxAvailablePrice, selectedBrands, selectedCategories, selectedLocations, t]);

  const visibleLocations = useMemo(() => {
    const query = locationQuery.trim().toLowerCase();
    if (query === '') return locations;
    return locations.filter((location) => location.name.toLowerCase().includes(query));
  }, [locationQuery, locations]);

  const filteredMachines = useMemo(() => {
    const nextItems = machines.filter((machine) => {
      const locationLabel = [machine.locationCity, machine.locationState].filter(Boolean).join(', ');
      if (selectedBrands.length > 0 && (!machine.brand || !selectedBrands.includes(machine.brand.name))) return false;
      if (selectedCategories.length > 0 && (!machine.category || !selectedCategories.includes(machine.category.id))) return false;
      if (selectedLocations.length > 0 && !selectedLocations.includes(locationLabel)) return false;
      if (selectedConditions.length > 0 && !selectedConditions.includes(machine.condition || t('machines.unspecified'))) return false;
      if (parsedMinPrice > 0 && machine.price < parsedMinPrice) return false;
      if (parsedMaxPrice < maxAvailablePrice && machine.price > parsedMaxPrice) return false;
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        if (
          !machine.title.toLowerCase().includes(query) &&
          !(machine.brand?.name || '').toLowerCase().includes(query) &&
          !(machine.category?.name || '').toLowerCase().includes(query) &&
          !(machine.model?.name || '').toLowerCase().includes(query) &&
          !(machine.locationCity || '').toLowerCase().includes(query) &&
          !(machine.locationState || '').toLowerCase().includes(query) &&
          ![machine.locationCity, machine.locationState].filter(Boolean).join(', ').toLowerCase().includes(query) &&
          !(machine.partner?.name || '').toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      return true;
    });

    nextItems.sort((a, b) => {
      if (sortBy === 'price-low') return a.price - b.price;
      if (sortBy === 'price-high') return b.price - a.price;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return nextItems;
  }, [machines, parsedMaxPrice, parsedMinPrice, maxAvailablePrice, searchQuery, selectedBrands, selectedCategories, selectedConditions, selectedLocations, sortBy, t]);

  const lastTrackedSearch = useRef('');

  useEffect(() => {
    if (machines.length === 0) return;

    const normalizedQuery = searchQuery.trim();
    const hasSearchIntent = normalizedQuery.length >= 2 || activeFilterCount > 0;
    if (!hasSearchIntent) return;

    const signature = JSON.stringify({
      query: normalizedQuery.toLowerCase(),
      brands: selectedBrands,
      categories: selectedCategories,
      locations: selectedLocations,
      conditions: selectedConditions,
      minPrice: parsedMinPrice,
      maxPrice: parsedMaxPrice,
      sortBy,
    });

    if (lastTrackedSearch.current === signature) return;

    const timer = window.setTimeout(() => {
      lastTrackedSearch.current = signature;
      trackPublicAnalyticsEvent({
        eventType: normalizedQuery.length >= 2 ? 'SEARCH' : 'FILTER_APPLIED',
        query: normalizedQuery || undefined,
        filterPayload: {
          brands: selectedBrands,
          categories: selectedCategories,
          locations: selectedLocations,
          conditions: selectedConditions,
          minPrice: parsedMinPrice,
          maxPrice: parsedMaxPrice,
          sortBy,
        },
        resultCount: filteredMachines.length,
        source: 'machines_browser_filter',
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [activeFilterCount, filteredMachines.length, machines.length, parsedMaxPrice, parsedMinPrice, searchQuery, selectedBrands, selectedCategories, selectedConditions, selectedLocations, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredMachines.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const paginatedMachines = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredMachines.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredMachines]);

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    setList((prev) => prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]);
    setPage(1);
  };

  const clearAllFilters = () => {
    setSelectedBrands([]);
    setSelectedCategories(initialCategoryId ? [initialCategoryId] : []);
    setSelectedLocations([]);
    setSelectedConditions([]);
    setLocationQuery('');
    setParsedMinPrice(0);
    setParsedMaxPrice(maxAvailablePrice);
    setSearchQuery('');
    setSortBy('relevance');
    setPage(1);
  };

  useEffect(() => {
    if (isMobileFiltersOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileFiltersOpen]);

  const renderFiltersContent = () => (
    <div className="space-y-4">
      <FilterAccordion title={t('machines.price')} defaultOpen>
        <div className="mt-6 mb-2 px-2">
          <DualRangeSlider
            key={maxAvailablePrice}
            min={0}
            max={maxAvailablePrice}
            onChange={(min, max) => {
              setParsedMinPrice(min);
              setParsedMaxPrice(max);
              setPage(1);
            }}
            formatValue={formatPrice}
          />
        </div>
      </FilterAccordion>

      <FilterAccordion title={t('machines.brand')} defaultOpen>
        <div className="space-y-3 mt-3">
          {brands.map((brand) => (
            <label key={brand.name} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedBrands.includes(brand.name)}
                onChange={() => toggleFilter(selectedBrands, setSelectedBrands, brand.name)}
                className="w-4 h-4 rounded border border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors flex-1">{brand.name}</span>
              <span className="text-sm text-gray-400">({brand.count})</span>
            </label>
          ))}
        </div>
      </FilterAccordion>

      <FilterAccordion title={t('machines.equipmentType')} defaultOpen={Boolean(initialCategoryId)}>
        <div className="space-y-3 mt-3">
          {categories.map((cat) => (
            <label key={cat.id} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedCategories.includes(cat.id)}
                onChange={() => toggleFilter(selectedCategories, setSelectedCategories, cat.id)}
                className="w-4 h-4 rounded border border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors flex-1">{cat.name}</span>
              <span className="text-sm text-gray-400">({cat.count})</span>
            </label>
          ))}
        </div>
      </FilterAccordion>

      <FilterAccordion title={t('machines.location')}>
        <div className="mt-3 space-y-3">
          <input
            type="text"
            placeholder={t('machines.locationPlaceholder')}
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-jcb-yellow focus:ring-1 focus:ring-jcb-yellow"
          />
          {visibleLocations.map((loc) => (
            <label key={loc.name} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedLocations.includes(loc.name)}
                onChange={() => toggleFilter(selectedLocations, setSelectedLocations, loc.name)}
                className="w-4 h-4 rounded border border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors flex-1 line-clamp-1">{loc.name}</span>
              <span className="text-sm text-gray-400">({loc.count})</span>
            </label>
          ))}
          {visibleLocations.length === 0 && <p className="text-sm text-gray-500">{t('machines.noMatchingLocations')}</p>}
        </div>
      </FilterAccordion>

      <FilterAccordion title={t('machines.condition')}>
        <div className="space-y-3 mt-3">
          {conditions.map((condition) => (
            <label key={condition.name} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedConditions.includes(condition.name)}
                onChange={() => toggleFilter(selectedConditions, setSelectedConditions, condition.name)}
                className="w-4 h-4 rounded border border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors flex-1">{condition.name}</span>
              <span className="text-sm text-gray-400">({condition.count})</span>
            </label>
          ))}
        </div>
      </FilterAccordion>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100dvh-53px)] flex-1 flex-col overflow-x-hidden bg-[#f3f4f6] pt-4 pb-24 lg:pb-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-6 flex flex-col justify-between gap-4 border-b border-gray-200 pb-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="mb-1 break-words text-2xl font-bold leading-tight tracking-tight text-gray-900 capitalize lg:text-3xl">
              {selectedCategories.length === 1
                ? t('machines.browseCategory', {
                    category: categories.find((c) => c.id === selectedCategories[0])?.name || t('home.equipmentFallback'),
                  })
                : t('machines.browseEquipment')}
            </h1>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 w-full lg:w-auto">
            {/* Search Input, Sort Select Pill (mobile), Filter Icon (mobile) */}
            <div className="flex min-w-0 items-center gap-2 w-full lg:w-auto">
              <div className="relative min-w-0 flex-1">
                <input
                  type="text"
                  placeholder={t('machines.searchByModel')}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 w-full min-w-0 rounded-full border border-gray-300 bg-white pl-9 pr-2 text-xs font-semibold text-gray-700 shadow-sm outline-none transition focus:border-jcb-yellow focus:ring-1 focus:ring-jcb-yellow lg:pr-3"
                />
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              </div>

              {/* Mobile Sort Select Pill */}
              <SortDropdown
                value={sortBy}
                onChange={(val) => {
                  setSortBy(val);
                  setPage(1);
                }}
                isMobile={true}
              />

              {/* Mobile Filter Icon Button */}
              <button
                onClick={() => setIsMobileFiltersOpen(true)}
                className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 transition shadow-sm"
              >
                <Settings2 className="h-4 w-4 text-gray-600" />
              </button>
            </div>

            <div className="hidden lg:block">
              <SortDropdown
                value={sortBy}
                onChange={(val) => {
                  setSortBy(val);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">

          <div className={`fixed inset-0 z-[10020] flex transition-opacity duration-300 lg:hidden ${isMobileFiltersOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
            <div 
              className={`fixed inset-0 bg-black/40 transition-opacity duration-300 ${isMobileFiltersOpen ? 'opacity-100' : 'opacity-0'}`}
              onClick={() => setIsMobileFiltersOpen(false)}
            />
            
            <div className={`relative ml-auto flex h-full w-full max-w-xs flex-col bg-white shadow-2xl transition-transform duration-300 ease-out transform ${isMobileFiltersOpen ? 'translate-x-0' : 'translate-x-full'}`}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-base font-bold text-gray-900">{t('machines.filters')}</h2>
                <button 
                  onClick={() => setIsMobileFiltersOpen(false)}
                  className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-5 no-scrollbar">
                <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
                  <span className="text-xs text-gray-500 font-semibold">
                    {t('machines.activeFilters', { count: activeFilterCount })}
                  </span>
                  {(selectedBrands.length > 0 || (!initialCategoryId && selectedCategories.length > 0) || (initialCategoryId && selectedCategories.length > 1) || selectedLocations.length > 0 || parsedMinPrice > 0 || parsedMaxPrice < maxAvailablePrice || selectedConditions.length > 0) && (
                    <button onClick={clearAllFilters} className="text-xs font-bold text-red-600 hover:underline">
                      {t('machines.clearAll')}
                    </button>
                  )}
                </div>
                {renderFiltersContent()}
              </div>

              <div className="border-t border-gray-200 p-4 bg-gray-50 flex gap-3">
                <button 
                  onClick={() => {
                    clearAllFilters();
                    setIsMobileFiltersOpen(false);
                  }}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition"
                >
                  {t('machines.reset')}
                </button>
                <button 
                  onClick={() => setIsMobileFiltersOpen(false)}
                  className="flex-1 py-2.5 bg-jcb-yellow hover:bg-yellow-500 text-black rounded-xl text-xs font-extrabold shadow-sm transition animate-none"
                >
                  {t('machines.applyFilters')}
                </button>
              </div>
            </div>
          </div>

          <aside className="hidden lg:block w-full lg:w-64 flex-shrink-0">
            <div className="bg-white p-5 shadow-sm rounded-xl border border-gray-200 sticky top-4">
              <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">{t('machines.filters')}</h2>
                {(selectedBrands.length > 0 || (!initialCategoryId && selectedCategories.length > 0) || (initialCategoryId && selectedCategories.length > 1) || selectedLocations.length > 0 || parsedMinPrice > 0 || parsedMaxPrice < maxAvailablePrice || selectedConditions.length > 0) && (
                  <button onClick={clearAllFilters} className="text-xs text-gray-500 hover:text-jcb-yellow underline transition-colors">
                    {t('machines.clearAll')}
                  </button>
                )}
              </div>
              {renderFiltersContent()}
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="grid grid-cols-2 gap-3 lg:gap-6 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    <div className="h-32 animate-pulse bg-gray-100 lg:h-48" />
                    <div className="space-y-3 p-3 lg:p-5">
                      <div className="h-4 w-3/4 animate-pulse rounded-md bg-gray-100 lg:h-5" />
                      <div className="h-5 w-1/2 animate-pulse rounded-md bg-gray-100 lg:h-6" />
                      <div className="h-3 w-2/3 animate-pulse rounded-md bg-gray-100 lg:h-4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : paginatedMachines.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-dashed border-gray-300 bg-white px-6 py-20 rounded-2xl text-center shadow-sm">
                <Settings2 className="h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-xl font-bold text-gray-900">{t('machines.noMachinesFound')}</h3>
                <p className="mt-2 text-sm text-gray-500 max-w-sm">
                  {t('machines.adjustFilters')}
                </p>
                <button onClick={clearAllFilters} className="mt-6 bg-jcb-yellow text-black font-bold px-6 py-2.5 rounded-xl shadow-sm hover:bg-yellow-500 transition-colors">
                  {t('machines.clearFilters')}
                </button>
              </div>
            ) : (
              <>
                <div className="grid w-full min-w-0 grid-cols-2 gap-3 lg:gap-6 xl:grid-cols-3">
                  {paginatedMachines.map((machine) => {
                    const imageUrl = getMediaUrl(machine.featuredImage);
                    const locationLabel = formatListingLocation(machine, {
                      includeAddress: true,
                      fallback: t('machines.locationNotSpecified'),
                    });

                    return (
                      <Link key={machine.id} href={generateMachineSlugPath(machine)} className="group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:border-gray-200 hover:shadow-md">
                        <div className="relative h-32 shrink-0 overflow-hidden bg-gray-50 lg:h-48">
                          <div className="absolute top-3 right-3 z-10">{getAvailabilityBadge(machine.status, availabilityLabels)}</div>
                          {imageUrl ? (
                            <Image
                              src={imageUrl}
                              alt={`${machine.title} machine listing${locationLabel ? ` in ${locationLabel}` : ''}`}
                              fill
                              sizes="(max-width: 1024px) 50vw, 33vw"
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center bg-gray-100 text-gray-400 gap-2">
                              <Truck className="h-8 w-8 opacity-30" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{t('machines.noImageAvailable')}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-1 flex-col p-3 lg:p-5">
                          <h3 className="line-clamp-3 break-words text-[12px] font-bold leading-snug text-gray-900 transition-colors group-hover:text-yellow-600 lg:line-clamp-2 lg:text-sm">{machine.title}</h3>
                          <p className="mt-2 text-sm font-extrabold text-[#b48900] lg:text-base">{formatPrice(machine.price)}</p>

                          <div className="mt-auto flex items-center gap-1 border-t border-gray-50 pt-3 text-[10px] text-gray-500 lg:gap-1.5 lg:pt-4 lg:text-xs">
                            <MapPin className="h-3 w-3 shrink-0 text-gray-400 lg:h-3.5 lg:w-3.5" />
                            <span className="truncate">{locationLabel}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="mt-8 flex w-full justify-center overflow-hidden border-t border-gray-200 px-1 pt-6 sm:mt-10 sm:px-0 sm:pt-8">
                    <div className="flex max-w-full items-center justify-center gap-0.5 sm:gap-1">
                      <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1} className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-50 sm:gap-1 sm:px-3 sm:py-2 sm:text-sm">
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">{t('machines.previous')}</span>
                      </button>

                      {Array.from({ length: totalPages }).slice(0, 5).map((_, index) => {
                        const pageNum = index + 1;
                        const isCurrent = currentPage === pageNum;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-sm transition-colors sm:px-2 ${isCurrent ? 'bg-jcb-yellow font-bold text-black' : 'text-gray-600 hover:bg-gray-100'}`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      {totalPages > 5 && <span className="px-2 text-gray-400">...</span>}
                      {totalPages > 5 && (
                        <button onClick={() => setPage(totalPages)} className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-sm text-gray-600 hover:bg-gray-100 sm:px-2">
                          {totalPages}
                        </button>
                      )}

                      <button onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={currentPage === totalPages} className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-50 sm:gap-1 sm:px-3 sm:py-2 sm:text-sm">
                        <span className="hidden sm:inline">{t('machines.next')}</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortDropdown({
  value,
  onChange,
  isMobile = false,
}: {
  value: string;
  onChange: (val: string) => void;
  isMobile?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const options = [
    { value: 'relevance', label: t('machines.sortRelevance') },
    { value: 'latest', label: t('machines.sortLatest') },
    { value: 'price-low', label: t('machines.sortPriceLow') },
    { value: 'price-high', label: t('machines.sortPriceHigh') },
  ];

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isMobile) {
    return (
      <div className="relative min-w-0 flex-1 lg:hidden" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-full min-w-0 items-center justify-between rounded-full border border-gray-300 bg-white pl-7 pr-2 text-[11px] font-semibold text-gray-700 shadow-sm outline-none transition focus:border-jcb-yellow focus:ring-1 focus:ring-jcb-yellow sm:pl-8 sm:pr-3 sm:text-xs"
        >
          <ArrowUpDown className="absolute left-3 h-3.5 w-3.5 text-gray-500" />
          <span className="min-w-0 truncate">{selectedOption.label}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-gray-500 shrink-0 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="absolute z-50 mt-2 w-full min-w-[140px] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-lg right-0 animate-in fade-in slide-in-from-top-2 duration-200">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-xs transition-colors hover:bg-gray-100 ${
                  value === option.value ? 'bg-gray-50 font-bold text-gray-900' : 'text-gray-700 font-medium'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full sm:w-auto" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-jcb-yellow focus:ring-1 focus:ring-jcb-yellow hover:bg-gray-50 gap-2 min-w-[160px]"
      >
        <span>{selectedOption.label}</span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full min-w-[160px] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-lg right-0 animate-in fade-in slide-in-from-top-2 duration-200">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 ${
                value === option.value ? 'bg-gray-50 font-bold text-gray-900' : 'text-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterAccordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-100 py-3 last:border-0 last:pb-0">
      <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between text-left focus:outline-none">
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {isOpen && <div className="animate-in fade-in slide-in-from-top-1 duration-200">{children}</div>}
    </div>
  );
}
