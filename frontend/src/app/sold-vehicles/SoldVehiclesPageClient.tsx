"use client";

import Image from 'next/image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import api, { API_ORIGIN } from '@/lib/api';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  Truck,
  ArrowUpDown,
  CalendarRange,
  Gauge,
  Layers,
  Tag,
  CheckCircle2,
  Store,
  Camera,
} from 'lucide-react';
import { generateMachineSlugPath } from '@/lib/seoUtils';
import { useTranslation } from '@/hooks/useTranslation';
import BrandLoader from '@/components/ui/BrandLoader';
import { formatListingLocation } from '@/lib/listingLocation';

interface MachineListing {
  id: string;
  title: string;
  price: number;
  isNegotiable: boolean;
  manufacturingYear: number | null;
  operatingHours: number | null;
  address?: string | null;
  locationCity: string | null;
  locationState: string | null;
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
    type?: string;
  } | null;
  featuredImage: string | null;
  mediaCount: number;
  createdAt: string;
}

const PAGE_SIZE = 12;

const formatPrice = (price: number) => {
  if (!price || isNaN(price)) return '₹0';
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

const formatBrandDisplay = (rawName: string): { main: string; subtitle?: string } => {
  if (!rawName) return { main: 'Unknown' };

  const upper = rawName.toUpperCase();
  if (upper.includes('CASE NEW HOLLAND') || upper.includes('CNH')) {
    return { main: 'Case New Holland', subtitle: 'CNH Equipment' };
  }
  if (upper.includes('JCB INDIA LIMITED') || upper.includes('JCB INDIA LTD') || upper === 'JCB') {
    return { main: 'JCB India', subtitle: upper.includes('LTD') ? 'Ltd' : upper.includes('LIMITED') ? 'Limited' : undefined };
  }
  if (upper.includes('TATA HITACHI')) {
    return { main: 'Tata Hitachi', subtitle: 'Construction' };
  }

  if (rawName === rawName.toUpperCase() && rawName.length > 10) {
    const titleCased = rawName
      .toLowerCase()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return { main: titleCased };
  }

  return { main: rawName };
};

interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  icon?: React.ReactNode;
  className?: string;
  dropdownClassName?: string;
}

