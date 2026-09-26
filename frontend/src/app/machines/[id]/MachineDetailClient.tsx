"use client";

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
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
  CreditCard,
  Cpu,
  FileText,
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
  Play,
  UserCircle,
  X,
  ChevronLeft,
  Car,
  Hash,
  UserCheck,
} from 'lucide-react';
import type { MachineListingDetail } from './data';
import { getAbsoluteMediaUrl } from './data';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { generateMachineSlugPath } from '@/lib/seoUtils';
import { useAuthStore } from '@/store/authStore';
import CustomerPrimePaymentModal, { type CustomerPrimeFeature } from '@/components/payments/CustomerPrimePaymentModal';
import ListingBuyNowModal from '@/components/payments/ListingBuyNowModal';
import { createPublicContactEnquiry } from '@/lib/enquiries';
import { getPublicAnalyticsIdentity } from '@/lib/analytics';
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

const getVideoMimeType = (url?: string | null): string | undefined => {
  const normalizedUrl = String(url || '').toLowerCase();
  if (normalizedUrl.endsWith('.webm')) return 'video/webm';
  if (normalizedUrl.endsWith('.mov')) return 'video/quicktime';
  if (normalizedUrl.endsWith('.mp4')) return 'video/mp4';
  return undefined;
};

const getLocationLabel = (listing: MachineListingDetail, fallback: string) => {
  const invalidValues = new Set(['n/a', 'na', 'nan', 'null', 'undefined']);
  const parts = [listing.locationCity, listing.locationState]
    .map((value) => value?.trim())
    .filter((value): value is string => typeof value === 'string' && Boolean(value) && !invalidValues.has(value.toLowerCase()));

  return parts.join(', ') || fallback;
};

const formatDateOnly = (value?: string | null) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  const dateOnlyMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatRegistrationNumber = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '';

  const compact = normalized.replace(/[\s-]+/g, '');
  const standardMatch = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
  if (standardMatch) {
    return [standardMatch[1], standardMatch[2], standardMatch[3], standardMatch[4]].join('-');
  }

  const stateAndNumberMatch = compact.match(/^([A-Z]{2})(\d{1,2})(\d{1,4})$/);
  if (stateAndNumberMatch) {
    return [stateAndNumberMatch[1], stateAndNumberMatch[2], stateAndNumberMatch[3]].join('-');
  }

  return normalized.replace(/[\s-]+/g, '-');
};

const formatAddressWithoutPinCode = (address?: string | null, pinCode?: string | null) => {
  const normalizedAddress = String(address || '').trim();
  const normalizedPinCode = String(pinCode || '').trim();
  if (!normalizedAddress || !normalizedPinCode) return normalizedAddress;

  const escapedPinCode = normalizedPinCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return normalizedAddress
    .replace(new RegExp(`\\s*(?:,|-)\\s*${escapedPinCode}\\s*$`, 'i'), '')
    .replace(new RegExp(`\\s+${escapedPinCode}\\s*$`, 'i'), '')
    .replace(/[\s,-]+$/, '')
    .trim();
};

