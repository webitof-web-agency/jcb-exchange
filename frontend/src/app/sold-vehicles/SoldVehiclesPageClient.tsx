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
} from 'lucide-react';
import { generateMachineSlugPath } from '@/lib/seoUtils';
import { useTranslation } from '@/hooks/useTranslation';

interface MachineListing {
  id: string;
  title: string;
  price: number;
  isNegotiable: boolean;
  manufacturingYear: number | null;
  operatingHours: number | null;
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
}

function CustomSelect({ value, onChange, options, icon, className = '' }: CustomSelectProps) {
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
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full min-w-[200px] max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
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
        <div className="absolute right-0 top-full z-50 mt-1.5 w-48 sm:w-52 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
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

export default function SoldVehiclesPageClient() {
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
        const [soldListingsRes, allListingsRes] = await Promise.all([
          api.get('/master/public-listings?status=SOLD').catch(() => ({ data: { data: [] } })),
          api.get('/master/public-listings').catch(() => ({ data: { data: [] } })),
        ]);

        if (isCancelled) return;

        let rawSoldListings: MachineListing[] = soldListingsRes.data?.data || [];
        if (rawSoldListings.length === 0 && allListingsRes.data?.data) {
          const allListings = allListingsRes.data.data as MachineListing[];
          rawSoldListings = allListings.filter(
            (item) => String(item.status || '').toUpperCase() === 'SOLD'
          );
        }

        setListings(rawSoldListings);
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
      ...list.map((b) => ({ value: b.id, label: `${b.name} (${b.count})` })),
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
      <section className="relative overflow-hidden bg-slate-900 px-4 py-10 sm:px-6 sm:py-14 lg:px-8 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,193,7,0.18),transparent_60%),linear-gradient(135deg,#0f172a_0%,#1e293b_100%)]" />

        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-col items-start gap-2">
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
              {t('soldVehicles.title')}
            </h1>

            <p className="max-w-2xl text-xs sm:text-base text-slate-300 leading-relaxed">
              {t('soldVehicles.subtitle')}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Link href="/machines" className="text-sm font-bold text-[#FFC107] hover:text-yellow-300">
                Browse available machines
              </Link>
              <Link href="/dealers" className="text-sm font-bold text-[#FFC107] hover:text-yellow-300">
                Explore dealers
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
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
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent" />
            <p className="text-sm font-semibold text-slate-600">{t('soldVehicles.loading')}</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {paginatedListings.map((item) => {
                const locationLabel = [item.locationCity, item.locationState].filter(Boolean).join(', ') || 'India';
                const imageUrl = getMediaUrl(item.featuredImage);
                // "gadi ka name likha ho": We will use item.title directly instead of brand/model logic
                const finalTitle = item.title || 'Equipment';
                const formattedDate = new Date(item.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

                return (
                  <Link
                    key={item.id}
                    href={generateMachineSlugPath(item)}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-slate-300"
                  >
                    {/* Featured Image */}
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={`${finalTitle} sold machine${locationLabel ? ` in ${locationLabel}` : ''}`}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                          <Truck size={48} strokeWidth={1} />
                        </div>
                      )}

                      {/* Top Overlay Badge: Red SOLD */}
                      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-sm bg-[#ff3b40] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-sm">
                        <CheckCircle2 size={11} strokeWidth={3} className="text-white" />
                        <span>Sold</span>
                      </div>

                      {/* Pill */}
                      {item.manufacturingYear ? (
                        <div className="absolute bottom-3 right-3 z-10 bg-slate-900/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-md border border-white/20 rounded-[4px]">
                          {item.manufacturingYear} Model
                        </div>
                      ) : null}
                    </div>

                    {/* Details Container */}
                    <div className="flex flex-1 flex-col p-4 sm:p-5">
                      {/* Title */}
                      <h3 className="line-clamp-2 text-[17px] font-bold text-slate-900 leading-tight">
                        {finalTitle}
                      </h3>

                      {/* Location */}
                      <div className="mt-1.5 mb-4 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <MapPin size={14} className="shrink-0" />
                        <span className="truncate">{locationLabel}</span>
                      </div>

                      {/* Specs Box */}
                      <div className="mb-5 grid grid-cols-2 bg-slate-50 border border-slate-200 rounded-[6px]">
                        <div className="py-2.5 px-3 border-r border-slate-200 flex flex-col justify-center">
                          <div className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            <CalendarRange size={11} className="text-amber-500" />
                            <span>Year</span>
                          </div>
                          <div className="text-[15px] font-extrabold text-slate-900">{item.manufacturingYear || 'N/A'}</div>
                        </div>
                        <div className="py-2.5 px-3 flex flex-col justify-center">
                          <div className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            <Gauge size={11} className="text-amber-500" />
                            <span>Hours</span>
                          </div>
                          <div className="text-[15px] font-extrabold text-slate-900">{item.operatingHours ? `${item.operatingHours.toLocaleString('en-US')} hrs` : 'N/A'}</div>
                        </div>
                      </div>

                      {/* Footer Details */}
                      <div className="mt-auto flex items-end justify-between">
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Sold Price</div>
                          <div className="text-sm font-bold text-slate-800">{formatPrice(item.price)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            {item.partner?.type ? `${item.partner.type.toLowerCase()}` : 'Sold By'}
                          </div>
                          <div className="text-sm font-bold text-slate-800 truncate max-w-[130px]">
                            {item.partner?.name || formattedDate}
                          </div>
                        </div>
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

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
              <div className="max-w-4xl space-y-4 text-sm leading-7 text-slate-600">
                <h2 className="text-2xl font-extrabold text-slate-900">Use sold listings to understand pricing and demand</h2>
                <p>
                  Sold equipment data gives buyers and sellers useful context around market movement, machine popularity, and realistic
                  price expectations. Reviewing completed transactions can help you benchmark similar equipment before you shortlist active inventory.
                </p>
                <p>
                  When you are ready to compare available options, go back to the <Link href="/machines" className="font-bold text-[#c69200] hover:text-amber-600">live machines marketplace</Link>.
                  You can also browse <Link href="/dealers" className="font-bold text-[#c69200] hover:text-amber-600">verified dealers</Link> or explore
                  <Link href="/categories" className="ml-1 font-bold text-[#c69200] hover:text-amber-600">equipment categories</Link> for a more focused search.
                </p>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
