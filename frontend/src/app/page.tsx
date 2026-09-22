"use client";

import Image from 'next/image';
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, MapPin, ChevronDown, ArrowRight, Package, Truck, Coins, FileText, Handshake, Briefcase, Sparkles } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import api, { getRemoteMediaUrl } from '@/lib/api';
import { generateMachineSlugPath } from '@/lib/seoUtils';
import { useTranslation } from '@/hooks/useTranslation';
import { generateCategoryMachinesPath } from '@/lib/seoUtils';
import CategoryIconRenderer from '@/components/shared/CategoryIconRenderer';


type FeaturedJobItem = {
  id: string;
  slug: string;
  title: string;
  department: { name: string } | null;
  workMode: string;
  locationCity: string;
  locationState: string;
  employmentType: string;
  vacancies: number;
};

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
  slug?: string | null;
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

type MobileAppSettings = {
  playStoreLink?: string | null;
  appStoreLink?: string | null;
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

const getMediaUrl = (url: string | null) => getRemoteMediaUrl(url);

export default function Home() {
  const { t } = useTranslation();
  const { recentListings, recentListingsLoading } = useNotificationStore();
  const [financeSupportItems, setFinanceSupportItems] = React.useState<FinanceSupportItem[]>([]);
  const [heroImageUrl, setHeroImageUrl] = React.useState<string | null>(null);
  const [heroHeadline, setHeroHeadline] = React.useState('');
  const [inspectionContent, setInspectionContent] = React.useState<InspectionSectionContent | null>(null);
  const [browseCategories, setBrowseCategories] = React.useState<PublicCategory[]>([]);
  const [searchCategories, setSearchCategories] = React.useState<PublicCategory[]>([]);
  const [featuredJobs, setFeaturedJobs] = React.useState<FeaturedJobItem[]>([]);
  const [searchLocations, setSearchLocations] = React.useState<PublicSearchLocation[]>([]);
  const [playStoreLink, setPlayStoreLink] = React.useState<string | null>(null);
  const [appStoreLink, setAppStoreLink] = React.useState<string | null>(null);
  const [isHomepageDataLoading, setIsHomepageDataLoading] = React.useState(true);

  // Hero Search States
  const router = useRouter();
  const [heroSearchQuery, setHeroSearchQuery] = React.useState('');
  const [heroSearchCategory, setHeroSearchCategory] = React.useState('');
  const [heroSearchLocation, setHeroSearchLocation] = React.useState('');
  const [isLocationSuggestionsOpen, setIsLocationSuggestionsOpen] = React.useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = React.useState(false);
  const [activeNewIndex, setActiveNewIndex] = React.useState(0);
  const [activeFinanceIndex, setActiveFinanceIndex] = React.useState(0);

  const handleHeroSearch = () => {
    const params = new URLSearchParams();
    if (heroSearchQuery.trim()) params.set('q', heroSearchQuery.trim());
    if (heroSearchCategory) params.set('category', heroSearchCategory);
    if (heroSearchLocation.trim()) params.set('location', heroSearchLocation.trim());
    router.push(`/machines?${params.toString()}`);
  };

  const handleNewSectionScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const width = e.currentTarget.clientWidth;
    // width * 0.85 approx since cards are 85vw
    const index = Math.round(scrollLeft / (width * 0.85));
    setActiveNewIndex(index);
  };

  const handleFinanceScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    // Mobile card width is 100px + gap-3 (12px) = 112px
    const cardWidth = 112;
    const index = Math.round(scrollLeft / cardWidth);
    setActiveFinanceIndex(index);
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
      if (!getMediaUrl(item.imageUrl)) return false;

      const key = `${item.id}:${item.name.trim().toLowerCase()}:${item.imageUrl}`;
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }, [financeSupportItems]);

  const financeRows = React.useMemo(() => {
    const normalizedItems = uniqueFinanceSupportItems.filter((item) => item.imageUrl);
    const row1 = normalizedItems.filter((_, index) => index % 2 === 0);
    const row2 = normalizedItems.filter((_, index) => index % 2 === 1);
    return { row1, row2 };
  }, [uniqueFinanceSupportItems]);

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
        const [financeRes, heroRes, inspectionRes, categoriesRes, filtersRes, mobileAppRes, jobsRes] = await Promise.all([
          api.get<{ success: boolean; data: FinanceSupportItem[] }>('/master/finance-support').catch(() => null),
          api.get<{ success: boolean; data: { imageUrl: string | null; headline?: string | null } }>('/master/hero-image').catch(() => null),
          api.get<{ success: boolean; data: InspectionSectionContent }>('/master/inspection-section').catch(() => null),
          api.get<{ success: boolean; data: PublicCategory[] }>('/master/public-categories').catch(() => null),
          api.get<{ success: boolean; data: PublicSearchFilters }>('/master/public-search-filters').catch(() => null),
          api.get<{ success: boolean; data: MobileAppSettings }>('/master/mobile-app').catch(() => null),
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

        if (mobileAppRes?.data?.success) {
          setPlayStoreLink(mobileAppRes.data.data?.playStoreLink || null);
          setAppStoreLink(mobileAppRes.data.data?.appStoreLink || null);
        } else {
          setPlayStoreLink(null);
          setAppStoreLink(null);
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
          setPlayStoreLink(null);
          setAppStoreLink(null);
        }
      } finally {
        if (!cancelled) {
          setIsHomepageDataLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const categoryOptions = searchCategories.length > 0 ? searchCategories : browseCategories;

  const renderFinanceCard = (item: FinanceSupportItem, key: string) => {
    const imageUrl = getMediaUrl(item.imageUrl);

    return (
      <div
        key={key}
        className="relative flex flex-col md:flex-row w-[90px] md:h-[80px] md:w-[240px] shrink-0 snap-center md:overflow-hidden md:rounded-lg md:bg-gray-900 md:shadow-md transition-transform active:scale-95 hover:scale-105 md:border-none"
      >
        {/* Desktop Full Card Image */}
        <div className="hidden md:block relative w-full h-full">
          {imageUrl && (
            <Image
              src={imageUrl}
              alt={`${item.name} finance support partner on JCB Exchange`}
              fill
              sizes="(max-width: 640px) 220px, 240px"
              className="object-cover opacity-80 transition-opacity hover:opacity-100"
            />
          )}
          {/* Brand Name Overlaid */}
          <div className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center pointer-events-none">
            <p className="truncate text-[15px] font-extrabold uppercase tracking-widest text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {item.name}
            </p>
          </div>
        </div>

        {/* Mobile Custom Card Layout */}
        <div className="flex md:hidden flex-col items-center w-full">
          <div className="relative h-[65px] w-full bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center p-2 mb-1.5 overflow-hidden">
            {imageUrl && (
              <Image
                src={imageUrl}
                alt={`${item.name} finance support partner on JCB Exchange`}
                fill
                sizes="90px"
                className="object-contain p-2"
              />
            )}
          </div>
          <span className="text-[9px] font-extrabold text-gray-800 text-center uppercase tracking-wide truncate w-full px-1">
            {item.name}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen">

      {/* 1. HERO SECTION */}
      <section className="relative w-full min-h-[180px] sm:min-h-[280px] md:h-[600px] flex flex-col items-center justify-center pt-6 pb-4 md:pt-24 md:pb-16 md:py-0">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0 bg-[#1C1C1C]">
          <Image
            src={getMediaUrl(heroImageUrl) || "/images/jcbhero.png"}
            alt="Heavy machinery marketplace hero banner"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 text-left md:text-center px-4 w-full max-w-5xl md:mb-12 md:mt-[-60px] mt-0 mb-3">
          {heroHeadlineLines.length > 0 ? (
            <h1 className="text-[28px] sm:text-4xl md:text-6xl lg:text-7xl font-extrabold text-white mb-3 sm:mb-6 tracking-tight leading-tight md:leading-[1.1] drop-shadow-lg">
              {heroHeadlineLines.map((line, index) => (
                <React.Fragment key={`${line}-${index}`}>
                  {line}
                  {index < heroHeadlineLines.length - 1 ? <br /> : null}
                </React.Fragment>
              ))}
            </h1>
          ) : (
            <h1 className="text-[28px] sm:text-4xl md:text-6xl lg:text-7xl font-extrabold text-white mb-3 sm:mb-6 tracking-tight leading-tight md:leading-[1.1] drop-shadow-lg">
              Find the Right Machine for Your Next Job
            </h1>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative md:absolute md:bottom-[-45px] z-20 w-full max-w-[1200px] px-3 sm:px-4 md:left-1/2 md:-translate-x-1/2">
          <div className="bg-white md:bg-[#FAF8F5] p-2 sm:p-4 md:p-6 rounded-xl md:rounded-lg shadow-2xl flex flex-col md:flex-row gap-2 md:gap-4 border border-gray-100 w-full">

            {/* Input 1 */}
            <div className="flex-1 flex items-center bg-[#F3EFE9] border border-[#E8E1D7] rounded-lg md:rounded-[4px] px-3 sm:px-4 py-1.5 md:py-3.5 hover:border-gray-400 focus-within:border-gray-400 transition-colors w-full">
              <Search className="text-gray-900 md:text-gray-600 mr-2 sm:mr-3 shrink-0 h-5 w-5 sm:h-5 sm:w-5" />
              <div className="flex flex-col w-full min-w-0">
                <input
                  type="text"
                  placeholder={t('home.searchPlaceholder')}
                  value={heroSearchQuery}
                  onChange={(e) => setHeroSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleHeroSearch()}
                  className="w-full bg-transparent outline-none text-gray-900 placeholder:text-gray-600 md:placeholder:text-gray-600 text-[14px] md:text-xs sm:text-sm font-semibold truncate"
                />
              </div>
            </div>

            <div className="flex flex-row gap-2.5 w-full md:contents">
              {/* Input 2 */}
              <div className="relative flex-1 min-w-0">
                <div
                  className="flex items-center justify-between bg-[#F3EFE9] border border-[#E8E1D7] rounded-lg md:rounded-[4px] px-3 sm:px-4 py-1.5 md:py-1.5 sm:py-3.5 cursor-pointer hover:border-gray-400 transition-colors w-full h-full"
                  onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                  onBlur={() => {
                    window.setTimeout(() => setIsCategoryDropdownOpen(false), 120);
                  }}
                  tabIndex={0}
                >
                  <div className="flex items-center w-full min-w-0">
                    <Truck className="text-gray-900 md:text-gray-600 mr-2 sm:mr-3 shrink-0 h-4 w-4 sm:h-5 sm:w-5" />
                    <div className="flex flex-col w-full text-[13px] md:text-xs sm:text-sm font-semibold text-gray-900 truncate">
                      <span className="truncate">{heroSearchCategory ? categoryOptions.find(c => c.id === heroSearchCategory)?.name || t('home.allTypes') : <span className="text-gray-900 md:text-gray-600">{t('home.selectEquipmentType')}</span>}</span>
                    </div>
                  </div>
                  <ChevronDown className="text-gray-900 md:text-gray-600 shrink-0 ml-1 h-4 w-4 sm:h-5 sm:w-5" />
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

              <div className="relative flex-1 min-w-0">
                <div className="flex items-center bg-[#F3EFE9] border border-[#E8E1D7] rounded-lg md:rounded-[4px] px-3 sm:px-4 py-1.5 md:py-1.5 sm:py-3.5 hover:border-gray-400 focus-within:border-gray-400 transition-colors w-full h-full">
                  <MapPin className="text-gray-900 md:text-gray-600 mr-2 sm:mr-3 shrink-0 h-4 w-4 sm:h-5 sm:w-5" />
                  <div className="flex flex-col w-full min-w-0">
                    <input
                      type="text"
                      placeholder={t('home.enterLocation')}
                      value={heroSearchLocation}
                      onFocus={() => setIsLocationSuggestionsOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => setIsLocationSuggestionsOpen(false), 200);
                      }}
                      onMouseDown={(e) => {
                        if (document.activeElement === e.target && isLocationSuggestionsOpen) {
                          setIsLocationSuggestionsOpen(false);
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => {
                        setHeroSearchLocation(e.target.value);
                        setIsLocationSuggestionsOpen(true);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleHeroSearch()}
                      className="w-full bg-transparent outline-none text-gray-900 placeholder:text-gray-900 md:placeholder:text-gray-600 text-[13px] md:text-xs sm:text-sm font-semibold truncate"
                    />
                  </div>
                  <ChevronDown 
                    className="text-gray-900 md:hidden shrink-0 ml-1 h-4 w-4 cursor-pointer" 
                    onMouseDown={(e) => {
                      setIsLocationSuggestionsOpen(!isLocationSuggestionsOpen);
                      e.preventDefault();
                    }}
                  />
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
            </div>

            {/* Submit Button */}
            <button
              onClick={handleHeroSearch}
              className="bg-jcb-yellow hover:bg-yellow-400 text-black font-bold text-[15px] md:text-[16px] px-6 sm:px-8 py-2 md:py-3.5 rounded-lg md:rounded-[4px] transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-sm w-full md:w-auto mt-1 md:mt-0 h-[40px] md:h-auto"
            >
              {t('home.searchButton')} <ArrowRight size={18} className="h-[18px] w-[18px] sm:h-[18px] sm:w-[18px]" strokeWidth={2.5} />
            </button>

          </div>
        </div>
      </section>

      {/* Spacer so the absolute positioned search bar doesn't overlap the next section's heading */}
      <div className="hidden md:block h-[60px] w-full bg-[#FAF9F6]"></div>



      {/* 2.5 SELECT YOUR PRODUCT */}
      <section className="pt-6 pb-6 md:py-16 px-4 md:px-6 bg-[#FAF9F6] w-full">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 md:mb-6 flex items-center justify-between">
            <h2 className="text-lg sm:text-[28px] font-bold sm:font-extrabold text-gray-900">{t('home.selectProduct') || 'Select your product'}</h2>
            <Link href="/categories" className="flex items-center text-xs sm:text-sm font-semibold text-gray-900 hover:text-jcb-yellow">
              View all <ArrowRight size={16} className="ml-1 h-3 w-3 sm:h-4 sm:w-4" />
            </Link>
          </div>

          <div className="flex flex-col md:border-t md:border-gray-200">
            {isHomepageDataLoading ? (
              <div className="animate-pulse">
                {/* Desktop skeleton: match the loaded four-column category rows. */}
                <div className="hidden md:flex md:flex-col">
                  {Array.from({ length: 3 }).map((_, rowIndex) => (
                    <div key={`desktop-skeleton-row-${rowIndex}`} className="grid grid-cols-4 gap-4 border-b border-gray-200 py-8 last:border-b-0">
                      {Array.from({ length: 4 }).map((__, columnIndex) => (
                        <div key={`desktop-skeleton-${rowIndex}-${columnIndex}`} className="flex flex-col items-center justify-center">
                          <div className="mb-4 h-12 w-16 rounded-md bg-gray-200 sm:h-16 sm:w-20" />
                          <div className="h-3 w-24 rounded bg-gray-200" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Mobile skeleton: match the loaded three-column category cards. */}
                <div className="flex flex-col px-1 md:hidden">
                  {Array.from({ length: 2 }).map((_, rowIndex) => (
                    <div key={`mobile-skeleton-row-${rowIndex}`} className="grid grid-cols-3 gap-2 py-1">
                      {Array.from({ length: 3 }).map((__, columnIndex) => (
                        <div key={`mobile-skeleton-${rowIndex}-${columnIndex}`} className="flex min-h-[66px] flex-col items-center justify-center rounded-xl border border-gray-100 bg-white p-2 shadow-sm">
                          <div className="mb-1 h-8 w-10 rounded-md bg-gray-200" />
                          <div className="h-2.5 w-14 rounded bg-gray-200" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : browseCategories.length > 0 ? (
              <>
                {/* Desktop View (Rows of 4) */}
                <div className="hidden md:flex flex-col">
                  {Array.from({ length: Math.ceil(browseCategories.length / 4) }).map((_, rowIndex) => {
                    const row = browseCategories.slice(rowIndex * 4, rowIndex * 4 + 4);
                    return (
                      <div key={`desktop-row-${rowIndex}`} className="grid grid-cols-4 gap-4 py-8 border-b border-gray-200 last:border-b-0">
                        {row.map((category) => (
                          <Link
                            href={generateCategoryMachinesPath(category)}
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

                {/* Mobile View (Rows of 3, limit 6) */}
                <div className="flex flex-col md:hidden px-1">
                  {Array.from({ length: Math.ceil(Math.min(browseCategories.length, 6) / 3) }).map((_, rowIndex) => {
                    const row = browseCategories.slice(rowIndex * 3, rowIndex * 3 + 3);
                    return (
                      <div key={`mobile-row-${rowIndex}`} className="grid grid-cols-3 gap-2 py-1">
                        {row.map((category) => (
                          <Link
                            href={generateCategoryMachinesPath(category)}
                            key={category.id}
                            className="flex flex-col items-center justify-center p-2 bg-white border border-gray-100 rounded-xl cursor-pointer group active:scale-95 transition-transform duration-200 shadow-sm h-full"
                          >
                            <div className="h-8 flex items-center justify-center mb-1">
                              <CategoryIconRenderer
                                svgData={category.icon?.svgData}
                                name={category.name}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-gray-900 text-center tracking-tight capitalize leading-tight">{category.name}</span>
                          </Link>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center">
                <Package className="mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm font-semibold text-gray-700">
                  {t('categories.noCategoriesFound', 'No categories available yet.')}
                </p>
                <p className="mt-1 max-w-md text-xs text-gray-500">
                  {t('categories.noCategoriesDescription', 'Categories will appear here after approved listings are added.')}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2.75 SEARCH-FRIENDLY SERVICE SUMMARY */}
      <section className="hidden md:block w-full border-y border-gray-200 bg-white px-4 py-10 sm:px-6 sm:py-12">
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

      {/* WRAPPER FOR SECTIONS 3 AND 4 */}
      <div className="flex flex-col w-full">
        <div className="w-full">
          {/* 3. LATEST VEHICLES */}
          <section className="pt-2 pb-4 md:py-16 px-3 md:px-6 bg-[#2d2d2d] w-full">
        <div className="max-w-7xl mx-auto">
          <div className="mb-2 md:mb-8 flex flex-row items-center justify-between md:border-b border-[#444] pb-1 md:pb-4">
            <h2 className="text-xl md:text-3xl font-extrabold text-jcb-yellow tracking-wider uppercase">{t('home.newSection')}</h2>
            <Link
              href="/machines"
              className="inline-flex items-center gap-1 md:gap-2 text-[12px] md:text-sm font-bold text-white hover:text-jcb-yellow"
            >
              View all machines
              <ArrowRight size={14} className="md:h-4 md:w-4" />
            </Link>
          </div>

          <div
            className="flex overflow-x-auto snap-x snap-mandatory gap-3 md:gap-4 pb-2 md:pb-4 hide-scrollbar md:grid md:grid-cols-2 lg:grid-cols-4 md:pb-0 md:overflow-visible"
            onScroll={handleNewSectionScroll}
          >
            {recentListingsLoading ? (
              <div className="col-span-1 md:col-span-2 lg:col-span-4 min-h-[300px] flex flex-col items-center justify-center text-gray-400 bg-[#333] rounded-lg border border-[#444] border-dashed">
                <Package className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-base font-medium">{t('home.loadingLatestMachines')}</p>
              </div>
            ) : recentListings.length === 0 ? (
              <div className="col-span-1 md:col-span-2 lg:col-span-4 min-h-[220px] flex flex-col items-center justify-center text-gray-400 bg-[#333] rounded-lg border border-[#444] border-dashed px-6 text-center">
                <Package className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-base font-medium">
                  {t('home.noLatestMachines', 'No machines available yet.')}
                </p>
              </div>
            ) : (
              recentListings.slice(0, 4).map((listing) => {
                const img = getMediaUrl(listing.featuredImage);
                return (
                  <Link href={generateMachineSlugPath(listing)} key={listing.id} className="w-[85vw] md:w-auto snap-center shrink-0 md:min-w-0 md:shrink bg-[#383838] border border-[#444] flex flex-row md:flex-col rounded-md overflow-hidden group hover:border-jcb-yellow transition-colors h-[120px] md:h-auto">
                    <div className="relative h-full w-[40%] md:w-full md:h-48 bg-black flex shrink-0 items-center justify-center">
                      {img ? (
                        <Image
                          src={img}
                          alt={`${listing.title} available in ${listing.locationCity || 'India'}`}
                          fill
                          sizes="(max-width: 768px) 40vw, (max-width: 1200px) 50vw, 25vw"
                          className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
                        />
                      ) : (
                        <Package className="w-8 h-8 md:w-12 md:h-12 text-[#555]" />
                      )}
                      <div className="absolute top-2 left-2 md:top-3 md:left-3 bg-jcb-yellow text-black px-1.5 py-0.5 md:px-2 md:py-1 rounded text-[8px] md:text-[10px] font-bold uppercase tracking-wider shadow-sm">
                        {t('home.justAdded')}
                      </div>
                      <div
                        className={`absolute bottom-2 right-2 md:bottom-auto md:top-3 md:right-3 rounded px-1.5 py-0.5 md:px-2 md:py-1 text-[8px] md:text-[10px] font-bold uppercase tracking-wider shadow-sm ${getListingStatusBadge(
                          listing.status
                        )}`}
                      >
                        {getListingStatusLabel(listing.status, listingStatusLabels)}
                      </div>
                    </div>
                    <div className="p-3 md:p-4 flex flex-col flex-grow min-w-0">
                      <p className="text-gray-400 text-[8px] md:text-[10px] font-bold uppercase tracking-widest mb-1 truncate">
                        {listing.categoryName || t('home.equipmentFallback')} • {listing.brandName || t('home.brandFallback')}
                      </p>
                      <h3 className="text-white font-bold text-sm md:text-base mb-1.5 md:mb-3 line-clamp-2 leading-tight md:leading-normal">{listing.title}</h3>
                      <div className="mt-auto flex justify-between items-end">
                        <div>
                          <p className="text-[#888] text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-0.5 md:mb-1">{t('home.priceLabel')}</p>
                          <p className="text-jcb-yellow text-base md:text-lg font-bold leading-none md:leading-normal">₹{(listing.price / 100000).toFixed(2)} Lakh</p>
                        </div>
                        <div className="text-gray-400 text-[10px] md:text-xs font-medium flex items-center gap-1">
                          <MapPin size={10} className="md:hidden shrink-0" />
                          <span className="truncate max-w-[50px] md:max-w-none">{listing.locationCity}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Active Indicators for Mobile */}
          {recentListings.length > 0 && (
            <div className="flex md:hidden justify-center items-center gap-1.5 mt-2">
              {recentListings.slice(0, 4).map((_, i) => (
                <div
                  key={`dot-${i}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${activeNewIndex === i ? 'bg-jcb-yellow w-4' : 'bg-gray-500 w-1.5'}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>
        </div>

        <div className="w-full">
          {/* 4. OUR FINANCE SUPPORT */}
          <section className="relative pt-4 pb-1 md:py-12 px-0 bg-[#FAF9F6] w-full border-y-0 md:border-y border-gray-200 border-dashed overflow-hidden">
        <div className="w-full px-4 md:px-6 mb-3 md:mb-8">
          <h2 className="text-left md:text-center text-sm md:text-2xl font-extrabold md:font-bold text-gray-900 uppercase tracking-widest md:tracking-normal md:normal-case">{t('home.financeSupportTitle')}</h2>
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
          <>
            {/* Mobile: Manual Scroll with Dots */}
            <div className="md:hidden flex flex-col mb-1">
              <div
                className="flex overflow-x-auto snap-x snap-mandatory gap-3 px-4 py-2 hide-scrollbar w-full"
                onScroll={handleFinanceScroll}
              >
                {uniqueFinanceSupportItems.filter(item => item.imageUrl).map((item, index) =>
                  renderFinanceCard(item, `m1-${item.id}-${index}`)
                )}
              </div>
              <div className="flex justify-center items-center gap-1.5 mt-2">
                {uniqueFinanceSupportItems.filter(item => item.imageUrl).map((_, i) => (
                  <div
                    key={`f-dot-${i}`}
                    className={`h-1.5 rounded-full transition-all duration-300 ${activeFinanceIndex === i ? 'bg-jcb-yellow w-4' : 'bg-gray-300 w-1.5'}`}
                  />
                ))}
              </div>
            </div>

            {/* Desktop: Single continuous marquee loop */}
            <div className="hidden md:block finance-marquee-shell finance-marquee-bleed flex w-screen overflow-hidden">
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
          </>
        )}
      </section>
        </div>
      </div>

      {/* 4.5 MOBILE APP PROMO BANNER (Desktop Only) */}
      <section className="hidden md:flex w-full bg-[#1A1A1A] text-white py-16 px-6 relative overflow-hidden items-center justify-center">
        <div className="max-w-7xl w-full mx-auto flex flex-row items-center justify-between gap-12">
          {/* Left Text Content */}
          <div className="flex flex-col w-[50%] z-10">
            <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight mb-4 text-white">
              JCB Exchange Mobile App
            </h2>
            <p className="text-gray-400 text-lg lg:text-xl font-medium mb-10 leading-relaxed max-w-lg">
              Your one-stop solution for instant heavy machinery trading, financing, and certified dealer network right from your phone.
            </p>
            
            <div className="flex flex-row items-center gap-4">
              {/* Play Store Button */}
              <a href={playStoreLink || 'https://play.google.com/store/apps'} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 rounded-full px-6 py-3.5 transition-colors font-bold text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <path d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.15L13.69 12L3.84 21.85C3.34 21.61 3 21.09 3 20.5ZM4.53 2.76L14.6 12.83L19.46 10.4C20.19 10 20.19 8.94 19.46 8.54L4.53 2.76ZM20.44 11.26L15.67 13.65L14.47 12.45L20.44 11.26ZM15.67 10.35L19.46 11.83C20.48 12.23 20.48 13.72 19.46 14.12L15.67 15.6L14.47 14.4L15.67 10.35ZM4.53 21.24L14.6 11.17L15.67 12.24L4.53 21.24Z" fill="url(#paint1_linear)" />
                  <defs>
                    <linearGradient id="paint1_linear" x1="18.9141" y1="2.78125" x2="6.60156" y2="21.1406" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#00A0FF" />
                      <stop offset="0.0066" stopColor="#00A1FF" />
                      <stop offset="0.2601" stopColor="#00BEFF" />
                      <stop offset="0.5122" stopColor="#00D2FF" />
                      <stop offset="0.7604" stopColor="#00DFFF" />
                      <stop offset="1" stopColor="#00E3FF" />
                    </linearGradient>
                  </defs>
                </svg>
                Play Store
              </a>

              {/* App Store Button */}
              <a href={appStoreLink || 'https://apps.apple.com/app'} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 rounded-full px-6 py-3.5 transition-colors font-bold text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <path d="M16.365 14.402C16.388 11.391 18.825 9.946 18.938 9.876C17.489 7.76 15.195 7.42 14.417 7.375C12.474 7.18 10.584 8.52 9.588 8.52C8.591 8.52 7.042 7.399 5.437 7.414C3.393 7.444 1.503 8.604 0.457 10.428C-1.666 14.116 0.283 19.569 2.35 22.564C3.363 24.032 4.568 25.688 6.136 25.613C7.659 25.538 8.243 24.619 10.089 24.619C11.935 24.619 12.474 25.613 14.043 25.583C15.657 25.553 16.697 24.093 17.693 22.624C18.857 20.912 19.336 19.245 19.359 19.155C19.314 19.14 16.342 18.016 16.365 14.402ZM12.723 4.887C13.565 3.869 14.135 2.449 13.981 1.029C12.756 1.079 11.238 1.849 10.372 2.852C9.594 3.739 8.922 5.187 9.106 6.574C10.472 6.679 11.881 5.901 12.723 4.887Z" />
                </svg>
                App Store
              </a>
            </div>
          </div>

          {/* Right Mobile App Image */}
          <div className="w-[45%] flex items-center justify-center relative">
            <div>
              <Image
                src="/apkbanner.png"
                alt="JCB Exchange Mobile App"
                width={700}
                height={700}
                className="object-contain w-full max-w-[600px] drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* 5. CERTIFIED & INSPECTED BY EXPERTS */}
      <section className="pt-2 pb-5 md:py-16 px-4 md:px-6 bg-[#FAF9F6] md:bg-[#FFF9ED] w-full">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 md:gap-12 items-center">
          {/* Mobile Banner View */}
          <div className="md:hidden relative w-full bg-[#FFF9ED] rounded-xl overflow-hidden shadow-sm border border-gray-100 flex flex-row items-stretch min-h-[140px]">
             {/* Text Content */}
             <div className="flex flex-col justify-center p-4 w-[60%]">
               <p className="text-[8px] font-extrabold text-gray-400 uppercase tracking-widest mb-1.5">CERTIFIED DEALERS</p>
               <h3 className="text-sm font-extrabold text-gray-900 leading-tight tracking-tight mb-1.5 line-clamp-2">
                 {inspectionContent?.title || 'Expert Service for a Stronger Tomorrow'}
               </h3>
               <p className="text-[10px] font-medium text-gray-500 leading-snug mb-3 line-clamp-2 whitespace-normal pr-1">
                 {inspectionContent?.description || 'Genuine support. Genuine growth.'}
               </p>
               <Link href="/dealers" className="bg-jcb-yellow text-black text-[9px] font-extrabold uppercase px-2.5 py-1.5 rounded inline-flex items-center self-start hover:bg-yellow-400 transition-colors tracking-wide">
                 FIND A DEALER <ArrowRight className="ml-1 h-3 w-3" strokeWidth={2.5} />
               </Link>
             </div>
             
             {/* Full Image on Right */}
             <div className="relative w-[40%] h-auto">
               <Image 
                 src={getMediaUrl(inspectionContent?.imageUrl || null) || "/images/inspection.png"}
                 alt="Verified dealers" 
                 fill 
                 sizes="(max-width: 768px) 40vw"
                 className="object-cover object-center" 
               />
             </div>
          </div>

          {/* Desktop View Card */}
          <div className="hidden md:flex flex-col lg:flex-row bg-transparent rounded-3xl p-8 lg:p-12 items-center justify-between gap-8 w-full mt-0">
            <div className="lg:w-1/2 text-center lg:text-left flex flex-col items-center lg:items-start">
              {inspectionContent?.title ? (
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold sm:font-extrabold text-gray-900 mb-4 leading-tight">
                  {inspectionContent.title}
                </h2>
              ) : null}
              {inspectionContent?.description ? (
                <p className="text-gray-600 font-medium mb-8 sm:mb-10 text-sm sm:text-[15px] leading-relaxed max-w-lg mx-auto lg:mx-0 whitespace-pre-line">
                  {inspectionContent.description}
                </p>
              ) : null}
              
              <Link
                href="/dealers"
                className="bg-jcb-yellow text-black text-[15px] font-extrabold uppercase px-6 py-3 rounded-lg inline-flex items-center hover:bg-yellow-400 transition-colors tracking-wide shadow-sm"
              >
                FIND A DEALER
                <ArrowRight className="ml-2 h-5 w-5" strokeWidth={2.5} />
              </Link>
            </div>

            <div className="lg:w-[45%] relative mt-8 lg:mt-0">
              <div className="relative rounded-2xl overflow-hidden shadow-xl border-4 border-white">
                <Image
                  src={getMediaUrl(inspectionContent?.imageUrl || null) || "/images/inspection.png"}
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
        </div>
      </section>


      {/* 6. CAREERS & OPEN POSITIONS SECTION */}
      <section className="hidden md:block py-8 sm:py-10 px-4 sm:px-6 bg-gray-50/80 text-gray-900 w-full border-t border-gray-200/80">
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
