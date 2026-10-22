'use client';

import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Truck, X, Upload, ImagePlus, PlayCircle, Pencil, Trash2, MoreVertical, UserCheck, ChevronDown, ChevronLeft, ChevronRight, ReceiptText, FileText, Phone, Check, ArrowUpDown, ArrowUp, ArrowDown, Plus, ShieldCheck, CheckCircle2, Loader2, Sparkles, LayoutGrid, List, RefreshCw, MapPin, AlertCircle, TrendingUp, Handshake, Eye, Camera } from 'lucide-react';
import PortalActionDropdown from '@/components/ui/PortalActionDropdown';
import axios from 'axios';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import SafeRemoteImage from '@/components/ui/SafeRemoteImage';
import ListingPaymentVerificationTable from '@/components/admin/ListingPaymentVerificationTable';
import ListingBillsTable from '@/components/admin/ListingBillsTable';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { useTranslation } from '@/hooks/useTranslation';
import { buildPaginationItems } from '@/lib/paginationUtils';
import {
  MAX_IMAGE_INPUT_SIZE,
  MAX_LISTING_VIDEO_DURATION_SECONDS,
  MAX_LISTING_VIDEO_INPUT_SIZE,
  getAbsoluteFileUrl,
  type UploadedFileResult,
  uploadListingMediaToServer,
} from '@/lib/fileUpload';
import { useAuthStore } from '@/store/authStore';
import { buildAccountModuleUrl, getListingAccountLinkState, isInternalAccountLinkRole } from '@/lib/listingAccountPrefill.mjs';
import { getListingVerificationDisplay } from '@/lib/listingVerificationDisplay.mjs';
import { hasPermission } from '@/lib/permissionUtils';
import { generateAdminListingDetailPath } from '@/lib/routePaths';
import {
  handleAlphanumericKeyDown,
  handleDigitOnlyKeyDown,
  handleTextOnlyKeyDown,
  isValidDigitsOnlyValue,
  isValidDateValue,
  isValidPinCodeValue,
  isValidYearValue,
  normalizeSellVehicleAvailability,
  sanitizeListingFieldValue,
  sanitizeListingFormData,
  SELL_VEHICLE_AVAILABILITY_OPTIONS,
} from '@/lib/listingFormSanitizers';
import ListingRtoFields from '@/components/listings/ListingRtoFields';
import ListingPricingModal, { type ListingPricing } from '@/components/listings/ListingPricingModal';
import { ApiFillBox, ApiFillLegend } from '@/components/ui/ApiFillBadge';
import { buildListingRtoDetails, emptyListingRtoForm, hasListingRtoInput, sanitizeListingRtoForm, validateListingRtoForm, type ListingRtoFormState } from '@/lib/listingRtoForm';
import { findMasterOption, getProviderVehicleIdentityMismatch, getVehicleVerificationButtonState, getVehicleVerificationSubmitValidationError, mapProviderVehicleToListing, normalizeMasterName, type VehicleVerificationSource } from '@/lib/listingVehicleVerification';
import { getListingSaveResponse } from '@/lib/listingSaveResponse';
import { getSellVehicleSampleMedia } from '@/lib/sellVehicleSampleMedia.mjs';
import { getListingFormValidationError } from '@/lib/listingRequirements.mjs';
import { getModerationStatus, getPendingModerationOptions } from '@/lib/listingModeration.mjs';
import { buildVerificationCacheKey, getVerificationCache, setVerificationCache } from '@/lib/verificationRequestCache';
import { isHighlightedListing } from '@/lib/listingListNavigation.mjs';

type ListingFormState = {
  category: string;
  brand: string;
  model: string;
  variant: string;
  manufacturingYear: string;
  registrationDate: string;
  registrationUpto: string;
  registrationNo: string;
  ownerName: string;
  chassisOrSerialNo: string;
  engineNumber: string;
  previousOwners: string;
  condition: string;
  operatingHours: string;
  fuelType: string;
  transmission: string;
  currentAvailability: string;
  title: string;
  price: string;
  state: string;
  address: string;
  city: string;

  pinCode: string;
  nearbyLandmark: string;
  description: string;
  additionalDescription: string;
  grossPower: string;
  isNegotiable: boolean;
  insuranceExpiry: string;
  selectedStateId: string;
  selectedCityId: string;
  buyerName: string;
  buyerPhone: string;
  buyerCity: string;
  buyerState: string;
  soldPrice: string;
  soldAt: string;
  selectedBuyerStateId: string;
  selectedBuyerCityId: string;
  rtoDetails: ListingRtoFormState;
};

type CategoryOption = {
  id: string;
  name: string;
};

type ListingSortKey = 'title' | 'price' | 'year' | 'location' | 'date';

const formatEntryDate = (dateString?: string | null) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

function SortIcon({
  col,
  sortKey,
  sortDir,
}: {
  col: ListingSortKey;
  sortKey: ListingSortKey | null;
  sortDir: 'asc' | 'desc';
}) {
  if (sortKey !== col) return <ArrowUpDown size={11} className="ml-1 inline opacity-40" />;
  return sortDir === 'asc'
    ? <ArrowUp size={11} className="ml-1 inline text-amber-500" />
    : <ArrowDown size={11} className="ml-1 inline text-amber-500" />;
}

type ListingFormDependencies = {
  categories: CategoryOption[];
  brands: Option[];
  states: Option[];
};

type ChassisVerificationResponse = {
  success: boolean;
  cacheHit?: boolean;
  record?: { id?: string };
  result?: Record<string, unknown> | null;
};

type VehicleVerificationResponse = ChassisVerificationResponse;

type ListingVerificationPolicyResponse = {
  vehicleListingVerification: {
    enabled: boolean;
    required: boolean;
    chassisEnabled: boolean;
    registrationEnabled: boolean;
    chassisRequired: boolean;
    registrationRequired: boolean;
  };
};

type ListingRecord = {
  id: string;
  title: string;
  price: string;
  // Seller price + admin margin + expenses; buyers see finalPrice.
  pricing?: ListingPricing | null;
  manufacturingYear: number;
  locationState: string;
  locationCity: string;
  address?: string | null;
  status: string;
  createdAt: string;
  brand?: { name: string };
  model?: { name: string };
  category?: { id: string; name: string };
  vehicleVerification?: {
    verificationRecordId?: string | null;
    verificationSource?: VehicleVerificationSource | null;
    verifiedRegistrationNumber?: string | null;
    verifiedChassisNumber?: string | null;
    verifiedEngineNumber?: string | null;
    status?: string | null;
    changedFields?: string[];
    lastVerifiedAt?: string | null;
    lastModifiedAt?: string | null;
  } | null;
  condition?: string;
  operatingHours?: string;
  description?: string;
  additionalDescription?: string;
  grossPower?: string;
  engineNumber?: string | null;
  ownerName?: string | null;
  isNegotiable?: boolean;
  views?: number;
  dealer?: string;
  dealerPhone?: string | null;
  dealerCategory?: string;
  partner?: {
    role?: string | null;
    mobile?: string | null;
    phone?: string | null;
    partnerProfile?: {
      partnerType?: string | null;
      mobile?: string | null;
      phone?: string | null;
    } | null;
    customerPrimeSubscriptions?: Array<{ status: string }>;
  } | null;
  saleRecord?: {
    buyerName?: string;
    buyerPhone?: string;
    buyerCity?: string | null;
    buyerState?: string | null;
    soldPrice?: number | string;
    soldAt?: string;
    invoiceNo?: string | null;
    notes?: string | null;
  } | null;
  rtoRecords?: Array<{
    vehicleNumber?: string | null;
    hirePurchaseStatus: ListingRtoFormState['hirePurchaseStatus']; financerName?: string | null;
    taxStatus: ListingRtoFormState['taxStatus']; taxValidUntil?: string | null;
    fitnessStatus: ListingRtoFormState['fitnessStatus']; fitnessValidUntil?: string | null;
    insuranceStatus: ListingRtoFormState['insuranceStatus']; insuranceValidUntil?: string | null;
    pucStatus: ListingRtoFormState['pucStatus']; pucValidUntil?: string | null;
    hsrpStatus: ListingRtoFormState['hsrpStatus']; hsrpNumber?: string | null; rtoOffice?: string | null; rtoAgentName?: string | null;
    rtoExpenses?: number | string; vehicleMaintenanceCost?: number | string; hourRunning?: number | null;
  }>;
  media: Array<{
    id: string;
    url: string;
    type: string;
    slot?: string | null;
    isFeatured: boolean;
  }>;
};

const isProtectedListing = (listing: ListingRecord, currentUserRole?: string | null) =>
  listing.partner?.role === 'SUPER_ADMIN' && currentUserRole !== 'SUPER_ADMIN';

type MediaSlotKey =
  | 'front-view'
  | 'rear-view'
  | 'left-side'
  | 'right-side'
  | 'front-left-angle'
  | 'front-right-angle'
  | 'rear-left-angle'
  | 'rear-right-angle'
  | 'chassis-number'
  | 'meter-reading'
  | 'dashboard-front'
  | 'dashboard-left'
  | 'dashboard-right'
  | 'walkaround-video';

type MediaSlotState = Record<MediaSlotKey, UploadedFileResult | null>;

type MediaPreviewState = Record<MediaSlotKey, string>;

type MediaSlotConfig = {
  key: MediaSlotKey;
  label: string;
  kind: 'image' | 'video';
};

type ParsedListingDetails = {
  rawDescription: string;
  variant: string;
  registrationDate: string;
  registrationUpto: string;
  registrationYear: string;
  registrationNo: string;
  ownerName: string;
  chassisOrSerialNo: string;
  engineNumber: string;
  previousOwners: string;
  fuelType: string;
  transmission: string;
  address: string;
  district: string;

  pinCode: string;
  nearbyLandmark: string;
  insuranceExpiry: string;
};

const initialForm: ListingFormState = {
  category: '',
  brand: '',
  model: '',
  variant: '',
  manufacturingYear: '',
  registrationDate: '',
  registrationUpto: '',
  registrationNo: '',
  ownerName: '',
  chassisOrSerialNo: '',
  engineNumber: '',
  previousOwners: '',
  condition: '',
  operatingHours: '',
  fuelType: '',
  transmission: '',
  currentAvailability: 'AVAILABLE',
  title: '',
  price: '',
  state: '',
  address: '',
  city: '',

  pinCode: '',
  nearbyLandmark: '',
  description: '',
  additionalDescription: '',
  grossPower: '',
  isNegotiable: false,
  insuranceExpiry: '',
  selectedStateId: '',
  selectedCityId: '',
  buyerName: '',
  buyerPhone: '',
  buyerCity: '',
  buyerState: '',
  soldPrice: '',
  soldAt: new Date().toISOString().split('T')[0],
  selectedBuyerStateId: '',
  selectedBuyerCityId: '',
  rtoDetails: emptyListingRtoForm,
};

const createEmptyMediaState = (): MediaSlotState => ({
  'front-view': null,
  'rear-view': null,
  'left-side': null,
  'right-side': null,
  'front-left-angle': null,
  'front-right-angle': null,
  'rear-left-angle': null,
  'rear-right-angle': null,
  'chassis-number': null,
  'meter-reading': null,
  'dashboard-front': null,
  'dashboard-left': null,
  'dashboard-right': null,
  'walkaround-video': null,
});

const createEmptyPreviewState = (): MediaPreviewState => ({
  'front-view': '',
  'rear-view': '',
  'left-side': '',
  'right-side': '',
  'front-left-angle': '',
  'front-right-angle': '',
  'rear-left-angle': '',
  'rear-right-angle': '',
  'chassis-number': '',
  'meter-reading': '',
  'dashboard-front': '',
  'dashboard-left': '',
  'dashboard-right': '',
  'walkaround-video': '',
});

const conditions = ['Excellent', 'Good', 'Fair', 'Needs Repair'];
const fuelTypes = ['Diesel', 'Electric', 'Petrol', 'Hybrid', 'Other'];
const availabilityTypes = ['AVAILABLE', 'PENDING', 'RESERVED', 'SOLD'];

const availabilityBadgeClassName: Record<string, string> = {
  AVAILABLE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  RESERVED: 'border-blue-200 bg-blue-50 text-blue-700',
  SOLD: 'border-rose-200 bg-rose-50 text-rose-700',
};

type FilterOption = {
  value: string;
  label: string;
};

const buildCountedFilterOptions = <T,>(
  items: T[],
  getValue: (item: T) => string | null | undefined,
  getLabel: (item: T, value: string) => string,
): FilterOption[] => {
  const counts = new Map<string, { label: string; count: number }>();

  items.forEach((item) => {
    const value = getValue(item)?.trim();
    if (!value) {
      return;
    }

    const label = getLabel(item, value).trim();
    const current = counts.get(value);
    counts.set(value, {
      label: current?.label || label || value,
      count: (current?.count || 0) + 1,
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .map(([value, meta]) => ({
      value,
      label: `${meta.label} (${meta.count})`,
    }));
};

const resolveDealerTypeLabel = (listing: ListingRecord) => {
  if (listing.dealerCategory?.trim()) {
    return formatPartnerTypeLabel(listing.dealerCategory, 'Authorized Place');
  }

  if (listing.partner?.customerPrimeSubscriptions && listing.partner.customerPrimeSubscriptions.length > 0) {
    return 'Prime Customer';
  }

  if (listing.partner?.partnerProfile?.partnerType?.trim()) {
    return formatPartnerTypeLabel(listing.partner.partnerProfile.partnerType, 'Authorized Place');
  }

  if (listing.partner?.role?.trim()) {
    return formatPartnerTypeLabel(listing.partner.role, 'Authorized Place');
  }

  return 'Authorized Place';
};

const mediaSlots: MediaSlotConfig[] = [
  { key: 'front-view', label: 'Front View (Image)', kind: 'image' },
  { key: 'rear-view', label: 'Rear View (Image)', kind: 'image' },
  { key: 'left-side', label: 'Left Side (Image)', kind: 'image' },
  { key: 'right-side', label: 'Right Side (Image)', kind: 'image' },
  { key: 'front-left-angle', label: 'Front-Left Angle', kind: 'image' },
  { key: 'front-right-angle', label: 'Front-Right Angle', kind: 'image' },
  { key: 'rear-left-angle', label: 'Rear-Left Angle', kind: 'image' },
  { key: 'rear-right-angle', label: 'Rear-Right Angle', kind: 'image' },
  { key: 'chassis-number', label: 'Chassis Number', kind: 'image' },
  { key: 'meter-reading', label: 'Meter Reading', kind: 'image' },
  { key: 'dashboard-front', label: 'Dashboard Front', kind: 'image' },
  { key: 'dashboard-left', label: 'Dashboard Left', kind: 'image' },
  { key: 'dashboard-right', label: 'Dashboard Right', kind: 'image' },
  { key: 'walkaround-video', label: 'Video (Max 1)', kind: 'video' },
];

const imageSlotKeys = mediaSlots.filter((slot) => slot.kind === 'image').map((slot) => slot.key);

const isKnownMediaSlotKey = (value?: string | null): value is MediaSlotKey =>
  !!value && mediaSlots.some((slot) => slot.key === value);

const buildMediaPreviewState = (
  media: Array<{ url: string; type: string; isFeatured: boolean; slot?: string | null }>
) => {
  const nextMediaState = createEmptyMediaState();
  const nextPreviewState = createEmptyPreviewState();
  const assignedSlots = new Set<MediaSlotKey>();
  const unslottedImages: Array<{ url: string; type: string; isFeatured: boolean; slot?: string | null }> = [];

  media
    .filter((item) => String(item.type || '').toUpperCase() === 'IMAGE')
    .forEach((mediaItem) => {
      const explicitSlot = isKnownMediaSlotKey(mediaItem.slot) ? mediaItem.slot : null;

      if (!explicitSlot || explicitSlot === 'walkaround-video' || assignedSlots.has(explicitSlot)) {
        unslottedImages.push(mediaItem);
        return;
      }

      nextMediaState[explicitSlot] = {
        access: 'public',
        fileName: mediaItem.url.split('/').pop() || 'image',
        originalName: mediaItem.url.split('/').pop() || 'image',
        mimeType: 'image/webp',
        size: 0,
        fileUrl: mediaItem.url,
        absoluteUrl: getAbsoluteFileUrl(mediaItem.url),
      };
      nextPreviewState[explicitSlot] = getAbsoluteFileUrl(mediaItem.url);
      assignedSlots.add(explicitSlot);
    });

  const remainingImageSlots = imageSlotKeys.filter((slotKey) => !assignedSlots.has(slotKey));

  unslottedImages.forEach((mediaItem, index) => {
    const fallbackSlot = remainingImageSlots[index];
    if (!fallbackSlot) {
      return;
    }

    nextMediaState[fallbackSlot] = {
      access: 'public',
      fileName: mediaItem.url.split('/').pop() || 'image',
      originalName: mediaItem.url.split('/').pop() || 'image',
      mimeType: 'image/webp',
      size: 0,
      fileUrl: mediaItem.url,
      absoluteUrl: getAbsoluteFileUrl(mediaItem.url),
    };
    nextPreviewState[fallbackSlot] = getAbsoluteFileUrl(mediaItem.url);
  });

  const videoMedia = media.find((item) => String(item.type || '').toUpperCase() === 'VIDEO');
  if (videoMedia) {
    nextMediaState['walkaround-video'] = {
      access: 'public',
      fileName: videoMedia.url.split('/').pop() || 'video',
      originalName: videoMedia.url.split('/').pop() || 'video',
      mimeType: videoMedia.url.toLowerCase().endsWith('.webm')
        ? 'video/webm'
        : videoMedia.url.toLowerCase().endsWith('.mov')
          ? 'video/quicktime'
          : 'video/mp4',
      size: 0,
      fileUrl: videoMedia.url,
      absoluteUrl: getAbsoluteFileUrl(videoMedia.url),
    };
  }

  return { nextMediaState, nextPreviewState };
};
type ModalTabKey = 'equipment' | 'rto' | 'media' | 'pricing' | 'sale' | 'all';

const fieldClassName =
  'w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:ring-1 focus:ring-[#FFC107] h-[34px]';

const imageUploadHelper = `Auto-compressed before upload. Max ${Math.round(MAX_IMAGE_INPUT_SIZE / (1024 * 1024))}MB input`;
const videoUploadHelper = `Auto-compressed video (muted). Max ${Math.round(MAX_LISTING_VIDEO_INPUT_SIZE / (1024 * 1024))}MB and ${MAX_LISTING_VIDEO_DURATION_SECONDS} seconds`;

const formatCurrency = (value: string | number) => {
  const numericValue = typeof value === 'number' ? value : Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numericValue || 0);
};

const createEmptyParsedListingDetails = (): ParsedListingDetails => ({
  rawDescription: '',
  variant: '',
  registrationDate: '',
  registrationUpto: '',
  registrationYear: '',
  registrationNo: '',
  ownerName: '',
  chassisOrSerialNo: '',
  engineNumber: '',
  previousOwners: '',
  fuelType: '',
  transmission: '',
  address: '',
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

const buildListingDescription = (form: ListingFormState) =>
  [
    form.description.trim(),
    form.variant ? `Variant: ${form.variant}` : '',
    form.registrationDate ? `Registration date: ${form.registrationDate}` : '',
    form.registrationUpto ? `Registration upto: ${form.registrationUpto}` : '',
    form.registrationNo ? `Registration no: ${form.registrationNo}` : '',
    form.ownerName ? `Owner name: ${form.ownerName}` : '',
    form.chassisOrSerialNo ? `Chassis/serial: ${form.chassisOrSerialNo}` : '',
    form.previousOwners ? `Owners: ${form.previousOwners}` : '',
    form.fuelType ? `Fuel: ${form.fuelType}` : '',
    form.transmission ? `Transmission: ${form.transmission}` : '',

    form.pinCode ? `PIN: ${form.pinCode}` : '',
    form.nearbyLandmark ? `Landmark: ${form.nearbyLandmark}` : '',
    form.insuranceExpiry ? `Insurance expiry: ${form.insuranceExpiry}` : '',
  ]
    .filter(Boolean)
    .join('\n');

const getCoverMedia = (listing: ListingRecord) =>
  listing.media?.find((item) => item.isFeatured && item.type === 'IMAGE') ||
  listing.media?.find((item) => item.type === 'IMAGE') ||
  null;

const hasAdminPricing = (listing: { pricing?: ListingPricing | null }) =>
  Boolean(listing.pricing && (listing.pricing.marginAmount > 0 || listing.pricing.expenseAmount > 0));

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.response?.data?.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
};

const availabilityToListingStatus = (value: string) => {
  switch (value.toUpperCase()) {
    case 'AVAILABLE':
      return 'PUBLISHED';
    case 'PENDING':
      return 'PENDING_APPROVAL';
    case 'RESERVED':
      return 'RESERVED';
    case 'SOLD':
      return 'SOLD';
    default:
      return 'DRAFT';
  }
};

const listingStatusToAvailability = (value: string) => {
  switch (value.toUpperCase()) {
    case 'PUBLISHED':
    case 'PAUSED':
    case 'DRAFT':
      return 'AVAILABLE';
    case 'PENDING_APPROVAL':
    case 'CHANGES_REQUESTED':
      return 'PENDING';
    case 'RESERVED':
      return 'RESERVED';
    case 'SOLD':
      return 'SOLD';
    default:
      return 'AVAILABLE';
  }
};

const isPendingApprovalListing = (status?: string | null) => {
  const normalized = String(status || '').toUpperCase();
  return normalized === 'PENDING_APPROVAL' || normalized === 'CHANGES_REQUESTED';
};

const getVideoPosterFrame = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    video.onloadeddata = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const context = canvas.getContext('2d');

        if (!context) {
          cleanup();
          reject(new Error('Unable to prepare video preview.'));
          return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/webp', 0.82);
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error('Unable to capture video preview.'));
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Unable to read the selected video.'));
    };

    video.src = objectUrl;
  });

function CustomSelectPill({
  value,
  onChange,
  options,
  defaultLabel,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  defaultLabel: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = value === 'ALL' ? null : options.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : defaultLabel;
  const isFiltered = value !== 'ALL';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const rawOptions = options.filter((o) => o.value !== 'ALL');
  const allOptions = [{ value: 'ALL', label: defaultLabel }, ...rawOptions];

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-8 items-center justify-between gap-1.5 rounded-lg border px-2.5 text-xs font-semibold outline-none transition cursor-pointer ${
          isFiltered
            ? 'border-amber-400 bg-amber-50 text-gray-950 font-bold shadow-2xs'
            : 'border-gray-200 bg-white text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50'
        } focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:cursor-not-allowed disabled:opacity-60 ${isOpen ? 'border-[#FFC107] ring-1 ring-[#FFC107]' : ''}`}
      >
        <span className="truncate max-w-[125px]">{displayLabel}</span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[170px] max-w-[260px] max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl ring-1 ring-black/5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {allOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-amber-50 text-amber-950 font-bold'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-[#FFC107] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AvailabilityFilterDropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];
  const isFiltered = value !== 'ALL';

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
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-8 items-center justify-between gap-1.5 rounded-lg border px-2.5 text-xs font-semibold outline-none transition shadow-2xs cursor-pointer ${
          isFiltered
            ? 'border-amber-400 bg-amber-50 text-gray-950 font-bold'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
        } focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] ${isOpen ? 'border-[#FFC107] ring-1 ring-[#FFC107]' : ''}`}
      >
        <span className="truncate max-w-[125px]">{selectedOption?.label || 'All Availability'}</span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] max-w-[280px] max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl ring-1 ring-black/5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                className={`w-full text-left rounded-lg px-3 py-2 text-xs font-medium transition cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-amber-50 text-amber-950 font-bold'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-[#FFC107] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TableAvailabilityDropdown({
  value,
  onChange,
  options,
  disabled,
  openUpwards: _openUpwards,
  optionLabels,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  disabled?: boolean;
  openUpwards?: boolean;
  optionLabels?: Record<string, string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const calculatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = Math.min(options.length * 36 + 12, 200);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
    const top = openUp ? rect.top - menuHeight - 4 : rect.bottom + 4;
    const left = Math.min(rect.left, window.innerWidth - 160);
    setCoords({ top, left });
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleScrollOrResize = () => calculatePosition();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const badgeClass = availabilityBadgeClassName[value] || 'border-gray-200 bg-white text-gray-700';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!isOpen) {
            calculatePosition();
            setIsOpen(true);
          } else {
            setIsOpen(false);
          }
        }}
        className={`inline-flex items-center justify-between gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold shadow-2xs outline-none transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${badgeClass}`}
      >
        <span className="truncate max-w-[62px]">{value}</span>
        <ChevronDown size={10} className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && coords && typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px` }}
            className="z-[99999] min-w-[130px] max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-2xl ring-1 ring-black/5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((opt) => {
              const isSelected = opt === value;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(opt);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition cursor-pointer ${
                    isSelected
                      ? 'bg-gray-100 text-gray-950 font-extrabold'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {optionLabels?.[opt] || opt}
                </button>
              );
            })}
          </div>,
          document.body
        )
      }
    </>
  );
}

