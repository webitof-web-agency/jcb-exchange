"use client";

import Image from 'next/image';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, Shapes } from 'lucide-react';
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
    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-yellow-100 bg-[#fff8db] text-gray-700 shadow-sm">
      <CategoryIconRenderer
        svgData={icon?.svgData}
        name={name}
        className="flex h-6 w-6 items-center justify-center text-gray-700"
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
    if (!normalizedSearch) {
      return categories;
    }

    return categories.filter((category) => category.name.toLowerCase().includes(normalizedSearch));
  }, [categories, search]);

  const totalMachines = useMemo(
    () => categories.reduce((sum, category) => sum + category.count, 0),
    [categories]
  );

  return (
    <div className="min-h-screen bg-[#f6f4ef] pb-16 pt-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#111827_0%,#1f2937_55%,#3a321d_100%)] px-6 py-10 text-white shadow-xl sm:px-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.35em] text-jcb-yellow">{t('categories.browseCategories')}</p>
              <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
                {t('categories.heroTitle')}
              </h1>
              <p className="mt-4 max-w-xl text-sm text-white/75 sm:text-base">
                {t('categories.heroDescription')}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/55">{t('categories.liveCategories')}</p>
                <p className="mt-2 text-3xl font-black text-white">{formatMachineCount(categories.length)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/55">{t('categories.publishedMachines')}</p>
                <p className="mt-2 text-3xl font-black text-jcb-yellow">{formatMachineCount(totalMachines)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-gray-900">{t('categories.allCategories')}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {t('categories.allCategoriesDescription')}
              </p>
              <div className="mt-3">
                <Link href="/machines" className="text-sm font-bold text-jcb-yellow hover:text-yellow-600">
                  View all machines
                </Link>
              </div>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('categories.searchPlaceholder')}
                className="w-full rounded-xl border border-gray-200 bg-[#faf8f3] py-3 pl-11 pr-4 text-sm font-medium text-gray-800 outline-none transition focus:border-jcb-yellow"
              />
            </div>
          </div>

          <div className="mt-6">
            {loading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`category-loading-${index}`} className="h-[310px] animate-pulse rounded-2xl border border-gray-100 bg-[#fcfbf8] p-5" />
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
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredCategories.map((category) => (
                    <Link
                      href={`/machines?category=${category.id}`}
                      key={category.id}
                      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-[#fcfbf8] p-5 transition-all hover:-translate-y-1 hover:border-jcb-yellow/40 hover:shadow-lg"
                    >
                    <div className="mb-4 flex items-start justify-between">
                      <CategoryIconBadge icon={category.icon} name={category.name} />
                      <ArrowRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-jcb-yellow" />
                    </div>

                    <div>
                      <h3 className="text-xl font-extrabold text-gray-900">{category.name}</h3>
                      <p className="mt-2 text-sm font-semibold text-gray-500">
                        {t('categories.liveMachinesCount', { count: formatMachineCount(category.count) })}
                      </p>
                    </div>

                    <div className="relative mt-5 h-48 overflow-hidden rounded-xl bg-white">
                      {category.featuredImage ? (
                        <Image
                          src={getMediaUrl(category.featuredImage) || category.featuredImage}
                          alt={`${category.name} heavy equipment category`}
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#fff7db] to-[#efe9de]">
                          <span className="px-4 text-center text-sm font-bold uppercase tracking-[0.26em] text-gray-500">
                            {category.name}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-gray-200 pt-4">
                      <span className="text-xs font-bold uppercase tracking-[0.24em] text-gray-400">{t('categories.categoryView')}</span>
                      <span className="text-sm font-bold text-gray-900 group-hover:text-jcb-yellow">
                        {t('categories.browseMachines')}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="max-w-4xl space-y-4 text-sm leading-7 text-gray-600">
            <h2 className="text-2xl font-extrabold text-gray-900">Explore equipment categories with real market demand</h2>
            <p>
              Browse machine categories to quickly narrow down verified listings for backhoe loaders, excavators, telehandlers,
              compact equipment, and other heavy machinery commonly searched across India. Each category page helps buyers move
              faster from discovery to comparison without losing track of active listings.
            </p>
            <p>
              If you already know the type of machine you need, continue to the <Link href="/machines" className="font-bold text-jcb-yellow hover:text-yellow-600">full machines marketplace</Link>.
              If you want help from businesses operating in your region, explore <Link href="/dealers" className="font-bold text-jcb-yellow hover:text-yellow-600">verified dealers</Link> before making contact.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
