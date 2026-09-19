"use client";

import Image from 'next/image';
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, MapPin, ChevronDown, ArrowRight, Package, Briefcase, Sparkles, Building2, Users } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import api, { API_ORIGIN } from '@/lib/api';
import { generateMachineSlugPath } from '@/lib/seoUtils';
import { useTranslation } from '@/hooks/useTranslation';
import CategoryIconRenderer from '@/components/shared/CategoryIconRenderer';

type FinanceSupportItem = {
  id: string;
  name: string;
  imageUrl: string;
  displayOrder: number;
};

type InspectionSectionContent = {
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

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

type PublicSearchLocation = {
  name: string;
  count: number;
};

type PublicSearchFilters = {
  categories: PublicCategory[];
  locations: PublicSearchLocation[];
};

type FeaturedJobItem = {
  id: string;
  title: string;
  slug: string;
  locationCity: string;
  locationState: string;
  employmentType: string;
  workMode: string;
  vacancies: number;
  department?: { name: string };
};

const getListingStatusBadge = (status?: string | null) => {
  const normalizedStatus = String(status || '').trim().toUpperCase();

  if (normalizedStatus === 'SOLD') {
    return 'bg-red-600 text-white';
  }

  if (normalizedStatus === 'RESERVED') {
    return 'bg-amber-500 text-white';
  }

  return 'bg-green-600 text-white';
};

const getListingStatusLabel = (
  status: string | null | undefined,
  labels: {
    sold: string;
    reserved: string;
    available: string;
  }
) => {
  const normalizedStatus = String(status || '').trim().toUpperCase();

  if (normalizedStatus === 'SOLD') {
    return labels.sold;
  }

  if (normalizedStatus === 'RESERVED') {
    return labels.reserved;
  }

  return labels.available;
};

const getMediaUrl = (url: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
};

export default function Home() {
  const { t } = useTranslation();
  const { recentListings } = useNotificationStore();
  const [financeSupportItems, setFinanceSupportItems] = React.useState<FinanceSupportItem[]>([]);
  const [heroImageUrl, setHeroImageUrl] = React.useState<string | null>(null);
  const [heroHeadline, setHeroHeadline] = React.useState('');
  const [inspectionContent, setInspectionContent] = React.useState<InspectionSectionContent | null>(null);
  const [browseCategories, setBrowseCategories] = React.useState<PublicCategory[]>([]);
  const [searchCategories, setSearchCategories] = React.useState<PublicCategory[]>([]);
  const [searchLocations, setSearchLocations] = React.useState<PublicSearchLocation[]>([]);
  const [featuredJobs, setFeaturedJobs] = React.useState<FeaturedJobItem[]>([]);

  // Hero Search States
  const router = useRouter();
  const [heroSearchQuery, setHeroSearchQuery] = React.useState('');
  const [heroSearchCategory, setHeroSearchCategory] = React.useState('');
  const [heroSearchLocation, setHeroSearchLocation] = React.useState('');
  const [isLocationSuggestionsOpen, setIsLocationSuggestionsOpen] = React.useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = React.useState(false);

  const handleHeroSearch = () => {
    const params = new URLSearchParams();
    if (heroSearchQuery.trim()) params.set('q', heroSearchQuery.trim());
    if (heroSearchCategory) params.set('category', heroSearchCategory);
    if (heroSearchLocation.trim()) params.set('location', heroSearchLocation.trim());
    router.push(`/machines?${params.toString()}`);
  };

  const visibleLocationSuggestions = React.useMemo(() => {
    const query = heroSearchLocation.trim().toLowerCase();
    const source = searchLocations;

    if (!query) {
      return source.slice(0, 6);
    }

    return source
      .filter((location) => location.name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [heroSearchLocation, searchLocations]);

  const heroHeadlineLines = React.useMemo(
    () => heroHeadline.split('\n').filter((line) => line.trim().length > 0),
    [heroHeadline]
  );
  const uniqueFinanceSupportItems = React.useMemo(() => {
    const seen = new Set<string>();
    return financeSupportItems.filter((item) => {
      if (!item.imageUrl) return false;

      const key = `${item.id}:${item.name.trim().toLowerCase()}:${item.imageUrl}`;
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }, [financeSupportItems]);
  const listingStatusLabels = React.useMemo(
    () => ({
      sold: t('machines.sold'),
      reserved: t('machines.reserved'),
      available: t('machines.available'),
    }),
    [t]
  );

  React.useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [financeRes, heroRes, inspectionRes, categoriesRes, filtersRes, jobsRes] = await Promise.all([
          api.get<{ success: boolean; data: FinanceSupportItem[] }>('/master/finance-support').catch(() => null),
          api.get<{ success: boolean; data: { imageUrl: string | null; headline?: string | null } }>('/master/hero-image').catch(() => null),
          api.get<{ success: boolean; data: InspectionSectionContent }>('/master/inspection-section').catch(() => null),
          api.get<{ success: boolean; data: PublicCategory[] }>('/master/public-categories').catch(() => null),
          api.get<{ success: boolean; data: PublicSearchFilters }>('/master/public-search-filters').catch(() => null),
          api.get<{ success: boolean; jobs: FeaturedJobItem[] }>('/recruitment/public/jobs?limit=4').catch(() => null),
        ]);

        if (cancelled) return;

        if (financeRes?.data?.success) {
          setFinanceSupportItems(financeRes.data.data || []);
        } else {
          setFinanceSupportItems([]);
        }

        if (heroRes?.data?.success && heroRes.data.data?.imageUrl) {
          setHeroImageUrl(heroRes.data.data.imageUrl);
        }

        if (heroRes?.data?.success) {
          setHeroHeadline(heroRes.data.data?.headline || '');
        } else {
          setHeroHeadline('');
        }

        if (inspectionRes?.data?.success) {
          setInspectionContent(inspectionRes.data.data || null);
        } else {
          setInspectionContent(null);
        }

        if (categoriesRes?.data?.success) {
          setBrowseCategories(categoriesRes.data.data || []);
        } else {
          setBrowseCategories([]);
        }

        if (filtersRes?.data?.success) {
          setSearchCategories(filtersRes.data.data?.categories || []);
          setSearchLocations(filtersRes.data.data?.locations || []);
        } else {
          setSearchCategories([]);
          setSearchLocations([]);
        }

        if (jobsRes?.data?.success) {
          setFeaturedJobs(jobsRes.data.jobs || []);
        } else {
          setFeaturedJobs([]);
        }
      } catch {
        if (!cancelled) {
          setFinanceSupportItems([]);
          setHeroHeadline('');
          setInspectionContent(null);
          setHeroImageUrl(null);
          setBrowseCategories([]);
          setSearchCategories([]);
          setSearchLocations([]);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const categoryOptions = searchCategories.length > 0 ? searchCategories : browseCategories;

  const renderFinanceCard = (item: FinanceSupportItem, key: string) => (
    <div
      key={key}
      className="relative flex h-[80px] w-[220px] sm:w-[240px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-900 shadow-md transition-transform hover:scale-105"
    >
      {/* Full Card Image */}
      <Image
        src={getMediaUrl(item.imageUrl) || item.imageUrl}
        alt={`${item.name} finance support partner on JCB Exchange`}
        fill
        sizes="(max-width: 640px) 220px, 240px"
        className="object-cover opacity-80 transition-opacity hover:opacity-100"
      />

      {/* Brand Name Overlaid */}
      <div className="relative z-10 px-4 text-center pointer-events-none">
        <p className="truncate text-[15px] font-extrabold uppercase tracking-widest text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {item.name}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen">

      {/* 1. HERO SECTION */}
      <section className="relative w-full min-h-[500px] md:h-[600px] flex flex-col items-center justify-center pt-24 pb-16 md:py-0">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0 bg-[#1C1C1C]">
          <Image
            src={heroImageUrl ? (getMediaUrl(heroImageUrl) || heroImageUrl) : "/images/jcbhero.png"}
            alt="Heavy machinery marketplace hero banner"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 text-center px-4 w-full max-w-5xl md:mb-12 md:mt-[-60px] mt-0 mb-8">
          {heroHeadlineLines.length > 0 ? (
            <h1 className="text-[26px] sm:text-4xl md:text-6xl lg:text-7xl font-extrabold text-white mb-4 sm:mb-6 tracking-tight leading-tight md:leading-[1.1] drop-shadow-lg">
              {heroHeadlineLines.map((line, index) => (
                <React.Fragment key={`${line}-${index}`}>
                  {line}
                  {index < heroHeadlineLines.length - 1 ? <br /> : null}
                </React.Fragment>
              ))}
            </h1>
          ) : (
            <h1 className="text-[26px] sm:text-4xl md:text-6xl lg:text-7xl font-extrabold text-white mb-4 sm:mb-6 tracking-tight leading-tight md:leading-[1.1] drop-shadow-lg">
              Find the Right Machine for Your Next Job
            </h1>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative md:absolute md:bottom-[-45px] z-20 w-full max-w-[1200px] px-3 sm:px-4 md:left-1/2 md:-translate-x-1/2">
          <div className="bg-[#FAF8F5] p-2.5 sm:p-4 md:p-6 rounded-lg shadow-2xl flex flex-col md:flex-row gap-2.5 sm:gap-4 border border-gray-100 w-full">

            {/* Input 1 */}
            <div className="flex-1 flex items-center bg-[#F3EFE9] border border-[#E8E1D7] rounded-[4px] px-3 sm:px-4 py-1.5 sm:py-3.5 hover:border-gray-400 focus-within:border-gray-400 transition-colors">
              <Search className="text-gray-600 mr-2 sm:mr-3 shrink-0 h-4 w-4 sm:h-5 sm:w-5" />
              <div className="flex flex-col w-full">
                <input 
                  type="text" 
                  placeholder={t('home.searchPlaceholder')}
                  value={heroSearchQuery}
                  onChange={(e) => setHeroSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleHeroSearch()}
                  className="w-full bg-transparent outline-none text-gray-900 placeholder:text-gray-600 text-xs sm:text-sm font-semibold" 
                />
              </div>
            </div>

            {/* Input 2 */}
            <div className="relative flex-1">
              <div 
                className="flex items-center justify-between bg-[#F3EFE9] border border-[#E8E1D7] rounded-[4px] px-3 sm:px-4 py-1.5 sm:py-3.5 cursor-pointer hover:border-gray-400 transition-colors w-full h-full"
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                onBlur={() => {
                  window.setTimeout(() => setIsCategoryDropdownOpen(false), 120);
                }}
                tabIndex={0}
              >
                <div className="flex flex-col w-full text-xs sm:text-sm font-semibold text-gray-900 truncate">
                  {heroSearchCategory 
                    ? categoryOptions.find(c => c.id === heroSearchCategory)?.name || t('home.allTypes')
                    : <span className="text-gray-600">{t('home.selectEquipmentType')}</span>}
                </div>
                <ChevronDown className="text-gray-600 shrink-0 ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              
              {isCategoryDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[240px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setHeroSearchCategory('');
                      setIsCategoryDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-gray-50 font-semibold"
                  >
                    {t('home.allTypes')}
                  </button>
                  {categoryOptions.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setHeroSearchCategory(cat.id);
                        setIsCategoryDropdownOpen(false);
                      }}
                      className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-gray-50 last:border-b-0"
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input 3 */}
            <div className="relative flex-1">
              <div className="flex items-center bg-[#F3EFE9] border border-[#E8E1D7] rounded-[4px] px-3 sm:px-4 py-1.5 sm:py-3.5 hover:border-gray-400 focus-within:border-gray-400 transition-colors">
                <MapPin className="text-gray-600 mr-2 sm:mr-3 shrink-0 h-4 w-4 sm:h-5 sm:w-5" />
                <div className="flex flex-col w-full">
                  <input 
                    type="text" 
                    placeholder={t('home.enterLocation')}
                    value={heroSearchLocation}
                    onFocus={() => setIsLocationSuggestionsOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setIsLocationSuggestionsOpen(false), 120);
                    }}
                    onChange={(e) => {
                      setHeroSearchLocation(e.target.value);
                      setIsLocationSuggestionsOpen(true);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleHeroSearch()}
                    className="w-full bg-transparent outline-none text-gray-900 placeholder:text-gray-600 text-xs sm:text-sm font-semibold" 
                  />
                </div>
              </div>
              {isLocationSuggestionsOpen && visibleLocationSuggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[240px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {visibleLocationSuggestions.map((location) => (
                    <button
                      key={location.name}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setHeroSearchLocation(location.name);
                        setIsLocationSuggestionsOpen(false);
                      }}
                      className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-gray-50 last:border-b-0"
                    >
                      <span className="truncate">{location.name}</span>
                      <span className="ml-4 shrink-0 text-xs text-gray-400">({location.count})</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Submit Button */}
            <button 
              onClick={handleHeroSearch}
              className="bg-jcb-yellow hover:bg-yellow-400 text-black font-bold text-sm sm:text-[15px] px-6 sm:px-8 py-2 sm:py-3.5 rounded-[4px] transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-sm"
            >
              {t('home.searchButton')} <ArrowRight size={18} className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.5} />
            </button>

          </div>
        </div>
      </section>

      {/* Spacer so the absolute positioned search bar doesn't overlap the next section's heading */}
      <div className="hidden md:block h-[60px] w-full bg-transparent"></div>



      {/* 2.5 SELECT YOUR PRODUCT */}
      <section className="py-12 sm:py-16 px-6 bg-[#FAF9F6] w-full">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl sm:text-[28px] font-bold sm:font-extrabold text-gray-900">{t('home.selectProduct')}</h2>
          </div>
          
          <div className="flex flex-col border-t border-gray-200">
            {browseCategories.length === 0 ? (
              <div className="py-12 flex justify-center space-x-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={`skel-${i}`} className="flex flex-col items-center animate-pulse">
                    <div className="h-16 w-16 bg-gray-200 rounded-full mb-4"></div>
                    <div className="h-3 w-20 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Desktop View (Rows of 4) */}
                <div className="hidden md:flex flex-col">
                  {Array.from({ length: Math.ceil(browseCategories.length / 4) }).map((_, rowIndex) => {
                    const row = browseCategories.slice(rowIndex * 4, rowIndex * 4 + 4);
                    return (
                      <div key={`desktop-row-${rowIndex}`} className="grid grid-cols-4 gap-4 py-8 border-b border-gray-200 last:border-b-0">
                        {row.map((category) => (
                          <Link 
                            href={`/machines?category=${category.id}`}
                            key={category.id} 
                            className="flex flex-col items-center justify-center cursor-pointer group hover:-translate-y-1 transition-transform duration-300"
                          >
                            <div className="h-12 sm:h-16 flex items-center justify-center mb-2 sm:mb-4">
                              <CategoryIconRenderer
                                svgData={category.icon?.svgData}
                                name={category.name}
                              />
                            </div>
                            <span className="text-xs sm:text-[13px] font-semibold sm:font-bold text-gray-900 text-center tracking-tight capitalize">{category.name}</span>
                          </Link>
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* Mobile View (Rows of 2) */}
                <div className="flex flex-col md:hidden">
                  {Array.from({ length: Math.ceil(browseCategories.length / 2) }).map((_, rowIndex) => {
                    const row = browseCategories.slice(rowIndex * 2, rowIndex * 2 + 2);
                    return (
                      <div key={`mobile-row-${rowIndex}`} className="grid grid-cols-2 gap-4 py-8 border-b border-gray-200 last:border-b-0">
                        {row.map((category) => (
                          <Link 
                            href={`/machines?category=${category.id}`}
                            key={category.id} 
                            className="flex flex-col items-center justify-center cursor-pointer group hover:-translate-y-1 transition-transform duration-300"
                          >
                            <div className="h-12 sm:h-16 flex items-center justify-center mb-2 sm:mb-4">
                              <CategoryIconRenderer
                                svgData={category.icon?.svgData}
                                name={category.name}
                              />
                            </div>
                            <span className="text-xs sm:text-[13px] font-semibold sm:font-bold text-gray-900 text-center tracking-tight capitalize">{category.name}</span>
                          </Link>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 2.75 SEARCH-FRIENDLY SERVICE SUMMARY */}
      <section className="w-full border-y border-gray-200 bg-white px-4 py-10 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">
              Construction Machinery Buy &amp; Sell
            </h2>
            <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-gray-600 sm:text-base">
              Find verified used construction equipment and pre-owned construction machines across India. Compare second hand JCB listings on JCB Exchange, explore commercial vehicle buy sell opportunities, and get help with used machine RTO services.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/machines"
              className="rounded-lg border border-gray-200 bg-[#FAF9F6] p-4 text-sm font-bold text-gray-900 transition-colors hover:border-jcb-yellow hover:bg-[#FFF9ED]"
            >
              Used Construction Equipment
            </Link>
            <Link
              href="/machines"
              className="rounded-lg border border-gray-200 bg-[#FAF9F6] p-4 text-sm font-bold text-gray-900 transition-colors hover:border-jcb-yellow hover:bg-[#FFF9ED]"
            >
              Second Hand JCB
            </Link>
            <Link
              href="/dealers"
              className="rounded-lg border border-gray-200 bg-[#FAF9F6] p-4 text-sm font-bold text-gray-900 transition-colors hover:border-jcb-yellow hover:bg-[#FFF9ED]"
            >
              Commercial Vehicle Buy Sell
            </Link>
            <Link
              href="/dealers"
              className="rounded-lg border border-gray-200 bg-[#FAF9F6] p-4 text-sm font-bold text-gray-900 transition-colors hover:border-jcb-yellow hover:bg-[#FFF9ED] sm:col-span-2 lg:col-span-1"
            >
              Used Machine RTO Services
            </Link>
            <Link
              href="/machines"
              className="rounded-lg border border-gray-200 bg-[#FAF9F6] p-4 text-sm font-bold text-gray-900 transition-colors hover:border-jcb-yellow hover:bg-[#FFF9ED]"
            >
              Pre-Owned Construction Machines
            </Link>
          </div>
        </div>
      </section>

      {/* 3. LATEST VEHICLES */}
      <section className="py-16 px-6 bg-[#2d2d2d] w-full">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 flex flex-col gap-3 border-b border-[#444] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-3xl font-extrabold text-jcb-yellow tracking-wider uppercase">{t('home.newSection')}</h2>
            <Link
              href="/machines"
              className="inline-flex items-center gap-2 text-sm font-bold text-white hover:text-jcb-yellow"
            >
              View all machines
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {recentListings.length === 0 ? (
              <div className="col-span-1 md:col-span-2 lg:col-span-4 min-h-[300px] flex flex-col items-center justify-center text-gray-400 bg-[#333] rounded-lg border border-[#444] border-dashed">
                <Package className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-base font-medium">{t('home.loadingLatestMachines')}</p>
              </div>
            ) : (
              recentListings.slice(0, 4).map((listing) => {
                const img = getMediaUrl(listing.featuredImage);
                return (
                  <Link href={generateMachineSlugPath(listing)} key={listing.id} className="bg-[#383838] border border-[#444] flex flex-col rounded-md overflow-hidden group hover:border-jcb-yellow transition-colors">
                    <div className="relative h-48 w-full bg-black flex items-center justify-center">
                      {img ? (
                        <Image
                          src={img}
                          alt={`${listing.title} available in ${listing.locationCity || 'India'}`}
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                          className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
                        />
                      ) : (
                        <Package className="w-12 h-12 text-[#555]" />
                      )}
                      <div className="absolute top-3 left-3 bg-jcb-yellow text-black px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm">
                        {t('home.justAdded')}
                      </div>
                      <div
                        className={`absolute top-3 right-3 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm ${getListingStatusBadge(
                          listing.status
                        )}`}
                      >
                        {getListingStatusLabel(listing.status, listingStatusLabels)}
                      </div>
                    </div>
                    <div className="p-4 flex flex-col flex-grow">
                      <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1 truncate">
                        {listing.categoryName || t('home.equipmentFallback')} • {listing.brandName || t('home.brandFallback')}
                      </p>
                      <h3 className="text-white font-bold text-base mb-3 line-clamp-2">{listing.title}</h3>
                      <div className="mt-auto flex justify-between items-end">
                        <div>
                          <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest mb-1">{t('home.priceLabel')}</p>
                          <p className="text-jcb-yellow text-lg font-bold">₹{(listing.price / 100000).toFixed(2)} Lakh</p>
                        </div>
                        <div className="text-gray-400 text-xs font-medium">
                          {listing.locationCity}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* 4. OUR FINANCE SUPPORT */}
      <section className="relative py-12 px-0 bg-[#FAF9F6] w-full border-y border-gray-200 border-dashed overflow-hidden">
        <div className="w-full px-6 mb-8">
          <h2 className="text-center text-xl md:text-2xl font-bold text-gray-900">{t('home.financeSupportTitle')}</h2>
        </div>

        {uniqueFinanceSupportItems.length === 0 ? (
          <div className="px-6 text-center text-sm text-gray-500">
            {t('home.financeSupportEmpty')}
          </div>
        ) : uniqueFinanceSupportItems.length === 1 ? (
          <div className="px-6">
            <div className="mx-auto flex max-w-sm justify-center">
              {renderFinanceCard(uniqueFinanceSupportItems[0], `single-${uniqueFinanceSupportItems[0].id}`)}
            </div>
          </div>
        ) : (
          <div className="finance-marquee-shell finance-marquee-bleed flex w-screen overflow-hidden">
            <div className="animate-marquee-left finance-marquee-track flex">
              {[0, 1].map((copy) => (
                <div className="finance-marquee-group flex shrink-0 items-center gap-5 px-8 py-2" key={`finance-copy-${copy}`}>
                  {uniqueFinanceSupportItems.map((item, index) =>
                    renderFinanceCard(item, `finance-${copy}-${item.id}-${index}`)
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 5. CERTIFIED & INSPECTED BY EXPERTS */}
      <section className="py-8 sm:py-10 px-4 sm:px-6 bg-[#FFF9ED] w-full">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-10 items-center">
          <div className="lg:w-1/2 text-center lg:text-left">
            {inspectionContent?.title ? (
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold sm:font-extrabold text-gray-900 mb-3 leading-tight">
                {inspectionContent.title}
              </h2>
            ) : null}
            {inspectionContent?.description ? (
              <p className="text-gray-600 font-medium mb-4 sm:mb-6 text-xs sm:text-sm leading-relaxed max-w-lg mx-auto lg:mx-0 whitespace-pre-line">
                {inspectionContent.description}
              </p>
            ) : null}

          </div>

          <div className="lg:w-1/2 relative">
            {/* The generated image */}
            <div className="relative rounded-xl overflow-hidden shadow-lg border-2 border-white max-h-[340px]">
              <Image
                src={inspectionContent?.imageUrl ? (getMediaUrl(inspectionContent.imageUrl) || inspectionContent.imageUrl) : "/images/inspection.png"}
                alt={inspectionContent?.title || 'Heavy equipment inspection support'}
                width={1200}
                height={800}
                sizes="(max-width: 1024px) 100vw, 50vw"
                style={{ width: '100%', height: 'auto' }}
                className="object-cover transition-transform duration-700 hover:scale-105"
              />
            </div>
          </div>
        </div>
        <div className="mx-auto mt-4 max-w-7xl px-0 text-center lg:text-left">
          <Link
            href="/dealers"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-900 hover:text-jcb-yellow"
          >
            Explore verified dealers
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* 6. CAREERS & OPEN POSITIONS SECTION */}
      <section className="py-8 sm:py-10 px-4 sm:px-6 bg-gray-50/80 text-gray-900 w-full border-t border-gray-200/80">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200/80 pb-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                <Sparkles size={12} className="text-amber-600" />
                <span>{t('careers.badge', 'Careers at JCB Exchange')}</span>
              </div>
              <h2 className="text-base sm:text-xl font-bold tracking-tight text-gray-900">
                {t('careers.homeHeading', "Join India's Leading Heavy Equipment Network")}
              </h2>
            </div>

            <Link
              href="/jobs"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs rounded-xl transition-all shadow-xs shrink-0 self-start sm:self-auto"
            >
              <span>{t('careers.viewAllPositions', 'View All Open Positions')}</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {featuredJobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {featuredJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.slug}`}
                  className="group bg-white hover:bg-amber-50/20 border border-gray-200/80 hover:border-amber-400 p-4 rounded-xl transition-all duration-300 flex flex-col justify-between shadow-xs hover:shadow-md"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 text-[10px] font-bold truncate max-w-[130px]">
                        {job.department?.name || t('careers.department', 'Department')}
                      </span>
                      <span className="text-[9px] text-gray-600 font-semibold uppercase bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                        {job.workMode === 'REMOTE' ? t('careers.remote', 'Remote') : job.workMode === 'HYBRID' ? t('careers.hybrid', 'Hybrid') : t('careers.onSite', 'On-site')}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-gray-900 group-hover:text-amber-600 transition-colors line-clamp-1">
                      {job.title}
                    </h3>

                    <div className="space-y-1 text-xs text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-gray-400 shrink-0" />
                        <span className="truncate">{job.locationCity}, {job.locationState}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Briefcase size={12} className="text-gray-400 shrink-0" />
                        <span>
                          {job.employmentType === 'FULL_TIME' ? t('careers.fullTime', 'Full Time') : job.employmentType === 'PART_TIME' ? t('careers.partTime', 'Part Time') : job.employmentType === 'CONTRACT' ? t('careers.contract', 'Contract') : job.employmentType === 'INTERNSHIP' ? t('careers.internship', 'Internship') : job.employmentType === 'FREELANCE' ? t('careers.freelance', 'Freelance') : job.employmentType.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-gray-500 text-[11px] font-medium">
                      {job.vacancies} {job.vacancies === 1 ? t('careers.opening', 'Opening') : t('careers.openings', 'Openings')}
                    </span>
                    <span className="text-amber-600 text-xs font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      {t('careers.applyNow', 'Apply Now')} &rarr;
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200/80 p-6 text-center space-y-3 shadow-xs">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-100">
                <Briefcase size={20} />
              </div>
              <h3 className="text-sm font-bold text-gray-900">{t('careers.constantlyHiringTitle', "We're Constantly Hiring Talent")}</h3>
              <Link
                href="/jobs"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-bold text-xs rounded-xl transition-all shadow-xs"
              >
                <span>{t('careers.browsePortal', 'Browse Careers Portal')}</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