export default function PartnerListingsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedHighlightId = searchParams.get('highlightId')?.trim() || '';
  const user = useAuthStore((state) => state.user);

  const canEdit =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN' ||
    hasPermission(user?.permissions, 'listings.update') ||
    hasPermission(user?.permissions, 'listings.approve');
  const ownerCanCreate =
    user?.role === 'PARTNER' ||
    user?.role === 'CUSTOMER';
  const [managedListingCreationEnabled, setManagedListingCreationEnabled] = useState(false);
  const canCreate = ownerCanCreate || managedListingCreationEnabled;
  const canDelete = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || hasPermission(user?.permissions, 'listings.delete');
  const canApprove = user?.role === 'SUPER_ADMIN' || hasPermission(user?.permissions, 'listings.approve');
  const canVerifyPayment =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN' ||
    hasPermission(user?.permissions, 'listings.verify_payment') ||
    hasPermission(user?.permissions, 'listings.approve');
  const canLinkAccountModules = isInternalAccountLinkRole(user?.role);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<ModalTabKey>('equipment');
  const [form, setForm] = useState<ListingFormState>(initialForm);
  const modalFormRef = useRef<HTMLFormElement | null>(null);
  const soldSectionRef = useRef<HTMLElement | null>(null);
  const buyerNameInputRef = useRef<HTMLInputElement | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [buyerCities, setBuyerCities] = useState<Option[]>([]);
  const formDependenciesRef = useRef<Promise<ListingFormDependencies> | null>(null);
  const [listings, setListings] = useState<ListingRecord[]>([]);
  const [mediaState, setMediaState] = useState<MediaSlotState>(createEmptyMediaState);
  const [previewState, setPreviewState] = useState<MediaPreviewState>(createEmptyPreviewState);
  const [sampleGuideSlot, setSampleGuideSlot] = useState<MediaSlotKey | null>(null);
  const [guideLanguage, setGuideLanguage] = useState<'both' | 'en' | 'hi'>('both');
  const [loadingListings, setLoadingListings] = useState(true);
  const [linkedRtoRecords, setLinkedRtoRecords] = useState<Array<{ listingId?: string | null }>>([]);
  const [linkedSellRecords, setLinkedSellRecords] = useState<Array<{ listingId?: string | null }>>([]);

  useEffect(() => {
    if (!canLinkAccountModules) return;

    let cancelled = false;
    const loadLinkedAccountRecords = async () => {
      const [rtoResult, sellResult] = await Promise.allSettled([
        api.get<{ records?: Array<{ listingId?: string | null }> }>('/recruitment/admin/rto-records'),
        api.get<{ records?: Array<{ listingId?: string | null }> }>('/recruitment/admin/sell-accounts'),
      ]);

      let sellRecords: Array<{ listingId?: string | null }> = [];
      try {
        const saved = localStorage.getItem('jcb_sell_accounts_records');
        const parsed = saved ? JSON.parse(saved) : [];
        if (Array.isArray(parsed)) sellRecords = parsed;
      } catch {
        sellRecords = [];
      }

      if (cancelled) return;
      setLinkedRtoRecords(rtoResult.status === 'fulfilled' ? rtoResult.value.data.records || [] : []);
      setLinkedSellRecords(sellResult.status === 'fulfilled' ? sellResult.value.data.records || [] : sellRecords);
    };

    void loadLinkedAccountRecords();
    return () => {
      cancelled = true;
    };
  }, [canLinkAccountModules]);

  const openListingDetails = (listing: ListingRecord) => {
    const basePath = pathname.startsWith('/employee')
      ? '/employee/listings'
      : pathname.startsWith('/admin')
        ? '/admin/listings'
        : '/superadmin/listings';
    router.push(generateAdminListingDetailPath(basePath, listing));
  };

  const [saving, setSaving] = useState(false);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [chassisVerificationStatus, setChassisVerificationStatus] = useState<'UNVERIFIED' | 'VERIFYING' | 'VERIFIED' | 'FAILED'>('UNVERIFIED');
  const [verifiedChassisNumber, setVerifiedChassisNumber] = useState('');
  const [verifiedRegistrationNumber, setVerifiedRegistrationNumber] = useState('');
  const [vehicleVerificationSource, setVehicleVerificationSource] = useState<VehicleVerificationSource | ''>('');
  const [verificationLoadingSource, setVerificationLoadingSource] = useState<VehicleVerificationSource | ''>('');
  const [chassisVerificationId, setChassisVerificationId] = useState('');
  const [listingVerificationPolicy, setListingVerificationPolicy] = useState<ListingVerificationPolicyResponse['vehicleListingVerification'] | null>(null);
  const chassisVerificationRequestRef = useRef(0);
  const originalChassisNumberRef = useRef('');
  const originalRegistrationNumberRef = useRef('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [fuelFilter, setFuelFilter] = useState('ALL');
  const [pendingCategoryFilter, setPendingCategoryFilter] = useState('ALL');
  const [pendingBrandFilter, setPendingBrandFilter] = useState('ALL');
  const [pendingDealerFilter, setPendingDealerFilter] = useState('ALL');
  const [pendingSearch, setPendingSearch] = useState('');
  const [listingView, setListingView] = useState<'all' | 'pending' | 'payments' | 'bills'>(() => {
    const requestedView = searchParams.get('view');
    if (requestedView === 'payments' || requestedView === 'pending' || requestedView === 'all' || requestedView === 'bills') {
      return requestedView;
    }
    return 'all';
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openPageSizeDropdown, setOpenPageSizeDropdown] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Sorting state
  const [sortKey, setSortKey] = useState<ListingSortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [pendingPaymentVerificationsCount, setPendingPaymentVerificationsCount] = useState(0);
  const [deleteListingRecord, setDeleteListingRecord] = useState<ListingRecord | null>(null);
  const [pricingTarget, setPricingTarget] = useState<{ listing: ListingRecord; mode: 'approve' | 'edit' } | null>(null);
  const [updatingAvailabilityIds, setUpdatingAvailabilityIds] = useState<string[]>([]);
  const [moderatingListingIds, setModeratingListingIds] = useState<string[]>([]);
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);
  const [highlightedListingId, setHighlightedListingId] = useState<string | null>(null);
  const { t } = useTranslation();
  const localizedAvailability = useCallback((value: string) => t(`sellModal.availability.${value}`, value), [t]);
  const localizedCondition = useCallback((value: string) => t(`machineDetails.conditionOptions.${value}`, value), [t]);
  const localizedFuelType = useCallback((value: string) => t(`machineDetails.fuelOptions.${value}`, value), [t]);

  const ensureFormDependencies = useCallback(() => {
    if (formDependenciesRef.current) {
      return formDependenciesRef.current;
    }

    const dependenciesPromise = (async () => {
      const [categoryResponse, brandResponse, countriesResponse] = await Promise.all([
        api.get<{ data: CategoryOption[] }>('/master/categories'),
        api.get<{ data: Option[] }>('/master/brands'),
        api.get<Option[]>('/locations/countries'),
      ]);
      const nextCategories = categoryResponse.data.data || [];
      const nextBrands = brandResponse.data.data || [];
      const india = countriesResponse.data.find((country) => country.name === 'India');
      const nextStates = india
        ? (await api.get<Option[]>(`/locations/states/${india.id}`)).data
        : [];

      setCategories(nextCategories);
      setBrands(nextBrands);
      setStates(nextStates);

      return {
        categories: nextCategories,
        brands: nextBrands,
        states: nextStates,
      };
    })().catch((loadError) => {
      formDependenciesRef.current = null;
      throw loadError;
    });

    formDependenciesRef.current = dependenciesPromise;
    return dependenciesPromise;
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.action-dropdown-container') || target?.closest?.('.rows-per-page-dropdown-container')) {
        return;
      }
      setOpenActionDropdownId(null);
      setOpenPageSizeDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPageData = async () => {
      try {
        const [listingResponse, paymentsResult, verificationPolicyResult] = await Promise.allSettled([
          api.get<{ listings: ListingRecord[]; canCreateListing?: boolean }>('/superadmin/listings?compact=true'),
          api.get<{ count?: number }>('/superadmin/listing-payments?status=PENDING_VERIFICATION&summary=true'),
          api.get<ListingVerificationPolicyResponse>('/listings/verification-policy'),
        ]);

        if (cancelled) {
          return;
        }

        if (listingResponse.status === 'fulfilled') {
          setListings(listingResponse.value.data.listings || []);
          setManagedListingCreationEnabled(listingResponse.value.data.canCreateListing === true);
        } else {
          setListings([]);
          setManagedListingCreationEnabled(false);
        }

        if (paymentsResult.status === 'fulfilled') {
          setPendingPaymentVerificationsCount(paymentsResult.value.data.count || 0);
        }

        if (verificationPolicyResult.status === 'fulfilled') {
          setListingVerificationPolicy(verificationPolicyResult.value.data.vehicleListingVerification);
        } else {
          setListingVerificationPolicy(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load listing data.');
        }
      } finally {
        if (!cancelled) {
          setLoadingListings(false);
        }
      }
    };

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, []);

  const allViewListings = useMemo(
    () => listings.filter((listing) => !isPendingApprovalListing(listing.status)),
    [listings]
  );

  const pendingViewListings = useMemo(
    () => listings.filter((listing) => isPendingApprovalListing(listing.status)),
    [listings]
  );

  const allListingCategoryOptions = useMemo(
    () =>
      buildCountedFilterOptions(
        allViewListings,
        (listing) => listing.category?.id || listing.category?.name || '',
        (listing, value) => listing.category?.name || value
      ),
    [allViewListings]
  );

  const allListingBrandOptions = useMemo(
    () =>
      buildCountedFilterOptions(
        allViewListings,
        (listing) => listing.brand?.name || '',
        (listing, value) => listing.brand?.name || value
      ),
    [allViewListings]
  );

  const allListingStateOptions = useMemo(
    () =>
      buildCountedFilterOptions(
        allViewListings,
        (listing) => listing.locationState || '',
        (listing, value) => listing.locationState || value
      ),
    [allViewListings]
  );

  const allListingFuelOptions = useMemo(
    () =>
      buildCountedFilterOptions(
        allViewListings,
        (listing) => parseListingDescription(listing.description).fuelType || '',
        (_listing, value) => localizedFuelType(value)
      ),
    [allViewListings, localizedFuelType]
  );

  const pendingListingCategoryOptions = useMemo(
    () =>
      buildCountedFilterOptions(
        pendingViewListings,
        (listing) => listing.category?.id || listing.category?.name || '',
        (listing, value) => listing.category?.name || value
      ),
    [pendingViewListings]
  );

  const pendingListingBrandOptions = useMemo(
    () =>
      buildCountedFilterOptions(
        pendingViewListings,
        (listing) => listing.brand?.name || '',
        (listing, value) => listing.brand?.name || value
      ),
    [pendingViewListings]
  );

  const pendingListingDealerTypeOptions = useMemo(
    () =>
      buildCountedFilterOptions(
        pendingViewListings,
        (listing) => resolveDealerTypeLabel(listing),
        (listing, value) => resolveDealerTypeLabel(listing) || value
      ),
    [pendingViewListings]
  );

  const dynamicAvailabilityOptions = useMemo(() => {
    const options: FilterOption[] = [{ value: 'ALL', label: 'All Availability' }];
    const counted = buildCountedFilterOptions(
      allViewListings,
      (listing) => listingStatusToAvailability(listing.status),
      (_listing, value) => localizedAvailability(value)
    );
    return options.concat(counted);
  }, [allViewListings, localizedAvailability]);

  useEffect(() => {
    if (!form.selectedStateId) {
      return;
    }

    let cancelled = false;
    api.get<Option[]>(`/locations/cities/${form.selectedStateId}`)
      .then((res) => {
        if (!cancelled) setCities(res.data);
      })
      .catch((err) => console.error('Failed to load cities', err));

    return () => { cancelled = true; };
  }, [form.selectedStateId]);

  useEffect(() => {
    if (!form.selectedBuyerStateId) {
      return;
    }

    let cancelled = false;
    api.get<Option[]>(`/locations/cities/${form.selectedBuyerStateId}`)
      .then((res) => {
        if (!cancelled) setBuyerCities(res.data);
      })
      .catch((err) => console.error('Failed to load buyer cities', err));

    return () => { cancelled = true; };
  }, [form.selectedBuyerStateId]);

  useEffect(() => {
    if (!isModalOpen || form.currentAvailability !== 'SOLD') {
      return;
    }

    const container = modalFormRef.current;
    const soldSection = soldSectionRef.current;
    const buyerNameInput = buyerNameInputRef.current;

    if (!container || !soldSection || !buyerNameInput) {
      return;
    }

    const timer = window.setTimeout(() => {
      container.scrollTo({
        top: Math.max(soldSection.offsetTop - 24, 0),
        behavior: 'smooth',
      });
      buyerNameInput.focus({ preventScroll: true });
      buyerNameInput.select();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [form.currentAvailability, isModalOpen]);

  const currentCategoryFilterOptions = useMemo(
    () =>
      allListingCategoryOptions.length > 0
        ? allListingCategoryOptions
        : categories.map((category) => ({ value: category.id, label: category.name })),
    [allListingCategoryOptions, categories]
  );

  const currentBrandFilterOptions = useMemo(
    () =>
      allListingBrandOptions.length > 0
        ? allListingBrandOptions
        : brands.map((brand) => ({ value: String(brand.id || brand.name), label: brand.name })),
    [allListingBrandOptions, brands]
  );

  const currentStateFilterOptions = useMemo(
    () =>
      allListingStateOptions.length > 0
        ? allListingStateOptions
        : states.map((state) => ({ value: String(state.id || state.name), label: state.name })),
    [allListingStateOptions, states]
  );

  const currentFuelFilterOptions = useMemo(
    () =>
      allListingFuelOptions.length > 0
        ? allListingFuelOptions
        : fuelTypes.map((fuelType) => ({ value: fuelType, label: localizedFuelType(fuelType) })),
    [allListingFuelOptions, localizedFuelType]
  );

  const currentPendingCategoryFilterOptions = useMemo(
    () =>
      pendingListingCategoryOptions.length > 0
        ? pendingListingCategoryOptions
        : categories.map((category) => ({ value: category.id, label: category.name })),
    [pendingListingCategoryOptions, categories]
  );

  const currentPendingBrandFilterOptions = useMemo(
    () =>
      pendingListingBrandOptions.length > 0
        ? pendingListingBrandOptions
        : brands.map((brand) => ({ value: String(brand.id || brand.name), label: brand.name })),
    [pendingListingBrandOptions, brands]
  );

  const currentPendingDealerTypeOptions = useMemo(
    () =>
      pendingListingDealerTypeOptions.length > 0
        ? pendingListingDealerTypeOptions
        : ['Authorized Place', 'Prime Customer'].map((value) => ({ value, label: value })),
    [pendingListingDealerTypeOptions]
  );

  const filteredListings = useMemo(() => {
    if (listingView === 'payments') {
      return [];
    }

    if (listingView === 'pending') {
      let pendingList = listings.filter((listing) => isPendingApprovalListing(listing.status));

      if (pendingCategoryFilter !== 'ALL') {
        pendingList = pendingList.filter(
          (listing) => listing.category?.id === pendingCategoryFilter || listing.category?.name === pendingCategoryFilter
        );
      }

      if (pendingBrandFilter !== 'ALL') {
        pendingList = pendingList.filter(
          (listing) => (listing.brand?.name || '').toLowerCase() === pendingBrandFilter.toLowerCase()
        );
      }

      if (pendingDealerFilter !== 'ALL') {
        pendingList = pendingList.filter((listing) => {
          const label = resolveDealerTypeLabel(listing).toLowerCase();
          return label.includes(pendingDealerFilter.toLowerCase());
        });
      }

      const q = pendingSearch.trim().toLowerCase();
      if (q) {
        pendingList = pendingList.filter((listing) => {
          const haystack = [
            listing.title,
            listing.dealer,
            listing.brand?.name,
            listing.model?.name,
            listing.category?.name,
            listing.locationCity,
            listing.locationState,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        });
      }

      return pendingList;
    }

    // Default: 'all' Listings View
    let scopedListings = listings.filter((listing) => !isPendingApprovalListing(listing.status));

    if (availabilityFilter !== 'ALL') {
      scopedListings = scopedListings.filter(
        (listing) => listingStatusToAvailability(listing.status) === availabilityFilter
      );
    }

    if (categoryFilter !== 'ALL') {
      scopedListings = scopedListings.filter(
        (listing) => listing.category?.id === categoryFilter || listing.category?.name === categoryFilter
      );
    }

    if (brandFilter !== 'ALL') {
      scopedListings = scopedListings.filter(
        (listing) => (listing.brand?.name || '').toLowerCase() === brandFilter.toLowerCase()
      );
    }

    if (stateFilter !== 'ALL') {
      scopedListings = scopedListings.filter(
        (listing) => (listing.locationState || '').toLowerCase() === stateFilter.toLowerCase()
      );
    }

    if (fuelFilter !== 'ALL') {
      scopedListings = scopedListings.filter((listing) => {
        const parsedDetails = parseListingDescription(listing.description);
        return (parsedDetails.fuelType || '').toLowerCase() === fuelFilter.toLowerCase();
      });
    }

    const query = search.trim().toLowerCase();
    if (!query) {
      return scopedListings;
    }

    return scopedListings.filter((listing) => {
      const parsedDetails = parseListingDescription(listing.description);
      const haystack = [
        listing.title,
        listing.brand?.name,
        listing.model?.name,
        listing.category?.name,
        listing.locationCity,
        listing.locationState,
        listing.condition,
        listing.address,
        listing.description,
        parsedDetails.address,
        parsedDetails.variant,
        parsedDetails.registrationNo,
        parsedDetails.chassisOrSerialNo,
        parsedDetails.fuelType,
        parsedDetails.transmission,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [
    listings,
    listingView,
    search,
    availabilityFilter,
    categoryFilter,
    brandFilter,
    stateFilter,
    fuelFilter,
    pendingCategoryFilter,
    pendingBrandFilter,
    pendingDealerFilter,
    pendingSearch,
  ]);

  // Sorting logic applied on top of filtered results
  const sortedFilteredListings = useMemo(() => {
    const isSold = (listing: ListingRecord) => {
      const isAvailabilitySold = listingStatusToAvailability(listing.status) === 'SOLD';
      const hasSaleRecord = Boolean(
        listing.saleRecord?.soldPrice ||
        listing.saleRecord?.soldAt ||
        listing.saleRecord?.buyerName
      );
      const hasSellAccount = linkedSellRecords.some(
        (record) => String(record?.listingId || '').trim() === String(listing.id || '').trim()
      );
      return isAvailabilitySold || hasSaleRecord || hasSellAccount;
    };

    return [...filteredListings].sort((a, b) => {
      const aSold = isSold(a);
      const bSold = isSold(b);

      // Sold vehicles always stay at the bottom ("sold vehicle niche rahe")
      if (!aSold && bSold) return -1;
      if (aSold && !bSold) return 1;

      // Within the same group (both unsold or both sold):
      if (sortKey === 'title') {
        const aVal = a.title || '';
        const bVal = b.title || '';
        const cmp = aVal.localeCompare(bVal);
        return sortDir === 'asc' ? cmp : -cmp;
      } else if (sortKey === 'price') {
        const aNum = parseFloat(String(a.price || '0').replace(/[^\d.]/g, '')) || 0;
        const bNum = parseFloat(String(b.price || '0').replace(/[^\d.]/g, '')) || 0;
        return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
      } else if (sortKey === 'year') {
        const aYear = a.manufacturingYear || 0;
        const bYear = b.manufacturingYear || 0;
        return sortDir === 'asc' ? aYear - bYear : bYear - aYear;
      } else if (sortKey === 'location') {
        const aVal = `${a.locationCity || ''} ${a.locationState || ''}`;
        const bVal = `${b.locationCity || ''} ${b.locationState || ''}`;
        const cmp = aVal.localeCompare(bVal);
        return sortDir === 'asc' ? cmp : -cmp;
      } else if (sortKey === 'date') {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
      }

      // Default sorting: Newest entries first by createdAt
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [filteredListings, sortKey, sortDir, linkedSellRecords]);

  const handleSort = (key: ListingSortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  const pendingApprovalCount = useMemo(
    () => listings.filter((listing) => isPendingApprovalListing(listing.status)).length,
    [listings],
  );

  const clearedPendingCount =
    user?.id && typeof window !== 'undefined'
      ? parseInt(localStorage.getItem(`cleared_listings_pending_${user.id}`) || '0', 10)
      : 0;

  const clearedPaymentsCount =
    user?.id && typeof window !== 'undefined'
      ? parseInt(localStorage.getItem(`cleared_listings_payments_${user.id}`) || '0', 10)
      : 0;

  const totalListings = sortedFilteredListings.length;
  const totalPages = Math.ceil(totalListings / pageSize) || 1;
  const currentPageForView = Math.min(currentPage, totalPages);
  const paginatedListings = useMemo(() => {
    const startIndex = (currentPageForView - 1) * pageSize;
    return sortedFilteredListings.slice(startIndex, startIndex + pageSize);
  }, [sortedFilteredListings, currentPageForView, pageSize]);
  const paginationItems = useMemo(
    () => buildPaginationItems(currentPageForView, totalPages),
    [currentPageForView, totalPages]
  );
  const startItemIndex = totalListings === 0 ? 0 : (currentPageForView - 1) * pageSize + 1;
  const endItemIndex = Math.min(currentPageForView * pageSize, totalListings);

  useEffect(() => {
    if (!requestedHighlightId || loadingListings || listingView === 'payments' || listingView === 'bills') {
      return;
    }

    const targetIndex = sortedFilteredListings.findIndex((listing) => isHighlightedListing(listing, requestedHighlightId));
    if (targetIndex < 0) {
      return;
    }

    const targetPage = Math.floor(targetIndex / pageSize) + 1;
    if (currentPageForView === targetPage) {
      return;
    }

    const timer = window.setTimeout(() => setCurrentPage(targetPage), 0);
    return () => window.clearTimeout(timer);
  }, [currentPageForView, listingView, loadingListings, pageSize, requestedHighlightId, sortedFilteredListings]);

  useEffect(() => {
    if (!requestedHighlightId || loadingListings || listingView === 'payments' || listingView === 'bills') {
      return;
    }

    const targetListing = paginatedListings.find((listing) => isHighlightedListing(listing, requestedHighlightId));
    if (!targetListing) {
      return;
    }

    const highlightTimer = window.setTimeout(() => {
      setHighlightedListingId(targetListing.id);
      document
        .getElementById(`listing-row-${encodeURIComponent(targetListing.id)}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    const clearTimer = window.setTimeout(() => setHighlightedListingId(null), 4_080);

    return () => {
      window.clearTimeout(highlightTimer);
      window.clearTimeout(clearTimer);
    };
  }, [listingView, loadingListings, paginatedListings, requestedHighlightId]);



  const populateEditForm = (listing: ListingRecord, availableStates = states) => {
    chassisVerificationRequestRef.current += 1;
    setMessage('');
    setError('');
    setEditingListingId(listing.id);
    const parsedDetails = parseListingDescription(listing.description);
    originalChassisNumberRef.current = parsedDetails.chassisOrSerialNo;
    const linkedRto = listing.rtoRecords?.[0];
    originalRegistrationNumberRef.current = linkedRto?.vehicleNumber || parsedDetails.registrationNo;
    const initialBuyerStateId =
      availableStates.find((option) => option.name.toLowerCase() === (listing.saleRecord?.buyerState || '').toLowerCase())?.id
        ? String(availableStates.find((option) => option.name.toLowerCase() === (listing.saleRecord?.buyerState || '').toLowerCase())?.id)
        : '';
    setForm({
      category: listing.category?.id || '',
      brand: listing.brand?.name || '',
      model: listing.model?.name || '',
      variant: parsedDetails.variant,
      manufacturingYear: String(listing.manufacturingYear || ''),
      registrationDate: parsedDetails.registrationDate,
      registrationUpto: parsedDetails.registrationUpto,
      registrationNo: linkedRto?.vehicleNumber || parsedDetails.registrationNo,
      ownerName: listing.ownerName || parsedDetails.ownerName,
      chassisOrSerialNo: parsedDetails.chassisOrSerialNo,
      engineNumber: listing.engineNumber || listing.vehicleVerification?.verifiedEngineNumber || parsedDetails.engineNumber,
      previousOwners: parsedDetails.previousOwners,
      condition: listing.condition || '',
      operatingHours: String(listing.operatingHours || ''),
      fuelType: parsedDetails.fuelType,
      transmission: parsedDetails.transmission,
      currentAvailability: normalizeSellVehicleAvailability(listingStatusToAvailability(listing.status || 'DRAFT')),
      title: listing.title || '',
      price: String(listing.price || ''),
      state: listing.locationState || '',
      address: listing.address || parsedDetails.address || parsedDetails.district,
      city: listing.locationCity || '',

      pinCode: parsedDetails.pinCode,
      nearbyLandmark: parsedDetails.nearbyLandmark,
      description: parsedDetails.rawDescription,
      additionalDescription: listing.additionalDescription || '',
      grossPower: (listing.grossPower || '').replace(/\s*(hp|HP|kw|kW|kWh|w|W).*$/i, '').trim(),
      isNegotiable: Boolean(listing.isNegotiable),
      insuranceExpiry: linkedRto
        ? linkedRto.insuranceStatus === 'VALID' && linkedRto.insuranceValidUntil
          ? String(linkedRto.insuranceValidUntil).split('T')[0]
          : ''
        : parsedDetails.insuranceExpiry,
      selectedStateId: '',
      selectedCityId: '',
      buyerName: listing.saleRecord?.buyerName || '',
      buyerPhone: listing.saleRecord?.buyerPhone || '',
      buyerCity: listing.saleRecord?.buyerCity || '',
      buyerState: listing.saleRecord?.buyerState || '',
      soldPrice: listing.saleRecord?.soldPrice ? String(listing.saleRecord.soldPrice) : '',
      soldAt: listing.saleRecord?.soldAt ? String(listing.saleRecord.soldAt).split('T')[0] : new Date().toISOString().split('T')[0],
      selectedBuyerStateId: initialBuyerStateId,
      selectedBuyerCityId: '',
      rtoDetails: {
        hirePurchaseStatus: linkedRto?.hirePurchaseStatus || emptyListingRtoForm.hirePurchaseStatus,
        financerName: linkedRto?.financerName || '',
        taxStatus: linkedRto?.taxStatus === 'EXPIRED'
          ? 'EXPIRED'
          : linkedRto?.taxStatus === 'LIFETIME'
            ? 'LIFETIME'
            : linkedRto?.taxStatus === 'VALID'
              ? 'VALID'
              : 'NOT_AVAILABLE',
        taxValidUntil: linkedRto?.taxStatus === 'VALID' && linkedRto.taxValidUntil ? String(linkedRto.taxValidUntil).split('T')[0] : '',
        fitnessStatus: linkedRto?.fitnessStatus === 'EXPIRED' ? 'EXPIRED' : linkedRto?.fitnessStatus === 'VALID' ? 'VALID' : 'NOT_AVAILABLE',
        fitnessValidUntil: linkedRto?.fitnessStatus === 'VALID' && linkedRto.fitnessValidUntil ? String(linkedRto.fitnessValidUntil).split('T')[0] : '',
        insuranceStatus: linkedRto?.insuranceStatus === 'EXPIRED' ? 'EXPIRED' : linkedRto?.insuranceStatus === 'VALID' ? 'VALID' : 'NOT_AVAILABLE',
        pucStatus: linkedRto?.pucStatus === 'EXPIRED' ? 'EXPIRED' : linkedRto?.pucStatus === 'VALID' ? 'VALID' : 'NOT_AVAILABLE',
        pucValidUntil: linkedRto?.pucStatus === 'VALID' && linkedRto.pucValidUntil ? String(linkedRto.pucValidUntil).split('T')[0] : '',
        hsrpStatus: linkedRto?.hsrpStatus === 'YES' ? 'YES' : linkedRto?.hsrpStatus === 'NO' ? 'NO' : linkedRto?.hsrpStatus === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'PENDING',
        hsrpNumber: linkedRto?.hsrpNumber || '',
        rtoOffice: linkedRto?.rtoOffice || '',
        rtoAgentName: linkedRto?.rtoAgentName || '',
        rtoExpenses: linkedRto?.rtoExpenses != null ? String(linkedRto.rtoExpenses) : '',
        vehicleMaintenanceCost: linkedRto?.vehicleMaintenanceCost != null ? String(linkedRto.vehicleMaintenanceCost) : '',
      },
    });

    const { nextMediaState, nextPreviewState } = buildMediaPreviewState(listing.media || []);

    setMediaState(nextMediaState);
    setPreviewState(nextPreviewState);
    const savedVerification = listing.vehicleVerification;
    const hasReusableVerification = Boolean(
      savedVerification?.verificationRecordId
      && ['API_VERIFIED', 'MANUALLY_MODIFIED'].includes(savedVerification.status || '')
      && savedVerification.status !== 'REVERIFICATION_REQUIRED',
    );
    setChassisVerificationStatus(hasReusableVerification ? 'VERIFIED' : 'UNVERIFIED');
    setVerifiedChassisNumber(hasReusableVerification ? savedVerification?.verifiedChassisNumber || parsedDetails.chassisOrSerialNo : '');
    setVerifiedRegistrationNumber(hasReusableVerification ? savedVerification?.verifiedRegistrationNumber || linkedRto?.vehicleNumber || parsedDetails.registrationNo : '');
    setVehicleVerificationSource(hasReusableVerification ? savedVerification?.verificationSource || 'CHASSIS' : '');
    setChassisVerificationId(hasReusableVerification ? savedVerification?.verificationRecordId || '' : '');
    setModalTab('equipment');
    setIsModalOpen(true);
  };

  const openModal = () => {
    chassisVerificationRequestRef.current += 1;
    originalChassisNumberRef.current = '';
    originalRegistrationNumberRef.current = '';
    setMessage('');
    setError('');
    setForm(initialForm);
    setMediaState(createEmptyMediaState());
    setPreviewState(createEmptyPreviewState());
    setEditingListingId(null);
    setChassisVerificationStatus('UNVERIFIED');
    setVerifiedChassisNumber('');
    setVerifiedRegistrationNumber('');
    setVehicleVerificationSource('');
    setVerificationLoadingSource('');
    setChassisVerificationId('');
    setModalTab('equipment');
    setIsModalOpen(true);
    void ensureFormDependencies().catch(() => {
      setError('Unable to load listing form options. Please try again.');
    });
  };

  const openEditModal = async (listing: ListingRecord) => {
    try {
      const [response, dependencies] = await Promise.all([
        api.get<{ listing: ListingRecord }>(`/listings/${listing.id}`),
        ensureFormDependencies(),
      ]);
      populateEditForm(response.data.listing || listing, dependencies.states);
    } catch {
      try {
        const dependencies = await ensureFormDependencies();
        populateEditForm(listing, dependencies.states);
      } catch {
        populateEditForm(listing);
      }
    }
  };
  const closeModal = () => {
    if (saving || uploadingCount > 0) {
      return;
    }

    setIsModalOpen(false);
    setModalTab('equipment');
    setForm(initialForm);
    setMediaState(createEmptyMediaState());
    setPreviewState(createEmptyPreviewState());
    setEditingListingId(null);
    chassisVerificationRequestRef.current += 1;
    originalChassisNumberRef.current = '';
    originalRegistrationNumberRef.current = '';
    setChassisVerificationStatus('UNVERIFIED');
    setVerifiedChassisNumber('');
    setVerifiedRegistrationNumber('');
    setVehicleVerificationSource('');
    setChassisVerificationId('');
  };

  const updateField = <K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) => {
    if (key === 'chassisOrSerialNo' || key === 'registrationNo' || key === 'engineNumber') {
      chassisVerificationRequestRef.current += 1;
      setChassisVerificationStatus('UNVERIFIED');
      setVerifiedChassisNumber('');
      setVerifiedRegistrationNumber('');
      setVehicleVerificationSource('');
      setVerificationLoadingSource('');
      setChassisVerificationId('');
    }
    setForm((current) => ({
      ...current,
      [key]: typeof value === 'string' ? sanitizeListingFieldValue(key, value) : value,
    }));
  };

  const updateRtoField = <K extends keyof ListingRtoFormState>(key: K, value: ListingRtoFormState[K]) => {
    setForm((current) => ({ ...current, rtoDetails: { ...current.rtoDetails, [key]: value } }));
  };

  const handleChassisVerification = async () => {
    if (listingVerificationPolicy?.chassisEnabled !== true) {
      setError('Chassis verification is currently disabled. Enter the vehicle details manually or use registration number verification.');
      return;
    }

    const chassisNumber = form.chassisOrSerialNo.trim();
    if (!chassisNumber) {
      setChassisVerificationStatus('FAILED');
      setError('Enter a chassis number before verification.');
      return;
    }

    const requestId = ++chassisVerificationRequestRef.current;
    setVerificationLoadingSource('CHASSIS');
    setChassisVerificationStatus('VERIFYING');
    setError('');
    setMessage('');

    try {
      const cacheKey = buildVerificationCacheKey('chassis-to-rc', chassisNumber);
      const cachedResponse = getVerificationCache<ChassisVerificationResponse>(cacheKey);
      const response = cachedResponse
        ? { data: { ...cachedResponse, cacheHit: true } }
        : await api.post<ChassisVerificationResponse>('/chassis-to-rc/verify', { chassis_number: chassisNumber });
      if (requestId !== chassisVerificationRequestRef.current) return;

      const verificationRecordId = response.data.record?.id || '';
      if (!response.data.success || !verificationRecordId) {
        throw new Error('Vehicle verification did not return a usable verification record.');
      }
      if (!cachedResponse) setVerificationCache(cacheKey, response.data);

      const mapped = mapProviderVehicleToListing(response.data.result || {});
      const identityMismatch = getProviderVehicleIdentityMismatch('CHASSIS', form.registrationNo, chassisNumber, mapped);
      if (identityMismatch || !mapped.chassisOrSerialNo) {
        throw new Error(identityMismatch || 'The provider did not return a usable chassis number.');
      }

      const categoryMatch = findMasterOption(categories, mapped.categoryName);
      const brandMatch = findMasterOption(brands, mapped.brandName);
      const categoryId = categoryMatch?.id
        ? String(categoryMatch.id)
        : mapped.categoryName
          ? `__provider_category__${normalizeMasterName(mapped.categoryName)}`
          : '';
      const brandName = brandMatch?.name || mapped.brandName;

      if (mapped.categoryName && !categoryMatch) {
        setCategories((current) => current.some((option) => normalizeMasterName(option.name) === normalizeMasterName(mapped.categoryName))
          ? current
          : [...current, { id: categoryId, name: mapped.categoryName }]);
      }
      if (mapped.brandName && !brandMatch) {
        setBrands((current) => current.some((option) => normalizeMasterName(option.name) === normalizeMasterName(mapped.brandName))
          ? current
          : [...current, { id: `__provider_brand__${normalizeMasterName(mapped.brandName)}`, name: mapped.brandName }]);
      }

      setForm((current) => ({
        ...current,
        category: categoryId || current.category,
        brand: brandName || current.brand,
        model: mapped.model || current.model,
        variant: mapped.variant || current.variant,
        manufacturingYear: mapped.manufacturingYear || current.manufacturingYear,
        registrationDate: mapped.registrationDate || current.registrationDate,
        registrationUpto: mapped.registrationUpto || current.registrationUpto,
        registrationNo: mapped.registrationNo || current.registrationNo,
        ownerName: mapped.ownerName || current.ownerName,
        chassisOrSerialNo: mapped.chassisOrSerialNo || current.chassisOrSerialNo,
        engineNumber: mapped.engineNumber || current.engineNumber,
        previousOwners: mapped.previousOwners || current.previousOwners,
        fuelType: mapped.fuelType || current.fuelType,
        title: current.title.trim() || mapped.titleSuggestion,
        insuranceExpiry: mapped.insuranceExpiry || current.insuranceExpiry,
        rtoDetails: { ...current.rtoDetails, ...mapped.rtoDetails },
      }));
      setVerifiedChassisNumber(mapped.chassisOrSerialNo || chassisNumber);
      setVerifiedRegistrationNumber(mapped.registrationNo);
      setVehicleVerificationSource('CHASSIS');
      setChassisVerificationId(verificationRecordId);
      setChassisVerificationStatus('VERIFIED');
      setMessage(response.data.cacheHit
        ? 'Vehicle verification loaded from the recent secure result.'
        : 'Vehicle verified. Available details have been auto-filled.');
    } catch (verificationError) {
      if (requestId !== chassisVerificationRequestRef.current) return;
      setChassisVerificationStatus('FAILED');
      setVerifiedChassisNumber('');
      setVerifiedRegistrationNumber('');
      setVehicleVerificationSource('');
      setChassisVerificationId('');
      setError(getApiErrorMessage(verificationError, 'Vehicle verification failed. Please check the chassis number and try again.'));
    } finally {
      if (requestId === chassisVerificationRequestRef.current) {
        setVerificationLoadingSource('');
      }
    }
  };

  const handleVehicleNumberVerification = async () => {
    if (listingVerificationPolicy?.registrationEnabled !== true) {
      setError('Registration number verification is currently disabled. Enter the vehicle details manually or use chassis verification.');
      return;
    }

    const registrationNumber = form.registrationNo.trim();
    if (!registrationNumber) {
      setChassisVerificationStatus('FAILED');
      setError('Enter a registration number before verification.');
      return;
    }

    const requestId = ++chassisVerificationRequestRef.current;
    setVerificationLoadingSource('RC_FULL');
    setChassisVerificationStatus('VERIFYING');
    setError('');
    setMessage('');

    try {
      const cacheKey = buildVerificationCacheKey('rc-full', registrationNumber);
      const cachedResponse = getVerificationCache<VehicleVerificationResponse>(cacheKey);
      const response = cachedResponse
        ? { data: { ...cachedResponse, cacheHit: true } }
        : await api.post<VehicleVerificationResponse>('/listings/vehicle-verification/rc-full', { id_number: registrationNumber });
      if (requestId !== chassisVerificationRequestRef.current) return;

      const verificationRecordId = response.data.record?.id || '';
      if (!response.data.success || !verificationRecordId) {
        throw new Error('Vehicle verification did not return a usable verification record.');
      }
      if (!cachedResponse) setVerificationCache(cacheKey, response.data);

      const mapped = mapProviderVehicleToListing(response.data.result || {});
      const identityMismatch = getProviderVehicleIdentityMismatch('RC_FULL', registrationNumber, form.chassisOrSerialNo, mapped);
      if (identityMismatch || !mapped.registrationNo || !mapped.chassisOrSerialNo) {
        throw new Error(identityMismatch || 'The provider did not return complete vehicle identity details.');
      }

      const categoryMatch = findMasterOption(categories, mapped.categoryName);
      const brandMatch = findMasterOption(brands, mapped.brandName);
      const categoryId = categoryMatch?.id
        ? String(categoryMatch.id)
        : mapped.categoryName
          ? `__provider_category__${normalizeMasterName(mapped.categoryName)}`
          : '';
      const brandName = brandMatch?.name || mapped.brandName;

      if (mapped.categoryName && !categoryMatch) {
        setCategories((current) => current.some((option) => normalizeMasterName(option.name) === normalizeMasterName(mapped.categoryName))
          ? current
          : [...current, { id: categoryId, name: mapped.categoryName }]);
      }
      if (mapped.brandName && !brandMatch) {
        setBrands((current) => current.some((option) => normalizeMasterName(option.name) === normalizeMasterName(mapped.brandName))
          ? current
          : [...current, { id: `__provider_brand__${normalizeMasterName(mapped.brandName)}`, name: mapped.brandName }]);
      }

      setForm((current) => ({
        ...current,
        category: categoryId || current.category,
        brand: brandName || current.brand,
        model: mapped.model || current.model,
        variant: mapped.variant || current.variant,
        manufacturingYear: mapped.manufacturingYear || current.manufacturingYear,
        registrationDate: mapped.registrationDate || current.registrationDate,
        registrationUpto: mapped.registrationUpto || current.registrationUpto,
        registrationNo: mapped.registrationNo || current.registrationNo,
        ownerName: mapped.ownerName || current.ownerName,
        chassisOrSerialNo: mapped.chassisOrSerialNo || current.chassisOrSerialNo,
        engineNumber: mapped.engineNumber || current.engineNumber,
        previousOwners: mapped.previousOwners || current.previousOwners,
        fuelType: mapped.fuelType || current.fuelType,
        title: current.title.trim() || mapped.titleSuggestion,
        insuranceExpiry: mapped.insuranceExpiry || current.insuranceExpiry,
        rtoDetails: { ...current.rtoDetails, ...mapped.rtoDetails },
      }));
      setVerifiedChassisNumber(mapped.chassisOrSerialNo);
      setVerifiedRegistrationNumber(mapped.registrationNo);
      setVehicleVerificationSource('RC_FULL');
      setChassisVerificationId(verificationRecordId);
      setChassisVerificationStatus('VERIFIED');
      setMessage(response.data.cacheHit
        ? 'Vehicle verification loaded from the recent secure result.'
        : 'Vehicle verified. Available details have been auto-filled.');
    } catch (verificationError) {
      if (requestId !== chassisVerificationRequestRef.current) return;
      setChassisVerificationStatus('FAILED');
      setVerifiedChassisNumber('');
      setVerifiedRegistrationNumber('');
      setVehicleVerificationSource('');
      setChassisVerificationId('');
      setError(getApiErrorMessage(verificationError, 'Vehicle verification failed. Please check the registration number and try again.'));
    } finally {
      if (requestId === chassisVerificationRequestRef.current) {
        setVerificationLoadingSource('');
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const sanitizedForm = sanitizeListingFormData(form);
    const mediaRequirementError = getListingFormValidationError({
      category: sanitizedForm.category,
      brand: sanitizedForm.brand,
      imageCount: mediaSlots.filter((slot) => slot.kind === 'image' && mediaState[slot.key]).length,
      hasVideo: Boolean(mediaState['walkaround-video']),
    });
    if (mediaRequirementError) {
      setError(mediaRequirementError);
      setModalTab(
        mediaRequirementError.toLowerCase().includes('category') || mediaRequirementError.toLowerCase().includes('brand')
          ? 'equipment'
          : 'media'
      );
      return;
    }

    const vehicleVerificationRequired = listingVerificationPolicy?.required === true;
    const vehicleVerificationError = getVehicleVerificationSubmitValidationError({
      required: vehicleVerificationRequired,
      source: vehicleVerificationSource,
      currentRegistrationNumber: sanitizedForm.registrationNo,
      currentChassisNumber: sanitizedForm.chassisOrSerialNo,
      verifiedRegistrationNumber,
      verifiedChassisNumber,
      verifiedSource: vehicleVerificationSource,
    });
    if (vehicleVerificationError || (vehicleVerificationRequired && !chassisVerificationId)) {
      setError(vehicleVerificationError || 'Verify the current vehicle identity before posting this vehicle.');
      setModalTab('equipment');
      return;
    }

    const sanitizedRto = sanitizeListingRtoForm(sanitizedForm.rtoDetails);
    if (sanitizedRto.insuranceStatus !== 'VALID') {
      sanitizedForm.insuranceExpiry = '';
    }
    const shouldSyncRto = !editingListingId || hasListingRtoInput(sanitizedRto);
    const rtoValidationError = shouldSyncRto ? validateListingRtoForm(sanitizedRto, {
      registrationNo: sanitizedForm.registrationNo,
      vehicleType: categories.find((item) => item.id === sanitizedForm.category)?.name || '',
      vehicleModel: sanitizedForm.model,
      operatingHours: sanitizedForm.operatingHours,
      insuranceExpiry: sanitizedForm.insuranceExpiry,
    }) : null;
    if (rtoValidationError) {
      setError(rtoValidationError);
      setModalTab('rto');
      setForm({ ...sanitizedForm, rtoDetails: sanitizedRto });
      return;
    }

    if (!sanitizedForm.price || Number(sanitizedForm.price) <= 0) {
      setError('Price is required and must be greater than 0.');
      setModalTab('pricing');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidDigitsOnlyValue(sanitizedForm.price)) {
      setError('Price must contain digits only.');
      setModalTab('pricing');
      setForm(sanitizedForm);
      return;
    }

    if (!sanitizedForm.state.trim()) {
      setError('State is required.');
      setModalTab('pricing');
      setForm(sanitizedForm);
      return;
    }

    if (!sanitizedForm.city.trim()) {
      setError('City is required.');
      setModalTab('pricing');
      setForm(sanitizedForm);
      return;
    }

    if (!sanitizedForm.address.trim()) {
      setError('Address is required.');
      setModalTab('pricing');
      setForm(sanitizedForm);
      return;
    }

    if (!sanitizedForm.pinCode.trim()) {
      setError('PIN Code is required.');
      setModalTab('pricing');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidPinCodeValue(sanitizedForm.pinCode) || sanitizedForm.pinCode.length !== 6) {
      setError('Pin code must be exactly 6 digits.');
      setModalTab('pricing');
      setForm(sanitizedForm);
      return;
    }

    if (!sanitizedForm.nearbyLandmark.trim()) {
      setError('Nearby Landmark is required.');
      setModalTab('pricing');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidYearValue(sanitizedForm.manufacturingYear)) {
      setError('Manufacturing year must be a 4-digit year.');
      setModalTab('equipment');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidDigitsOnlyValue(sanitizedForm.operatingHours)) {
      setError('Operating hours must contain digits only.');
      setModalTab('equipment');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidDateValue(sanitizedForm.registrationDate) || !isValidDateValue(sanitizedForm.registrationUpto)) {
      setError('Registration dates must be valid calendar dates.');
      setModalTab('equipment');
      setForm(sanitizedForm);
      return;
    }

    if (sanitizedForm.registrationDate && sanitizedForm.registrationUpto && sanitizedForm.registrationDate > sanitizedForm.registrationUpto) {
      setError('Registration upto cannot be before the registration date.');
      setModalTab('equipment');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidDigitsOnlyValue(sanitizedForm.previousOwners)) {
      setError('Previous owners must contain digits only.');
      setModalTab('equipment');
      setForm(sanitizedForm);
      return;
    }

    if (sanitizedForm.currentAvailability === 'SOLD') {
      if (!sanitizedForm.buyerName.trim()) {
        setError('Buyer Name is required when marking a vehicle as SOLD.');
        setModalTab('sale');
        setForm(sanitizedForm);
        return;
      }

      if (sanitizedForm.buyerPhone.length !== 10) {
        setError('Buyer Mobile Number must be 10 digits when marking a vehicle as SOLD.');
        setModalTab('sale');
        setForm(sanitizedForm);
        return;
      }

      if (!sanitizedForm.soldPrice || Number(sanitizedForm.soldPrice) <= 0) {
        setError('Final Sold Price is required when marking a vehicle as SOLD.');
        setModalTab('sale');
        setForm(sanitizedForm);
        return;
      }
    }

    setForm({ ...sanitizedForm, rtoDetails: sanitizedRto });

    setSaving(true);

    try {
      const uploadedMedia = mediaSlots
        .map((slot) => {
          const uploadedFile = mediaState[slot.key];
          if (!uploadedFile) {
            return null;
          }

          return {
            slot: slot.key,
            fileUrl: uploadedFile.fileUrl,
            type: slot.kind === 'video' ? 'VIDEO' : 'IMAGE',
          };
        })
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        categoryId: sanitizedForm.category.startsWith('__provider_category__') ? undefined : sanitizedForm.category,
        ...(sanitizedForm.category.startsWith('__provider_category__')
          ? { categoryName: categories.find((item) => item.id === sanitizedForm.category)?.name || '' }
          : {}),
        brandName: sanitizedForm.brand,
        modelName: sanitizedForm.model,
        ownerName: sanitizedForm.ownerName,
        chassisOrSerialNo: sanitizedForm.chassisOrSerialNo,
        title: sanitizedForm.title || `${sanitizedForm.brand} ${sanitizedForm.model}`.trim(),
        price: sanitizedForm.price,
        manufacturingYear: sanitizedForm.manufacturingYear,
        operatingHours: sanitizedForm.operatingHours,
        locationState: sanitizedForm.state,
        locationCity: sanitizedForm.city,
        address: sanitizedForm.address.trim() || undefined,
        condition: sanitizedForm.condition,
        description: buildListingDescription(sanitizedForm),
        additionalDescription: sanitizedForm.additionalDescription,
        grossPower: sanitizedForm.grossPower,
        engineNumber: sanitizedForm.engineNumber,
        isNegotiable: sanitizedForm.isNegotiable,
        media: uploadedMedia,
        ...(chassisVerificationId
          ? { vehicleVerificationId: chassisVerificationId, vehicleVerificationSource: vehicleVerificationSource || 'CHASSIS' }
          : {}),
        ...(shouldSyncRto ? {
          rtoDetails: buildListingRtoDetails(sanitizedRto, {
            registrationNo: sanitizedForm.registrationNo,
            vehicleType: categories.find((item) => item.id === sanitizedForm.category)?.name || '',
            vehicleModel: sanitizedForm.model,
            operatingHours: sanitizedForm.operatingHours,
            insuranceExpiry: sanitizedForm.insuranceExpiry,
          }),
        } : {}),
      };

      if (['AVAILABLE', 'SOLD'].includes(sanitizedForm.currentAvailability)) {
        payload.status = availabilityToListingStatus(sanitizedForm.currentAvailability);
      }

      if (sanitizedForm.currentAvailability === 'SOLD') {
        if (!form.buyerName.trim()) {
          throw new Error('Buyer Name is required when marking a vehicle as SOLD.');
        }
        if (!form.buyerPhone.trim()) {
          throw new Error('Buyer Mobile Number is required when marking a vehicle as SOLD.');
        }
        if (!form.soldPrice || Number(form.soldPrice) <= 0) {
          throw new Error('Final Sold Price (₹) is required when marking a vehicle as SOLD.');
        }

        payload.buyerDetails = {
          buyerName: sanitizedForm.buyerName.trim(),
          buyerPhone: sanitizedForm.buyerPhone.trim(),
          buyerCity: sanitizedForm.buyerCity.trim() || undefined,
          buyerState: sanitizedForm.buyerState.trim() || undefined,
          soldPrice: sanitizedForm.soldPrice,
          soldAt: sanitizedForm.soldAt || new Date().toISOString().split('T')[0],
        };
      }

      let response;

      if (editingListingId) {
        const updateResponse = await api.put<{ listing: ListingRecord; message: string }>(`/listings/${editingListingId}`, payload);
        const shouldSyncAvailability = ['AVAILABLE', 'SOLD'].includes(sanitizedForm.currentAvailability.toUpperCase());
        let availabilityResponse;

        if (shouldSyncAvailability) {
          availabilityResponse = await api.patch<{ listing: ListingRecord; message: string }>(`/listings/${editingListingId}/availability`, {
            status: availabilityToListingStatus(sanitizedForm.currentAvailability),
            buyerDetails: payload.buyerDetails,
          });
        }

        response = getListingSaveResponse(updateResponse, availabilityResponse?.data);
      } else {
        response = await api.post<{ listing: ListingRecord; message: string }>('/listings', payload);
      }

      setListings((current) =>
        editingListingId
          ? current.map((item) => (item.id === editingListingId ? response.data.listing : item))
          : [response.data.listing, ...current]
      );
      setMessage(response.data.message || (editingListingId ? 'Listing updated successfully.' : 'Listing saved successfully.'));
      setIsModalOpen(false);
      setForm(initialForm);
      setMediaState(createEmptyMediaState());
      setPreviewState(createEmptyPreviewState());
      setEditingListingId(null);
      chassisVerificationRequestRef.current += 1;
      originalChassisNumberRef.current = '';
      setChassisVerificationStatus('UNVERIFIED');
      setVerifiedChassisNumber('');
      setChassisVerificationId('');
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, editingListingId ? 'Unable to update the listing.' : 'Unable to save the listing.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteListing = async () => {
    if (!deleteListingRecord) return;

    setDeletingListingId(deleteListingRecord.id);
    setMessage('');
    setError('');

    try {
      const response = await api.delete<{ message: string }>(`/listings/${deleteListingRecord.id}`);
      setListings((current) => current.filter((item) => item.id !== deleteListingRecord.id));

      setMessage(response.data.message || 'Listing deleted successfully.');
      setDeleteListingRecord(null);
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Unable to delete the listing.'));
    } finally {
      setDeletingListingId(null);
    }
  };

  const handleUpdateAvailability = async (listingId: string, newAvailability: string) => {
    setError('');
    setMessage('');
    const previousListing = listings.find((item) => item.id === listingId);

    if (!previousListing) {
      return;
    }

    if (newAvailability === 'SOLD') {
      await openEditModal(previousListing);
      setForm((current) => ({
        ...current,
        currentAvailability: 'SOLD',
        soldPrice: current.soldPrice || String(previousListing.price || ''),
      }));
      return;
    }

    const optimisticStatus = availabilityToListingStatus(newAvailability);

    setUpdatingAvailabilityIds((current) => [...current, listingId]);
    setListings((current) =>
      current.map((item) => (item.id === listingId ? { ...item, status: optimisticStatus } : item))
    );


    try {
      const response = await api.patch<{ listing: ListingRecord; message: string }>(`/listings/${listingId}/availability`, {
        status: newAvailability
      });

      setListings((current) =>
        current.map((item) => (item.id === listingId ? response.data.listing : item))
      );

      setMessage(response.data.message || 'Availability updated successfully.');
      setTimeout(() => setMessage(''), 3000);
    } catch (updateError) {
      setListings((current) =>
        current.map((item) => (item.id === listingId ? previousListing : item))
      );

      setError(getApiErrorMessage(updateError, 'Unable to update availability.'));
      setTimeout(() => setError(''), 3000);
    } finally {
      setUpdatingAvailabilityIds((current) => current.filter((id) => id !== listingId));
    }
  };

  const handleListingModeration = async (listingId: string, nextStatus: 'PUBLISHED' | 'CHANGES_REQUESTED') => {
    setError('');
    setMessage('');

    // Approving goes through the pricing modal so the admin can add margin and expenses first.
    const pendingListing = listings.find((item) => item.id === listingId);
    if (nextStatus === 'PUBLISHED' && pendingListing) {
      setPricingTarget({ listing: pendingListing, mode: 'approve' });
      return;
    }
    setModeratingListingIds((current) => [...current, listingId]);

    try {
      const response = await api.patch<{ listing: ListingRecord; message: string }>(`/listings/${listingId}/status`, {
        status: nextStatus,
      });

      setListings((current) =>
        current.map((item) => (item.id === listingId ? response.data.listing : item))
      );
      setMessage(
        response.data.message ||
        (nextStatus === 'PUBLISHED' ? 'Listing approved successfully.' : 'Listing rejected successfully.')
      );
    } catch (moderationError) {
      setError(
        getApiErrorMessage(
          moderationError,
          nextStatus === 'PUBLISHED' ? 'Unable to approve listing.' : 'Unable to reject listing.',
        ),
      );
    } finally {
      setModeratingListingIds((current) => current.filter((id) => id !== listingId));
    }
  };

  const editingListingRecord = editingListingId
    ? listings.find((item) => item.id === editingListingId) || null
    : null;
    const editingVerification = getListingVerificationDisplay(editingListingRecord?.vehicleVerification?.status);
  const chassisButtonState = getVehicleVerificationButtonState('CHASSIS', verificationLoadingSource, vehicleVerificationSource);
  // Fields that RC / chassis verification can fill carry the AI badge; solid once actually filled.
  const vehicleVerificationFilled = chassisVerificationStatus === 'VERIFIED';
  const vehicleApiFill = listingVerificationPolicy?.enabled ? { source: 'RC / chassis verification', filled: vehicleVerificationFilled } : null;
  const registrationApiFill = listingVerificationPolicy?.chassisEnabled ? { source: 'chassis verification', filled: vehicleVerificationFilled && vehicleVerificationSource === 'CHASSIS' } : null;
  const chassisApiFill = listingVerificationPolicy?.registrationEnabled ? { source: 'registration (RC) verification', filled: vehicleVerificationFilled && vehicleVerificationSource === 'RC_FULL' } : null;
  const registrationButtonState = getVehicleVerificationButtonState('RC_FULL', verificationLoadingSource, vehicleVerificationSource);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [listingResponse, paymentsResult] = await Promise.allSettled([
        api.get<{ listings: ListingRecord[]; canCreateListing?: boolean }>('/superadmin/listings?compact=true'),
        api.get<{ count?: number }>('/superadmin/listing-payments?status=PENDING_VERIFICATION&summary=true'),
      ]);
      if (listingResponse.status === 'fulfilled') {
        setListings(listingResponse.value.data.listings || []);
      }
      if (paymentsResult.status === 'fulfilled') {
        setPendingPaymentVerificationsCount(paymentsResult.value.data.count || 0);
      }
    } catch {
      // silently handle
    } finally {
      setIsRefreshing(false);
    }
  };

  const metrics = useMemo(() => {
    const totalVehicles = allViewListings.length;
    const availableCount = allViewListings.filter(
      (l) => listingStatusToAvailability(l.status) === 'AVAILABLE'
    ).length;
    const soldOrReservedCount = allViewListings.filter((l) => {
      const avail = listingStatusToAvailability(l.status);
      return avail === 'SOLD' || avail === 'RESERVED';
    }).length;
    const verifiedCount = allViewListings.filter(
      (l) => getListingVerificationDisplay(l.vehicleVerification?.status).label === 'Verified'
    ).length;
    const totalValue = allViewListings.reduce((sum, item) => {
      const num = parseFloat(String(item.price || '0').replace(/[^\d.]/g, ''));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);

    return {
      totalVehicles,
      availableCount,
      soldOrReservedCount,
      verifiedCount,
      totalValue,
    };
  }, [allViewListings]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (categoryFilter !== 'ALL') count++;
    if (brandFilter !== 'ALL') count++;
    if (stateFilter !== 'ALL') count++;
    if (availabilityFilter !== 'ALL') count++;
    if (fuelFilter !== 'ALL') count++;
    if (search.trim()) count++;
    return count;
  }, [categoryFilter, brandFilter, stateFilter, availabilityFilter, fuelFilter, search]);

  const activePendingFilterCount = useMemo(() => {
    let count = 0;
    if (pendingCategoryFilter !== 'ALL') count++;
    if (pendingBrandFilter !== 'ALL') count++;
    if (pendingDealerFilter !== 'ALL') count++;
    if (pendingSearch.trim()) count++;
    return count;
  }, [pendingCategoryFilter, pendingBrandFilter, pendingDealerFilter, pendingSearch]);

  const handleResetFilters = () => {
    setCategoryFilter('ALL');
    setBrandFilter('ALL');
    setStateFilter('ALL');
    setAvailabilityFilter('ALL');
    setFuelFilter('ALL');
    setSearch('');
    setCurrentPage(1);
  };

  const handleResetPendingFilters = () => {
    setPendingCategoryFilter('ALL');
    setPendingBrandFilter('ALL');
    setPendingDealerFilter('ALL');
    setPendingSearch('');
    setCurrentPage(1);
  };

  const getListingActionItems = (
    listing: ListingRecord,
    isPendingListing: boolean,
    isModeratingListing: boolean,
    accountLinkState: { rtoExists: boolean; sellExists: boolean }
  ) => [
    ...(canApprove && isPendingListing
      ? [
          {
            label: 'Approve',
            icon: <Check className="h-3.5 w-3.5" />,
            variant: 'success' as const,
            disabled: isModeratingListing,
            onClick: () => void handleListingModeration(listing.id, 'PUBLISHED'),
          },
          {
            label: 'Reject',
            icon: <X className="h-3.5 w-3.5" />,
            variant: 'warning' as const,
            disabled: isModeratingListing,
            onClick: () => void handleListingModeration(listing.id, 'CHANGES_REQUESTED'),
          },
        ]
      : []),
    ...(canApprove && !isPendingListing && String(listing.status).toUpperCase() !== 'SOLD'
      ? [
          {
            label: 'Edit Pricing',
            icon: <TrendingUp className="h-3.5 w-3.5" />,
            variant: 'default' as const,
            onClick: () => setPricingTarget({ listing, mode: 'edit' }),
          },
        ]
      : []),
    ...(canEdit
      ? [
          {
            label: 'Edit Listing',
            icon: <Pencil size={14} />,
            variant: 'default' as const,
            onClick: () => openEditModal(listing),
          },
        ]
      : []),
    ...(canDelete && !isProtectedListing(listing, user?.role)
      ? [
          {
            label: 'Delete Listing',
            icon: <Trash2 size={14} />,
            variant: 'danger' as const,
            onClick: () => setDeleteListingRecord(listing),
          },
        ]
      : []),
    ...(canLinkAccountModules
      ? [
          {
            label: accountLinkState.rtoExists ? 'Edit RTO Record' : 'Create RTO Work Record',
            icon: <Truck size={14} />,
            variant: 'default' as const,
            onClick: () => router.push(buildAccountModuleUrl(pathname, 'rto-work-status', listing.id)),
          },
          {
            label: accountLinkState.sellExists ? 'Edit Sold Vehicle Record' : 'Create Sold Vehicle Record',
            icon: <ReceiptText size={14} />,
            variant: 'default' as const,
            onClick: () => router.push(buildAccountModuleUrl(pathname, 'sell-accounts', listing.id)),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-2.5">
      {(message || error) && (
        <div
          className={`rounded-xl border px-3 py-2 text-xs font-medium ${
            error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {error || message}
        </div>
      )}

      {/* Ultra-Compact Operational KPI Metrics Bar */}
      {(listingView === 'all' || listingView === 'pending') && (
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
          {/* Total Fleet */}
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-white px-3 py-2 shadow-2xs hover:border-gray-300 transition">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Truck size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate">Total Fleet</span>
                <span className="text-base font-black text-gray-900 leading-none">{metrics.totalVehicles}</span>
              </div>
              <p className="mt-0.5 text-[10.5px] text-gray-500 font-medium truncate">
                {metrics.availableCount} Available • {metrics.soldOrReservedCount} Sold/Reserved
              </p>
            </div>
          </div>

          {/* Ready for Sale */}
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-white px-3 py-2 shadow-2xs hover:border-gray-300 transition">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate">Ready For Sale</span>
                <span className="text-base font-black text-gray-900 leading-none">{metrics.availableCount}</span>
              </div>
              <p className="mt-0.5 text-[10.5px] text-emerald-700 font-semibold truncate">Live on platform</p>
            </div>
          </div>

          {/* Pending Moderation */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (canApprove) {
                setListingView('pending');
                setCurrentPage(1);
              }
            }}
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 shadow-2xs transition ${
              pendingApprovalCount > 0
                ? 'border-amber-300 bg-amber-50/50 hover:bg-amber-100/50 cursor-pointer'
                : 'border-gray-200/80 bg-white hover:border-gray-300'
            }`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                pendingApprovalCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              <AlertCircle size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate">Pending Review</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black text-gray-900 leading-none">{pendingApprovalCount}</span>
                  {pendingApprovalCount > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                  )}
                </div>
              </div>
              <p className="mt-0.5 text-[10.5px] font-medium truncate text-gray-500">
                {pendingApprovalCount > 0 ? 'Click to inspect submissions' : 'All submissions reviewed'}
              </p>
            </div>
          </div>

          {/* Fleet Valuation */}
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-white px-3 py-2 shadow-2xs hover:border-gray-300 transition">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate">Fleet Valuation</span>
                <span className="text-[13px] sm:text-[14px] font-black text-gray-900 leading-none truncate">
                  {formatCurrency(metrics.totalValue)}
                </span>
              </div>
              <p className="mt-0.5 text-[10.5px] text-gray-500 font-medium truncate">
                {metrics.verifiedCount} RTO Verified vehicles
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Card Container */}
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xs">
        {/* Top Tab Navigation & Action Toolbar */}
        <div className="flex flex-col gap-2.5 border-b border-gray-100 px-3 py-2 sm:py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {/* All Listings Tab */}
            <button
              type="button"
              onClick={() => {
                setListingView('all');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                listingView === 'all'
                  ? 'bg-[#FFC107] text-gray-950 shadow-2xs font-extrabold'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
              }`}
            >
              <span>All Listings</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-extrabold ${
                  listingView === 'all' ? 'bg-black/15 text-gray-950' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {listings.filter((l) => !isPendingApprovalListing(l.status)).length}
              </span>
            </button>

            {/* Pending Approval Tab */}
            {canApprove ? (
              <button
                type="button"
                onClick={() => {
                  setListingView('pending');
                  setCurrentPage(1);
                  if (user?.id) {
                    localStorage.setItem(`cleared_listings_pending_${user.id}`, pendingApprovalCount.toString());
                    window.dispatchEvent(new CustomEvent('badge_refresh'));
                  }
                }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  listingView === 'pending'
                    ? 'bg-[#FFC107] text-gray-950 shadow-2xs font-extrabold'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                <span>Pending Approval</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-extrabold ${
                    listingView === 'pending' ? 'bg-black/15 text-gray-950' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {pendingApprovalCount}
                </span>
                {pendingApprovalCount > clearedPendingCount ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                  </span>
                ) : null}
              </button>
            ) : null}

            {/* Payment Verification Tab */}
            {canVerifyPayment ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setListingView('payments');
                    setCurrentPage(1);
                    if (user?.id) {
                      localStorage.setItem(
                        `cleared_listings_payments_${user.id}`,
                        pendingPaymentVerificationsCount.toString()
                      );
                      window.dispatchEvent(new CustomEvent('badge_refresh'));
                    }
                  }}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    listingView === 'payments'
                      ? 'bg-[#FFC107] text-gray-950 shadow-2xs font-extrabold'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
                  }`}
                >
                  <ReceiptText className="h-3.5 w-3.5" />
                  <span>Payment Verification</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-extrabold ${
                      listingView === 'payments' ? 'bg-black/15 text-gray-950' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {pendingPaymentVerificationsCount}
                  </span>
                  {pendingPaymentVerificationsCount > clearedPaymentsCount ? (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setListingView('bills');
                    setCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    listingView === 'bills'
                      ? 'bg-[#FFC107] text-gray-950 shadow-2xs font-extrabold'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Bills</span>
                </button>
              </>
            ) : null}
          </div>

          {/* Right Action Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0 self-end lg:self-auto">
            {/* View Switcher (Table vs Grid) - shown on listings tabs */}
            {(listingView === 'all' || listingView === 'pending') && (
              <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  title="Table View"
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-white text-gray-950 shadow-xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <List size={13} />
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  title="Grid View"
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white text-gray-950 shadow-xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <LayoutGrid size={13} />
                  <span className="hidden sm:inline">Grid</span>
                </button>
              </div>
            )}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh inventory"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-2xs transition hover:bg-gray-50 hover:text-gray-900 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-amber-500' : ''} />
            </button>

            {/* Add Vehicle Button */}
            {canCreate ? (
              <button
                type="button"
                onClick={openModal}
                className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] px-3.5 text-xs font-bold text-gray-950 shadow-xs transition hover:bg-[#E5AD06] active:scale-95 cursor-pointer"
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>Add Vehicle</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Filter Bar for "All Listings" */}
        {listingView === 'all' && (
          <div className="flex w-full flex-col gap-2 bg-gray-50/50 px-3 py-2 border-b border-gray-100">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              {/* Search Bar */}
              <div className="relative w-full lg:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search title, brand, model, city, reg..."
                  className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-7 text-xs font-medium text-gray-900 shadow-2xs placeholder:text-gray-400 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>

              {/* Filter Dropdowns Cluster */}
              <div className="flex flex-wrap items-center gap-1.5">
                <CustomSelectPill
                  value={categoryFilter}
                  onChange={(val) => {
                    setCategoryFilter(val);
                    setCurrentPage(1);
                  }}
                  options={currentCategoryFilterOptions}
                  defaultLabel="All Categories"
                />

                <CustomSelectPill
                  value={brandFilter}
                  onChange={(val) => {
                    setBrandFilter(val);
                    setCurrentPage(1);
                  }}
                  options={currentBrandFilterOptions}
                  defaultLabel="All Brands"
                />

                <CustomSelectPill
                  value={stateFilter}
                  onChange={(val) => {
                    setStateFilter(val);
                    setCurrentPage(1);
                  }}
                  options={currentStateFilterOptions}
                  defaultLabel="All States"
                />

                <AvailabilityFilterDropdown
                  value={availabilityFilter}
                  onChange={(val) => {
                    setAvailabilityFilter(val);
                    setCurrentPage(1);
                  }}
                  options={dynamicAvailabilityOptions}
                />

                <CustomSelectPill
                  value={fuelFilter}
                  onChange={(val) => {
                    setFuelFilter(val);
                    setCurrentPage(1);
                  }}
                  options={currentFuelFilterOptions}
                  defaultLabel="All Fuel Types"
                />

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 cursor-pointer"
                  >
                    <X size={11} />
                    <span>Reset ({activeFilterCount})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filter Bar for "Pending Approval" */}
        {listingView === 'pending' && (
          <div className="flex w-full flex-col gap-2 bg-amber-50/30 px-3 py-2 border-b border-gray-100">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              {/* Search Bar */}
              <div className="relative w-full lg:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  value={pendingSearch}
                  onChange={(event) => {
                    setPendingSearch(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search pending listing, dealer..."
                  className="w-full rounded-lg border border-amber-200 bg-white py-1.5 pl-8 pr-7 text-xs font-medium text-gray-900 shadow-2xs placeholder:text-gray-400 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                />
                {pendingSearch ? (
                  <button
                    type="button"
                    onClick={() => setPendingSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <CustomSelectPill
                  value={pendingCategoryFilter}
                  onChange={(val) => {
                    setPendingCategoryFilter(val);
                    setCurrentPage(1);
                  }}
                  options={currentPendingCategoryFilterOptions}
                  defaultLabel="All Categories"
                />

                <CustomSelectPill
                  value={pendingBrandFilter}
                  onChange={(val) => {
                    setPendingBrandFilter(val);
                    setCurrentPage(1);
                  }}
                  options={currentPendingBrandFilterOptions}
                  defaultLabel="All Brands"
                />

                <CustomSelectPill
                  value={pendingDealerFilter}
                  onChange={(val) => {
                    setPendingDealerFilter(val);
                    setCurrentPage(1);
                  }}
                  options={currentPendingDealerTypeOptions}
                  defaultLabel="All Dealer Types"
                />

                {activePendingFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetPendingFilters}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 cursor-pointer"
                  >
                    <X size={11} />
                    <span>Reset ({activePendingFilterCount})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* View Content Rendering */}
        {listingView === 'payments' ? (
          <div className="p-4 sm:p-6">
            <ListingPaymentVerificationTable onPendingCountChange={(count) => setPendingPaymentVerificationsCount(count)} />
          </div>
        ) : listingView === 'bills' ? (
          <div className="p-4 sm:p-6">
            <ListingBillsTable />
          </div>
        ) : loadingListings ? (
          <BrandLoader variant="section" size="sm" bg="light" text="Loading your listings..." />
        ) : filteredListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Truck size={32} />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              {listingView === 'pending' ? 'No pending approvals' : 'No listings found'}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-gray-500">
              {listingView === 'pending'
                ? 'All submitted machinery and vehicle listings have already been reviewed.'
                : activeFilterCount > 0
                ? 'No machinery match your filter criteria. Try resetting filters.'
                : 'There are no vehicles or machinery listed yet.'}
            </p>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-4 rounded-xl bg-gray-100 px-4 py-2 text-xs font-bold text-gray-800 hover:bg-gray-200 transition cursor-pointer"
              >
                Reset all filters
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* Cards / Grid View */
          <>
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedListings.map((listing) => {
                const cover = getCoverMedia(listing);
                const parsedDetails = parseListingDescription(listing.description);
                const availability = listingStatusToAvailability(listing.status);
                const isHighlighted = isHighlightedListing(listing, highlightedListingId);
                const isUpdatingAvailability = updatingAvailabilityIds.includes(listing.id);
                const isModeratingListing = moderatingListingIds.includes(listing.id);
                const isPendingListing = isPendingApprovalListing(listing.status);
                const verification = getListingVerificationDisplay(listing.vehicleVerification?.status);
                const accountLinkState = getListingAccountLinkState(listing.id, {
                  rtoRecords: linkedRtoRecords,
                  sellRecords: linkedSellRecords,
                });

                return (
                  <div
                    key={listing.id}
                    id={`listing-row-${encodeURIComponent(listing.id)}`}
                    onClick={() => openListingDetails(listing)}
                    className={`group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400/80 hover:shadow-md cursor-pointer ${isHighlighted ? 'animate-pulse border-amber-400 bg-amber-50/90 shadow-[inset_4px_0_0_#f59e0b]' : ''}`}
                  >
                    {/* Card Image */}
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100">
                      {cover ? (
                        <SafeRemoteImage
                          src={getAbsoluteFileUrl(cover.url)}
                          alt={listing.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          fallback={
                            <div className="flex h-full w-full items-center justify-center text-gray-400">
                              <Truck className="h-10 w-10 stroke-1" />
                            </div>
                          }
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                          <Truck className="h-10 w-10 stroke-1" />
                        </div>
                      )}

                      {/* Floating Badges */}
                      <div className="absolute left-2.5 top-2.5 z-10">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold backdrop-blur-md shadow-xs ${verification.className}`}
                        >
                          <ShieldCheck className="h-3 w-3" />
                          <span>{verification.label}</span>
                        </span>
                      </div>

                      <div className="absolute right-2.5 top-2.5 z-10" onClick={(e) => e.stopPropagation()}>
                        <TableAvailabilityDropdown
                          value={isPendingListing ? 'PENDING' : availability}
                          onChange={(val) => {
                            if (isPendingListing) {
                              const nextStatus = getModerationStatus(val);
                              if (nextStatus) void handleListingModeration(listing.id, nextStatus);
                              return;
                            }
                            void handleUpdateAvailability(listing.id, val);
                          }}
                          options={isPendingListing ? getPendingModerationOptions() : availabilityTypes}
                          optionLabels={isPendingListing ? { APPROVE: 'Approve', REJECT: 'Reject' } : undefined}
                          disabled={isPendingListing ? !canApprove : isUpdatingAvailability || !canEdit}
                        />
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="flex flex-1 flex-col p-4">
                      {/* Category & Year */}
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 font-bold uppercase tracking-wider text-gray-700">
                          {listing.category?.name || 'Equipment'}
                        </span>
                        <span className="font-semibold text-gray-500">
                          {listing.manufacturingYear || 'Year N/A'}
                        </span>
                      </div>

                      {/* Title */}
                      <h4
                        className="mt-2 text-sm font-bold text-gray-900 group-hover:text-amber-600 transition line-clamp-1"
                        title={listing.title}
                      >
                        {listing.title}
                      </h4>

                      {/* Model & Fuel Specs */}
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                        {[listing.brand?.name, listing.model?.name].filter(Boolean).join(' ') || '-'}
                        {parsedDetails.fuelType ? ` • ${parsedDetails.fuelType}` : ''}
                      </p>

                      {/* Price & Location */}
                      <div className="mt-3 flex items-baseline justify-between border-t border-gray-100 pt-2.5">
                        <div>
                          <span className="text-base font-bold text-gray-900 tabular-nums tracking-tight">
                            {formatCurrency(listing.pricing?.finalPrice ?? listing.price)}
                          </span>
                          {hasAdminPricing(listing) ? (
                            <span className="ml-1.5 text-[10px] font-medium text-gray-400 tabular-nums">Seller {formatCurrency(listing.price)}</span>
                          ) : null}
                          {listing.isNegotiable ? (
                            <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-medium text-emerald-700">
                              <span className="h-1 w-1 rounded-full bg-emerald-500 shrink-0" />
                              <span>Negotiable</span>
                            </span>
                          ) : null}
                        </div>
                        {listing.locationCity ? (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
                            <MapPin size={11} className="text-gray-400 shrink-0" />
                            <span className="truncate max-w-[100px]">{listing.locationCity}</span>
                          </span>
                        ) : null}
                      </div>

                      {/* Seller Strip & Actions */}
                      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-gray-800 truncate">
                            {listing.dealer || 'Unknown Seller'}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium truncate">
                            {resolveDealerTypeLabel(listing)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {listing.dealerPhone ? (
                            <a
                              href={`tel:${listing.dealerPhone}`}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 transition"
                              title={`Call ${listing.dealerPhone}`}
                            >
                              <Phone size={12} />
                            </a>
                          ) : null}

                          <PortalActionDropdown
                            align="right"
                            items={getListingActionItems(
                              listing,
                              isPendingListing,
                              isModeratingListing,
                              accountLinkState
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col gap-3 border-t border-gray-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-gray-500 sm:justify-start">
                <div>
                  Showing <span className="font-bold text-gray-900">{startItemIndex}</span> to{' '}
                  <span className="font-bold text-gray-900">{endItemIndex}</span> of{' '}
                  <span className="font-bold text-gray-900">{totalListings}</span> listings
                </div>

                <div className="flex items-center gap-2">
                  <span>Rows:</span>
                  <div className="relative rows-per-page-dropdown-container">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenPageSizeDropdown((prev) => !prev);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-800 shadow-2xs transition hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] cursor-pointer"
                    >
                      <span>{pageSize}</span>
                      <ChevronDown className="h-3 w-3 text-gray-400" />
                    </button>

                    {openPageSizeDropdown ? (
                      <div className="absolute bottom-full left-0 z-50 mb-1.5 w-20 origin-bottom-left rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                        {[5, 10, 25, 50].map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPageSize(size);
                              setCurrentPage(1);
                              setOpenPageSizeDropdown(false);
                            }}
                            className={`block w-full rounded-lg px-2.5 py-1 text-left text-xs transition-colors hover:bg-gray-100 cursor-pointer ${
                              pageSize === size
                                ? 'bg-[#FFC107]/20 font-bold text-gray-950'
                                : 'font-medium text-gray-700'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-1 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPageForView === 1}
                  className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {paginationItems.map((item, index) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setCurrentPage(item)}
                        className={`h-7 w-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                          currentPageForView === item
                            ? 'bg-[#FFC107] text-gray-950 shadow-2xs font-extrabold'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {item}
                      </button>
                    ) : (
                      <span key={`ellipsis-${index}`} className="px-1 text-xs font-bold text-gray-400">
                        ...
                      </span>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPageForView === totalPages || totalPages === 1}
                  className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Table View - 8 Proportional Columns, Zero Horizontal Scroll */
          <>
            <div className="overflow-x-auto flex-1 [scrollbar-width:thin]">
              <table className="w-full table-fixed border-collapse text-left text-xs text-gray-600">
                <colgroup>
                  <col className="w-auto" />
                  <col className="w-[125px]" style={{ width: '125px' }} />
                  <col className="w-[95px]" style={{ width: '95px' }} />
                  <col className="w-[48px]" style={{ width: '48px' }} />
                  <col className="w-[105px]" style={{ width: '105px' }} />
                  <col className="w-[86px]" style={{ width: '86px' }} />
                  <col className="w-[82px]" style={{ width: '82px' }} />
                  <col className="w-[78px]" style={{ width: '78px' }} />
                  <col className="w-[88px]" style={{ width: '88px' }} />
                  <col className="w-[34px]" style={{ width: '34px' }} />
                </colgroup>
                <thead className="border-b border-gray-100 bg-gray-50/80 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th
                      className="px-2.5 py-2 cursor-pointer select-none hover:text-amber-600 transition-colors"
                      onClick={() => handleSort('title')}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate">Equipment &amp; Specs</span>
                        <SortIcon col="title" sortKey={sortKey} sortDir={sortDir} />
                      </div>
                    </th>
                    <th className="w-[125px] px-2 py-2">
                      <span className="truncate">Listed By</span>
                    </th>
                    <th
                      className="w-[95px] px-2 py-2 cursor-pointer select-none hover:text-amber-600 transition-colors"
                      onClick={() => handleSort('price')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Price</span>
                        <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} />
                      </div>
                    </th>
                    <th
                      className="w-[48px] px-1 py-2 text-center cursor-pointer select-none hover:text-amber-600 transition-colors"
                      onClick={() => handleSort('year')}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <span>Year</span>
                        <SortIcon col="year" sortKey={sortKey} sortDir={sortDir} />
                      </div>
                    </th>
                    <th
                      className="w-[105px] px-2 py-2 cursor-pointer select-none hover:text-amber-600 transition-colors"
                      onClick={() => handleSort('location')}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate">Location</span>
                        <SortIcon col="location" sortKey={sortKey} sortDir={sortDir} />
                      </div>
                    </th>
                    <th className="w-[86px] px-1 py-2 text-center">
                      <span className="truncate">Availability</span>
                    </th>
                    <th className="w-[82px] px-1 py-2 text-center">
                      <span className="truncate">Verification</span>
                    </th>
                    <th
                      className="w-[78px] px-1 py-2 text-center cursor-pointer select-none hover:text-amber-600 transition-colors"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <span>Date</span>
                        <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
                      </div>
                    </th>
                    <th className="w-[88px] px-1 py-2 text-center">
                      <span className="truncate">Sell Vehicle</span>
                    </th>
                    <th className="w-[34px] px-1 py-2 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {paginatedListings.map((listing, index) => {
                    const cover = getCoverMedia(listing);
                    const parsedDetails = parseListingDescription(listing.description);
                    const accountLinkState = getListingAccountLinkState(listing.id, {
                      rtoRecords: linkedRtoRecords,
                      sellRecords: linkedSellRecords,
                    });
                    const availability = listingStatusToAvailability(listing.status);
                    const isUpdatingAvailability = updatingAvailabilityIds.includes(listing.id);
                    const isModeratingListing = moderatingListingIds.includes(listing.id);
                    const isPendingListing = isPendingApprovalListing(listing.status);
                    const isNearBottom = index >= Math.max(paginatedListings.length - 3, 0);
                    const isHighlighted = isHighlightedListing(listing, highlightedListingId);

                    return (
                      <tr
                        key={listing.id}
                        id={`listing-row-${encodeURIComponent(listing.id)}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open details for ${listing.title}`}
                        onClick={() => openListingDetails(listing)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openListingDetails(listing);
                          }
                        }}
                        className={`group cursor-pointer transition hover:bg-amber-50/20 focus-visible:bg-gray-50 focus-visible:outline-none ${isHighlighted ? 'animate-pulse bg-amber-50/90 shadow-[inset_4px_0_0_#f59e0b]' : ''}`}
                      >
                        {/* Equipment & Specs Column */}
                        <td className="px-2.5 py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="relative h-8 w-10 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50 shadow-2xs group-hover:border-amber-400/80 transition">
                              {cover ? (
                                <SafeRemoteImage
                                  src={getAbsoluteFileUrl(cover.url)}
                                  alt={listing.title}
                                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  fallback={
                                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                                      <Truck className="h-3.5 w-3.5" />
                                    </div>
                                  }
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-gray-400">
                                  <Truck className="h-3.5 w-3.5" />
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span
                                className="truncate text-xs font-bold text-gray-900 leading-tight group-hover:text-amber-700 transition"
                                title={listing.title}
                              >
                                {listing.title}
                              </span>
                              <div className="mt-0.5 flex items-center gap-1 min-w-0 text-[10px] text-gray-500 font-medium truncate">
                                {listing.category?.name ? (
                                  <span className="rounded bg-gray-100 px-1 py-0.2 text-[8.5px] font-bold uppercase tracking-wider text-gray-600 shrink-0">
                                    {listing.category.name}
                                  </span>
                                ) : null}
                                <span className="truncate">
                                  {[listing.brand?.name, listing.model?.name].filter(Boolean).join(' ') || '-'}
                                  {parsedDetails.fuelType ? ` • ${parsedDetails.fuelType}` : ''}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Listed By Column */}
                        <td className="w-[125px] px-2 py-1.5 text-xs">
                          <div className="flex flex-col min-w-0">
                            <span className="truncate font-bold text-gray-900" title={listing.dealer || 'Unknown'}>
                              {listing.dealer || 'Unknown'}
                            </span>
                            {listing.dealerPhone ? (
                              <a
                                href={`tel:${listing.dealerPhone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-800 transition hover:text-amber-950 hover:underline min-w-0"
                                title={`Click to call ${listing.dealerPhone}`}
                              >
                                <Phone className="h-2.5 w-2.5 text-amber-600 shrink-0" />
                                <span className="truncate">{listing.dealerPhone}</span>
                              </a>
                            ) : null}
                            <span className="mt-0.5 inline-flex w-fit rounded-full bg-gray-100 px-1.5 py-0.2 text-[8.5px] font-semibold text-gray-600 truncate max-w-full">
                              {resolveDealerTypeLabel(listing)}
                            </span>
                          </div>
                        </td>

                        {/* Price Column */}
                        <td className="w-[95px] px-2 py-1.5">
                          <div className="flex flex-col min-w-0">
                            <span className="whitespace-nowrap text-xs sm:text-[13px] font-semibold text-gray-800 tabular-nums tracking-tight">
                              {formatCurrency(listing.pricing?.finalPrice ?? listing.price)}
                            </span>
                            {hasAdminPricing(listing) ? (
                              <span className="whitespace-nowrap text-[9.5px] font-medium text-gray-400 tabular-nums">Seller {formatCurrency(listing.price)}</span>
                            ) : null}
                            {listing.isNegotiable ? (
                              <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                                <span className="h-1 w-1 rounded-full bg-emerald-500 shrink-0" />
                                <span>Negotiable</span>
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Year Column */}
                        <td className="w-[48px] px-1 py-1.5 text-center">
                          <span className="inline-block rounded-md border border-gray-200/60 bg-gray-50 px-1.5 py-0.2 text-[10.5px] font-bold text-gray-700">
                            {listing.manufacturingYear || '-'}
                          </span>
                        </td>

                        {/* Location Column */}
                        <td className="w-[105px] px-2 py-1.5 text-xs">
                          <div className="flex flex-col min-w-0">
                            <span className="truncate font-bold text-gray-900" title={listing.locationCity || '-'}>
                              {listing.locationCity || '-'}
                            </span>
                            {listing.locationState ? (
                              <span
                                className="flex items-center gap-0.5 truncate text-[10px] text-gray-500 font-medium"
                                title={listing.locationState}
                              >
                                <MapPin size={9} className="text-gray-400 shrink-0" />
                                <span className="truncate">{listing.locationState}</span>
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Availability Column */}
                        <td className="w-[86px] px-1 py-1.5 text-center">
                          <div className="flex flex-col items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <TableAvailabilityDropdown
                              value={isPendingListing ? 'PENDING' : availability}
                              onChange={(val) => {
                                if (isPendingListing) {
                                   const nextStatus = getModerationStatus(val);
                                  if (nextStatus) void handleListingModeration(listing.id, nextStatus);
                                  return;
                                }
                                void handleUpdateAvailability(listing.id, val);
                              }}
                              options={isPendingListing ? getPendingModerationOptions() : availabilityTypes}
                              optionLabels={isPendingListing ? { APPROVE: 'Approve', REJECT: 'Reject' } : undefined}
                              disabled={isPendingListing ? isModeratingListing || !canApprove : isUpdatingAvailability || !canEdit}
                              openUpwards={isNearBottom}
                            />
                            {(isPendingListing || isUpdatingAvailability) && (
                              <span className="text-[9px] text-gray-400 font-medium">
                                {isPendingListing ? 'Awaiting approval' : 'Updating...'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Verification Column */}
                        <td className="w-[82px] px-1 py-1.5 text-center">
                          {(() => {
                            const verification = getListingVerificationDisplay(listing.vehicleVerification?.status);
                            const shortLabel =
                              verification.label === 'Re-verification Required'
                                ? 'Re-verify'
                                : verification.label === 'Verification Failed'
                                ? 'Failed'
                                : verification.label === 'Manually Modified'
                                ? 'Modified'
                                : verification.label === 'Not Verified'
                                ? 'Unverified'
                                : verification.label;

                            return (
                              <span
                                className={`inline-flex items-center justify-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] sm:text-[9.5px] font-bold shadow-2xs ${verification.className}`}
                                title={
                                  listing.vehicleVerification?.changedFields?.length
                                    ? `Changed: ${listing.vehicleVerification.changedFields.join(', ')}`
                                    : verification.label
                                }
                              >
                                <ShieldCheck className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate max-w-[65px]">{shortLabel}</span>
                              </span>
                            );
                          })()}
                        </td>

                        {/* Entry Date Column */}
                        <td className="w-[78px] px-1 py-1.5 text-center">
                          <span
                            className="inline-block text-[10.5px] font-medium text-gray-700 tabular-nums whitespace-nowrap"
                            title={listing.createdAt ? new Date(listing.createdAt).toLocaleString('en-IN') : undefined}
                          >
                            {formatEntryDate(listing.createdAt)}
                          </span>
                        </td>

                        {/* Sell Vehicle Column (Second Last) */}
                        <td className="w-[88px] px-1 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(buildAccountModuleUrl(pathname, 'sell-accounts', listing.id));
                            }}
                            className={`inline-flex items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-bold transition shadow-2xs active:scale-95 cursor-pointer ${
                              accountLinkState.sellExists
                                ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400'
                                : 'border border-amber-300 bg-amber-50 text-amber-950 hover:bg-[#FFC107] hover:border-amber-400'
                            }`}
                            title={
                              accountLinkState.sellExists
                                ? 'Edit Sold Vehicle Record for this vehicle'
                                : 'Create Sold Vehicle Record / Sell this vehicle'
                            }
                          >
                            {accountLinkState.sellExists ? (
                              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
                            ) : (
                              <Handshake className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                            )}
                            <span className="whitespace-nowrap">
                              {accountLinkState.sellExists ? 'Sold' : 'Sell Vehicle'}
                            </span>
                          </button>
                        </td>

                        {/* Actions Column */}
                        <td className="w-[34px] px-1 py-1.5 text-right">
                          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                            <PortalActionDropdown
                              align="right"
                              buttonClassName="flex h-6.5 w-6.5 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition cursor-pointer"
                              trigger={<MoreVertical className="h-4 w-4" />}
                              items={getListingActionItems(
                                listing,
                                isPendingListing,
                                isModeratingListing,
                                accountLinkState
                              )}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Compact Pagination Controls */}
            <div className="flex flex-col gap-2 border-t border-gray-100 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-gray-500 sm:justify-start">
                <div>
                  Showing <span className="font-bold text-gray-900">{startItemIndex}</span> to{' '}
                  <span className="font-bold text-gray-900">{endItemIndex}</span> of{' '}
                  <span className="font-bold text-gray-900">{totalListings}</span> listings
                </div>

                <div className="flex items-center gap-1.5">
                  <span>Rows:</span>
                  <div className="relative rows-per-page-dropdown-container">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenPageSizeDropdown((prev) => !prev);
                      }}
                      className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-bold text-gray-800 shadow-2xs transition hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] cursor-pointer"
                    >
                      <span>{pageSize}</span>
                      <ChevronDown className="h-3 w-3 text-gray-400" />
                    </button>

                    {openPageSizeDropdown ? (
                      <div className="absolute bottom-full left-0 z-50 mb-1 w-18 origin-bottom-left rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                        {[5, 10, 25, 50].map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPageSize(size);
                              setCurrentPage(1);
                              setOpenPageSizeDropdown(false);
                            }}
                            className={`block w-full rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-gray-100 cursor-pointer ${
                              pageSize === size
                                ? 'bg-[#FFC107]/20 font-bold text-gray-950'
                                : 'font-medium text-gray-700'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-1 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPageForView === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                <div className="flex items-center gap-0.5 px-0.5">
                  {paginationItems.map((item, index) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setCurrentPage(item)}
                        className={`h-6.5 w-6.5 rounded-md text-xs font-bold transition cursor-pointer ${
                          currentPageForView === item
                            ? 'bg-[#FFC107] text-gray-950 shadow-2xs font-extrabold'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {item}
                      </button>
                    ) : (
                      <span key={`ellipsis-${index}`} className="px-0.5 text-xs font-bold text-gray-400">
                        ...
                      </span>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPageForView === totalPages || totalPages === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {isModalOpen && (() => {
        const uploadedMediaCount = mediaSlots.filter((slot) => Boolean(mediaState[slot.key] || previewState[slot.key])).length;
        const hasRequiredMedia = Boolean((mediaState['front-view'] || previewState['front-view']) && (mediaState['walkaround-video'] || previewState['walkaround-video']));
        const modalTabs: { key: ModalTabKey; label: string; icon: typeof Truck; badge?: string; badgeColor?: string }[] = [
          { key: 'equipment', label: 'Equipment & Specs', icon: Truck },
          { key: 'rto', label: 'RTO Compliance', icon: ShieldCheck },
          {
            key: 'media',
            label: 'Media Uploads',
            icon: Upload,
            badge: `${uploadedMediaCount}/14`,
            badgeColor: hasRequiredMedia ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
          },
          { key: 'pricing', label: 'Price & Location', icon: MapPin },
          ...(form.currentAvailability === 'SOLD'
            ? [
                {
                  key: 'sale' as ModalTabKey,
                  label: 'Buyer & Sale',
                  icon: UserCheck,
                  badge: 'SOLD',
                  badgeColor: 'bg-rose-100 text-rose-800',
                },
              ]
            : []),
        ];
        const tabKeys = modalTabs.map((t) => t.key);
        const activeTabIndex = Math.max(0, tabKeys.indexOf(modalTab));
        const handleNextTab = () => {
          if (activeTabIndex < tabKeys.length - 1) {
            setModalTab(tabKeys[activeTabIndex + 1]);
          }
        };
        const handlePrevTab = () => {
          if (activeTabIndex > 0) {
            setModalTab(tabKeys[activeTabIndex - 1]);
          }
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs">
            <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/70 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-base sm:text-lg font-bold text-gray-900">
                    {editingListingId ? 'Edit Vehicle' : 'Add Vehicle'}
                  </h2>
                  {editingListingId ? (
                    <>
                      <span className="rounded-md border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        {form.registrationNo || editingListingRecord?.title || 'Vehicle'}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${editingVerification.className}`}>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {editingVerification.label}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {uploadingCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading ({uploadingCount})
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200/70 hover:text-gray-700 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Navigation Tabs Bar */}
              <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex items-center gap-1">
                  {modalTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = modalTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setModalTab(tab.key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                          isActive
                            ? 'bg-gray-900 text-white shadow-xs'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-[#FFC107]' : 'text-gray-400'}`} />
                        <span>{tab.label}</span>
                        {tab.badge ? (
                          <span
                            className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                              isActive ? 'bg-white/20 text-white' : tab.badgeColor || 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {tab.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
                  <button
                    type="button"
                    onClick={() => setModalTab(modalTab === 'all' ? 'equipment' : 'all')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      modalTab === 'all'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 bg-white'
                    }`}
                    title={modalTab === 'all' ? 'Switch back to tabbed view' : 'Show all sections in one scrollable page'}
                  >
                    <LayoutGrid className="h-3 w-3" />
                    <span>{modalTab === 'all' ? 'Tab View' : 'View All'}</span>
                  </button>
                </div>
              </div>

              {/* Form Content */}
              <form ref={modalFormRef} onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Tab 1: Equipment & Specs */}
                <div className={modalTab !== 'equipment' && modalTab !== 'all' ? 'hidden' : 'space-y-3'}>
                  {listingVerificationPolicy?.enabled ? <ApiFillLegend /> : null}
                  {/* Verification Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {/* Registration No. */}
                    <div className="rounded-xl border border-gray-200 bg-white p-2.5 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-800">
                          Registration No.{listingVerificationPolicy?.registrationRequired ? ' *' : ''}
                        </span>
                        {registrationButtonState.isVerified ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Verified
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">e.g. DL01AB1234</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ApiFillBox apiFill={registrationApiFill} className="min-w-0 flex-1"><input
                          value={form.registrationNo}
                          maxLength={15}
                          onKeyDown={(e) => handleAlphanumericKeyDown(e, true)}
                          onChange={(event) => updateField('registrationNo', event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 15))}
                          className={fieldClassName}
                          placeholder="e.g. DL01AB1234"
                          aria-describedby={listingVerificationPolicy?.enabled ? 'admin-vehicle-verification-status' : undefined}
                        /></ApiFillBox>
                        {listingVerificationPolicy?.registrationEnabled ? (
                          <button
                            type="button"
                            onClick={() => void handleVehicleNumberVerification()}
                            disabled={registrationButtonState.isLoading || registrationButtonState.isLocked || !form.registrationNo.trim()}
                            className="h-[34px] shrink-0 inline-flex items-center justify-center gap-1 px-3 rounded-lg bg-[#FFC107] text-xs font-bold text-gray-950 shadow-2xs hover:bg-[#e5b100] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {registrationButtonState.isLoading ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying</>
                            ) : registrationButtonState.isVerified ? (
                              <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-900" /> Verified</>
                            ) : registrationButtonState.isLocked ? (
                              <span className="text-[11px]">Auto-filled</span>
                            ) : (
                              <><Sparkles className="h-3.5 w-3.5" /> Verify</>
                            )}
                          </button>
                        ) : null}
                      </div>
                      {listingVerificationPolicy?.registrationEnabled ? (
                        <p id="admin-vehicle-verification-status" className={`text-[10px] font-medium truncate ${registrationButtonState.isVerified ? 'text-emerald-600' : chassisVerificationStatus === 'FAILED' ? 'text-red-600' : 'text-gray-400'}`}>
                          {registrationButtonState.isVerified ? '✓ Verified using RC. Details were auto-filled.' : vehicleVerificationSource === 'CHASSIS' ? 'Auto-filled from chassis verification.' : verificationLoadingSource === 'RC_FULL' ? 'Verifying registration number...' : 'Verify to auto-fill vehicle details.'}
                        </p>
                      ) : null}
                    </div>

                    {/* Chassis / Serial No. */}
                    <div className="rounded-xl border border-gray-200 bg-white p-2.5 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-800">
                          Chassis / Serial No.{listingVerificationPolicy?.required ? ' *' : ''}
                        </span>
                        {chassisButtonState.isVerified ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Verified
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">17-digit Chassis / Serial</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ApiFillBox apiFill={chassisApiFill} className="min-w-0 flex-1"><input
                          value={form.chassisOrSerialNo}
                          maxLength={30}
                          onKeyDown={(e) => handleAlphanumericKeyDown(e, false)}
                          onChange={(event) => updateField('chassisOrSerialNo', event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30))}
                          className={fieldClassName}
                          placeholder="Enter chassis number"
                          aria-describedby={listingVerificationPolicy?.enabled ? 'admin-chassis-verification-status' : undefined}
                        /></ApiFillBox>
                        {listingVerificationPolicy?.chassisEnabled ? (
                          <button
                            type="button"
                            onClick={() => void handleChassisVerification()}
                            disabled={chassisButtonState.isLoading || chassisButtonState.isLocked || !form.chassisOrSerialNo.trim()}
                            className="h-[34px] shrink-0 inline-flex items-center justify-center gap-1 px-3 rounded-lg bg-[#FFC107] text-xs font-bold text-gray-950 shadow-2xs hover:bg-[#e5b100] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {chassisButtonState.isLoading ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying</>
                            ) : chassisButtonState.isVerified ? (
                              <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-900" /> Verified</>
                            ) : chassisButtonState.isLocked ? (
                              <span className="text-[11px]">Auto-filled</span>
                            ) : (
                              <><Sparkles className="h-3.5 w-3.5" /> Verify</>
                            )}
                          </button>
                        ) : null}
                      </div>
                      {listingVerificationPolicy?.chassisEnabled ? (
                        <p id="admin-chassis-verification-status" className={`text-[10px] font-medium truncate ${chassisButtonState.isVerified ? 'text-emerald-600' : chassisVerificationStatus === 'FAILED' ? 'text-red-600' : 'text-gray-400'}`}>
                          {chassisButtonState.isVerified ? '✓ Verified successfully. Details were filled.' : vehicleVerificationSource === 'RC_FULL' ? 'Auto-filled from registration verification.' : verificationLoadingSource === 'CHASSIS' ? 'Verifying chassis number...' : chassisVerificationStatus === 'FAILED' ? '✕ Verification failed. Correct chassis number.' : 'Verify chassis to fetch vehicle records.'}
                        </p>
                      ) : (
                        <p className="text-[10px] font-medium text-gray-400 truncate">
                          {listingVerificationPolicy?.registrationEnabled ? 'Registration verification can auto-fill chassis.' : 'Manual listing mode active.'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Title and Owner */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <Field label="Vehicle Name / Listing Title" hint="Marketplace title" apiFill={vehicleApiFill}>
                      <input
                        value={form.title}
                        maxLength={120}
                        onChange={(event) => updateField('title', event.target.value)}
                        className={fieldClassName}
                        placeholder="e.g. JCB 3DX Plus Super"
                      />
                    </Field>
                    <Field label="Owner Name" apiFill={vehicleApiFill}>
                      <input
                        value={form.ownerName}
                        maxLength={80}
                        onKeyDown={handleTextOnlyKeyDown}
                        onChange={(event) => updateField('ownerName', event.target.value.replace(/[^A-Za-z\s.]/g, '').slice(0, 80))}
                        className={fieldClassName}
                        placeholder="Vehicle owner name"
                      />
                    </Field>
                  </div>

                  {/* Specifications Grid */}
                  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 border-b border-gray-100 pb-2">
                      <Truck className="h-3.5 w-3.5 text-amber-500" />
                      <span>Machine Specifications & Classification</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                      <Field label="Category *" apiFill={vehicleApiFill}>
                        <select
                          required
                          value={form.category}
                          onChange={(event) => updateField('category', event.target.value)}
                          className={fieldClassName}
                        >
                          <option value="">Select category</option>
                          {categories.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Brand *" apiFill={vehicleApiFill}>
                        <SearchableSelect
                          options={brands}
                          value={form.brand}
                          displayValue={form.brand}
                          onChange={(option) => updateField('brand', option.name)}
                          required
                          size="sm"
                          placeholder="Select brand"
                          className="bg-[#F8FAFC]"
                        />
                      </Field>

                      <Field label="Model" apiFill={vehicleApiFill}>
                        <input
                          value={form.model}
                          maxLength={60}
                          onChange={(event) => updateField('model', event.target.value)}
                          className={fieldClassName}
                          placeholder="e.g. 3DX"
                        />
                      </Field>

                      <Field label="Horse Power">
                        <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 bg-[#F8FAFC] focus-within:border-[#FFC107] transition h-[34px]">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={5}
                            value={form.grossPower}
                            onChange={(event) => updateField('grossPower', event.target.value.replace(/\D/g, '').slice(0, 5))}
                            onKeyDown={handleDigitOnlyKeyDown}
                            className="flex-1 bg-transparent px-2.5 text-xs text-gray-900 outline-none"
                            placeholder="e.g. 76"
                          />
                          <span className="shrink-0 border-l border-gray-200 bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500 select-none">
                            HP
                          </span>
                        </div>
                      </Field>

                      <Field label="Manufacture Year" apiFill={vehicleApiFill}>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={4}
                          value={form.manufacturingYear}
                          onChange={(event) => updateField('manufacturingYear', event.target.value.replace(/\D/g, '').slice(0, 4))}
                          onKeyDown={handleDigitOnlyKeyDown}
                          className={fieldClassName}
                          placeholder="YYYY (e.g. 2021)"
                        />
                      </Field>

                      <Field label="Registration Date" apiFill={vehicleApiFill}>
                        <input
                          type="date"
                          value={form.registrationDate}
                          onChange={(event) => updateField('registrationDate', event.target.value)}
                          className={fieldClassName}
                        />
                      </Field>

                      <Field label="Registration Upto" apiFill={vehicleApiFill}>
                        <input
                          type="date"
                          value={form.registrationUpto}
                          onChange={(event) => updateField('registrationUpto', event.target.value)}
                          className={fieldClassName}
                        />
                      </Field>

                      {form.rtoDetails.insuranceStatus === 'VALID' && (
                        <Field label="Insurance Expiry Date" apiFill={vehicleApiFill}>
                          <input
                            type="date"
                            value={form.insuranceExpiry}
                            onChange={(event) => updateField('insuranceExpiry', event.target.value)}
                            className={fieldClassName}
                          />
                        </Field>
                      )}

                      <Field label="Engine Number" apiFill={vehicleApiFill}>
                        <input
                          value={form.engineNumber}
                          maxLength={40}
                          onKeyDown={(e) => handleAlphanumericKeyDown(e, true)}
                          onChange={(event) => updateField('engineNumber', event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40))}
                          className={fieldClassName}
                          placeholder="Engine serial number"
                        />
                      </Field>

                      <Field label="Meter Reading / Hours" hint="Digits only">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={8}
                          value={form.operatingHours}
                          onChange={(event) => updateField('operatingHours', event.target.value.replace(/\D/g, '').slice(0, 8))}
                          onKeyDown={handleDigitOnlyKeyDown}
                          className={fieldClassName}
                          placeholder="e.g. 1500"
                        />
                      </Field>

                      <Field label="No. of Owners" apiFill={vehicleApiFill}>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={2}
                          value={form.previousOwners}
                          onChange={(event) => updateField('previousOwners', event.target.value.replace(/\D/g, '').slice(0, 2))}
                          onKeyDown={handleDigitOnlyKeyDown}
                          className={fieldClassName}
                          placeholder="e.g. 1"
                        />
                      </Field>

                      <Field label="Condition">
                        <SearchableSelect
                          options={conditions.map((option) => ({ id: option, name: localizedCondition(option) }))}
                          value={form.condition}
                          onChange={(opt) => updateField('condition', String(opt.id))}
                          placeholder="Select condition"
                          searchable={false}
                          size="sm"
                          className="bg-[#F8FAFC]"
                        />
                      </Field>

                      <Field label="Fuel Type" apiFill={vehicleApiFill}>
                        <SearchableSelect
                          options={fuelTypes.map((option) => ({ id: option, name: localizedFuelType(option) }))}
                          value={form.fuelType}
                          onChange={(opt) => updateField('fuelType', String(opt.id))}
                          placeholder="Select fuel type"
                          searchable={false}
                          size="sm"
                          className="bg-[#F8FAFC]"
                        />
                      </Field>

                    </div>
                  </div>

                  {/* Current Availability Toggle */}
                  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                            form.currentAvailability === 'SOLD'
                              ? 'bg-rose-100 text-rose-600'
                              : form.currentAvailability === 'PENDING'
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-emerald-100 text-emerald-600'
                          }`}
                        >
                          {form.currentAvailability === 'SOLD' ? (
                            <Handshake className="h-5 w-5" />
                          ) : form.currentAvailability === 'PENDING' ? (
                            <AlertCircle className="h-5 w-5" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900">Current Availability</span>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                form.currentAvailability === 'SOLD'
                                  ? 'border border-rose-200 bg-rose-50 text-rose-700'
                                  : form.currentAvailability === 'PENDING'
                                  ? 'border border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                                  form.currentAvailability === 'SOLD'
                                    ? 'bg-rose-500'
                                    : form.currentAvailability === 'PENDING'
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                              />
                              {localizedAvailability(form.currentAvailability)}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500">
                            {form.currentAvailability === 'SOLD'
                              ? 'Machine is marked as Sold. Confidential buyer & sale details enabled in Buyer & Sale tab.'
                              : form.currentAvailability === 'PENDING'
                              ? 'Listing is awaiting moderation approval or verification.'
                              : 'Machine is active and available for inquiries & purchase on marketplace.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50/90 p-1 self-start sm:self-auto shrink-0">
                        {form.currentAvailability === 'PENDING' && (
                          <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-2xs">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>Pending Moderation</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            updateField('currentAvailability', 'AVAILABLE');
                            if (modalTab === 'sale') {
                              setModalTab('equipment');
                            }
                          }}
                          disabled={form.currentAvailability === 'PENDING'}
                          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                            form.currentAvailability === 'AVAILABLE'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <CheckCircle2 className={`h-3.5 w-3.5 ${form.currentAvailability === 'AVAILABLE' ? 'text-white' : 'text-gray-400'}`} />
                          <span>Available</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            updateField('currentAvailability', 'SOLD');
                            setModalTab('sale');
                            setTimeout(() => {
                              soldSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              buyerNameInputRef.current?.focus();
                            }, 100);
                          }}
                          disabled={form.currentAvailability === 'PENDING'}
                          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                            form.currentAvailability === 'SOLD'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <Handshake className={`h-3.5 w-3.5 ${form.currentAvailability === 'SOLD' ? 'text-white' : 'text-gray-400'}`} />
                          <span>Sold Vehicle</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tab 2: RTO Compliance */}
                <div className={modalTab !== 'rto' && modalTab !== 'all' ? 'hidden' : 'space-y-3'}>
                  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                        <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                        <span>RTO Documents & Compliance</span>
                      </div>
                      <span className="text-[10px] text-gray-400">
                        Tax, Fitness, Insurance, HSRP, and Loan NOC status
                      </span>
                    </div>
                    <ListingRtoFields
                      apiFillSource={vehicleApiFill?.source || ''}
                      apiFilled={Boolean(vehicleApiFill?.filled)}
                      compact={true}
                      value={form.rtoDetails}
                      onChange={updateRtoField}
                      insuranceExpiry={form.insuranceExpiry}
                      onInsuranceExpiryChange={(value) => updateField('insuranceExpiry', value)}
                      required={!editingListingId || hasListingRtoInput(form.rtoDetails)}
                    />
                  </div>
                </div>

                {/* Tab 3: Media Uploads */}
                <div className={modalTab !== 'media' && modalTab !== 'all' ? 'hidden' : 'space-y-3'}>
                  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                        <Upload className="h-3.5 w-3.5 text-amber-500" />
                        <span>Media Gallery (14 High-Density Slots)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            hasRequiredMedia
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {uploadedMediaCount} of 14 uploaded {hasRequiredMedia ? '✓ Required ready' : '(Front photo & Video required)'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
                      {mediaSlots.map((slot) => (
                        <ListingMediaUploadBox
                          key={slot.key}
                          slotKey={slot.key}
                          label={slot.label}
                          kind={slot.kind}
                          uploadedFile={mediaState[slot.key]}
                          previewUrl={previewState[slot.key]}
                          helperText={slot.kind === 'video' ? videoUploadHelper : imageUploadHelper}
                          onUploaded={(file) =>
                            setMediaState((current) => ({
                              ...current,
                              [slot.key]: file,
                            }))
                          }
                          onPreviewReady={(previewUrl) =>
                            setPreviewState((current) => ({
                              ...current,
                              [slot.key]: previewUrl,
                            }))
                          }
                          onClear={() => {
                            setMediaState((current) => ({
                              ...current,
                              [slot.key]: null,
                            }));
                            setPreviewState((current) => ({
                              ...current,
                              [slot.key]: '',
                            }));
                          }}
                          onUploadingChange={(isUploading) =>
                            setUploadingCount((current) => current + (isUploading ? 1 : -1))
                          }
                          onOpenSampleGuide={(key) => setSampleGuideSlot(key)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tab 4: Price & Location */}
                <div className={modalTab !== 'pricing' && modalTab !== 'all' ? 'hidden' : 'space-y-3'}>
                  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 border-b border-gray-100 pb-2">
                      <MapPin className="h-3.5 w-3.5 text-amber-500" />
                      <span>Pricing & Machine Location</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                      <Field label="Price (₹) *">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          required
                          maxLength={10}
                          value={form.price}
                          onKeyDown={handleDigitOnlyKeyDown}
                          onChange={(event) => updateField('price', event.target.value.replace(/\D/g, '').slice(0, 10))}
                          className={fieldClassName}
                          placeholder="e.g. 1850000"
                        />
                      </Field>

                      <div className="flex flex-col justify-end">
                        <label className="flex h-[34px] items-center gap-2 rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 cursor-pointer select-none transition hover:bg-white hover:border-[#FFC107]">
                          <input
                            type="checkbox"
                            checked={form.isNegotiable}
                            onChange={(e) => updateField('isNegotiable', e.target.checked)}
                            className="w-3.5 h-3.5 text-amber-500 rounded border-gray-300 focus:ring-amber-500"
                          />
                          <span className="text-xs font-semibold text-gray-700">Price is Negotiable</span>
                        </label>
                      </div>

                      <Field label="State *">
                        <SearchableSelect
                          options={states}
                          value={form.selectedStateId || form.state}
                          displayValue={form.state}
                          onChange={(option) => {
                            updateField('state', option.name);
                            updateField('selectedStateId', String(option.id));
                            updateField('city', '');
                            updateField('selectedCityId', '');
                          }}
                          placeholder="Select state"
                          required
                          size="sm"
                          className="bg-[#F8FAFC]"
                        />
                      </Field>

                      <Field label="City *">
                        <SearchableSelect
                          options={cities}
                          value={form.selectedCityId || form.city}
                          displayValue={form.city}
                          onChange={(option) => {
                            updateField('city', option.name);
                            updateField('selectedCityId', String(option.id));
                          }}
                          placeholder={form.selectedStateId ? 'Select city' : 'Select state first'}
                          disabled={!form.selectedStateId}
                          required
                          size="sm"
                          className="bg-[#F8FAFC]"
                        />
                      </Field>

                      <Field label="PIN Code *">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          required
                          maxLength={6}
                          value={form.pinCode}
                          onKeyDown={handleDigitOnlyKeyDown}
                          onChange={(event) => updateField('pinCode', event.target.value.replace(/\D/g, '').slice(0, 6))}
                          className={fieldClassName}
                          placeholder="6-digit PIN"
                        />
                      </Field>

                      <Field label="Address *" className="col-span-2 sm:col-span-1 lg:col-span-2">
                        <input
                          required
                          value={form.address}
                          onChange={(event) => updateField('address', event.target.value)}
                          className={fieldClassName}
                          placeholder="Physical location address"
                        />
                      </Field>

                      <Field label="Nearby Landmark *">
                        <input
                          required
                          value={form.nearbyLandmark}
                          onChange={(event) => updateField('nearbyLandmark', event.target.value)}
                          className={fieldClassName}
                          placeholder="Highway / Toll / Chowk"
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                      <Field label="Short Description" hint="Machine condition & highlights">
                        <textarea
                          value={form.description}
                          onChange={(event) => updateField('description', event.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:ring-1 focus:ring-[#FFC107]"
                          placeholder="Short machine condition, issues, and selling points"
                        />
                      </Field>

                      <Field label="Additional Description" hint="Technical specs, tyres, cabin features">
                        <textarea
                          value={form.additionalDescription}
                          onChange={(event) => updateField('additionalDescription', event.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:ring-1 focus:ring-[#FFC107]"
                          placeholder="Detailed specifications, tyre life %, cabin features, etc."
                        />
                      </Field>
                    </div>
                  </div>
                </div>

                {/* Tab 5: Buyer & Sale Record (Confidential) */}
                {form.currentAvailability === 'SOLD' && (
                  <section
                    ref={soldSectionRef}
                    className={modalTab !== 'sale' && modalTab !== 'all' ? 'hidden' : 'space-y-3'}
                  >
                    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 shadow-2xs space-y-2.5">
                      <div className="flex items-center justify-between border-b border-rose-200/80 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-950">
                          <UserCheck className="h-4 w-4 text-rose-600" />
                          <span>Buyer & Sale Record (Confidential Super Admin Only)</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-200">
                          Marked Sold
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        <Field label="Buyer Name *">
                          <input
                            ref={buyerNameInputRef}
                            type="text"
                            maxLength={80}
                            value={form.buyerName}
                            onKeyDown={handleTextOnlyKeyDown}
                            onChange={(event) => updateField('buyerName', event.target.value.replace(/[^A-Za-z\s.]/g, '').slice(0, 80))}
                            placeholder="e.g. Ramesh Sharma"
                            className={fieldClassName}
                          />
                        </Field>

                        <Field label="Buyer Mobile Number *">
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={10}
                            value={form.buyerPhone}
                            onKeyDown={handleDigitOnlyKeyDown}
                            onChange={(event) => updateField('buyerPhone', event.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="10-digit mobile"
                            className={fieldClassName}
                          />
                        </Field>

                        <Field label="Final Sold Price (₹) *">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={10}
                            value={form.soldPrice}
                            onKeyDown={handleDigitOnlyKeyDown}
                            onChange={(event) => updateField('soldPrice', event.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="e.g. 2450000"
                            className={fieldClassName}
                          />
                        </Field>

                        <Field label="Sale Date *">
                          <input
                            type="date"
                            value={form.soldAt}
                            onChange={(event) => updateField('soldAt', event.target.value)}
                            className={fieldClassName}
                          />
                        </Field>

                        <Field label="Buyer State">
                          <SearchableSelect
                            options={states}
                            value={form.selectedBuyerStateId || form.buyerState}
                            displayValue={form.buyerState}
                            onChange={(option) => {
                              updateField('buyerState', option.name);
                              updateField('selectedBuyerStateId', String(option.id));
                              updateField('buyerCity', '');
                              updateField('selectedBuyerCityId', '');
                            }}
                            placeholder="Select buyer state"
                            size="sm"
                            className="bg-[#F8FAFC]"
                          />
                        </Field>

                        <Field label="Buyer City">
                          <SearchableSelect
                            options={form.selectedBuyerStateId ? buyerCities : []}
                            value={form.selectedBuyerCityId || form.buyerCity}
                            displayValue={form.buyerCity}
                            onChange={(option) => {
                              updateField('buyerCity', option.name);
                              updateField('selectedBuyerCityId', String(option.id));
                            }}
                            placeholder={form.selectedBuyerStateId ? 'Select buyer city' : 'Select state first'}
                            disabled={!form.selectedBuyerStateId}
                            size="sm"
                            className="bg-[#F8FAFC]"
                          />
                        </Field>
                      </div>
                    </div>

                    {/* Commercial & Deal Settlement Insights */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {/* Deal Financials */}
                      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                          <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Deal Financials
                          </span>
                          <span className="text-[10px] font-semibold text-gray-400">INR (₹)</span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between items-center text-gray-500">
                            <span>Listed Price:</span>
                            <span className="font-semibold text-gray-800">
                              {form.price ? `₹${Number(form.price).toLocaleString('en-IN')}` : 'Not set'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-gray-500">
                            <span>Final Sold Price:</span>
                            <span className="font-bold text-emerald-700">
                              {form.soldPrice ? `₹${Number(form.soldPrice).toLocaleString('en-IN')}` : 'Enter sold price'}
                            </span>
                          </div>
                          {form.price && form.soldPrice && (
                            <div className="flex justify-between items-center pt-1 border-t border-gray-100 text-[11px]">
                              <span className="text-gray-500">Margin / Discount:</span>
                              {Number(form.soldPrice) - Number(form.price) >= 0 ? (
                                <span className="font-bold text-emerald-600">
                                  +₹{(Number(form.soldPrice) - Number(form.price)).toLocaleString('en-IN')} (Gain)
                                </span>
                              ) : (
                                <span className="font-bold text-rose-600">
                                  -₹{(Number(form.price) - Number(form.soldPrice)).toLocaleString('en-IN')} (Discount)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Compliance Status */}
                      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                          <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" /> Compliance Status
                          </span>
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">RTO Ready</span>
                        </div>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-gray-600 text-[11px]">
                            <span>RC Transfer Status:</span>
                            <span className="font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[10px]">
                              Pending Transfer
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-gray-600 text-[11px]">
                            <span>Vehicle Delivery:</span>
                            <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[10px]">
                              Ready for Handover
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-gray-600 text-[11px]">
                            <span>Payment Settlement:</span>
                            <span className="font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">
                              Recorded in Portal
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Destination Summary */}
                      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                          <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-amber-600" /> Destination
                          </span>
                          <span className="text-[10px] font-semibold text-gray-400">Buyer Location</span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <p className="text-[11px] text-gray-700 font-semibold truncate">
                            {form.buyerName ? `Buyer: ${form.buyerName}` : 'Buyer name not entered'}
                          </p>
                          <p className="text-[11px] text-gray-500 truncate">
                            {form.buyerPhone ? `Contact: +91 ${form.buyerPhone}` : 'Phone: —'}
                          </p>
                          <p className="text-[11px] text-gray-500 truncate">
                            Location: {[form.buyerCity, form.buyerState].filter(Boolean).join(', ') || 'State / City not selected'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Sticky Footer */}
                <div className="sticky bottom-0 -mx-5 -mb-4 mt-4 border-t border-gray-200 bg-white/95 backdrop-blur-xs px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-xs">
                  <div className="flex items-center gap-2">
                    {error ? (
                      <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 max-w-md">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        <span className="truncate">{error}</span>
                      </div>
                    ) : modalTab !== 'all' ? (
                      <div className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                        <span>Step {activeTabIndex + 1} of {tabKeys.length}:</span>
                        <span className="font-bold text-gray-800">{modalTabs[activeTabIndex]?.label}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    {modalTab !== 'all' && (
                      <>
                        <button
                          type="button"
                          onClick={handlePrevTab}
                          disabled={activeTabIndex <= 0}
                          className="h-[34px] px-3 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          <span>Prev</span>
                        </button>

                        {activeTabIndex < tabKeys.length - 1 && (
                          <button
                            type="button"
                            onClick={handleNextTab}
                            className="h-[34px] px-3 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                          >
                            <span>Next</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onClick={closeModal}
                      className="h-[34px] px-3.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={saving || uploadingCount > 0}
                      className="h-[34px] px-4 rounded-lg bg-[#FFC107] text-xs font-bold text-gray-950 shadow-xs hover:bg-[#E5AD06] transition flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                    >
                      {saving ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {editingListingId ? 'Updating...' : 'Adding...'}</>
                      ) : uploadingCount > 0 ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...</>
                      ) : (
                        <><Check className="h-3.5 w-3.5" /> {editingListingId ? 'Update Vehicle' : 'Add Vehicle'}</>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {sampleGuideSlot && (() => {
        const activeSampleMedia = getSellVehicleSampleMedia(sampleGuideSlot);
        if (!activeSampleMedia) return null;
        const activeSlotIndex = mediaSlots.findIndex((s) => s.key === sampleGuideSlot);
        const handlePrevSample = () => {
          if (activeSlotIndex > 0) {
            setSampleGuideSlot(mediaSlots[activeSlotIndex - 1].key);
          } else {
            setSampleGuideSlot(mediaSlots[mediaSlots.length - 1].key);
          }
        };
        const handleNextSample = () => {
          if (activeSlotIndex < mediaSlots.length - 1) {
            setSampleGuideSlot(mediaSlots[activeSlotIndex + 1].key);
          } else {
            setSampleGuideSlot(mediaSlots[0].key);
          }
        };

        return typeof window !== 'undefined'
          ? createPortal(
              <div
                className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-150"
                onClick={() => setSampleGuideSlot(null)}
              >
                <div
                  className="relative flex flex-col w-full max-w-5xl xl:max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/90 px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shrink-0">
                        {activeSampleMedia.kind === 'video' ? (
                          <PlayCircle className="h-4 w-4" />
                        ) : (
                          <Camera className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-gray-900">
                            {guideLanguage === 'hi'
                              ? activeSampleMedia.titleHi
                              : guideLanguage === 'en'
                              ? activeSampleMedia.title
                              : `${activeSampleMedia.title} (${activeSampleMedia.titleHi})`}
                          </h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              activeSampleMedia.required
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {activeSampleMedia.required
                              ? guideLanguage === 'hi'
                                ? 'आवश्यक'
                                : guideLanguage === 'en'
                                ? 'Required'
                                : 'Required / जरूरी'
                              : guideLanguage === 'hi'
                              ? 'अनुशंसित'
                              : guideLanguage === 'en'
                              ? 'Recommended'
                              : 'Recommended / अनुशंसित'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium">
                          {guideLanguage === 'hi'
                            ? activeSampleMedia.subtitleHi
                            : guideLanguage === 'en'
                            ? activeSampleMedia.subtitle
                            : `${activeSampleMedia.subtitle} • ${activeSampleMedia.subtitleHi}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Language Switcher */}
                      <div className="hidden xs:flex sm:flex items-center rounded-lg border border-gray-200 bg-gray-100 p-0.5 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setGuideLanguage('both')}
                          className={`px-2 py-0.5 rounded-md text-[11px] transition cursor-pointer ${
                            guideLanguage === 'both' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-900'
                          }`}
                        >
                          हिंदी + EN
                        </button>
                        <button
                          type="button"
                          onClick={() => setGuideLanguage('hi')}
                          className={`px-2 py-0.5 rounded-md text-[11px] transition cursor-pointer ${
                            guideLanguage === 'hi' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-900'
                          }`}
                        >
                          हिंदी
                        </button>
                        <button
                          type="button"
                          onClick={() => setGuideLanguage('en')}
                          className={`px-2 py-0.5 rounded-md text-[11px] transition cursor-pointer ${
                            guideLanguage === 'en' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-900'
                          }`}
                        >
                          English
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSampleGuideSlot(null)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/80 hover:text-gray-700 transition cursor-pointer"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Modal Body: Left Media Preview + Right Guide Details */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                      {/* Visual Preview */}
                      <div className="md:col-span-7 flex flex-col gap-2">
                        <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-gray-950 border border-gray-800 shadow-md flex items-center justify-center">
                          {activeSampleMedia.kind === 'video' ? (
                            <video
                              src={activeSampleMedia.src}
                              controls
                              autoPlay
                              loop
                              playsInline
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <Image
                              src={activeSampleMedia.src}
                              alt={activeSampleMedia.title}
                              fill
                              unoptimized
                              className="object-contain"
                            />
                          )}

                          {/* Angle / Distance Badge Overlay */}
                          <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-0.5 rounded-md bg-black/80 backdrop-blur-xs px-2.5 py-1 text-[10px] font-bold text-white shadow-xs">
                            <div>
                              Angle: {activeSampleMedia.angle}
                              {guideLanguage !== 'en' && activeSampleMedia.angleHi ? (
                                <span className="text-amber-300 font-normal ml-1">({activeSampleMedia.angleHi})</span>
                              ) : null}
                            </div>
                            <div>
                              Distance: {activeSampleMedia.distance}
                              {guideLanguage !== 'en' && activeSampleMedia.distanceHi ? (
                                <span className="text-amber-300 font-normal ml-1">({activeSampleMedia.distanceHi})</span>
                              ) : null}
                            </div>
                          </div>

                          <div className="absolute bottom-2.5 right-2.5 z-10 rounded-md bg-emerald-600/95 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-white shadow-xs flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>
                              {guideLanguage === 'hi'
                                ? 'वेरीफाइड संदर्भ फोटो'
                                : guideLanguage === 'en'
                                ? 'Verified Reference Sample'
                                : 'Verified Reference / वेरीफाइड संदर्भ'}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-center text-gray-500 italic">
                          {guideLanguage === 'hi'
                            ? 'ऊपर दिया गया सैंपल फोटो सही एंगल, फ्रेमिंग और पर्याप्त रोशनी को दर्शाता है।'
                            : guideLanguage === 'en'
                            ? 'Above preview demonstrates the ideal angle, framing, and lighting for this upload slot.'
                            : 'Above preview demonstrates ideal angle & lighting. / ऊपर दिया गया सैंपल सही एंगल व फ्रेमिंग दर्शाता है।'}
                        </p>
                      </div>

                      {/* Guide Notes & Inspection Checklist */}
                      <div className="md:col-span-5 space-y-3">
                        {/* Guide Note Card */}
                        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2 shadow-2xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-amber-600" />
                            {guideLanguage === 'hi'
                              ? 'फोटो कैसे खींचें (निर्देश)'
                              : guideLanguage === 'en'
                              ? 'WHAT TO CAPTURE'
                              : 'WHAT TO CAPTURE / फोटो कैसे खींचें'}
                          </span>
                          {(guideLanguage === 'both' || guideLanguage === 'en') && (
                            <p className="text-xs text-gray-800 leading-relaxed font-medium">
                              {activeSampleMedia.guideNote}
                            </p>
                          )}
                          {(guideLanguage === 'both' || guideLanguage === 'hi') && activeSampleMedia.guideNoteHi && (
                            <p
                              className={`text-xs text-amber-950 leading-relaxed font-semibold ${
                                guideLanguage === 'both' ? 'pt-1.5 border-t border-amber-200/70' : ''
                              }`}
                            >
                              {guideLanguage === 'both' && (
                                <span className="text-[10px] text-amber-700 font-bold block mb-0.5">🇮🇳 हिंदी निर्देश:</span>
                              )}
                              {activeSampleMedia.guideNoteHi}
                            </p>
                          )}
                        </div>

                        {/* Pro Tips / Checklist Card */}
                        <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2 shadow-2xs">
                          <span className="text-[11px] font-bold text-gray-900 flex items-center gap-1">
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            {guideLanguage === 'hi'
                              ? 'जरूरी टिप्स व जांच'
                              : guideLanguage === 'en'
                              ? 'Inspection & Quality Tips'
                              : 'Inspection & Quality Tips / जरूरी टिप्स'}
                          </span>
                          <ul className="space-y-2">
                            {activeSampleMedia.tips?.map((tip: string, idx: number) => {
                              const tipHi = activeSampleMedia.tipsHi?.[idx];
                              return (
                                <li key={idx} className="flex items-start gap-2 text-xs">
                                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  <div className="space-y-0.5">
                                    {(guideLanguage === 'both' || guideLanguage === 'en') && (
                                      <span className="text-gray-800 font-medium block">{tip}</span>
                                    )}
                                    {(guideLanguage === 'both' || guideLanguage === 'hi') && tipHi && (
                                      <span className="text-emerald-900 font-semibold block text-[11px]">{tipHi}</span>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        {/* Technical Spec Box */}
                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-2.5 flex items-center justify-between text-[11px] text-gray-600">
                          <span>
                            <strong className="text-gray-800">{guideLanguage === 'hi' ? 'मान्य फॉर्मेट:' : 'Allowed / मान्य:'}</strong>{' '}
                            {activeSampleMedia.kind === 'video' ? 'MP4, WebM (Max 120s)' : 'JPG, PNG, WebP (Max 5MB)'}
                          </span>
                          <span className="font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded">
                            {guideLanguage === 'hi'
                              ? 'लैंडस्केप मोड (आड़ा)'
                              : guideLanguage === 'en'
                              ? 'Landscape Mode'
                              : 'Landscape Mode / लैंडस्केप'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer: Prev / Next / Close */}
                  <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50/80 px-4 sm:px-5 py-3">
                    <button
                      type="button"
                      onClick={handlePrevSample}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span>{guideLanguage === 'hi' ? 'पिछला' : guideLanguage === 'en' ? 'Previous' : 'Previous / पिछला'}</span>
                    </button>

                    <span className="text-xs font-bold text-gray-600">
                      Slot {activeSlotIndex + 1} of {mediaSlots.length}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleNextSample}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                      >
                        <span>{guideLanguage === 'hi' ? 'अगला' : guideLanguage === 'en' ? 'Next' : 'Next / अगला'}</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSampleGuideSlot(null)}
                        className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-gray-800 transition cursor-pointer shadow-xs"
                      >
                        {guideLanguage === 'hi' ? 'समझ गया, बंद करें' : guideLanguage === 'en' ? 'Got it, Close' : 'Got it, Close / समझ गया'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null;
      })()}



      {pricingTarget ? (
        <ListingPricingModal
          listing={pricingTarget.listing}
          mode={pricingTarget.mode}
          onClose={() => setPricingTarget(null)}
          onSaved={({ message: savedMessage, listing: saved }) => {
            setListings((current) =>
              current.map((item) => (item.id === pricingTarget.listing.id ? ({ ...item, ...saved } as ListingRecord) : item))
            );
            setMessage(savedMessage);
            setPricingTarget(null);
          }}
        />
      ) : null}

      {deleteListingRecord && !isProtectedListing(deleteListingRecord, user?.role) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Delete Listing</h3>
            <p className="mt-2 text-sm text-gray-500">
              Are you sure you want to delete <span className="font-semibold text-gray-700">{deleteListingRecord.title}</span>? This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteListingRecord(null)}
                disabled={deletingListingId === deleteListingRecord.id}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDeleteListing()}
                disabled={deletingListingId === deleteListingRecord.id}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {deletingListingId === deleteListingRecord.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  apiFill = null,
  className,
  hint,
}: {
  apiFill?: { source: string; filled?: boolean } | null;
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  const isRequired = label.trim().endsWith('*');
  const cleanLabel = isRequired ? label.trim().replace(/\s*\*$/, '') : label;

  return (
    <label className={`block ${className || ''}`}>
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-gray-700 truncate">
          {cleanLabel}
          {isRequired ? <span className="ml-0.5 text-rose-500 font-bold">*</span> : null}
        </span>
        {hint ? <span className="text-[9.5px] text-gray-400 font-medium truncate">{hint}</span> : null}
      </div>
      <ApiFillBox apiFill={apiFill}>{children}</ApiFillBox>
    </label>
  );
}

function ListingMediaUploadBox({
  slotKey,
  label,
  kind,
  previewUrl,
  uploadedFile,
  onUploaded,
  onPreviewReady,
  onClear,
  onUploadingChange,
  onOpenSampleGuide,
}: {
  slotKey: MediaSlotKey;
  label: string;
  kind: 'image' | 'video';
  previewUrl: string;
  helperText?: string;
  uploadedFile: UploadedFileResult | null;
  onUploaded: (file: UploadedFileResult) => void;
  onPreviewReady: (previewUrl: string) => void;
  onClear: () => void;
  onUploadingChange: (isUploading: boolean) => void;
  onOpenSampleGuide: (slotKey: MediaSlotKey) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const sampleMedia = getSellVehicleSampleMedia(slotKey);
  const hasUploadedPreview = Boolean(previewUrl);

  const handleChange = async (file?: File) => {
    if (!file) return;

    setError('');
    setUploading(true);
    onUploadingChange(true);

    try {
      const uploaded = await uploadListingMediaToServer({ file, kind });
      onUploaded(uploaded);

      if (kind === 'image') {
        onPreviewReady(URL.createObjectURL(file));
      } else {
        try {
          const posterFrame = await getVideoPosterFrame(file);
          onPreviewReady(posterFrame);
        } catch {
          onPreviewReady('');
        }
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  };

  const cleanLabel = label.replace(/\s*\([^)]*\)/, '');

  return (
    <div className="relative group flex flex-col">
      <label
        className={`relative flex h-24 sm:h-28 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border transition-all ${
          hasUploadedPreview
            ? 'border-emerald-400/80 bg-gray-950 shadow-2xs hover:border-emerald-500'
            : kind === 'video'
            ? 'border-dashed border-amber-300 bg-amber-50/50 hover:bg-amber-100/50 hover:border-amber-400'
            : 'border-dashed border-gray-200 bg-gray-50/70 hover:bg-amber-50/30 hover:border-amber-300'
        }`}
      >
        {hasUploadedPreview ? (
          <Image
            src={previewUrl}
            alt={label}
            fill
            unoptimized
            className="rounded-xl object-cover transition duration-300 group-hover:scale-105"
          />
        ) : sampleMedia?.kind === 'image' ? (
          <Image
            src={sampleMedia.src}
            alt={`Example ${label}`}
            fill
            unoptimized
            aria-hidden="true"
            className="rounded-xl object-cover opacity-20"
          />
        ) : sampleMedia?.kind === 'video' ? (
          <video
            src={sampleMedia.src}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full rounded-xl object-cover opacity-20"
          />
        ) : null}

        {/* Video Preview Overlay */}
        {hasUploadedPreview && kind === 'video' ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/25">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-gray-950 shadow-md">
              <PlayCircle className="h-4 w-4 text-gray-900" />
            </div>
          </div>
        ) : null}

        {/* Top Badges */}
        <div className="absolute top-1.5 left-1.5 right-1.5 z-20 flex items-center justify-between pointer-events-none">
          <span
            className={`rounded px-1.5 py-0.2 text-[8.5px] font-extrabold uppercase tracking-wider ${
              kind === 'video'
                ? 'bg-amber-400 text-gray-950 shadow-2xs'
                : hasUploadedPreview
                ? 'bg-black/60 text-white backdrop-blur-xs'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            {kind === 'video' ? 'Video' : 'Photo'}
          </span>

          <div className="flex items-center gap-1 pointer-events-auto">
            {/* Sample Guide Preview Button */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenSampleGuide(slotKey);
              }}
              title="Click to view full sample photo & photography guide"
              className="inline-flex items-center gap-0.5 rounded bg-black/65 hover:bg-black text-white px-1.5 py-0.5 text-[8.5px] font-bold shadow-xs backdrop-blur-xs transition cursor-pointer"
            >
              <Eye className="h-2.5 w-2.5 text-amber-300" />
              <span>Sample</span>
            </button>

            {hasUploadedPreview && (
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.2 text-[8.5px] font-bold text-white shadow-2xs">
                <CheckCircle2 className="h-2.5 w-2.5" />
                <span>OK</span>
              </span>
            )}
          </div>
        </div>

        {/* Center UI for empty slot */}
        {!hasUploadedPreview && (
          <div className="relative z-10 flex flex-col items-center px-1 text-center">
            <Upload className="mb-0.5 h-3.5 w-3.5 text-gray-400 group-hover:text-amber-600 transition" />
            <span className="text-[10.5px] font-bold text-gray-800 leading-tight truncate max-w-[95px]">
              {cleanLabel}
            </span>
            <span className="text-[8.5px] text-gray-400 font-medium mt-0.5">
              {kind === 'video' ? 'Max 120s' : 'Max 5MB'}
            </span>
          </div>
        )}

        {/* Bottom Title on Uploaded Card */}
        {hasUploadedPreview && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center p-1 bg-gradient-to-t from-black/80 via-black/30 to-transparent">
            <span className="text-[9.5px] font-bold text-white truncate text-center drop-shadow-xs">
              {cleanLabel}
            </span>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 rounded-xl text-white">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400 mb-1" />
            <span className="text-[9px] font-bold text-amber-300">Uploading...</span>
          </div>
        )}

        <input
          type="file"
          accept={kind === 'video' ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov' : 'image/jpeg,image/png,image/webp'}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 z-10"
          onChange={(event) => void handleChange(event.target.files?.[0])}
          disabled={uploading}
        />
      </label>

      {/* Footer link: Title, Guide & Remove button */}
      <div className="mt-1 flex items-center justify-between px-0.5">
        <span className="text-[9.5px] text-gray-600 font-semibold truncate max-w-[65px]" title={label}>
          {cleanLabel}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenSampleGuide(slotKey)}
            title="Read guide note & preview sample"
            className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 hover:text-amber-800 hover:underline transition cursor-pointer"
          >
            <Eye className="h-2.5 w-2.5" />
            <span>Guide</span>
          </button>
          {uploadedFile && (
            <>
              <span className="text-gray-300 text-[8px]">•</span>
              <button
                type="button"
                onClick={onClear}
                className="text-[9px] font-bold text-rose-600 hover:text-rose-700 hover:underline transition cursor-pointer"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      {error ? <p className="mt-0.5 text-[9px] font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
