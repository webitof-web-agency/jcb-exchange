"use client";

import Image from 'next/image';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, Shapes, Truck, ChevronRight, LayoutGrid, ChevronDown, ArrowUpDown } from 'lucide-react';
import api, { API_ORIGIN } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

type PublicCategory = {
  id: string;
  name: string;
  count: number;
  featuredImage: string | null;
  icon?: {
    id: string;
    name: string;
    svgData: string;
  } | null;
};

import CategoryIconRenderer from '@/components/shared/CategoryIconRenderer';

function CategoryIconBadge({ icon, name }: { icon?: PublicCategory['icon']; name: string }) {
  return (
    <div className="flex h-8 w-8 md:h-12 md:w-12 items-center justify-center rounded-full border border-yellow-100 bg-[#fff8db] text-gray-700 shadow-sm shrink-0">
      <CategoryIconRenderer
        svgData={icon?.svgData}
        name={name}
        className="flex h-4 w-4 md:h-6 md:w-6 items-center justify-center text-gray-700"
      />
      <span className="sr-only">{name}</span>
    </div>
  );
}

const getMediaUrl = (url: string | null) => {
  if (!url) {
    return null;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
};

const formatMachineCount = (count: number) =>
  new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(count);

export default function CategoriesPageClient() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('popular');

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const response = await api.get<{ success: boolean; data: PublicCategory[] }>('/master/public-categories');
        if (!cancelled && response.data?.success) {
          setCategories(response.data.data || []);
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCategories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    let result = categories;
    
    if (normalizedSearch) {
      result = result.filter((category) => category.name.toLowerCase().includes(normalizedSearch));
    }
    
    // Apply sorting
    result = [...result].sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'name-desc') {
        return b.name.localeCompare(a.name);
      } else { // popular
        return b.count - a.count;
      }
    });

    return result;
  }, [categories, search, sortBy]);

  const totalMachines = useMemo(
    () => categories.reduce((sum, category) => sum + category.count, 0),
    [categories]
  );

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10">
        
        {/* Header - Outside the card */}
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 pb-4">
          <div className="flex-shrink-0">
            <h2 className="text-[28px] sm:text-3xl font-black text-gray-900 tracking-tight">{t('categories.allCategories') || 'All Categories'}</h2>
          </div>

          <div className="relative w-full md:max-w-md xl:max-w-[300px]">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('categories.searchPlaceholder') || 'Search categories...'}
              className="w-full h-10 rounded-full border border-gray-300 bg-white pl-9 pr-3 text-xs font-semibold text-gray-700 shadow-sm outline-none transition focus:border-jcb-yellow focus:ring-1 focus:ring-jcb-yellow"
            />
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        {/* The Card containing ONLY the grid */}
        <section className="sm:rounded-[28px] sm:border sm:border-gray-200 sm:bg-white sm:p-7 relative z-10">
          <div className="flex flex-row items-center justify-between mb-4 sm:mb-6 gap-3 sm:border-b sm:border-gray-100 pb-2 sm:pb-4">
            
            {/* Desktop Left Side Stats */}
            <div className="hidden sm:flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-bold text-gray-500">{categories.length}</span>
                <span className="text-sm font-bold text-gray-500">Categories</span>
              </div>
              <div className="h-4 w-[2px] bg-gray-200"></div>
              <Link href="/machines" className="group flex items-center gap-1.5 transition-colors">
                <span className="text-[15px] font-bold text-gray-500 group-hover:text-jcb-yellow transition-colors">{totalMachines}</span>
                <span className="text-sm font-bold text-gray-500 group-hover:text-jcb-yellow transition-colors">Machines</span>
                <ArrowRight className="h-4 w-4 ml-1 text-gray-400 group-hover:text-jcb-yellow transition-colors" strokeWidth={3} />
              </Link>
            </div>

            {/* Right Side Sort & Mobile Stats */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:block text-sm font-semibold text-gray-500 mr-1">Sort by:</div>
              <SortDropdown value={sortBy} onChange={setSortBy} />
            </div>
            <span className="text-[12px] font-medium text-gray-500 sm:hidden">{categories.length} categories</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={`category-loading-${index}`} className="h-[180px] sm:h-[220px] md:h-[260px] animate-pulse rounded-2xl border border-gray-100 bg-[#fcfbf8]" />
              ))}
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-[#fcfbf8] px-6 py-16 text-center">
              <Shapes className="h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-xl font-bold text-gray-900">{t('categories.noCategoriesFound')}</h3>
              <p className="mt-2 max-w-md text-sm text-gray-500">
                {t('categories.noCategoriesDescription')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
              {filteredCategories.map((category) => (
                <Link
                  href={`/machines?category=${category.id}`}
                  key={category.id}
                  className="group flex flex-col overflow-hidden rounded-[16px] sm:rounded-[20px] border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md hover:-translate-y-1 hover:border-gray-300"
                >
                  <div className="relative h-[110px] sm:h-[140px] md:h-[160px] w-full overflow-hidden bg-[#f4f2ea]">
                    {category.featuredImage ? (
                      <Image
                        src={getMediaUrl(category.featuredImage) || category.featuredImage}
                        alt={`${category.name} heavy equipment`}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-gray-400">No Image</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 sm:p-4 md:p-5">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className="flex h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-full bg-[#fff5d0] text-gray-800">
                        <CategoryIconRenderer svgData={category.icon?.svgData} name={category.name} className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-gray-900 text-[13px] sm:text-sm md:text-[15px] truncate">{category.name}</h4>
                        <p className="mt-0.5 text-[10px] sm:text-[11px] md:text-xs font-semibold text-gray-500 truncate">
                          {category.count} live machines
                        </p>
                      </div>
                    </div>
                    <div className="flex h-5 w-5 sm:h-6 sm:w-6 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-400 transition-colors group-hover:bg-gray-100 group-hover:text-gray-700">
                      <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" strokeWidth={3} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

function SortDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  
  const options = [
    { value: 'popular', label: t('categories.sortPopular') || 'Popular' },
    { value: 'name-asc', label: t('categories.sortNameAsc') || 'Name (A-Z)' },
    { value: 'name-desc', label: t('categories.sortNameDesc') || 'Name (Z-A)' },
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

  return (
    <div className="relative w-full sm:w-auto" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-full border border-gray-300 bg-white px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-jcb-yellow focus:ring-1 focus:ring-jcb-yellow hover:bg-gray-50 gap-2 min-w-[140px] sm:min-w-[160px]"
      >
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" />
          <span>{selectedOption.label}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full min-w-[140px] sm:min-w-[160px] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-lg right-0 animate-in fade-in slide-in-from-top-2 duration-200">
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
