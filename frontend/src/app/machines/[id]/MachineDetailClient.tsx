"use client";

import Image from 'next/image';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Award,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Cog,
  Cpu,
  Fuel,
  GitBranch,
  Globe,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Settings,
  Share2,
  ShieldCheck,
  Truck,
  Zap,
  Video,
  UserCircle,
} from 'lucide-react';
import type { MachineListingDetail } from './data';
import { getAbsoluteMediaUrl } from './data';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { generateMachineSlugPath } from '@/lib/seoUtils';
import { useAuthStore } from '@/store/authStore';
import CustomerPrimePaymentModal, { type CustomerPrimeFeature } from '@/components/payments/CustomerPrimePaymentModal';
import { createPublicContactEnquiry } from '@/lib/enquiries';
import { useToastStore } from '@/store/toastStore';
import { API_BASE_URL } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

type MachineDetailClientProps = {
  listing: MachineListingDetail;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

const getLocationLabel = (listing: MachineListingDetail, fallback: string) =>
  [listing.locationCity, listing.locationState].filter(Boolean).join(', ') || fallback;

const getWhatsappUrl = (phoneNumber?: string | null) => {
  const normalizedDigits = phoneNumber?.replace(/\D/g, '') || '';
  return normalizedDigits ? `https://wa.me/${normalizedDigits}` : null;
};

const getDialNumber = (phoneNumber?: string | null) => {
  const normalizedDigits = phoneNumber?.replace(/\D/g, '') || '';
  if (!normalizedDigits) {
    return '';
  }

  if (normalizedDigits.length === 10) {
    return `+91${normalizedDigits}`;
  }

  return normalizedDigits.startsWith('91') ? `+${normalizedDigits}` : `+${normalizedDigits}`;
};

type ParsedListingDetails = {
  variant: string;
  registrationYear: string;
  registrationNo: string;
  chassisOrSerialNo: string;
  previousOwners: string;
  fuelType: string;
  transmission: string;
  district: string;
  area: string;
  pinCode: string;
  nearbyLandmark: string;
  insuranceExpiry: string;
  rawDescription: string;
};

const getAvailabilityBadge = (status: string, labels: { sold: string; reserved: string; available: string }) => {
  const upperStatus = (status || '').toUpperCase();
  if (upperStatus === 'SOLD') {
    return (
      <span className="flex items-center gap-1.5 bg-[#ff3b40] text-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest rounded-sm shadow-sm">
        <CheckCircle2 size={12} strokeWidth={3} />
        {labels.sold}
      </span>
    );
  }
  if (upperStatus === 'RESERVED') {
    return <span className="bg-amber-500 text-white px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded shadow-sm">{labels.reserved}</span>;
  }
  return <span className="bg-green-600 text-white px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded shadow-sm">{labels.available}</span>;
};

const maskName = (name: string) => {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= 3) return trimmed.padEnd(6, '*');
  return `${trimmed.substring(0, 3)}***`;
};