const getWhatsappUrl = (phoneNumber?: string | null) => {
  const normalizedDigits = phoneNumber?.replace(/\D/g, '') || '';
  if (!normalizedDigits) {
    return null;
  }

  const fullNumber = normalizedDigits.length === 10 ? `91${normalizedDigits}` : normalizedDigits;
  return `https://wa.me/${fullNumber}`;
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
  address: string;
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
  address: '',
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
      case 'address':
        parsed.address = value;
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
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);

  const [activeTab, setActiveTab] = useState<'machine' | 'seller' | 'rto'>('machine');
  const [views, setViews] = useState<number>(listing.views || 0);
  const [pendingFeature, setPendingFeature] = useState<CustomerPrimeFeature | null>(null);
  const [isBuyNowOpen, setIsBuyNowOpen] = useState(false);
  const { user, setAuthModalOpen } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const isOwnListing = Boolean(user?.id && listing.partner?.ownerUserId === user.id);

  const scrollThumbnails = (direction: 'left' | 'right') => {
    if (thumbnailStripRef.current) {
      const scrollAmount = direction === 'left' ? -220 : 220;
      thumbnailStripRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    // Only increment view once per load
    const incrementView = async () => {
      try {
        const identity = getPublicAnalyticsIdentity();
        const response = await fetch(`${API_BASE_URL}/master/public-listings/${listing.id}/view`, {
          method: 'POST',
          headers: identity ? { 'Content-Type': 'application/json' } : undefined,
          body: identity ? JSON.stringify(identity) : undefined,
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
  
  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLightboxOpen(false);
      if (e.key === 'ArrowLeft') setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      if (e.key === 'ArrowRight') setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, images.length]);

  useEffect(() => {
    if (isLightboxOpen || isVideoModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isLightboxOpen, isVideoModalOpen]);

  useEffect(() => {
    if (!isVideoModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsVideoModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVideoModalOpen]);

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
  const detailVariant = listing.variant || parsedDetails.variant;
  const detailRegistrationYear = listing.registrationYear || parsedDetails.registrationYear;
  const detailRegistrationNo = listing.registrationNo || parsedDetails.registrationNo;
  const detailChassisNo = listing.chassisOrSerialNo || parsedDetails.chassisOrSerialNo;
  const detailPreviousOwners = listing.previousOwners || parsedDetails.previousOwners;
  const detailFuelType = listing.fuelType || parsedDetails.fuelType;
  const detailTransmission = listing.transmission || parsedDetails.transmission;
  const detailPinCode = listing.pinCode || parsedDetails.pinCode;
  const detailLandmark = listing.nearbyLandmark || parsedDetails.nearbyLandmark;
  const detailInsuranceExpiry = listing.insuranceExpiry || parsedDetails.insuranceExpiry;
  const detailAddress = formatAddressWithoutPinCode(
    listing.address || parsedDetails.address || parsedDetails.district,
    detailPinCode,
  );
  const detailRegistrationNumber = formatRegistrationNumber(
    listing.vehicleCompliance?.vehicleNumber || detailRegistrationNo,
  );

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



  const handleShare = async () => {
    if (typeof window === 'undefined') return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: listing.title,
          text: `Check out ${listing.title} on JCB Exchange`,
          url: window.location.href,
        });
        return;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
          return;
        }
        console.error('Native share failed, falling back to clipboard:', err);
      }
    }

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast({ title: t('machineDetails.linkCopied', 'Link copied to clipboard!'), variant: 'success' });
      } catch (err) {
        console.error('Clipboard copy failed:', err);
      }
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
      if (feature === 'BUY_NOW') {
        setIsBuyNowOpen(true);
        return;
      }

      if (feature === 'CALL' && contactNumber) {
        window.location.href = `tel:${contactNumber}`;
      }

      if (feature === 'WHATSAPP' && whatsappUrl) {
        window.open(whatsappUrl, '_blank');
      }

      // Log enquiry asynchronously in background
      void createPublicContactEnquiry({
        listingId: listing.id,
        enquiryType: feature === 'WHATSAPP' ? 'WHATSAPP' : 'CALL',
      }).catch((error) => {
        console.error('Failed to create public contact enquiry', error);
      });
    } catch (error) {
      console.error('Failed to execute protected action', error);
      showToast({
        title: t('dealers.enquiryNotCreated'),
        description: t('dealers.enquiryNotCreatedDescription'),
        variant: 'error',
      });
    } finally {
      setPendingFeature(null);
    }
  };

  const handleBuyNowClick = () => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    if (user.role !== 'CUSTOMER') {
      showToast({
        title: 'Customer login required',
        description: 'Buy Now payment is available for customer accounts.',
        variant: 'error',
      });
      return;
    }

    if (isOwnListing) {
      showToast({
        title: 'Purchase unavailable',
        description: 'This is your own listing. You cannot buy your own vehicle.',
        variant: 'error',
      });
      return;
    }

    handleProtectedAction('BUY_NOW');
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20 overflow-x-hidden w-full max-w-[100vw] flex flex-col">
      <div className="w-full border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl py-3 w-[calc(100%-2rem)] sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)] items-center overflow-x-auto whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-gray-500 no-scrollbar">
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

      <div className="mx-auto max-w-7xl py-4 sm:py-8 w-[calc(100%-2rem)] sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <div className="flex flex-col gap-6 sm:gap-8 lg:flex-row max-w-full">
          <div className="min-w-0 flex-1 max-w-full">
            <div className="mb-6 sm:mb-8 overflow-hidden rounded-xl border border-gray-200 sm:border-gray-100 bg-white shadow-xs sm:shadow-sm max-w-full">
              <div 
                className="relative aspect-[4/3] bg-gray-100 sm:aspect-[16/10] cursor-pointer group"
                onClick={() => mainImage && setIsLightboxOpen(true)}
              >
                <div className="absolute top-4 left-4 z-10">
                  {getAvailabilityBadge(listing.status, {
                    sold: t('machines.sold'),
                    reserved: t('machines.reserved'),
                    available: t('machines.available'),
                  })}
                </div>

                {videos.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsVideoModalOpen(true);
                    }}
                    className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/85 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur-md shadow-xl transition-all duration-200 hover:bg-slate-900 hover:border-red-500/60 hover:scale-105 group cursor-pointer"
                    title={t('machineDetails.watchVideo', 'Watch Machine Video')}
                  >
                    <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-red-600 group-hover:bg-red-500 transition-colors shadow-xs">
                      <Play size={12} className="fill-white text-white ml-0.5" />
                      <span className="absolute -inset-0.5 rounded-full bg-red-500/40 animate-ping opacity-75 group-hover:opacity-100" />
                    </div>
                    <span className="font-bold text-white tracking-wide">
                      {t('machineDetails.watchVideo', 'Watch Video')}
                    </span>
                    {videos.length > 1 && (
                      <span className="rounded-full bg-red-500/30 px-1.5 py-0.5 text-[10px] font-extrabold text-red-200">
                        {videos.length}
                      </span>
                    )}
                  </button>
                )}
                {mainImage ? (
                  <Image
                    src={getAbsoluteMediaUrl(mainImage)}
                    alt={listing.title}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 66vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Truck size={64} className="text-gray-300" />
                  </div>
                )}

                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                      }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-xs transition-all hover:bg-black/80 hover:scale-110"
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={20} />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-xs transition-all hover:bg-black/80 hover:scale-110"
                      aria-label="Next image"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}

                {images.length > 0 && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-gray-800 shadow-sm backdrop-blur-sm">
                    <Camera size={14} />
                    <span>{activeImageIndex + 1} / {images.length}</span>
                  </div>
                )}

                {(images[activeImageIndex]?.createdAt || listing.createdAt) && (
                  <div className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm" title="Upload Date">
                    <Clock size={14} />
                    <span suppressHydrationWarning>
                      {new Date(images[activeImageIndex]?.createdAt || listing.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </span>
                  </div>
                )}
              </div>

              {(images.length > 1 || videos.length > 0) && (
                <div className="relative border-t border-gray-100 p-2 sm:p-3">
                  <button
                    type="button"
                    onClick={() => scrollThumbnails('left')}
                    className="absolute left-1 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-700 shadow-md border border-gray-200 transition-all hover:bg-amber-50 hover:text-black hover:border-amber-300"
                    aria-label="Scroll thumbnails left"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div 
                    ref={thumbnailStripRef}
                    className="flex overflow-x-auto gap-2 sm:gap-3 snap-x [&::-webkit-scrollbar]:hidden w-full scroll-smooth px-7"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {images.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setActiveImageIndex(index)}
                        className={`relative aspect-[4/3] w-[80px] sm:h-20 sm:w-32 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all snap-center ${
                          activeImageIndex === index
                            ? 'border-jcb-yellow shadow-xs scale-[0.98]'
                            : 'border-transparent hover:border-gray-200 opacity-90 hover:opacity-100'
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

                    {videos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const section = document.getElementById('videos-section');
                          if (section) {
                            section.scrollIntoView({ behavior: 'smooth' });
                            const videoEl = section.querySelector('video');
                            if (videoEl) {
                              videoEl.play().catch(() => {});
                            }
                          }
                        }}
                        className="relative aspect-[4/3] w-[80px] sm:h-20 sm:w-32 flex-shrink-0 overflow-hidden rounded-lg border-2 border-red-500/80 bg-slate-900 text-white flex flex-col items-center justify-center gap-1 transition-all hover:scale-[1.03] shadow-sm group snap-center"
                        title="Watch Machine Video"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 group-hover:bg-red-700 transition-colors shadow-md">
                          <Play size={12} className="fill-white text-white ml-0.5" />
                        </div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-100">Video</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => scrollThumbnails('right')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-700 shadow-md border border-gray-200 transition-all hover:bg-amber-50 hover:text-black hover:border-amber-300"
                    aria-label="Scroll thumbnails right"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside className="w-full flex-shrink-0 lg:w-[380px] min-w-0">
            <div className="rounded-xl border border-gray-200 sm:border-gray-100 bg-white px-4 py-5 sm:p-6 shadow-xs sm:shadow-sm">
              <div className="mb-5">
                <h1 className="mb-2 text-lg sm:text-xl font-bold text-gray-900 leading-snug tracking-tight break-words max-w-full">
                  {listing.title}
                </h1>
                
                <div className="mb-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500 font-normal">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-gray-400 shrink-0" />
                    <span>
                      {listing.manufacturingYear ? t('machineDetails.modelYearValue', { year: listing.manufacturingYear }) : t('machineDetails.yearNa')}
                    </span>
                  </div>
                  <span className="text-gray-300">•</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin size={13} className="text-gray-400 shrink-0" />
                    <span className="truncate" title={locationLabel}>{locationLabel}</span>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-medium tracking-wide text-emerald-700">
                    <CheckCircle2 size={12} className="shrink-0 text-emerald-600" />
                    <span className="uppercase">{partnerTypeLabel}</span>
                  </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-br from-gray-50/90 to-gray-100/50 border border-gray-200/70 p-4 sm:p-5 mb-6 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{listing.status === 'SOLD' ? 'Final Sold Price' : 'Asking Price'}</span>
                    {listing.status !== 'SOLD' && views > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 shadow-xs border border-gray-100">
                        {views} {views === 1 ? 'view' : 'views'}
                      </span>
                    )}
                  </div>
                  <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 leading-none">
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
                    {listing.buyNowPaymentAvailable && isOwnListing ? (
                      <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-center text-sm font-bold text-amber-900">
                        This is your own listing. You cannot buy your own vehicle.
                      </div>
                    ) : listing.buyNowPaymentAvailable ? (
                      <button
                        type="button"
                        onClick={handleBuyNowClick}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#111827] px-4 py-3 font-bold text-white shadow-sm transition-colors hover:bg-black"
                      >
                        <CreditCard size={18} />
                        Buy Now
                      </button>
                    ) : null}

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

        <div className="w-full mt-4 sm:mt-8 min-w-0">
            <section className="mb-10">
              <h2 className="mb-4 sm:mb-5 text-xl sm:text-2xl font-bold text-gray-900">{t('machineDetails.keyHighlights')}</h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <HighlightCard icon={<Settings className="text-jcb-yellow" size={20} />} label={t('machineDetails.conditionLabel')} value={listing.condition || t('machineDetails.na')} />
                <HighlightCard icon={<Calendar className="text-jcb-yellow" size={20} />} label={t('machineDetails.manufacturingYearLabel')} value={listing.manufacturingYear ? String(listing.manufacturingYear) : t('machineDetails.na')} />
                <HighlightCard icon={<Clock className="text-jcb-yellow" size={20} />} label={t('machineDetails.hoursUsedLabel')} value={listing.operatingHours ? t('machineDetails.hoursValue', { count: listing.operatingHours }) : t('machineDetails.na')} />
                <HighlightCard icon={<Zap className="text-jcb-yellow" size={20} />} label={t('machineDetails.grossPowerLabel')} value={listing.grossPower || t('machineDetails.na')} />
                <HighlightCard icon={<UserCheck className="text-jcb-yellow" size={20} />} label={t('machineDetails.previousOwnersLabel', 'Owners')} value={detailPreviousOwners ? (detailPreviousOwners === '1' ? '1st Owner' : detailPreviousOwners === '2' ? '2nd Owner' : `${detailPreviousOwners} Owners`) : t('machineDetails.na')} />
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
              <section id="videos-section" className="mb-10">
                <h2 className="mb-5 text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Video className="text-jcb-yellow" size={24} />
                  {t('machineDetails.videos')}
                </h2>
                <div className={`grid grid-cols-1 gap-4 ${videos.length === 1 ? '' : 'sm:grid-cols-2'}`}>
                  {videos.map((video) => (
                    <div key={video.id} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                      <video
                        controls
                        muted
                        playsInline
                        className="w-full h-auto max-h-[70vh] object-contain bg-black"
                        preload="metadata"
                      >
                        <source src={getAbsoluteMediaUrl(video.url)} type={getVideoMimeType(video.url)} />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mb-10">
              <h2 className="mb-5 text-2xl font-bold text-gray-900">{t('machineDetails.technicalSpecifications')}</h2>
              
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex overflow-x-auto border-b border-gray-200 no-scrollbar">
                  <button
                    onClick={() => setActiveTab('machine')}
                    className={`flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap border-b-2 px-4 sm:px-6 py-4 text-sm font-bold transition-colors ${
                      activeTab === 'machine'
                        ? 'border-jcb-yellow text-gray-900 bg-gray-50/50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50/50'
                    }`}
                  >
                    <Truck className={`h-4 w-4 sm:h-5 sm:w-5 ${activeTab === 'machine' ? 'text-jcb-yellow' : 'text-gray-400'}`} />
                    {t('machineDetails.vehicleDetails')}
                  </button>
                  <button
                    onClick={() => setActiveTab('seller')}
                    className={`flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap border-b-2 px-4 sm:px-6 py-4 text-sm font-bold transition-colors ${
                      activeTab === 'seller'
                        ? 'border-jcb-yellow text-gray-900 bg-gray-50/50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50/50'
                    }`}
                  >
                    <MapPin className={`h-4 w-4 sm:h-5 sm:w-5 ${activeTab === 'seller' ? 'text-jcb-yellow' : 'text-gray-400'}`} />
                    {t('machineDetails.registrationLocation')}
                  </button>
                  {listing.vehicleCompliance && (
                    <button
                      onClick={() => setActiveTab('rto')}
                      className={`flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap border-b-2 px-4 sm:px-6 py-4 text-sm font-bold transition-colors ${
                        activeTab === 'rto'
                          ? 'border-jcb-yellow text-gray-900 bg-gray-50/50'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50/50'
                      }`}
                    >
                      <Car className={`h-4 w-4 sm:h-5 sm:w-5 ${activeTab === 'rto' ? 'text-jcb-yellow' : 'text-gray-400'}`} />
                      Vehicle Compliance
                    </button>
                  )}
                </div>

                <div className="p-4 sm:p-6 bg-white min-h-[300px]">
                  {activeTab === 'machine' && (
                    <div className="animate-in fade-in duration-300">
                      <SpecsGrid
                        items={[
                          { icon: <Award className="h-4 w-4" />, label: t('machineDetails.brandLabel'), value: listing.brand?.name || t('machineDetails.na') },
                          { icon: <Cpu className="h-4 w-4" />, label: t('machineDetails.modelLabel'), value: listing.model?.name || t('machineDetails.na') },
                          { icon: <GitBranch className="h-4 w-4" />, label: t('machineDetails.variantLabel'), value: detailVariant || t('machineDetails.na') },
                          { icon: <Truck className="h-4 w-4" />, label: t('machineDetails.equipmentTypeLabel'), value: listing.category?.name || t('machineDetails.na') },
                          { icon: <Calendar className="h-4 w-4" />, label: t('machineDetails.manufacturingYearLabel'), value: listing.manufacturingYear ? String(listing.manufacturingYear) : t('machineDetails.na') },
                          { icon: <Clock className="h-4 w-4" />, label: t('machineDetails.operatingHoursLabel'), value: listing.operatingHours ? t('machineDetails.hoursValue', { count: listing.operatingHours }) : t('machineDetails.na') },
                          { icon: <Zap className="h-4 w-4" />, label: t('machineDetails.grossPowerLabel'), value: listing.grossPower || t('machineDetails.na') },
                          { icon: <ShieldCheck className="h-4 w-4" />, label: t('machineDetails.conditionLabel'), value: listing.condition || t('machineDetails.na') },
                          { icon: <Fuel className="h-4 w-4" />, label: t('machineDetails.fuelTypeLabel'), value: detailFuelType || t('machineDetails.na') },
                          { icon: <Cog className="h-4 w-4" />, label: t('machineDetails.transmissionLabel'), value: detailTransmission || t('machineDetails.na') },
                          { icon: <UserCheck className="h-4 w-4" />, label: t('machineDetails.previousOwnersLabel', 'Previous Owners'), value: detailPreviousOwners ? (detailPreviousOwners === '1' ? '1st Owner' : detailPreviousOwners === '2' ? '2nd Owner' : `${detailPreviousOwners} Owners`) : t('machineDetails.na') },
                          { icon: <Hash className="h-4 w-4" />, label: t('machineDetails.chassisNoLabel', 'Chassis / Serial No.'), value: detailChassisNo || t('machineDetails.na') },
                        ]}
                      />
                    </div>
                  )}

                  {activeTab === 'seller' && (
                    <div className="animate-in fade-in duration-300">
                      <SpecsGrid
                        items={[
                          { icon: <Car className="h-4 w-4" />, label: t('machineDetails.registrationNoLabel', 'Registration No.'), value: detailRegistrationNumber || t('machineDetails.na') },
                          { icon: <Calendar className="h-4 w-4" />, label: t('machineDetails.registrationYearLabel', 'Registration Year'), value: detailRegistrationYear || t('machineDetails.na') },
                          { icon: <CreditCard className="h-4 w-4" />, label: t('machineDetails.insuranceExpiryLabel', 'Insurance Expiry'), value: formatDateOnly(listing.vehicleCompliance?.insuranceValidUntil || detailInsuranceExpiry) || t('machineDetails.na') },
                          { icon: <CheckCircle2 className="h-4 w-4" />, label: t('machineDetails.availabilityLabel', 'Availability'), value: listing.currentAvailability || (listing.status === 'SOLD' ? 'SOLD' : listing.status === 'RESERVED' ? 'RESERVED' : 'AVAILABLE') },
                          { icon: <CreditCard className="h-4 w-4" />, label: t('machineDetails.negotiableLabel', 'Price Negotiable'), value: listing.isNegotiable ? 'Yes' : 'No' },
                          { icon: <Globe className="h-4 w-4" />, label: t('machineDetails.locationLabel'), value: locationLabel },
                          { icon: <MapPin className="h-4 w-4" />, label: t('machineDetails.addressLabel', 'Address'), value: detailAddress || t('machineDetails.na') },
                          { icon: <Navigation className="h-4 w-4" />, label: t('machineDetails.nearbyLandmarkLabel'), value: detailLandmark || t('machineDetails.na') },
                          { icon: <FileText className="h-4 w-4" />, label: t('machineDetails.pinCodeLabel', 'PIN Code'), value: detailPinCode || t('machineDetails.na') },
                        ]}
                      />
                    </div>
                  )}

                  {activeTab === 'rto' && listing.vehicleCompliance && (
                    <div className="animate-in fade-in duration-300">
                      {listing.vehicleCompliance.vehicleNumber && (
                        <div className="mb-6 flex items-center gap-4 rounded-xl bg-amber-50 border border-amber-100 px-5 py-4">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shadow-sm">
                            <Car className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-0.5">Vehicle Number</p>
                            <p className="text-xl font-extrabold tracking-widest text-gray-900">{formatRegistrationNumber(listing.vehicleCompliance.vehicleNumber)}</p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {([
                          { label: 'Hire Purchase', value: listing.vehicleCompliance.hirePurchaseStatus, type: 'hp' },
                          { label: 'Tax Validity', value: listing.vehicleCompliance.taxStatus, date: listing.vehicleCompliance.taxValidUntil, type: 'validity' },
                          { label: 'Fitness Validity', value: listing.vehicleCompliance.fitnessStatus, date: listing.vehicleCompliance.fitnessValidUntil, type: 'validity' },
                          { label: 'Insurance Validity', value: listing.vehicleCompliance.insuranceStatus, date: listing.vehicleCompliance.insuranceValidUntil, type: 'validity' },
                          { label: 'PUC Validity', value: listing.vehicleCompliance.pucStatus, date: listing.vehicleCompliance.pucValidUntil, type: 'validity' },
                          { label: 'HSRP', value: listing.vehicleCompliance.hsrpStatus, type: 'hsrp' },
                        ] as { label: string; value: string | null; date?: string | null; type: string }[]).map(({ label, value, date, type }) => {
                          const normalizedValue = (value || '').toUpperCase();
                          let badgeClass = 'bg-gray-100 text-gray-500 border border-gray-200';
                          let dotClass = 'bg-gray-400';
                          let displayLabel = value || 'N/A';

                          if (type === 'hp') {
                            if (normalizedValue === 'TERMINATED') { badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200'; dotClass = 'bg-emerald-500'; displayLabel = 'Terminated (Clear)'; }
                            else if (normalizedValue === 'ACTIVE') { badgeClass = 'bg-red-50 text-red-700 border border-red-200'; dotClass = 'bg-red-500'; displayLabel = 'Active'; }
                            else if (normalizedValue === 'NOT_APPLICABLE') { badgeClass = 'bg-gray-50 text-gray-500 border border-gray-200'; dotClass = 'bg-gray-400'; displayLabel = 'Not Applicable'; }
                            else { badgeClass = 'bg-yellow-50 text-yellow-700 border border-yellow-200'; dotClass = 'bg-yellow-500'; }
                          } else if (type === 'validity') {
                            if (normalizedValue === 'VALID') { badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200'; dotClass = 'bg-emerald-500'; displayLabel = 'Valid'; }
                            else if (normalizedValue === 'EXPIRED') { badgeClass = 'bg-red-50 text-red-700 border border-red-200'; dotClass = 'bg-red-500'; displayLabel = 'Expired'; }
                            else if (normalizedValue === 'NOT_AVAILABLE') { badgeClass = 'bg-gray-50 text-gray-500 border border-gray-200'; dotClass = 'bg-gray-400'; displayLabel = 'Not Available'; }
                            else { badgeClass = 'bg-yellow-50 text-yellow-700 border border-yellow-200'; dotClass = 'bg-yellow-500'; }
                          } else if (type === 'hsrp') {
                            if (normalizedValue === 'YES') { badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200'; dotClass = 'bg-emerald-500'; displayLabel = 'Yes'; }
                            else if (normalizedValue === 'NO') { badgeClass = 'bg-red-50 text-red-700 border border-red-200'; dotClass = 'bg-red-500'; displayLabel = 'No'; }
                            else if (normalizedValue === 'NOT_APPLICABLE') { badgeClass = 'bg-gray-50 text-gray-500 border border-gray-200'; dotClass = 'bg-gray-400'; displayLabel = 'Not Applicable'; }
                            else { badgeClass = 'bg-yellow-50 text-yellow-700 border border-yellow-200'; dotClass = 'bg-yellow-500'; displayLabel = 'Pending'; }
                          }

                          return (
                            <div key={label} className="flex flex-col gap-1.5 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3.5 hover:shadow-sm transition-shadow">
                              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
                              <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-xs ${badgeClass}`}>
                                <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
                                {displayLabel}
                              </span>
                              {date && (
                                <span className="text-[11px] font-medium text-gray-500 mt-1 flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Until: {formatDateOnly(date) || t('machineDetails.na')}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {(listing.vehicleCompliance.rtoOffice || listing.vehicleCompliance.rtoAgentName || listing.vehicleCompliance.rtoExpenses != null || listing.vehicleCompliance.vehicleMaintenanceCost != null) && (
                        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {[
                            ['RTO Office', listing.vehicleCompliance.rtoOffice],
                            ['RTO Agent Name', listing.vehicleCompliance.rtoAgentName],
                            ['RTO Expenses', listing.vehicleCompliance.rtoExpenses != null ? formatCurrency(listing.vehicleCompliance.rtoExpenses) : null],
                            ['Vehicle Maintenance Cost', listing.vehicleCompliance.vehicleMaintenanceCost != null ? formatCurrency(listing.vehicleCompliance.vehicleMaintenanceCost) : null],
                          ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                            <div key={label} className="flex items-center gap-3.5 rounded-xl border border-gray-100 bg-gray-50/80 px-5 py-4 hover:shadow-sm transition-shadow">
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 shadow-sm">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-0.5">{label}</p>
                                <p className="text-[15px] font-bold text-gray-900">{value}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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

      <ListingBuyNowModal
        isOpen={isBuyNowOpen}
        listingId={listing.id}
        fallbackTitle={listing.title}
        fallbackAmount={listing.price}
        buyer={user}
        onClose={() => setIsBuyNowOpen(false)}
      />

      {isLightboxOpen && mainImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm transition-all duration-300"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button 
            onClick={(e) => { e.stopPropagation(); setIsLightboxOpen(false); }}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 z-[110] rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          >
            <X size={28} />
          </button>
          
          <div className="h-full w-full max-h-screen max-w-7xl flex items-center justify-center p-4 sm:p-12 md:p-16" onClick={(e) => e.stopPropagation()}>
            <div className="relative h-full w-full">
              <Image
                src={getAbsoluteMediaUrl(mainImage)}
                alt={listing.title}
                fill
                sizes="100vw"
                className="object-contain"
                quality={100}
                priority
              />
            </div>
          </div>

          {images.length > 1 && (
            <>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                }}
                className="absolute left-2 sm:left-8 z-[110] rounded-full bg-black/40 sm:bg-white/10 p-2 sm:p-3 text-white hover:bg-white/20 transition-all backdrop-blur-md sm:hover:scale-110"
              >
                <ChevronLeft size={24} className="sm:w-8 sm:h-8" />
              </button>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
                }}
                className="absolute right-2 sm:right-8 z-[110] rounded-full bg-black/40 sm:bg-white/10 p-2 sm:p-3 text-white hover:bg-white/20 transition-all backdrop-blur-md sm:hover:scale-110"
              >
                <ChevronRight size={24} className="sm:w-8 sm:h-8" />
              </button>
            </>
          )}

          {images.length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[110] rounded-full bg-black/50 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md">
              {activeImageIndex + 1} / {images.length}
            </div>
          )}
        </div>
      )}

      {isVideoModalOpen && videos.length > 0 && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4 sm:p-6 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsVideoModalOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-gray-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/80 px-5 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600/20 border border-red-500/30 text-red-500">
                  <Video size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {listing.title}
                  </h3>
                  <p className="text-xs text-gray-400">
                    {t('machineDetails.videoPreview', 'Machine Walkaround & Inspection Video')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsVideoModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-gray-300 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="Close video player"
              >
                <X size={20} />
              </button>
            </div>

            {/* Video Player */}
            <div className="relative aspect-video w-full bg-black flex items-center justify-center">
              <video
                key={videos[activeVideoIndex]?.id || 'video-modal'}
                src={getAbsoluteMediaUrl(videos[activeVideoIndex]?.url || '')}
                controls
                autoPlay
                muted
                playsInline
                className="h-full w-full object-contain"
              >
                <source src={getAbsoluteMediaUrl(videos[activeVideoIndex]?.url || '')} type={getVideoMimeType(videos[activeVideoIndex]?.url)} />
                Your browser does not support the video tag.
              </video>
            </div>

            {/* Modal Footer / Playlist Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 bg-gray-900/60 px-5 py-3.5">
              {videos.length > 1 ? (
                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className="text-xs font-medium text-gray-400">{t('machineDetails.selectVideo', 'Select Video:')}</span>
                  {videos.map((vid, idx) => (
                    <button
                      key={vid.id}
                      type="button"
                      onClick={() => setActiveVideoIndex(idx)}
                      className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                        activeVideoIndex === idx
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      Video {idx + 1}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span>{t('machineDetails.verifiedInspectionVideo', 'Verified Machine Video')}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsVideoModalOpen(false);
                  const section = document.getElementById('videos-section');
                  if (section) {
                    section.scrollIntoView({ behavior: 'smooth' });
                    const videoEl = section.querySelector('video');
                    if (videoEl) {
                      videoEl.play().catch(() => {});
                    }
                  }
                }}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 ml-auto"
              >
                <span>{t('machineDetails.scrollToVideosSection', 'Scroll to Video Section')}</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HighlightCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="group flex flex-col rounded-xl border border-gray-100 bg-white p-3 sm:p-4 shadow-sm transition-shadow hover:shadow-md min-w-0 h-full">
      <div className="mb-2 sm:mb-3 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-yellow-50 transition-colors group-hover:bg-yellow-100 shrink-0">
        {icon}
      </div>
      <span className="mb-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 truncate" title={label}>{label}</span>
      <span className="text-xs sm:text-sm font-semibold text-gray-900 break-words line-clamp-2" title={value}>{value}</span>
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-8 lg:gap-x-12 gap-y-2 sm:gap-y-3">
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
