"use client";

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Award,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cog,
  CreditCard,
  Cpu,
  FileText,
  Fuel,
  GitBranch,
  Globe,
  HelpCircle,
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
  Wrench,
  X,
  ChevronLeft,
  Car,
  Hash,
  UserCheck,
  Eye,
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
import MediaDownloadButton, { getMediaDownloadFileName } from '@/components/media/MediaDownloadButton';

type MachineDetailClientProps = {
  listing: MachineListingDetail;
};

type PublicSupportContact = {
  phoneNumber?: string | null;
  supportWhatsappNumber?: string | null;
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
  registrationDate: string;
  registrationUpto: string;
  registrationYear: string;
  registrationNo: string;
  chassisOrSerialNo: string;
  engineNumber: string;
  ownerName: string;
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
      <span className="inline-flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest rounded-full shadow-lg shadow-red-500/30">
        <CheckCircle2 size={11} strokeWidth={3} />
        {labels.sold}
      </span>
    );
  }
  if (upperStatus === 'RESERVED') {
    return <span className="inline-flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest rounded-full shadow-lg shadow-amber-500/30">{labels.reserved}</span>;
  }
  return <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest rounded-full shadow-lg shadow-emerald-500/30">{labels.available}</span>;
};

const maskName = (name: string) => {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= 3) return trimmed.padEnd(6, '*');
  return `${trimmed.substring(0, 3)}***`;
};