const createEmptyParsedListingDetails = (): ParsedListingDetails => ({
  variant: '',
  registrationYear: '',
  registrationNo: '',
  chassisOrSerialNo: '',
  previousOwners: '',
  fuelType: '',
  transmission: '',
  district: '',
  area: '',
  pinCode: '',
  nearbyLandmark: '',
  insuranceExpiry: '',
  rawDescription: '',
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
      rawLines.push('');
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
      case 'area':
        parsed.area = value;
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

const getDescriptionParts = (listing: MachineListingDetail) => {
  const parsed = parseListingDescription(listing.description);
  const trimmedRaw = parsed.rawDescription?.trim() || '';
  return {
    overview: trimmedRaw,
    additional: listing.additionalDescription || '',
  };
};

const buildWhatsappMessage = (
  listing: MachineListingDetail,
  locationLabel: string,
  listingUrl: string,
  t: (key: string, params?: Record<string, string | number | boolean | null | undefined>) => string
) => {
  const lines = [
    t('machineDetails.whatsappIntro', { title: listing.title }),
    '',
    `${t('machineDetails.priceLabel')}: ${formatCurrency(listing.price)}`,
    `${t('machineDetails.locationLabel')}: ${locationLabel}`,
    `${t('machineDetails.brandLabel')}: ${listing.brand?.name || t('machineDetails.notSpecified')}`,
    `${t('machineDetails.modelLabel')}: ${listing.model?.name || t('machineDetails.notSpecified')}`,
    `${t('machineDetails.yearLabel')}: ${listing.manufacturingYear ? String(listing.manufacturingYear) : t('machineDetails.notSpecified')}`,
    `${t('machineDetails.listingLabel')}: ${listingUrl}`,
  ];

  return lines.join('\n');
};

export default function MachineDetailClient({ listing }: MachineDetailClientProps) {
  const { t } = useTranslation();
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const [expandedSections, setExpandedSections] = useState<string[]>(['machine', 'seller']);
  const [views, setViews] = useState<number>(listing.views || 0);
  const [pendingFeature, setPendingFeature] = useState<CustomerPrimeFeature | null>(null);
  const { user, setAuthModalOpen } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    // Only increment view once per load
    const incrementView = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/master/public-listings/${listing.id}/view`, {
          method: 'POST',
        });
        const data = await response.json();
        if (data.success && data.data?.views) {
          setViews(data.data.views);
        }
      } catch (error) {
        console.error('Failed to increment view', error);
      }
    };
    incrementView();
  }, [listing.id]);

  const images = listing.media.filter((media) => media.type === 'IMAGE');
  const videos = listing.media.filter((media) => media.type === 'VIDEO');
  const mainImage = images[activeImageIndex]?.url || listing.featuredImage;
  const partnerTypeLabel = !listing.partner?.partnerType
    ? t('machineDetails.marketplaceSeller')
    : listing.partner?.partnerType === 'PRIME_CUSTOMER'
      ? t('machineDetails.primeCustomer')
      : listing.partner?.partnerType === 'SHOWROOM' || listing.partner?.partnerType === 'DEALER'
        ? t('machineDetails.verifiedAuthorizedPlace')
        : listing.partner?.partnerType === 'BROKER'
          ? t('machineDetails.verifiedBroker')
          : t('machineDetails.verifiedPartnerLabel', { type: formatPartnerTypeLabel(listing.partner.partnerType, 'Partner') });
  const locationLabel = getLocationLabel(listing, t('machineDetails.locationNotAvailable'));
  const contactNumber = getDialNumber(listing.publicContact?.callNumber);
  const whatsappNumber = listing.publicContact?.whatsappNumber || '';
  const baseWhatsappUrl = getWhatsappUrl(whatsappNumber);
  const parsedDetails = parseListingDescription(listing.description);
  const descriptionParts = getDescriptionParts(listing);

  const listingUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `${API_BASE_URL.replace(/\/api\/?$/, '')}${generateMachineSlugPath(listing)}`;
  const soldPrice = listing.saleRecord?.soldPrice;
  const hasValidSoldPrice = typeof soldPrice === 'number' && Number.isFinite(soldPrice) && soldPrice > 0;
  const hasValidAskingPrice = typeof listing.price === 'number' && Number.isFinite(listing.price) && listing.price > 0;
  const soldPriceLabel = hasValidSoldPrice
    ? formatCurrency(soldPrice)
    : hasValidAskingPrice
      ? formatCurrency(listing.price)
      : t('machineDetails.notSpecified');
  const buyerName = listing.saleRecord?.buyerName?.trim()
    ? maskName(listing.saleRecord.buyerName.trim())
    : '';
  const whatsappMessage = buildWhatsappMessage(listing, locationLabel, listingUrl, t);
  const whatsappUrl = baseWhatsappUrl
    ? `${baseWhatsappUrl}?text=${encodeURIComponent(whatsappMessage)}`
    : null;
  const dealerProfileHref = listing.partner?.id ? `/dealers/${listing.partner.id}` : null;

  const toggleSection = (section: string) => {
    setExpandedSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section]
    );
  };

  const handleShare = async () => {
    if (typeof window === 'undefined') return;

    if (navigator.share) {
      await navigator.share({
        title: listing.title,
        url: window.location.href,
      });
      return;
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleProtectedAction = (feature: CustomerPrimeFeature) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    if (user.role !== 'CUSTOMER') {
      if (feature === 'CALL' && contactNumber) {
        window.location.href = `tel:${contactNumber}`;
      }

      if (feature === 'WHATSAPP' && whatsappUrl) {
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }

      return;
    }

    setPendingFeature(feature);
  };

  const executeProtectedAction = async (feature: CustomerPrimeFeature) => {
    try {
      await createPublicContactEnquiry({
        listingId: listing.id,
        enquiryType: feature === 'WHATSAPP' ? 'WHATSAPP' : 'CALL',
      });

      if (feature === 'CALL' && contactNumber) {
        window.location.href = `tel:${contactNumber}`;
      }

      if (feature === 'WHATSAPP' && whatsappUrl) {
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Failed to create public contact enquiry', error);
      showToast({
        title: t('dealers.enquiryNotCreated'),
        description: t('dealers.enquiryNotCreatedDescription'),
        variant: 'error',
      });
    } finally {
      setPendingFeature(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      <div className="w-full border-b border-gray-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center overflow-x-auto whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-gray-500 no-scrollbar">
          <Link href="/" className="flex-shrink-0 transition-colors hover:text-jcb-yellow">{t('navbar.home')}</Link>
          <ChevronRight size={14} className="mx-2 flex-shrink-0" />
          <Link href="/machines" className="flex-shrink-0 transition-colors hover:text-jcb-yellow">{t('machineDetails.usedEquipment')}</Link>
          <ChevronRight size={14} className="mx-2 flex-shrink-0" />
          <span className="flex-shrink-0">{listing.category?.name || t('machineDetails.machineDetail')}</span>
          <ChevronRight size={14} className="mx-2 flex-shrink-0" />
          <span className="max-w-[220px] flex-shrink-0 truncate font-bold text-gray-900 sm:max-w-none">
            {listing.title}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl sm:px-6 lg:px-8 py-0 sm:py-8">
        <div className="flex flex-col gap-2 sm:gap-8 lg:flex-row">
          <div className="min-w-0 flex-1">
            <div className="sm:mb-8 overflow-hidden sm:rounded-xl sm:border border-b border-gray-100 bg-white sm:shadow-sm">
              <div className="relative aspect-[4/3] bg-gray-100 sm:aspect-[16/10]">
                <div className="absolute top-4 left-4 z-10">
                  {getAvailabilityBadge(listing.status, {
                    sold: t('machines.sold'),
                    reserved: t('machines.reserved'),
                    available: t('machines.available'),
                  })}
                </div>
                {mainImage ? (
                  <Image
                    src={getAbsoluteMediaUrl(mainImage)}
                    alt={listing.title}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 66vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Truck size={64} className="text-gray-300" />
                  </div>
                )}

                {images.length > 0 && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-gray-800 shadow-sm backdrop-blur-sm">
                    <Camera size={14} />
                    <span>{activeImageIndex + 1} / {images.length}</span>
                  </div>
                )}
              </div>

              {images.length > 1 && (
                <div 
                  className="flex overflow-x-auto gap-2 sm:gap-3 border-t border-gray-100 p-3 sm:p-4 snap-x [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {images.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setActiveImageIndex(index)}
                        className={`relative aspect-[4/3] w-[80px] sm:h-20 sm:w-32 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all snap-center ${
                          activeImageIndex === index
                            ? 'border-jcb-yellow'
                            : 'border-transparent hover:border-gray-200'
                        }`}
                      >
                        <Image
                          src={getAbsoluteMediaUrl(image.url)}
                          alt={`${listing.title} ${index + 1}`}
                          fill
                          sizes="(max-width: 640px) 25vw, 128px"
                          className="object-cover"
                        />
                      </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="w-full flex-shrink-0 lg:w-[380px]">
            <div className="sm:rounded-xl sm:border border-y border-gray-100 sm:border-y-0 bg-white px-5 py-6 sm:p-6 sm:shadow-sm">
              <div className="mb-5">
                <h1 className="mb-1 text-2xl sm:text-[22px] font-extrabold text-[#1a202c] leading-tight">
                  {listing.title}
                </h1>
                
                <div className="mb-3 text-sm sm:text-[15px] font-medium text-gray-500">
                  {listing.manufacturingYear ? t('machineDetails.modelYearValue', { year: listing.manufacturingYear }) : t('machineDetails.yearNa')}
                </div>

                <div className="mb-4 flex items-center gap-1.5 text-[15px] text-gray-600">
                  <MapPin size={16} className="text-gray-500" />
                  <span>{locationLabel}</span>
                </div>

                <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-[#E6F4EA] px-3 py-1.5 text-sm font-semibold text-[#137333]">
                  <CheckCircle2 size={16} />
                  <span>{partnerTypeLabel}</span>
                </div>

                <div className="rounded-xl bg-gray-50 border border-gray-100 px-5 py-4 mb-6">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    <span>{listing.status === 'SOLD' ? 'Final Sold Price' : 'Asking Price'}</span>
                    {listing.status !== 'SOLD' && views > 0 && <span>{views} Views</span>}
                  </div>
                  <div className="text-3xl sm:text-[32px] font-extrabold tracking-tight text-[#1a202c] leading-none">
                    {listing.status === 'SOLD' 
                      ? soldPriceLabel
                      : formatCurrency(listing.price || 0)}
                  </div>
                </div>

                {listing.status === 'SOLD' ? (
                  <div className="mb-6 flex flex-col gap-3">
                    <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-50 px-4 py-3.5 font-bold text-gray-600 border border-gray-200 shadow-sm text-center text-[15px]">
                      <CheckCircle2 size={18} className="text-[#137333]" />
                      This equipment is sold out.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 mb-6">
                    {contactNumber ? (
                      <button
                        type="button"
                        onClick={() => handleProtectedAction('CALL')}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-3 font-bold text-black shadow-sm transition-colors hover:bg-[#FFB300]"
                      >
                        <Phone size={18} />
                        {t('machineDetails.callSeller')}
                      </button>
                    ) : (
                      <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-3 font-bold text-gray-400">
                        <Phone size={18} />
                        {t('dealers.contactUnavailable')}
                      </div>
                    )}

                    {whatsappUrl ? (
                      <button
                        type="button"
                        onClick={() => handleProtectedAction('WHATSAPP')}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#34A853] px-4 py-3 font-bold text-white shadow-sm transition-colors hover:bg-[#2b8c45]"
                      >
                        <MessageCircle size={18} />
                        {t('machineDetails.chatOnWhatsapp')}
                      </button>
                    ) : null}
                  </div>
                )}

                {listing.partner?.id && 
                 listing.partner?.partnerType !== 'PRIME_CUSTOMER' && 
                 listing.partner?.partnerType !== 'STANDARD_CUSTOMER' ? (
                  <Link
                    href={dealerProfileHref || '#'}
                    className="group block rounded-xl border border-gray-200 p-4 transition-all duration-200 hover:border-amber-400 hover:shadow-md hover:bg-amber-50/20"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {listing.partner?.logo ? (
                          <div className="relative h-[48px] w-[48px] flex-shrink-0 overflow-hidden rounded-full bg-gray-100 border border-gray-200">
                            <Image
                              src={getAbsoluteMediaUrl(listing.partner.logo)}
                              alt={listing.partner.name || t('machineDetails.dealerLogo')}
                              fill
                              sizes="48px"
                              className="object-cover transition-transform group-hover:scale-105"
                            />
                          </div>
                        ) : (
                          <div className="flex h-[48px] w-[48px] flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg font-bold uppercase text-amber-800 border border-amber-200 group-hover:bg-amber-200 transition-colors">
                            {listing.partner?.name?.charAt(0) || t('machineDetails.partnerInitialFallback')}
                          </div>
                        )}

                        <div className="min-w-0">
                          <h3 className="text-[16px] font-bold text-[#1a202c] truncate group-hover:text-amber-600 transition-colors">
                            {listing.partner?.name || t('machineDetails.verifiedPartner')}
                          </h3>
                          <div className="text-[12px] font-medium text-gray-500">{partnerTypeLabel}</div>
                        </div>
                      </div>

                      <ChevronRight size={18} className="text-gray-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
                    </div>
                  </Link>
                ) : (
                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-4">
                      {listing.partner?.logo ? (
                        <div className="relative h-[52px] w-[52px] flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                          <Image
                            src={getAbsoluteMediaUrl(listing.partner.logo)}
                            alt={listing.partner.name || t('machineDetails.dealerLogo')}
                            fill
                            sizes="52px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-xl font-bold uppercase text-gray-600">
                          {listing.partner?.name?.charAt(0) || t('machineDetails.partnerInitialFallback')}
                        </div>
                      )}

                      <div className="min-w-0">
                        <h3 className="text-[17px] font-bold text-[#1a202c]">
                          {listing.partner?.name || t('machineDetails.verifiedPartner')}
                        </h3>
                        <div className="text-[13px] text-gray-500">{partnerTypeLabel}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Purchased By Card */}
                {listing.status === 'SOLD' && (
                  <div className="mt-3 rounded-xl border border-gray-200 p-4 bg-gray-50/50">
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                        <UserCircle size={24} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Purchased By</div>
                        <h3 className="text-[16px] font-bold text-slate-800 truncate">
                          {buyerName || t('machineDetails.notSpecified')}
                        </h3>
                        {listing.saleRecord && (listing.saleRecord.buyerCity || listing.saleRecord.buyerState) && (
                          <div className="text-[12px] font-medium text-slate-500 mt-0.5">
                            {[listing.saleRecord.buyerCity, listing.saleRecord.buyerState].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center border-t border-gray-100 pt-6 text-xs font-semibold">
                <button
                  type="button"
                  onClick={handleShare}
                  className="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
                >
                  <Share2 size={14} className="transition-transform group-hover:scale-110" />
                  {t('machineDetails.share')}
                </button>
              </div>
            </div>
          </aside>
        </div>

        <div className="w-full mt-4 sm:mt-8 px-4 sm:px-0">
<section className="mb-10">
              <h2 className="mb-5 text-2xl font-bold text-gray-900">{t('machineDetails.keyHighlights')}</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <HighlightCard icon={<Settings className="text-jcb-yellow" size={20} />} label={t('machineDetails.conditionLabel')} value={listing.condition || t('machineDetails.na')} />
                <HighlightCard icon={<Zap className="text-jcb-yellow" size={20} />} label={t('machineDetails.grossPowerLabel')} value={listing.grossPower || t('machineDetails.na')} />
                <HighlightCard icon={<Clock className="text-jcb-yellow" size={20} />} label={t('machineDetails.hoursUsedLabel')} value={listing.operatingHours ? t('machineDetails.hoursValue', { count: listing.operatingHours }) : t('machineDetails.na')} />
                <HighlightCard icon={<MapPin className="text-jcb-yellow" size={20} />} label={t('machineDetails.locationLabel')} value={locationLabel} />
              </div>
            </section>

            {(descriptionParts.overview || descriptionParts.additional) && (
              <section className="mb-10">
                <h2 className="mb-5 text-2xl font-bold text-gray-900">{t('machineDetails.overview')}</h2>
                <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md sm:p-8">
                  {descriptionParts.overview && (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700 sm:text-base">
                      {descriptionParts.overview}
                    </p>
                  )}
                  {descriptionParts.additional && (
                    <div className={descriptionParts.overview ? 'mt-8' : ''}>
                      <h3 className="mb-3 text-sm font-bold text-gray-900">{t('machineDetails.additionalDescription')}</h3>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
                        {descriptionParts.additional}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {videos.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-5 text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Video className="text-jcb-yellow" size={24} />
                  {t('machineDetails.videos')}
                </h2>
                <div className={`grid grid-cols-1 gap-4 ${videos.length === 1 ? '' : 'sm:grid-cols-2'}`}>
                  {videos.map((video) => (
                    <div key={video.id} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                      <video
                        controls
                        className="w-full h-auto max-h-[70vh] object-contain bg-black"
                        src={getAbsoluteMediaUrl(video.url)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mb-10">
              <h2 className="mb-5 text-2xl font-bold text-gray-900">{t('machineDetails.technicalSpecifications')}</h2>
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <SpecAccordion
                  icon={<Truck className="h-5 w-5 text-amber-600" />}
                  title={t('machineDetails.vehicleDetails')}
                  isOpen={expandedSections.includes('machine')}
                  onToggle={() => toggleSection('machine')}
                >
                  <SpecsGrid
                    items={[
                      { icon: <Award className="h-4 w-4" />, label: t('machineDetails.brandLabel'), value: listing.brand?.name || t('machineDetails.na') },
                      { icon: <Cpu className="h-4 w-4" />, label: t('machineDetails.modelLabel'), value: listing.model?.name || t('machineDetails.na') },
                      { icon: <GitBranch className="h-4 w-4" />, label: t('machineDetails.variantLabel'), value: parsedDetails.variant || t('machineDetails.na') },
                      { icon: <Calendar className="h-4 w-4" />, label: t('machineDetails.manufacturingYearLabel'), value: listing.manufacturingYear ? String(listing.manufacturingYear) : t('machineDetails.na') },
                      { icon: <Zap className="h-4 w-4" />, label: t('machineDetails.grossPowerLabel'), value: listing.grossPower || t('machineDetails.na') },
                      { icon: <Truck className="h-4 w-4" />, label: t('machineDetails.equipmentTypeLabel'), value: listing.category?.name || t('machineDetails.na') },
                      { icon: <ShieldCheck className="h-4 w-4" />, label: t('machineDetails.conditionLabel'), value: listing.condition || t('machineDetails.na') },
                      { icon: <Clock className="h-4 w-4" />, label: t('machineDetails.operatingHoursLabel'), value: listing.operatingHours ? t('machineDetails.hoursValue', { count: listing.operatingHours }) : t('machineDetails.na') },
                    ]}
                  />
                </SpecAccordion>

                <SpecAccordion
                  icon={<MapPin className="h-5 w-5 text-amber-600" />}
                  title={t('machineDetails.registrationLocation')}
                  isOpen={expandedSections.includes('seller')}
                  onToggle={() => toggleSection('seller')}
                >
                  <SpecsGrid
                    items={[
                      { icon: <Fuel className="h-4 w-4" />, label: t('machineDetails.fuelTypeLabel'), value: parsedDetails.fuelType || t('machineDetails.na') },
                      { icon: <Cog className="h-4 w-4" />, label: t('machineDetails.transmissionLabel'), value: parsedDetails.transmission || t('machineDetails.na') },
                      { icon: <MapPin className="h-4 w-4" />, label: t('machineDetails.districtLabel'), value: parsedDetails.district || listing.partner?.district || t('machineDetails.na') },
                      { icon: <Navigation className="h-4 w-4" />, label: t('machineDetails.nearbyLandmarkLabel'), value: parsedDetails.nearbyLandmark || t('machineDetails.na') },
                      { icon: <Globe className="h-4 w-4" />, label: t('machineDetails.locationLabel'), value: locationLabel },
                    ]}
                  />
                </SpecAccordion>
              </div>
            </section>
        </div>
      </div>
      {pendingFeature ? (
        <CustomerPrimePaymentModal
          isOpen={!!pendingFeature}
          feature={pendingFeature}
          onClose={() => setPendingFeature(null)}
          onAccessGranted={() => {
            void executeProtectedAction(pendingFeature);
          }}
        />
      ) : null}
    </div>
  );
}

function HighlightCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="group flex flex-col rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-yellow-50 transition-colors group-hover:bg-yellow-100">
        {icon}
      </div>
      <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function SpecAccordion({
  icon,
  title,
  isOpen,
  onToggle,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between bg-white px-6 py-5 text-left transition-colors hover:bg-amber-50/30"
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100/80 text-amber-700 font-bold shadow-2xs">
              {icon}
            </div>
          )}
          <span className="text-base font-bold text-gray-900">{title}</span>
        </div>
        {isOpen ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
      </button>
      {isOpen && <div className="px-6 pb-6 pt-2">{children}</div>}
    </div>
  );
}

type SpecItem = {
  icon: React.ReactNode;
  label: string;
  value: string;
};

function SpecsGrid({ items }: { items: SpecItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 lg:gap-x-12 gap-y-1">
      {items.map(({ icon, label, value }) => (
        <div 
          key={label} 
          className="group flex items-center justify-between py-3 px-3 rounded-xl transition-all duration-200 hover:bg-slate-50 border-b border-gray-100/70 sm:border-b-0"
        >
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-100 group-hover:text-amber-700 flex-shrink-0">
              {icon}
            </div>
            <span className="text-sm font-medium text-gray-600 truncate">{label}</span>
          </div>
          <span className="text-sm font-bold text-gray-900 break-words text-right">{value}</span>
        </div>
      ))}
    </div>
  );
}