function CustomSelect({ value, onChange, options, icon, className = '', dropdownClassName = 'left-0' }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-11 sm:h-10 flex items-center justify-between gap-2 rounded-full border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 outline-none transition hover:border-amber-400 hover:bg-amber-50/10 shadow-xs cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="truncate">{selectedOption?.label || ''}</span>
        </div>
        <ChevronDown size={14} className={`text-slate-500 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute ${dropdownClassName} z-50 mt-1.5 w-max min-w-[100%] max-w-[85vw] max-h-60 overflow-y-auto custom-scrollbar rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl`}>
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
                className={`w-full text-left rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                  isSelected
                    ? 'bg-amber-50 text-amber-950 font-extrabold'
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

function SortIconButton({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
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

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Sort listings"
        aria-label="Sort listings"
        className="h-11 w-11 sm:h-10 sm:w-10 flex items-center justify-center rounded-full border border-slate-300 bg-white text-amber-500 outline-none transition hover:border-amber-400 hover:bg-amber-50/20 active:scale-95 shadow-xs cursor-pointer"
      >
        <ArrowUpDown size={16} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-48 sm:w-52 max-h-60 overflow-y-auto custom-scrollbar rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
            Sort Listings
          </div>
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
                className={`w-full text-left rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                  isSelected
                    ? 'bg-amber-50 text-amber-950 font-extrabold'
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

export default function SoldVehiclesPageClient({ initialLogoUrl }: { initialLogoUrl?: string | null }) {
  const { t } = useTranslation();
  const [listings, setListings] = useState<MachineListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [selectedCondition, setSelectedCondition] = useState('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'price-low' | 'price-high' | 'year-new' | 'hours-low'>('newest');
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch Sold Listings dynamically from backend
  useEffect(() => {
    let isCancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const soldListingsRes = await api.get('/master/public-listings?status=SOLD');

        if (isCancelled) return;

        setListings((soldListingsRes.data?.data || []) as MachineListing[]);
      } catch (err: unknown) {
        if (!isCancelled) {
          console.error('Failed to load sold vehicles data:', err);
          setError('Failed to load sold vehicles catalog. Please try again.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void fetchData();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Dynamically compute category options ONLY from actual sold listings
  const categoryOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();

    listings.forEach((item) => {
      if (item.category?.id && item.category?.name) {
        const existing = map.get(item.category.id);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(item.category.id, { id: item.category.id, name: item.category.name, count: 1 });
        }
      }
    });

    const list = Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name));
    return [
      { value: 'ALL', label: t('soldVehicles.allCategories', { count: list.length }) },
      ...list.map((c) => ({ value: c.id, label: `${c.name} (${c.count})` })),
    ];
  }, [listings, t]);

  // Dynamically compute brand options ONLY from actual sold listings
  const brandOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();

    listings.forEach((item) => {
      if (item.brand?.id && item.brand?.name) {
        const existing = map.get(item.brand.id);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(item.brand.id, { id: item.brand.id, name: item.brand.name, count: 1 });
        }
      }
    });

    const list = Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name));
    return [
      { value: 'ALL', label: t('soldVehicles.allBrands', { count: list.length }) },
      ...list.map((b) => {
        const brandInfo = formatBrandDisplay(b.name);
        return { value: b.id, label: `${brandInfo.main} (${b.count})` };
      }),
    ];
  }, [listings, t]);

  const sortOptions = useMemo(
    () => [
      { value: 'newest', label: t('soldVehicles.sortNewest') },
      { value: 'price-low', label: t('soldVehicles.sortPriceLow') },
      { value: 'price-high', label: t('soldVehicles.sortPriceHigh') },
      { value: 'year-new', label: t('soldVehicles.sortYearNew') },
      { value: 'hours-low', label: 'Lowest Hours' },
    ],
    [t],
  );

  const filteredListings = useMemo(() => {
    let result = [...listings];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.title?.toLowerCase().includes(q) ||
          item.category?.name?.toLowerCase().includes(q) ||
          item.brand?.name?.toLowerCase().includes(q) ||
          item.model?.name?.toLowerCase().includes(q) ||
          item.locationCity?.toLowerCase().includes(q) ||
          item.locationState?.toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'ALL') {
      result = result.filter((item) => item.category?.id === selectedCategory);
    }

    if (selectedBrand !== 'ALL') {
      result = result.filter((item) => item.brand?.id === selectedBrand);
    }

    if (selectedCondition !== 'ALL') {
      result = result.filter((item) => String(item.condition || '').trim() === selectedCondition);
    }

    result.sort((a, b) => {
      if (sortBy === 'price-low') return (a.price || 0) - (b.price || 0);
      if (sortBy === 'price-high') return (b.price || 0) - (a.price || 0);
      if (sortBy === 'year-new') return (b.manufacturingYear || 0) - (a.manufacturingYear || 0);
      if (sortBy === 'hours-low') return (a.operatingHours || Number.MAX_SAFE_INTEGER) - (b.operatingHours || Number.MAX_SAFE_INTEGER);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [listings, searchTerm, selectedCategory, selectedBrand, selectedCondition, sortBy]);

  const totalPages = Math.ceil(filteredListings.length / PAGE_SIZE) || 1;
  const paginatedListings = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredListings.slice(start, start + PAGE_SIZE);
  }, [filteredListings, currentPage]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('ALL');
    setSelectedBrand('ALL');
    setSelectedCondition('ALL');
    setSortBy('newest');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(
    searchTerm || selectedCategory !== 'ALL' || selectedBrand !== 'ALL' || selectedCondition !== 'ALL'
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Hero Header */}
      <section className="relative overflow-hidden bg-slate-900 px-4 py-6 sm:px-6 sm:py-14 lg:px-8 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,193,7,0.18),transparent_60%),linear-gradient(135deg,#0f172a_0%,#1e293b_100%)]" />

        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-col items-start gap-2">
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
              {t('soldVehicles.title')}
            </h1>

            <div className="mt-4 flex flex-row items-center gap-2 sm:gap-3.5 w-full sm:w-auto">
              <Link
                href="/machines"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-[#FFC107] px-2.5 sm:px-4 py-2.5 text-[11px] sm:text-sm font-bold text-black shadow-xs transition-all hover:bg-[#FFB300] hover:shadow-md active:scale-95 text-center whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  <span>Browse machines</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 opacity-70" />
              </Link>
              <Link
                href="/dealers"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 backdrop-blur-md px-2.5 sm:px-4 py-2.5 text-[11px] sm:text-sm font-semibold text-white transition-all hover:bg-white/20 hover:border-white/40 active:scale-95 text-center whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Store className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400 shrink-0" />
                  <span>Explore dealers</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 opacity-70" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6">
        {/* Controls Bar with Relatable Filter Icons */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs space-y-3.5">
          {/* Desktop Filter Bar (md:grid 4-columns) */}
          <div className="hidden md:grid md:grid-cols-4 gap-3 items-center">
            {/* Search Input */}
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t('soldVehicles.searchPlaceholder')}
                className="w-full h-10 rounded-full border border-slate-300 bg-white pl-10 pr-4 text-xs font-bold text-slate-900 outline-none transition hover:border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 placeholder:text-slate-400 shadow-xs"
              />
            </div>

            {/* Category Select */}
            <CustomSelect
              value={selectedCategory}
              onChange={(val) => {
                setSelectedCategory(val);
                setCurrentPage(1);
              }}
              options={categoryOptions}
              icon={<Layers size={14} className="text-amber-500" />}
            />

            {/* Brand Select */}
            <CustomSelect
              value={selectedBrand}
              onChange={(val) => {
                setSelectedBrand(val);
                setCurrentPage(1);
              }}
              options={brandOptions}
              icon={<Tag size={14} className="text-amber-500" />}
            />

            {/* Sort Select */}
            <CustomSelect
              value={sortBy}
              onChange={(val) => {
                setSortBy(val as typeof sortBy);
                setCurrentPage(1);
              }}
              options={sortOptions}
              icon={<ArrowUpDown size={14} className="text-amber-500" />}
            />
          </div>

          {/* Mobile Filter Bar (< md: 2 rows) */}
          <div className="md:hidden space-y-3">
            {/* Row 1: Search Input + Sort Icon Button right on the right side! */}
            <div className="flex items-center gap-2.5 w-full">
              <div className="relative flex-1 min-w-0">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={t('soldVehicles.searchPlaceholder')}
                  className="w-full h-11 rounded-full border border-slate-300 bg-white pl-10 pr-4 text-xs font-bold text-slate-900 outline-none transition hover:border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 placeholder:text-slate-400 shadow-xs"
                />
              </div>

              {/* Sort Icon Only Button on the right side of search */}
              <SortIconButton
                value={sortBy}
                onChange={(val) => {
                  setSortBy(val as typeof sortBy);
                  setCurrentPage(1);
                }}
                options={sortOptions}
              />
            </div>

            {/* Row 2: Category & Brand Dropdowns side-by-side */}
            <div className="grid grid-cols-2 gap-2.5 items-center">
              <CustomSelect
                value={selectedCategory}
                onChange={(val) => {
                  setSelectedCategory(val);
                  setCurrentPage(1);
                }}
                options={categoryOptions}
                icon={<Layers size={14} className="text-amber-500" />}
              />

              <CustomSelect
                value={selectedBrand}
                onChange={(val) => {
                  setSelectedBrand(val);
                  setCurrentPage(1);
                }}
                options={brandOptions}
                icon={<Tag size={14} className="text-amber-500" />}
                dropdownClassName="right-0 sm:left-0"
              />
            </div>
          </div>

          {/* Results Count & Active Filters Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
            <div>
              {t('soldVehicles.showingCount', { count: filteredListings.length })}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="font-bold text-amber-600 hover:text-amber-700 hover:underline transition"
              >
                {t('soldVehicles.clearFilters')}
              </button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-xs space-y-3">
            <BrandLoader
              size="md"
              variant="section"
              bg="light"
              text={t('soldVehicles.loading')}
              initialLogoUrl={initialLogoUrl}
            />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : filteredListings.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 sm:p-16 text-center shadow-xs space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Truck size={32} />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-lg font-bold text-slate-900">{t('soldVehicles.noResultsTitle')}</h3>
              <p className="text-xs text-slate-500">
                {t('soldVehicles.noResultsDescription')}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="rounded-full border border-slate-300 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                >
                  {t('soldVehicles.resetFilters')}
                </button>
              )}
              <Link
                href="/machines"
                className="rounded-full bg-[#FFC107] px-6 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-yellow-500 transition shadow-xs"
              >
                {t('soldVehicles.browseAvailable')}
              </Link>
            </div>
          </div>
        ) : (
          /* Grid of Sold Machine Cards */
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
              {paginatedListings.map((item) => {
                const locationLabel = formatListingLocation(item, {
                  includeAddress: true,
                  fallback: 'India',
                });
                const imageUrl = getMediaUrl(item.featuredImage);
                const brandDisplay = formatBrandDisplay(item.brand?.name || '');

                return (
                  <Link
                    key={item.id}
                    href={generateMachineSlugPath(item)}
                    className="group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-amber-400 hover:shadow-lg"
                  >
                    {/* 1. Image Container with Badges */}
                    <div className="relative aspect-[16/9.5] w-full shrink-0 overflow-hidden bg-gray-100">
                      {/* Top Overlay Badge: Red SOLD */}
                      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                        <CheckCircle2 size={11} strokeWidth={2.5} className="text-white" />
                        <span>Sold</span>
                      </div>

                      {/* Category pill */}
                      {item.category?.name && (
                        <div className="absolute top-2 left-2 z-10 rounded-md bg-black/65 px-2 py-0.5 text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md border border-white/10 shadow-xs">
                          {item.category.name}
                        </div>
                      )}

                      {/* Year model badge */}
                      {item.manufacturingYear ? (
                        <div className="absolute bottom-2 right-2 z-10 rounded-md bg-gray-950/85 px-2 py-0.5 text-[9.5px] sm:text-[10px] font-bold text-amber-400 backdrop-blur-md border border-amber-500/25 shadow-xs">
                          {item.manufacturingYear} Model
                        </div>
                      ) : null}

                      {/* Photos count */}
                      {item.mediaCount > 1 && (
                        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-md bg-black/65 px-2 py-0.5 text-[9.5px] sm:text-[10px] font-medium text-white backdrop-blur-md border border-white/10 shadow-xs">
                          <Camera size={10} className="text-amber-400" />
                          <span>{item.mediaCount} Photos</span>
                        </div>
                      )}

                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={`${item.title} sold machine${locationLabel ? ` in ${locationLabel}` : ''}`}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center bg-gray-100 text-gray-400 gap-1.5">
                          <Truck className="h-8 w-8 opacity-30 text-gray-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Sold Equipment</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Card Content Body */}
                    <div className="flex flex-1 flex-col p-3 sm:p-3.5 lg:p-4">
                      {/* Brand & Model subtitle */}
                      <div className="flex items-center gap-1.5 text-[10.5px] sm:text-[11px] font-semibold text-gray-500 mb-1 min-w-0">
                        <span className="text-amber-700 font-bold uppercase tracking-wider truncate max-w-[60%] shrink-0">
                          {brandDisplay.main !== 'Unknown' ? brandDisplay.main : 'Heavy Equipment'}
                        </span>
                        {item.model?.name && (
                          <>
                            <span className="text-gray-300 shrink-0">•</span>
                            <span className="text-gray-600 truncate font-medium">{item.model.name}</span>
                          </>
                        )}
                      </div>

                      {/* Machine Title */}
                      <h3
                        className="line-clamp-1 sm:line-clamp-2 text-sm sm:text-[14.5px] font-bold text-gray-900 leading-snug transition-colors group-hover:text-amber-600"
                        title={item.title}
                      >
                        {item.title}
                      </h3>

                      {/* Price & Sold Status Tag */}
                      <div className="mt-1.5 sm:mt-2 flex items-baseline justify-between gap-2 flex-wrap">
                        <div className="text-base sm:text-lg lg:text-xl font-black text-gray-950 tracking-tight">
                          {formatPrice(item.price)}
                        </div>
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[9.5px] sm:text-[10px] font-bold text-red-700 border border-red-200 shrink-0">
                          Sold
                        </span>
                      </div>

                      {/* 3. Specifications Grid */}
                      <div className="mt-2.5 sm:mt-3 grid grid-cols-3 gap-1 rounded-xl border border-gray-100/90 bg-gray-50/70 p-1.5 sm:p-2">
                        {/* Manufacturing Year */}
                        <div className="flex flex-col items-center justify-center text-center px-0.5 min-w-0">
                          <div className="flex items-center gap-1 text-[9.5px] sm:text-[10px] font-semibold uppercase text-gray-400">
                            <CalendarRange size={10} className="text-amber-500 shrink-0" />
                            <span className="truncate">Year</span>
                          </div>
                          <span className="mt-0.5 text-[11px] sm:text-xs font-bold text-gray-900 truncate w-full">
                            {item.manufacturingYear || 'N/A'}
                          </span>
                        </div>

                        {/* Operating Hours */}
                        <div className="flex flex-col items-center justify-center text-center px-0.5 min-w-0 border-x border-gray-200/60">
                          <div className="flex items-center gap-1 text-[9.5px] sm:text-[10px] font-semibold uppercase text-gray-400">
                            <Gauge size={10} className="text-amber-500 shrink-0" />
                            <span className="truncate">Hours</span>
                          </div>
                          <span className="mt-0.5 text-[11px] sm:text-xs font-bold text-gray-900 truncate w-full">
                            {item.operatingHours ? `${item.operatingHours.toLocaleString('en-IN')}h` : 'N/A'}
                          </span>
                        </div>

                        {/* Status */}
                        <div className="flex flex-col items-center justify-center text-center px-0.5 min-w-0">
                          <div className="flex items-center gap-1 text-[9.5px] sm:text-[10px] font-semibold uppercase text-gray-400">
                            <CheckCircle2 size={10} className="text-red-500 shrink-0" />
                            <span className="truncate">Status</span>
                          </div>
                          <span className="mt-0.5 text-[11px] sm:text-xs font-bold text-red-600 truncate uppercase w-full">
                            Sold
                          </span>
                        </div>
                      </div>

                      {/* 4. Footer: Location & View Action CTA */}
                      <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2 text-[11px] sm:text-xs text-gray-500">
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <span className="truncate font-medium">{locationLabel}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 shrink-0 font-bold text-amber-600 group-hover:text-amber-700 transition-colors">
                          <span>View Details</span>
                          <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-6">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="px-3 text-xs font-bold text-slate-700">
                  {t('soldVehicles.pageInfo', { current: currentPage, total: totalPages })}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}

          </>
        )}
      </main>
    </div>
  );
}