const createEmptyParsedListingDetails = (): ParsedListingDetails => ({
  variant: '',
  registrationDate: '',
  registrationUpto: '',
  registrationYear: '',
  registrationNo: '',
  chassisOrSerialNo: '',
  engineNumber: '',
  ownerName: '',
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
      case 'registration date':
        parsed.registrationDate = value;
        break;
      case 'registration upto':
      case 'registration up to':
        parsed.registrationUpto = value;
        break;
      case 'registration no':
        parsed.registrationNo = value;
        break;
      case 'owner name':
      case 'owner':
      case 'rc owner':
      case 'rc owner name':
      case 'registered owner':
      case 'owner_name':
        parsed.ownerName = value;
        break;
      case 'chassis/serial':
      case 'chassis / serial':
      case 'chassis or serial':
        parsed.chassisOrSerialNo = value;
        break;
      case 'engine number':
      case 'engine no':
        parsed.engineNumber = value;
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

const cleanOverviewText = (text: string) => {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().match(/^(?:owner\s*name|rc\s*owner|registered\s*owner|owner_name)\s*:/i))
    .join('\n')
    .trim();
};

const getDescriptionParts = (listing: MachineListingDetail) => {
  const parsed = parseListingDescription(listing.description);
  const trimmedRaw = cleanOverviewText(parsed.rawDescription || '');
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
  const [supportContact, setSupportContact] = useState<PublicSupportContact>({});
  const { user, isAuthModalOpen, setAuthModalOpen } = useAuthStore();
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

  useEffect(() => {
    let cancelled = false;
    const loadSupportContact = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/master/footer`);
        const payload = await response.json() as { data?: { contact?: PublicSupportContact } };
        if (!cancelled) setSupportContact(payload.data?.contact || {});
      } catch {
        if (!cancelled) setSupportContact({});
      }
    };
    void loadSupportContact();
    return () => { cancelled = true; };
  }, []);

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
  const supportCallNumber = getDialNumber(supportContact.phoneNumber);
  const supportWhatsappUrl = getWhatsappUrl(supportContact.supportWhatsappNumber);
  const parsedDetails = parseListingDescription(listing.description);
  const descriptionParts = getDescriptionParts(listing);
  const detailVariant = listing.variant || parsedDetails.variant;
  const detailRegistrationDate = parsedDetails.registrationDate || (listing.registrationYear ? String(listing.registrationYear) : parsedDetails.registrationYear);
  const detailRegistrationUpto = parsedDetails.registrationUpto;
  const detailRegistrationNo = listing.registrationNo || parsedDetails.registrationNo;
  const detailOwnerName = listing.ownerName || parsedDetails.ownerName;
  const detailChassisNo = listing.chassisOrSerialNo || parsedDetails.chassisOrSerialNo;
  const detailEngineNumber = listing.engineNumber || parsedDetails.engineNumber;
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
  const expenseLines = [
    { label: t('machineDetails.expenseTransport', 'Vehicle transport'), amount: Number(listing.expenseBreakdown?.transport || 0) },
    { label: t('machineDetails.expensePaperwork', 'Paperwork'), amount: Number(listing.expenseBreakdown?.paperwork || 0) },
    { label: t('machineDetails.expenseRtoWork', 'RTO work'), amount: Number(listing.expenseBreakdown?.rtoWork || 0) },
    { label: listing.expenseBreakdown?.otherLabel || t('machineDetails.expenseOther', 'Other'), amount: Number(listing.expenseBreakdown?.other || 0) },
  ].filter((line) => line.amount > 0);
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
      setPendingFeature(feature);
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

      void createPublicContactEnquiry({
        listingId: listing.id,
        enquiryType: feature === 'WHATSAPP' ? 'WHATSAPP' : 'CALL',
      }).catch((err) => console.error('Enquiry tracking error:', err));

      return;
    }

    setPendingFeature(feature);
  };

  // Resume pending action once user authenticates
  useEffect(() => {
    if (user && pendingFeature && !isAuthModalOpen) {
      void executeProtectedAction(pendingFeature);
    }
  }, [user, isAuthModalOpen]);

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
    <div className="min-h-screen bg-gray-50 pb-28 lg:pb-12 overflow-x-hidden w-full flex flex-col">

      {/* ── Breadcrumb ── */}
      <div className="w-full border-b border-gray-200 bg-white">
        <div className="mx-auto flex flex-wrap max-w-7xl px-4 sm:px-6 lg:px-8 py-3 items-center gap-y-1 text-[11px] sm:text-xs font-medium text-gray-500">
          <Link href="/" className="shrink-0 transition-colors hover:text-amber-600">{t('navbar.home')}</Link>
          <ChevronRight size={12} className="mx-1.5 shrink-0 text-gray-300" />
          <Link href="/machines" className="shrink-0 transition-colors hover:text-amber-600">{t('machineDetails.usedEquipment')}</Link>
          <ChevronRight size={12} className="mx-1.5 shrink-0 text-gray-300" />
          <span className="text-gray-400 shrink-0">{listing.category?.name || t('machineDetails.machineDetail')}</span>
          <ChevronRight size={12} className="mx-1.5 shrink-0 text-gray-300" />
          <span className="font-semibold text-gray-800 truncate max-w-[180px] sm:max-w-xs md:max-w-none">{listing.title}</span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 sm:py-8 w-full">

        {/* ── Title Row (mobile) ── */}
        <div className="mb-4 lg:hidden">
          <h1 className="text-xl font-extrabold text-gray-900 leading-tight">{listing.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><Calendar size={13} className="text-gray-400" />{listing.manufacturingYear ? `Model ${listing.manufacturingYear}` : t('machineDetails.yearNa')}</span>
            <span className="text-gray-300">•</span>
            <span className="flex items-center gap-1.5"><MapPin size={13} className="text-gray-400" />{locationLabel}</span>
            {views > 0 && (
              <>
                <span className="text-gray-300">•</span>
                <span className="flex items-center gap-1"><Eye size={12} className="text-gray-400" />{views} views</span>
              </>
            )}
          </div>
        </div>

        {/* ── Main 2-column layout ── */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-7 items-start">

          {/* ── LEFT: Gallery + Details ── */}
          <div className="min-w-0 flex-1 w-full max-w-full space-y-5 sm:space-y-7">

            {/* Gallery Card */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-200/70">
              {/* Main Image */}
              <div
                className="relative aspect-[4/3] sm:aspect-[16/10] bg-slate-900 cursor-zoom-in group select-none overflow-hidden"
                onClick={() => mainImage && setIsLightboxOpen(true)}
              >
                {/* Status Badge */}
                <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10">
                  {getAvailabilityBadge(listing.status, {
                    sold: t('machines.sold'),
                    reserved: t('machines.reserved'),
                    available: t('machines.available'),
                  })}
                </div>

                {/* Top-right controls */}
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex items-center gap-2">
                  {mainImage && (
                    <MediaDownloadButton
                      url={getAbsoluteMediaUrl(mainImage)}
                      fileName={getMediaDownloadFileName(listing.title, 'IMAGE', activeImageIndex, mainImage)}
                      label={t('machineDetails.downloadImage', 'Download image')}
                      className="h-10 w-10 sm:h-9 sm:w-9"
                      iconClassName="h-4 w-4"
                    />
                  )}

                  {videos.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsVideoModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-white/20 bg-black/75 px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold text-white backdrop-blur-md shadow-xl transition-all hover:bg-red-700/90 hover:border-red-400/60 hover:scale-105 group/vbtn cursor-pointer"
                      title={t('machineDetails.watchVideo', 'Watch Machine Video')}
                    >
                      <div className="relative flex h-5 w-5 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-600 shadow-sm shrink-0">
                        <Play size={10} className="fill-white text-white ml-0.5" />
                        <span className="absolute -inset-0.5 rounded-full bg-red-500/40 animate-ping opacity-75" />
                      </div>
                      <span className="font-bold tracking-wide hidden sm:block">{t('machineDetails.watchVideo', 'Watch Video')}</span>
                      {videos.length > 1 && (
                        <span className="rounded-full bg-red-500/30 px-1.5 py-0.5 text-[9px] font-extrabold text-red-200">{videos.length}</span>
                      )}
                    </button>
                  )}
                </div>

                {/* Main Image */}
                {mainImage ? (
                  <Image
                    src={getAbsoluteMediaUrl(mainImage)}
                    alt={listing.title}
                    fill
                    priority
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 66vw, 800px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Truck size={72} className="text-gray-600 opacity-30" />
                  </div>
                )}

                {/* Prev / Next */}
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1)); }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/80 hover:scale-110"
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0)); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/80 hover:scale-110"
                      aria-label="Next image"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}

                {/* Bottom bar */}
                <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between p-3 sm:p-4 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none">
                  {(images[activeImageIndex]?.createdAt || listing.createdAt) ? (
                    <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] sm:text-[11px] font-medium text-white backdrop-blur-sm truncate max-w-[65%]" title="Upload Date">
                      <Clock size={11} className="shrink-0" />
                      <span suppressHydrationWarning>
                        {new Date(images[activeImageIndex]?.createdAt || listing.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: 'numeric', minute: '2-digit', hour12: true,
                        })}
                      </span>
                    </div>
                  ) : <div />}

                  {images.length > 0 && (
                    <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-gray-800 shadow-sm backdrop-blur-sm shrink-0">
                      <Camera size={12} />
                      <span>{activeImageIndex + 1} / {images.length}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Thumbnail Strip */}
              {(images.length > 1 || videos.length > 0) && (
                <div className="relative border-t border-gray-100 px-2 py-2.5 sm:px-4 sm:py-3 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => scrollThumbnails('left')}
                    className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 z-20 h-7 w-7 items-center justify-center rounded-full bg-white text-gray-600 shadow-md border border-gray-200 transition-all hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300"
                    aria-label="Scroll thumbnails left"
                  >
                    <ChevronLeft size={15} />
                  </button>

                  <div
                    ref={thumbnailStripRef}
                    className="flex overflow-x-auto gap-2 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden w-full scroll-smooth px-1 sm:px-8"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {images.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setActiveImageIndex(index)}
                        className={`relative aspect-[4/3] w-[68px] sm:w-[100px] flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all snap-start ${
                          activeImageIndex === index
                            ? 'border-amber-500 ring-2 ring-amber-400/30 shadow-sm'
                            : 'border-transparent opacity-70 hover:opacity-100 hover:border-gray-300'
                        }`}
                      >
                        <Image
                          src={getAbsoluteMediaUrl(image.url)}
                          alt={`${listing.title} ${index + 1}`}
                          fill
                          sizes="(max-width: 640px) 68px, 100px"
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
                            if (videoEl) { videoEl.play().catch(() => {}); }
                          }
                        }}
                        className="relative aspect-[4/3] w-[68px] sm:w-[100px] flex-shrink-0 overflow-hidden rounded-lg border-2 border-red-500/80 bg-slate-900 text-white flex flex-col items-center justify-center gap-1 transition-all hover:scale-[1.04] shadow-sm group snap-start"
                        title="Watch Machine Video"
                      >
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 group-hover:bg-red-700 transition-colors shadow-md">
                          <Play size={11} className="fill-white text-white ml-0.5" />
                        </div>
                        <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-red-100">Video</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => scrollThumbnails('right')}
                    className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 z-20 h-7 w-7 items-center justify-center rounded-full bg-white text-gray-600 shadow-md border border-gray-200 transition-all hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300"
                    aria-label="Scroll thumbnails right"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>

            {/* ── MOBILE ONLY: Action & Price Card (Directly below gallery on mobile) ── */}
            <div className="block lg:hidden">
              <PriceAndActionCard
                listing={listing}
                locationLabel={locationLabel}
                views={views}
                partnerTypeLabel={partnerTypeLabel}
                soldPriceLabel={soldPriceLabel}
                expenseLines={expenseLines}
                isOwnListing={isOwnListing}
                contactNumber={contactNumber}
                whatsappUrl={whatsappUrl}
                buyerName={buyerName}
                dealerProfileHref={dealerProfileHref}
                handleBuyNowClick={handleBuyNowClick}
                handleProtectedAction={handleProtectedAction}
                handleShare={handleShare}
                showTitle={false}
                t={t}
              />
            </div>

            {/* ── Key Highlights ── */}
            <section>
              <h2 className="mb-3.5 sm:mb-4 text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="inline-block w-1 h-5 rounded-full bg-amber-500 shrink-0" />
                {t('machineDetails.keyHighlights')}
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <HighlightCard icon={<Settings className="text-amber-500" size={17} />} label={t('machineDetails.conditionLabel')} value={listing.condition || t('machineDetails.na')} />
                <HighlightCard icon={<Calendar className="text-amber-500" size={17} />} label={t('machineDetails.manufacturingYearLabel')} value={listing.manufacturingYear ? String(listing.manufacturingYear) : t('machineDetails.na')} />
                <HighlightCard icon={<Clock className="text-amber-500" size={17} />} label={t('machineDetails.hoursUsedLabel')} value={listing.operatingHours ? t('machineDetails.hoursValue', { count: listing.operatingHours }) : t('machineDetails.na')} />
                <HighlightCard icon={<Zap className="text-amber-500" size={17} />} label={t('machineDetails.grossPowerLabel')} value={listing.grossPower || t('machineDetails.na')} />
                <HighlightCard icon={<UserCheck className="text-amber-500" size={17} />} label={t('machineDetails.previousOwnersLabel', 'Owners')} value={detailPreviousOwners ? (detailPreviousOwners === '1' ? '1st Owner' : detailPreviousOwners === '2' ? '2nd Owner' : `${detailPreviousOwners} Owners`) : t('machineDetails.na')} />
                <HighlightCard icon={<MapPin className="text-amber-500" size={17} />} label={t('machineDetails.locationLabel')} value={locationLabel} />
              </div>
            </section>

            {/* ── Overview / Description ── */}
            {(descriptionParts.overview || descriptionParts.additional) && (
              <section>
                <h2 className="mb-3.5 sm:mb-4 text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="inline-block w-1 h-5 rounded-full bg-amber-500 shrink-0" />
                  {t('machineDetails.overview')}
                </h2>
                <div className="rounded-2xl border border-gray-200/70 bg-white p-4 sm:p-7 shadow-sm">
                  {descriptionParts.overview && (
                    <p className="whitespace-pre-line text-sm sm:text-[15px] leading-relaxed text-gray-700">
                      {descriptionParts.overview}
                    </p>
                  )}
                  {descriptionParts.additional && (
                    <div className={descriptionParts.overview ? 'mt-5 border-t border-gray-100 pt-5' : ''}>
                      <h3 className="mb-2 text-xs sm:text-sm font-bold text-gray-800">{t('machineDetails.additionalDescription')}</h3>
                      <p className="whitespace-pre-line text-xs sm:text-sm leading-relaxed text-gray-600">
                        {descriptionParts.additional}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Videos ── */}
            {videos.length > 0 && (
              <section id="videos-section">
                <h2 className="mb-3.5 sm:mb-4 text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="inline-block w-1 h-5 rounded-full bg-red-500 shrink-0" />
                  <Video className="text-red-500" size={18} />
                  {t('machineDetails.videos')}
                </h2>
                <div className={`grid grid-cols-1 gap-4 ${videos.length === 1 ? '' : 'sm:grid-cols-2'}`}>
                  {videos.map((video, index) => (
                    <div key={video.id} className="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm">
                      <video
                        controls
                        muted
                        playsInline
                        className="w-full h-auto max-h-[60vh] sm:max-h-[70vh] object-contain bg-black"
                        preload="metadata"
                      >
                        <source src={getAbsoluteMediaUrl(video.url)} type={getVideoMimeType(video.url)} />
                        Your browser does not support the video tag.
                      </video>
                      <MediaDownloadButton
                        url={getAbsoluteMediaUrl(video.url)}
                        fileName={getMediaDownloadFileName(listing.title, 'VIDEO', index, video.url)}
                        label={t('machineDetails.downloadVideo', 'Download video')}
                        className="absolute right-3 top-3 h-10 w-10 sm:h-9 sm:w-9"
                        iconClassName="h-4 w-4"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Technical Specifications Tabs ── */}
            <section>
              <h2 className="mb-3.5 sm:mb-4 text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="inline-block w-1 h-5 rounded-full bg-amber-500 shrink-0" />
                {t('machineDetails.technicalSpecifications')}
              </h2>

              <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm">
                {/* Tab Bar */}
                <div className="flex border-b border-gray-100 bg-gray-50/60 [&::-webkit-scrollbar]:hidden overflow-x-auto">
                  {[
                    { key: 'machine' as const, label: t('machineDetails.vehicleDetails'), Icon: Truck },
                    { key: 'seller' as const, label: t('machineDetails.registrationLocation'), Icon: MapPin },
                    ...(listing.vehicleCompliance ? [{ key: 'rto' as const, label: 'Vehicle Compliance', Icon: Car }] : []),
                  ].map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveTab(key)}
                      className={`flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap border-b-2 px-4 sm:px-6 py-3.5 text-xs sm:text-sm font-semibold transition-all ${
                        activeTab === key
                          ? 'border-amber-500 text-gray-900 bg-white'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/60'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${activeTab === key ? 'text-amber-500' : 'text-gray-400'}`} />
                      {label}
                    </button>
                  ))}
                </div>

                <div className="p-4 sm:p-6 min-h-[220px]">
                  {activeTab === 'machine' && (
                    <div className="animate-in fade-in duration-200">
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
                          ...(detailTransmission ? [{ icon: <Cog className="h-4 w-4" />, label: t('machineDetails.transmissionLabel'), value: detailTransmission }] : []),
                          { icon: <UserCheck className="h-4 w-4" />, label: t('machineDetails.previousOwnersLabel', 'Previous Owners'), value: detailPreviousOwners ? (detailPreviousOwners === '1' ? '1st Owner' : detailPreviousOwners === '2' ? '2nd Owner' : `${detailPreviousOwners} Owners`) : t('machineDetails.na') },
                          ...(detailOwnerName ? [{ icon: <UserCheck className="h-4 w-4" />, label: t('machineDetails.ownerNameLabel', 'RC Owner Name'), value: detailOwnerName }] : []),
                          { icon: <Hash className="h-4 w-4" />, label: t('machineDetails.chassisNoLabel', 'Chassis / Serial No.'), value: detailChassisNo || t('machineDetails.na') },
                          { icon: <Hash className="h-4 w-4" />, label: t('machineDetails.engineNumberLabel', 'Engine Number'), value: detailEngineNumber || t('machineDetails.na') },
                        ]}
                      />
                    </div>
                  )}

                  {activeTab === 'seller' && (
                    <div className="animate-in fade-in duration-200">
                      <SpecsGrid
                        items={[
                          { icon: <Car className="h-4 w-4" />, label: t('machineDetails.registrationNoLabel', 'Registration No.'), value: detailRegistrationNumber || t('machineDetails.na') },
                          ...(detailOwnerName ? [{ icon: <UserCheck className="h-4 w-4" />, label: t('machineDetails.ownerNameLabel', 'RC Owner Name'), value: detailOwnerName }] : []),
                          { icon: <Calendar className="h-4 w-4" />, label: t('machineDetails.registrationDateLabel', 'Registration Date'), value: detailRegistrationDate || t('machineDetails.na') },
                          { icon: <Calendar className="h-4 w-4" />, label: t('machineDetails.registrationUptoLabel', 'Registration Upto'), value: detailRegistrationUpto || t('machineDetails.na') },
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
                    <div className="animate-in fade-in duration-200">
                      {listing.vehicleCompliance.vehicleNumber && (
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3.5 rounded-xl bg-amber-50 border border-amber-200/80 p-4">
                          <div className="flex items-center gap-3.5">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                              <Car className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-0.5">Registration No.</p>
                              <p className="text-lg sm:text-xl font-extrabold tracking-widest text-gray-900 truncate">{formatRegistrationNumber(listing.vehicleCompliance.vehicleNumber)}</p>
                            </div>
                          </div>
                          {detailOwnerName && (
                            <div className="flex items-center gap-2.5 rounded-lg bg-white/90 border border-amber-200/80 px-3.5 py-2 shadow-2xs">
                              <UserCheck className="h-4 w-4 text-amber-700 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">RC Registered Owner</p>
                                <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">{detailOwnerName}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-2.5 sm:gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {([
                          { label: 'Hire Purchase', value: listing.vehicleCompliance.hirePurchaseStatus, date: undefined, type: 'hp' },
                          { label: 'Tax Validity', value: listing.vehicleCompliance.taxStatus, date: listing.vehicleCompliance.taxValidUntil, type: 'validity' },
                          { label: 'Fitness Validity', value: listing.vehicleCompliance.fitnessStatus, date: listing.vehicleCompliance.fitnessValidUntil, type: 'validity' },
                          { label: 'Insurance Validity', value: listing.vehicleCompliance.insuranceStatus, date: listing.vehicleCompliance.insuranceValidUntil, type: 'validity' },
                          { label: 'PUC Validity', value: listing.vehicleCompliance.pucStatus, date: listing.vehicleCompliance.pucValidUntil, type: 'validity' },
                          { label: 'HSRP', value: listing.vehicleCompliance.hsrpStatus, date: undefined, type: 'hsrp' },
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
                            <div key={label} className="flex flex-col gap-1.5 rounded-xl border border-gray-100 bg-gray-50/70 p-3 sm:px-4 sm:py-3.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
                              <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${badgeClass}`}>
                                <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
                                {displayLabel}
                              </span>
                              {date && (
                                <span className="text-[10px] font-medium text-gray-500 flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Until: {formatDateOnly(date) || t('machineDetails.na')}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {(listing.vehicleCompliance.financerName || listing.vehicleCompliance.hsrpNumber || listing.vehicleCompliance.rtoOffice || listing.vehicleCompliance.rtoAgentName || listing.vehicleCompliance.rtoExpenses != null || listing.vehicleCompliance.vehicleMaintenanceCost != null) && (
                        <div className="mt-4 sm:mt-5 grid grid-cols-1 gap-2.5 sm:gap-3 sm:grid-cols-2">
                          {[
                            ['Financer Name', listing.vehicleCompliance.financerName],
                            ['HSRP Number', listing.vehicleCompliance.hsrpNumber],
                            ['RTO Office', listing.vehicleCompliance.rtoOffice],
                            ['RTO Agent Name', listing.vehicleCompliance.rtoAgentName],
                            ['RTO Expenses', listing.vehicleCompliance.rtoExpenses != null ? formatCurrency(listing.vehicleCompliance.rtoExpenses) : null],
                            ['Vehicle Maintenance Cost', listing.vehicleCompliance.vehicleMaintenanceCost != null ? formatCurrency(listing.vehicleCompliance.vehicleMaintenanceCost) : null],
                          ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                            <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 sm:p-4">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">{label}</p>
                                <p className="text-sm font-bold text-gray-900 truncate">{value}</p>
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

            {/* ── MOBILE ONLY: Trust Assurance, Buyer Tips & Support (below specifications) ── */}
            <div className="block lg:hidden space-y-4 pt-1">
              <AssuranceCard />
              <BuyerSafetyCard />
              <SupportHelpCard supportCallNumber={supportCallNumber} supportWhatsappUrl={supportWhatsappUrl} />
            </div>
          </div>

          {/* ── RIGHT SIDEBAR (Desktop Sticky) ── */}
          <aside className="hidden lg:block w-full flex-shrink-0 lg:w-[380px] xl:w-[400px] min-w-0 lg:sticky lg:top-4 lg:self-start space-y-4">
            <PriceAndActionCard
              listing={listing}
              locationLabel={locationLabel}
              views={views}
              partnerTypeLabel={partnerTypeLabel}
              soldPriceLabel={soldPriceLabel}
              expenseLines={expenseLines}
              isOwnListing={isOwnListing}
              contactNumber={contactNumber}
              whatsappUrl={whatsappUrl}
              buyerName={buyerName}
              dealerProfileHref={dealerProfileHref}
              handleBuyNowClick={handleBuyNowClick}
              handleProtectedAction={handleProtectedAction}
              handleShare={handleShare}
              showTitle={true}
              t={t}
            />
            <AssuranceCard />
            <BuyerSafetyCard />
            <SupportHelpCard supportCallNumber={supportCallNumber} supportWhatsappUrl={supportWhatsappUrl} />
          </aside>
        </div>
      </div>

      {/* ── Mobile Sticky Bottom CTA ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/96 backdrop-blur-md border-t border-gray-200 px-3.5 py-2.5 shadow-[0_-2px_24px_rgba(0,0,0,0.10)]">
        <div className="flex items-center justify-between gap-2.5 max-w-lg mx-auto">
          <div className="min-w-0 flex flex-col justify-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
              {listing.status === 'SOLD' ? 'Sold Price' : 'Asking Price'}
            </span>
            <span className="text-sm font-extrabold text-gray-900 truncate">
              {listing.status === 'SOLD' ? soldPriceLabel : formatCurrency(listing.price || 0)}
            </span>
          </div>

          {listing.status === 'SOLD' ? (
            <span className="bg-emerald-100 text-emerald-800 text-xs font-extrabold px-3.5 py-2 rounded-lg shrink-0">
              SOLD OUT
            </span>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              {listing.buyNowPaymentAvailable && !isOwnListing && (
                <button
                  type="button"
                  onClick={handleBuyNowClick}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform"
                >
                  <CreditCard size={14} />
                  <span>Buy</span>
                </button>
              )}

              {contactNumber && (
                <button
                  type="button"
                  onClick={() => handleProtectedAction('CALL')}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[#FFC107] px-3.5 py-2.5 text-xs font-bold text-black shadow-sm active:scale-95 transition-transform"
                >
                  <Phone size={14} />
                  <span>Call</span>
                </button>
              )}

              {whatsappUrl && (
                <button
                  type="button"
                  onClick={() => handleProtectedAction('WHATSAPP')}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3.5 py-2.5 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform"
                >
                  <MessageCircle size={14} />
                  <span>WhatsApp</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {pendingFeature ? (
        <CustomerPrimePaymentModal
          isOpen={!!pendingFeature}
          feature={pendingFeature}
          onClose={() => setPendingFeature(null)}
          onAccessGranted={() => { void executeProtectedAction(pendingFeature); }}
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

      {/* ── Lightbox ── */}
      {isLightboxOpen && mainImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/97 backdrop-blur-sm"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setIsLightboxOpen(false); }}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 z-[110] rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 transition-colors"
            aria-label="Close image viewer"
          >
            <X size={22} />
          </button>

          <MediaDownloadButton
            url={getAbsoluteMediaUrl(mainImage)}
            fileName={getMediaDownloadFileName(listing.title, 'IMAGE', activeImageIndex, images[activeImageIndex]?.url || mainImage)}
            label={t('machineDetails.downloadImage', 'Download image')}
            className="absolute right-[4.5rem] top-4 z-[110] h-11 w-11 sm:right-20 sm:top-6 sm:h-10 sm:w-10 bg-white/10"
            iconClassName="h-4 w-4"
          />

          <div className="h-full w-full max-h-screen max-w-7xl flex items-center justify-center p-3 sm:p-14 md:p-20" onClick={(e) => e.stopPropagation()}>
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
                onClick={(e) => { e.stopPropagation(); setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1)); }}
                className="absolute left-3 sm:left-8 z-[110] rounded-full bg-white/10 p-2.5 sm:p-3.5 text-white hover:bg-white/20 transition-all backdrop-blur-md hover:scale-110"
              >
                <ChevronLeft size={20} className="sm:h-7 sm:w-7" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0)); }}
                className="absolute right-3 sm:right-8 z-[110] rounded-full bg-white/10 p-2.5 sm:p-3.5 text-white hover:bg-white/20 transition-all backdrop-blur-md hover:scale-110"
              >
                <ChevronRight size={20} className="sm:h-7 sm:w-7" />
              </button>
            </>
          )}

          {images.length > 0 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[110] rounded-full bg-black/70 px-4 py-1.5 text-xs sm:text-sm font-semibold text-white backdrop-blur-md">
              {activeImageIndex + 1} / {images.length}
            </div>
          )}
        </div>
      )}

      {/* ── Video Modal ── */}
      {isVideoModalOpen && videos.length > 0 && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/92 p-2 sm:p-6 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsVideoModalOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-gray-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/80 px-4 sm:px-5 py-3.5 sm:py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600/20 border border-red-500/30 text-red-500 shrink-0">
                  <Video size={15} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-white truncate">{listing.title}</h3>
                  <p className="text-[10px] sm:text-xs text-gray-400 truncate">{t('machineDetails.videoPreview', 'Machine Walkaround & Inspection Video')}</p>
                </div>
              </div>

              <div className="ml-2 flex shrink-0 items-center gap-2">
                <MediaDownloadButton
                  url={getAbsoluteMediaUrl(videos[activeVideoIndex]?.url || '')}
                  fileName={getMediaDownloadFileName(listing.title, 'VIDEO', activeVideoIndex, videos[activeVideoIndex]?.url)}
                  label={t('machineDetails.downloadVideo', 'Download video')}
                  className="h-10 w-10 bg-white/10 sm:h-9 sm:w-9"
                  iconClassName="h-4 w-4"
                />
                <button
                  type="button"
                  onClick={() => setIsVideoModalOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-gray-300 transition-colors hover:bg-white/20 hover:text-white sm:h-9 sm:w-9"
                  aria-label="Close video player"
                >
                  <X size={17} />
                </button>
              </div>
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

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-gray-800 bg-gray-900/60 px-4 sm:px-5 py-3">
              {videos.length > 1 ? (
                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className="text-[11px] font-medium text-gray-400">{t('machineDetails.selectVideo', 'Select Video:')}</span>
                  {videos.map((vid, idx) => (
                    <button
                      key={vid.id}
                      type="button"
                      onClick={() => setActiveVideoIndex(idx)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                        activeVideoIndex === idx ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      Video {idx + 1}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
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
                    if (videoEl) { videoEl.play().catch(() => {}); }
                  }
                }}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 ml-auto"
              >
                <span>{t('machineDetails.scrollToVideosSection', 'Scroll to Video Section')}</span>
                <ChevronRight size={13} />
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
    <div className="group flex flex-col rounded-xl border border-gray-200/80 bg-white p-3.5 sm:p-4 shadow-2xs transition-all hover:shadow-md hover:border-amber-300/60 hover:-translate-y-0.5 min-w-0">
      <div className="mb-2.5 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-amber-50 transition-colors group-hover:bg-amber-100 shrink-0">
        {icon}
      </div>
      <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate" title={label}>
        {label}
      </span>
      <span className="text-xs sm:text-sm font-bold text-gray-900 break-words line-clamp-2 leading-snug" title={value}>
        {value}
      </span>
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 sm:gap-x-10 gap-y-0">
      {items.map(({ icon, label, value }) => (
        <div
          key={label}
          className="group flex items-center justify-between py-2.5 px-2.5 rounded-xl transition-colors hover:bg-slate-50 border-b border-gray-100 last:border-b-0 sm:last:border-b-0 gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-100 group-hover:text-amber-700 shrink-0">
              {icon}
            </div>
            <span className="text-xs sm:text-sm font-medium text-gray-600 truncate">{label}</span>
          </div>
          <span className="text-xs sm:text-sm font-bold text-gray-900 text-right shrink-0 max-w-[52%] break-words leading-tight">{value}</span>
        </div>
      ))}
    </div>
  );
}

type PriceAndActionCardProps = {
  listing: MachineListingDetail;
  locationLabel: string;
  views: number;
  partnerTypeLabel: string;
  soldPriceLabel: string;
  expenseLines: { label: string; amount: number }[];
  isOwnListing: boolean;
  contactNumber: string;
  whatsappUrl: string | null;
  buyerName: string;
  dealerProfileHref: string | null;
  handleBuyNowClick: () => void;
  handleProtectedAction: (feature: CustomerPrimeFeature) => void;
  handleShare: () => void;
  showTitle?: boolean;
  t: ReturnType<typeof useTranslation>['t'];
};

function PriceAndActionCard({
  listing,
  locationLabel,
  views,
  partnerTypeLabel,
  soldPriceLabel,
  expenseLines,
  isOwnListing,
  contactNumber,
  whatsappUrl,
  buyerName,
  dealerProfileHref,
  handleBuyNowClick,
  handleProtectedAction,
  handleShare,
  showTitle = false,
  t,
}: PriceAndActionCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white shadow-sm overflow-hidden">
      {/* Title (for desktop sidebar) */}
      {showTitle && (
        <div className="px-5 pt-5 pb-0">
          <h1 className="text-lg font-extrabold text-gray-900 leading-snug">{listing.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <Calendar size={12} className="text-gray-400" />
              {listing.manufacturingYear ? `Model ${listing.manufacturingYear}` : t('machineDetails.yearNa')}
            </span>
            <span className="text-gray-300">•</span>
            <span className="flex items-center gap-1.5 truncate max-w-[180px]">
              <MapPin size={12} className="text-gray-400 shrink-0" />
              {locationLabel}
            </span>
            {views > 0 && (
              <>
                <span className="text-gray-300">•</span>
                <span className="flex items-center gap-1">
                  <Eye size={12} className="text-gray-400" />
                  {views} views
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Verified badge */}
      <div className={`px-4 sm:px-5 ${showTitle ? 'pt-3' : 'pt-4'}`}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 size={11} className="text-emerald-600" />
          <span>{partnerTypeLabel}</span>
        </span>
      </div>

      {/* Price Block */}
      <div className="mx-4 sm:mx-5 mt-3 sm:mt-4 mb-4 rounded-xl bg-gradient-to-br from-gray-900 to-gray-800 p-4 sm:p-5 text-white shadow-md shadow-gray-900/20">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">
            {listing.status === 'SOLD' ? 'Final Sold Price' : 'Asking Price'}
          </span>
          {listing.isNegotiable && listing.status !== 'SOLD' && (
            <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">
              Negotiable
            </span>
          )}
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-none">
          {listing.status === 'SOLD' ? soldPriceLabel : formatCurrency(listing.price || 0)}
        </div>
        {listing.status !== 'SOLD' && Number(listing.expenseAmount || 0) > 0 && (
          <div className="mt-3 border-t border-white/10 pt-2.5 text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-300">
              {t('machineDetails.includesExpenses', 'Includes expenses of {amount}', {
                amount: formatCurrency(listing.expenseAmount || 0),
              })}
            </p>
            {expenseLines.map((line) => (
              <div key={line.label} className="flex justify-between">
                <span>{line.label}</span>
                <span className="font-semibold tabular-nums text-gray-300">{formatCurrency(line.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA Buttons */}
      <div className="px-4 sm:px-5 pb-5 space-y-2.5">
        {listing.status === 'SOLD' ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3.5 font-bold text-emerald-800 border border-emerald-200 text-center text-sm">
            <CheckCircle2 size={17} className="text-emerald-600 shrink-0" />
            This equipment is sold out.
          </div>
        ) : (
          <>
            {listing.buyNowPaymentAvailable && isOwnListing ? (
              <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-900">
                This is your own listing. You cannot buy your own vehicle.
              </div>
            ) : listing.buyNowPaymentAvailable ? (
              <button
                type="button"
                onClick={handleBuyNowClick}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3.5 font-bold text-white shadow-sm transition-all hover:bg-black hover:shadow-md active:scale-[0.99] text-sm cursor-pointer"
              >
                <CreditCard size={17} />
                Buy Now
              </button>
            ) : null}

            {contactNumber ? (
              <button
                type="button"
                onClick={() => handleProtectedAction('CALL')}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-4 py-3.5 font-bold text-black shadow-sm transition-all hover:bg-[#FFB300] hover:shadow-md active:scale-[0.99] text-sm cursor-pointer"
              >
                <Phone size={17} />
                {t('machineDetails.callSeller')}
              </button>
            ) : (
              <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-3.5 font-bold text-gray-400 text-sm">
                <Phone size={17} />
                {t('dealers.contactUnavailable')}
              </div>
            )}

            {whatsappUrl ? (
              <button
                type="button"
                onClick={() => handleProtectedAction('WHATSAPP')}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 font-bold text-white shadow-sm transition-all hover:bg-[#1fba58] hover:shadow-md active:scale-[0.99] text-sm cursor-pointer"
              >
                <MessageCircle size={17} />
                {t('machineDetails.chatOnWhatsapp')}
              </button>
            ) : null}
          </>
        )}

        {/* Share */}
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={handleShare}
            className="group inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-700 cursor-pointer"
          >
            <Share2 size={13} className="transition-transform group-hover:scale-110" />
            {t('machineDetails.share')}
          </button>
        </div>
      </div>

      {/* Seller / Dealer Card */}
      {listing.partner?.id && (
        <div className="border-t border-gray-100 px-4 sm:px-5 py-4">
          {listing.partner?.partnerType !== 'PRIME_CUSTOMER' && listing.partner?.partnerType !== 'STANDARD_CUSTOMER' ? (
            <Link
              href={dealerProfileHref || '#'}
              className="group flex items-center gap-3 rounded-xl border border-gray-200/80 p-3.5 transition-all hover:border-amber-400/70 hover:bg-amber-50/40 hover:shadow-sm"
            >
              {listing.partner?.logo ? (
                <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-gray-100 border border-gray-200">
                  <Image
                    src={getAbsoluteMediaUrl(listing.partner.logo)}
                    alt={listing.partner.name || t('machineDetails.dealerLogo')}
                    fill
                    sizes="44px"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-extrabold text-base uppercase border border-amber-200 group-hover:bg-amber-200 transition-colors">
                  {listing.partner?.name?.charAt(0) || t('machineDetails.partnerInitialFallback')}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-gray-900 truncate group-hover:text-amber-700 transition-colors">
                  {listing.partner?.name || t('machineDetails.verifiedPartner')}
                </h3>
                <p className="text-[11px] font-medium text-gray-500">{partnerTypeLabel}</p>
              </div>
              <ChevronRight
                size={16}
                className="text-gray-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all flex-shrink-0"
              />
            </Link>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200/80 p-3.5">
              {listing.partner?.logo ? (
                <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-gray-100 border border-gray-200">
                  <Image
                    src={getAbsoluteMediaUrl(listing.partner.logo)}
                    alt={listing.partner.name || t('machineDetails.dealerLogo')}
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 font-extrabold text-base uppercase border border-slate-200">
                  {listing.partner?.name?.charAt(0) || t('machineDetails.partnerInitialFallback')}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-gray-900 truncate">
                  {listing.partner?.name || t('machineDetails.verifiedPartner')}
                </h3>
                <p className="text-[11px] text-gray-500">{partnerTypeLabel}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Purchased By */}
      {listing.status === 'SOLD' && (
        <div className="border-t border-gray-100 px-4 sm:px-5 py-4">
          <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
              <UserCircle size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Purchased By</div>
              <h3 className="text-sm font-bold text-slate-800 truncate">
                {buyerName || t('machineDetails.notSpecified')}
              </h3>
              {listing.saleRecord && (listing.saleRecord.buyerCity || listing.saleRecord.buyerState) && (
                <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                  {[listing.saleRecord.buyerCity, listing.saleRecord.buyerState].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssuranceCard() {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2.5 pb-3 mb-3.5 border-b border-gray-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900 leading-tight">JCB Exchange Assurance</h3>
          <p className="text-[11px] text-gray-500">Verified & safe heavy equipment trade</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={11} strokeWidth={3} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-800 leading-snug">Verified Machine Listing</h4>
            <p className="text-[11px] text-gray-500 leading-tight mt-0.5">Inspected specifications, real photos & operational details.</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={11} strokeWidth={3} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-800 leading-snug">Direct Seller Connection</h4>
            <p className="text-[11px] text-gray-500 leading-tight mt-0.5">Connect directly with verified owners or dealers with zero brokerage.</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={11} strokeWidth={3} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-800 leading-snug">Live Video & On-Site Trials</h4>
            <p className="text-[11px] text-gray-500 leading-tight mt-0.5">Request live video inspection or schedule a physical machine trial.</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={11} strokeWidth={3} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-800 leading-snug">RTO & Compliance Transparency</h4>
            <p className="text-[11px] text-gray-500 leading-tight mt-0.5">Registration validity, chassis number & compliance checks.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BuyerSafetyCard() {
  const inspectionPoints = [
    {
      title: "Engine & Smoke Check",
      desc: "Inspect engine cold-start, check for abnormal sound, blow-by, black/blue exhaust smoke, and oil or coolant leaks.",
    },
    {
      title: "Hydraulics & Load Test",
      desc: "Test hydraulic pump power, boom swing, bucket curl force under work load, and inspect cylinder ram seals.",
    },
    {
      title: "Chassis & Kingpost Inspection",
      desc: "Check kingpost play, slew ring bracket, loader arms, and inspect mainframe for stress cracks or re-welding.",
    },
    {
      title: "Physical Punch & RC Verification",
      desc: "Physically locate and match the chassis punch number and engine number on the frame against original RC documents.",
    },
    {
      title: "Working Trial & Transmission Test",
      desc: "Conduct a 15–20 min working test drive to check forward/reverse shuttle, brake responsiveness, and hour meter.",
    },
  ];

  return (
    <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
            <Wrench className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-950">Buyer Inspection Tips</h3>
            <p className="text-[10px] text-amber-800/70 font-medium">On-Site Pre-Purchase Checklist</p>
          </div>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          5-Point Check
        </span>
      </div>

      <div className="space-y-2.5">
        {inspectionPoints.map((point, index) => (
          <div key={index} className="flex items-start gap-2.5 text-xs">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-800">
              {index + 1}
            </span>
            <div className="leading-snug">
              <span className="font-bold text-gray-900">{point.title}: </span>
              <span className="text-gray-600">{point.desc}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3.5 pt-2.5 border-t border-amber-200/50 flex items-center gap-1.5 text-[11px] text-amber-900/80 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
        <span>Always conduct a live operational trial before deal finalization.</span>
      </div>
    </div>
  );
}

function SupportHelpCard({ supportCallNumber, supportWhatsappUrl }: { supportCallNumber: string; supportWhatsappUrl: string | null }) {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
            <HelpCircle size={15} />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800">Need Help?</h3>
        </div>
        <Link href="/support" className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-0.5">
          Support <ChevronRight size={12} />
        </Link>
      </div>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Questions about equipment documentation, machine verification or transport?
      </p>
      <div className="flex items-center gap-2">
        <a
          href={supportCallNumber ? `tel:${supportCallNumber}` : undefined}
          aria-disabled={!supportCallNumber}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-colors"
        >
          <Phone size={13} className="text-gray-500" />
          <span>Call Helpline</span>
        </a>
        <a
          href={supportWhatsappUrl || undefined}
          aria-disabled={!supportWhatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          <MessageCircle size={13} className="text-emerald-600" />
          <span>WhatsApp</span>
        </a>
      </div>
    </div>
  );
}
