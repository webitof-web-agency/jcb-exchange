"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeIndianRupee,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Cog,
  Fuel,
  Globe,
  Image as ImageIcon,
  Info,
  MapPin,
  Navigation,
  PlayCircle,
  ShieldCheck,
  Truck,
  UserRound,
  Wrench,
} from 'lucide-react';
import api, { getAbsoluteMediaUrl } from '@/lib/api';
import { resolveOwnedListingId } from '@/lib/privateRouteResolvers';
import { generateMachineSlugPath } from '@/lib/seoUtils';
import { generateProfileListingDetailPath } from '@/lib/privateRoutePaths';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/hooks/useTranslation';

type ListingMedia = {
  id: string;
  url: string;
  type: string;
  isFeatured?: boolean;
};

type ListingPartner = {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  partnerProfile?: {
    businessName?: string | null;
    partnerType?: string | null;
  } | null;
};

type SaleRecord = {
  buyerName?: string;
  buyerPhone?: string;
  buyerCity?: string | null;
  buyerState?: string | null;
  soldPrice?: number | string;
  soldAt?: string;
} | null;

type OwnedListingDetail = {
  id: string;
  title: string;
  price: string | number;
  status: string;
  manufacturingYear?: number | null;
  operatingHours?: string | number | null;
  locationCity?: string | null;
  locationState?: string | null;
  condition?: string | null;
  description?: string | null;
  additionalDescription?: string | null;
  grossPower?: string | null;
  category?: { id?: string; name?: string | null } | null;
  brand?: { id?: string; name?: string | null } | null;
  model?: { id?: string; name?: string | null } | null;
  partner?: ListingPartner | null;
  registrationYear?: number | null;
  registrationNo?: string | null;
  chassisOrSerialNo?: string | null;
  previousOwners?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  insuranceExpiry?: string | null;
  pinCode?: string | null;
  nearbyLandmark?: string | null;
  createdAt?: string;
  media: ListingMedia[];
  saleRecord?: SaleRecord;
  isPubliclyVisible?: boolean;
};

type ListingResponse = {
  listing?: OwnedListingDetail;
};

type ParsedListingDetails = {
  rawDescription: string;
  variant: string;
  registrationYear: string;
  registrationNo: string;
  chassisOrSerialNo: string;
  previousOwners: string;
  fuelType: string;
  transmission: string;
  district: string;
  pinCode: string;
  nearbyLandmark: string;
  insuranceExpiry: string;
};

const createEmptyParsedListingDetails = (): ParsedListingDetails => ({
  rawDescription: '',
  variant: '',
  registrationYear: '',
  registrationNo: '',
  chassisOrSerialNo: '',
  previousOwners: '',
  fuelType: '',
  transmission: '',
  district: '',
  pinCode: '',
  nearbyLandmark: '',
  insuranceExpiry: '',
});

const parseListingDescription = (description?: string | null): ParsedListingDetails => {
  const parsed = createEmptyParsedListingDetails();
  if (!description) {
    return parsed;
  }

  const rawLines: string[] = [];
  for (const line of description.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!match) {
      rawLines.push(trimmed);
      continue;
    }

    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();

    switch (key) {
      case 'variant':
        parsed.variant = value;
        break;
      case 'registration year':
        parsed.registrationYear = value;
        break;
      case 'registration no':
        parsed.registrationNo = value;
        break;
      case 'chassis/serial':
      case 'chassis / serial':
      case 'chassis or serial':
        parsed.chassisOrSerialNo = value;
        break;
      case 'owners':
        parsed.previousOwners = value;
        break;
      case 'fuel':
        parsed.fuelType = value;
        break;
      case 'transmission':
        parsed.transmission = value;
        break;
      case 'district':
        parsed.district = value;
        break;
      case 'pin':
      case 'pin code':
        parsed.pinCode = value;
        break;
      case 'landmark':
        parsed.nearbyLandmark = value;
        break;
      case 'insurance expiry':
        parsed.insuranceExpiry = value;
        break;
      default:
        rawLines.push(trimmed);
        break;
    }
  }

  parsed.rawDescription = rawLines.join('\n');
  return parsed;
};

const formatCurrency = (amount?: string | number | null) => {
  const numericAmount = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return 'Price on request';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numericAmount);
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

const getStatusBadgeClassName = (status?: string | null) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SOLD') return 'bg-red-600 text-white';
  if (normalized === 'RESERVED') return 'bg-amber-500 text-white';
  if (['PUBLISHED', 'AVAILABLE', 'ACTIVE'].includes(normalized)) return 'bg-green-600 text-white';
  return 'bg-slate-700 text-white';
};

const getLocationLabel = (listing?: OwnedListingDetail | null) =>
  [listing?.locationCity, listing?.locationState].filter(Boolean).join(', ');

const getSellerLabel = (listing?: OwnedListingDetail | null) =>
  listing?.partner?.partnerProfile?.businessName ||
  listing?.partner?.name ||
  listing?.partner?.email ||
  null;

const getOverviewText = (parsed: ParsedListingDetails) => parsed.rawDescription?.trim() || '';

type SectionKey = 'overview' | 'specs' | 'sale';

export default function ProfileListingDetailClient({ listingId }: { listingId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { hasHydrated, isAuthenticated } = useAuthStore();
  const [listing, setListing] = useState<OwnedListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [openSections, setOpenSections] = useState<SectionKey[]>(['overview', 'specs']);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!isAuthenticated) {
      router.replace('/');
      return;
    }

    let isMounted = true;

    const loadListing = async () => {
      try {
        setLoading(true);
        setError(null);
        const resolvedListingId = (await resolveOwnedListingId(listingId)) || listingId;
        const response = await api.get<ListingResponse>(`/listings/${resolvedListingId}`);
        if (!isMounted) {
          return;
        }

        const nextListing = response.data.listing || null;
        setListing(nextListing);

        const imageMedia = nextListing?.media?.filter((item) => item.type === 'IMAGE') || [];
        const featuredIndex = imageMedia.findIndex((item) => item.isFeatured);
        setActiveImageIndex(featuredIndex >= 0 ? featuredIndex : 0);
      } catch (fetchError) {
        console.error('Failed to load owned listing detail', fetchError);
        if (isMounted) {
          setError(t('profile.listingDetailLoadFailed'));
          setListing(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadListing();

    return () => {
      isMounted = false;
    };
  }, [hasHydrated, isAuthenticated, listingId, router, t]);

  useEffect(() => {
    if (!listing) {
      return;
    }

    const canonicalPath = generateProfileListingDetailPath(listing);
    if (pathname !== canonicalPath) {
      router.replace(canonicalPath);
    }
  }, [listing, pathname, router]);

  const parsedDetails = useMemo(() => parseListingDescription(listing?.description), [listing?.description]);
  const overviewText = useMemo(() => getOverviewText(parsedDetails), [parsedDetails]);
  const images = useMemo(() => listing?.media?.filter((item) => item.type === 'IMAGE') || [], [listing?.media]);
  const videos = useMemo(() => listing?.media?.filter((item) => item.type === 'VIDEO') || [], [listing?.media]);
  const imageSources = useMemo(() => images.map((item) => item.url).filter(Boolean), [images]);
  const mainImage = images[activeImageIndex]?.url || imageSources[0] || null;
  const locationLabel = getLocationLabel(listing) || t('machineDetails.locationNotAvailable');
  const soldDateLabel = formatDate(listing?.saleRecord?.soldAt) || t('profile.notSpecified');
  const createdAtLabel = formatDate(listing?.createdAt) || t('profile.notSpecified');
  const sellerLabel = getSellerLabel(listing) || t('machineDetails.notSpecified');
  const toggleSection = (section: SectionKey) => {
    setOpenSections((current) =>
      current.includes(section) ? current.filter((item) => item !== section) : [...current, section]
    );
  };

  if (!hasHydrated || (loading && !listing)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#F8F9FA] px-4">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent" />
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-100 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-red-50 p-3 text-red-500">
              <Info className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">{t('profile.listingDetailUnavailable')}</h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                {error || t('profile.listingDetailUnavailableDescription')}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-4 py-2.5 text-sm font-bold text-black transition hover:bg-[#FFB300]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t('profile.backToListings')}
                </Link>
                <Link
                  href="/sold-vehicles"
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  {t('navbar.soldVehicles')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-16 overflow-x-hidden w-full">
      <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link
            href="/profile"
            className="mb-2.5 inline-flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.24em] text-gray-500 transition hover:text-gray-900"
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {t('profile.backToListings')}
          </Link>
          
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-black text-gray-900 sm:text-3xl max-w-full">
              {listing.title}
            </h1>
            <span className={`shrink-0 rounded-full px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider ${getStatusBadgeClassName(listing.status)}`}>
              {listing.status}
            </span>
          </div>
          
          <p className="mt-1.5 text-xs sm:text-sm text-gray-500 leading-relaxed max-w-2xl">
            {t('profile.listingDetailSubtitle')}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
              <div className="relative aspect-[4/3] bg-gray-100 sm:aspect-[16/10]">
                    <SafeListingImage
                      key={[mainImage, ...imageSources].join('|') || listing.id}
                      sources={mainImage ? [mainImage, ...imageSources.filter((source) => source !== mainImage)] : imageSources}
                      alt={listing.title}
                      className="object-cover"
                      iconClassName="h-16 w-16"
                    />
              </div>

              {images.length > 1 ? (
                <div className="grid grid-cols-3 gap-3 border-t border-gray-100 p-3 sm:grid-cols-5 sm:p-4">
                  {images.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setActiveImageIndex(index)}
                      className={`relative aspect-[4/3] overflow-hidden rounded-2xl border-2 transition ${
                        activeImageIndex === index ? 'border-[#FFC107]' : 'border-transparent hover:border-gray-200'
                      }`}
                    >
                      <SafeListingImage
                        key={image.url}
                        sources={[image.url]}
                        alt={`${listing.title} ${index + 1}`}
                        className="object-cover"
                        iconClassName="h-8 w-8"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HighlightCard
                icon={<BadgeIndianRupee className="h-4 w-4 sm:h-5 sm:w-5 text-[#C28A00]" />}
                label={t('machineDetails.priceLabel')}
                value={formatCurrency(listing.price)}
              />
              <HighlightCard
                icon={<Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-[#C28A00]" />}
                label={t('machineDetails.yearLabel')}
                value={listing.manufacturingYear ? String(listing.manufacturingYear) : t('machineDetails.na')}
              />
              <HighlightCard
                icon={<Clock className="h-4 w-4 sm:h-5 sm:w-5 text-[#C28A00]" />}
                label={t('machineDetails.hoursUsedLabel')}
                value={
                  listing.operatingHours
                    ? t('machineDetails.hoursValue', { count: Number(listing.operatingHours) })
                    : t('machineDetails.na')
                }
              />
              <HighlightCard
                icon={<MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-[#C28A00]" />}
                label={t('machineDetails.locationLabel')}
                value={locationLabel}
              />
            </section>

            <DetailSection
              title={t('machineDetails.overview')}
              subtitle={t('profile.listingDetailOverviewSubtitle')}
              isOpen={openSections.includes('overview')}
              onToggle={() => toggleSection('overview')}
            >
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-500">
                      {t('machineDetails.overview')}
                    </h3>
                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-700 sm:text-[15px]">
                      {overviewText || t('machineDetails.notSpecified')}
                    </p>
                  </div>

                  {listing.additionalDescription ? (
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-500">
                        {t('machineDetails.additionalDescription')}
                      </h3>
                      <p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-700 sm:text-[15px]">
                        {listing.additionalDescription}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-[#FFE08A] bg-[#FFF9E6] p-5">
                  <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[#8A6B00]">
                    {t('profile.listingSnapshot')}
                  </h3>
                  <div className="mt-4 space-y-4 text-sm text-gray-700">
                    <InlineInfo label={t('profile.listedOn')} value={createdAtLabel} />
                    <InlineInfo label={t('machineDetails.brandLabel')} value={listing.brand?.name || t('machineDetails.notSpecified')} />
                    <InlineInfo label={t('machineDetails.modelLabel')} value={listing.model?.name || t('machineDetails.notSpecified')} />
                    <InlineInfo label={t('profile.sellerDisplay')} value={sellerLabel} />
                  </div>
                </div>
              </div>
            </DetailSection>

            {(String(listing.status || '').toUpperCase() === 'SOLD' || listing.saleRecord) && (
              <section className="rounded-3xl border border-rose-200 bg-rose-50/70 p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 border-b border-rose-200 pb-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="shrink-0 rounded-2xl bg-rose-100 p-3 text-rose-600">
                      <UserRound className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-lg sm:text-xl font-black text-rose-950">Buyer & Sale Record (Confidential)</h2>
                      <p className="truncate text-[10px] sm:text-sm text-rose-700">Confidential details of the buyer and final sale record for this vehicle.</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-rose-200/80 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-rose-800">
                    SOLD RECORD
                  </span>
                </div>

                {listing.saleRecord ? (
                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 pt-2">
                    <SpecCard icon={<UserRound className="h-4 w-4" />} label={t('sellModal.buyerName')} value={listing.saleRecord.buyerName || t('machineDetails.na')} />
                    <SpecCard icon={<Info className="h-4 w-4" />} label={t('sellModal.buyerPhone')} value={listing.saleRecord.buyerPhone || t('machineDetails.na')} />
                    <SpecCard icon={<BadgeIndianRupee className="h-4 w-4 text-emerald-600" />} label={t('sellModal.finalSoldPrice')} value={formatCurrency(listing.saleRecord.soldPrice)} />
                    <SpecCard icon={<Calendar className="h-4 w-4" />} label={t('sellModal.saleDate')} value={soldDateLabel} />
                    <SpecCard icon={<MapPin className="h-4 w-4" />} label={t('sellModal.buyerState')} value={listing.saleRecord.buyerState || t('machineDetails.na')} />
                    <SpecCard icon={<MapPin className="h-4 w-4" />} label={t('sellModal.buyerCity')} value={listing.saleRecord.buyerCity || t('machineDetails.na')} />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-rose-300 bg-white p-4 text-center text-xs text-rose-700 font-medium">
                    This vehicle is marked as SOLD, but detailed buyer record was not filled.
                  </div>
                )}
              </section>
            )}

            {videos.length > 0 ? (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex items-center gap-3 min-w-0">
                  <div className="shrink-0 rounded-2xl bg-[#FFF4CC] p-3 text-[#C28A00]">
                    <PlayCircle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg sm:text-xl font-black text-gray-900">{t('machineDetails.videos')}</h2>
                    <p className="truncate text-xs sm:text-sm text-gray-500">{t('profile.listingVideosSubtitle')}</p>
                  </div>
                </div>
                <div className={`grid gap-4 ${videos.length > 1 ? 'lg:grid-cols-2' : ''}`}>
                  {videos.map((video) => (
                    <div key={video.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-black">
                      <video controls className="h-auto max-h-[70vh] w-full object-contain" preload="metadata">
                        <source
                          src={getAbsoluteMediaUrl(video.url)}
                          type={
                            video.url.endsWith('.webm')
                              ? 'video/webm'
                              : video.url.endsWith('.mov')
                                ? 'video/quicktime'
                                : 'video/mp4'
                          }
                        />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] sm:text-xs font-bold uppercase tracking-[0.22em] text-gray-500">
                    {t('profile.currentListingStatus')}
                  </p>
                  <h2 className="mt-2 truncate text-2xl sm:text-3xl font-black text-gray-900">{formatCurrency(listing.price)}</h2>
                </div>
                <div className={`shrink-0 rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider ${getStatusBadgeClassName(listing.status)}`}>
                  {listing.status}
                </div>
              </div>

              <div className="mt-6 space-y-4 rounded-2xl bg-gray-50 p-4">
                <InlineInfo label={t('machineDetails.locationLabel')} value={locationLabel} />
                <InlineInfo label={t('machineDetails.brandLabel')} value={listing.brand?.name || t('machineDetails.notSpecified')} />
                <InlineInfo label={t('machineDetails.modelLabel')} value={listing.model?.name || t('machineDetails.notSpecified')} />
                <InlineInfo label={t('profile.totalMedia')} value={String(listing.media?.length || 0)} />
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <Link
                  href="/profile"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FFC107] px-4 py-3 text-sm font-bold text-black transition hover:bg-[#FFB300]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t('profile.backToListings')}
                </Link>

                {listing.isPubliclyVisible !== false ? (
                  <Link
                    href={generateMachineSlugPath(listing)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                  >
                    {t('profile.openPublicPage')}
                  </Link>
                ) : null}
              </div>
            </section>

            {/* Technical Specifications Card (Moved to Right Sidebar with Own Vertical Scroll) */}
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-3 min-w-0">
                <div className="shrink-0 rounded-2xl bg-[#FFF4CC] p-3 text-[#C28A00]">
                  <Wrench className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base sm:text-lg font-black text-gray-900">{t('machineDetails.technicalSpecifications')}</h2>
                  <p className="truncate text-[10px] sm:text-xs text-gray-500">{t('profile.listingDetailSpecsSubtitle')}</p>
                </div>
              </div>

              <div 
                className="space-y-3 max-h-[380px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" 
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <SpecCard icon={<Truck className="h-4 w-4" />} label={t('machineDetails.equipmentTypeLabel')} value={listing.category?.name || t('machineDetails.na')} />
                <SpecCard icon={<Wrench className="h-4 w-4" />} label={t('machineDetails.conditionLabel')} value={listing.condition || t('machineDetails.na')} />
                <SpecCard icon={<Info className="h-4 w-4" />} label={t('machineDetails.variantLabel')} value={parsedDetails.variant || t('machineDetails.na')} />
                <SpecCard icon={<Calendar className="h-4 w-4" />} label={t('machineDetails.manufacturingYearLabel')} value={listing.manufacturingYear ? String(listing.manufacturingYear) : t('machineDetails.na')} />
                <SpecCard icon={<Fuel className="h-4 w-4" />} label={t('machineDetails.fuelTypeLabel')} value={listing.fuelType || parsedDetails.fuelType || t('machineDetails.na')} />
                <SpecCard icon={<Cog className="h-4 w-4" />} label={t('machineDetails.transmissionLabel')} value={listing.transmission || parsedDetails.transmission || t('machineDetails.na')} />
                <SpecCard icon={<ShieldCheck className="h-4 w-4" />} label={t('machineDetails.grossPowerLabel')} value={listing.grossPower || t('machineDetails.na')} />
                <SpecCard icon={<Clock className="h-4 w-4" />} label={t('machineDetails.operatingHoursLabel')} value={listing.operatingHours ? String(listing.operatingHours) : t('machineDetails.na')} />
                <SpecCard icon={<Calendar className="h-4 w-4" />} label={t('profile.registrationYear')} value={String(listing.registrationYear || parsedDetails.registrationYear || t('machineDetails.na'))} />
                <SpecCard icon={<Info className="h-4 w-4" />} label={t('profile.registrationNumber')} value={listing.registrationNo || parsedDetails.registrationNo || t('machineDetails.na')} />
                <SpecCard icon={<Info className="h-4 w-4" />} label={t('profile.chassisNumber')} value={listing.chassisOrSerialNo || parsedDetails.chassisOrSerialNo || t('machineDetails.na')} />
                <SpecCard icon={<UserRound className="h-4 w-4" />} label={t('profile.previousOwners')} value={String(listing.previousOwners || parsedDetails.previousOwners || t('machineDetails.na'))} />
                <SpecCard icon={<MapPin className="h-4 w-4" />} label={t('machineDetails.districtLabel')} value={parsedDetails.district || t('machineDetails.na')} />
                <SpecCard icon={<Globe className="h-4 w-4" />} label={t('profile.pinCode')} value={listing.pinCode || parsedDetails.pinCode || t('machineDetails.na')} />
                <SpecCard icon={<Navigation className="h-4 w-4" />} label={t('machineDetails.nearbyLandmarkLabel')} value={listing.nearbyLandmark || parsedDetails.nearbyLandmark || t('machineDetails.na')} />
                <SpecCard icon={<Calendar className="h-4 w-4" />} label={t('profile.insuranceExpiry')} value={listing.insuranceExpiry || parsedDetails.insuranceExpiry || t('machineDetails.na')} />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function HighlightCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white p-3.5 sm:p-5 shadow-sm min-w-0">
      <div className="mb-2 sm:mb-4 inline-flex rounded-xl sm:rounded-2xl bg-[#FFF4CC] p-2 sm:p-3">{icon}</div>
      <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] sm:tracking-[0.22em] text-gray-500 truncate">{label}</p>
      <p className="mt-1 sm:mt-2 text-sm sm:text-base font-bold text-gray-900 truncate">{value}</p>
    </div>
  );
}

function DetailSection({
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6"
      >
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg sm:text-xl font-black text-gray-900">{title}</h2>
          <p className="mt-1 truncate text-xs sm:text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="shrink-0 rounded-2xl bg-gray-100 p-2 text-gray-500">
          {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </button>
      {isOpen ? <div className="border-t border-gray-100 px-5 py-5 sm:px-6 sm:py-6">{children}</div> : null}
    </section>
  );
}

function SpecCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-[84px] items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="shrink-0 rounded-xl bg-white p-2 text-[#C28A00] shadow-sm">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold uppercase tracking-[0.18em] text-gray-500">{label}</p>
        <p className="mt-2 break-words text-sm font-semibold leading-6 text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function InlineInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-200/70 pb-3 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-[11px] sm:text-xs font-bold uppercase tracking-[0.16em] text-gray-500">{label}</span>
      <span className="min-w-0 break-words text-right text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function SafeListingImage({
  sources,
  alt,
  className,
  iconClassName = 'h-10 w-10',
}: {
  sources: string[];
  alt: string;
  className?: string;
  iconClassName?: string;
}) {
  const availableSources = sources.filter(Boolean);
  const [currentIndex, setCurrentIndex] = useState(0);
  const activeSource = availableSources[currentIndex] || '';

  if (!activeSource) {
    return (
      <div className="flex h-full items-center justify-center text-gray-300">
        <ImageIcon className={iconClassName} />
      </div>
    );
  }

  return (
    <Image
      src={getAbsoluteMediaUrl(activeSource)}
      alt={alt}
      fill
      unoptimized
      onError={() => {
        setCurrentIndex((previousIndex) => previousIndex + 1);
      }}
      className={className}
    />
  );
}
