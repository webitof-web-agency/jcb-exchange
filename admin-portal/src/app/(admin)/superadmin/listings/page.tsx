'use client';

import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Truck, X, Upload, ImagePlus, PlayCircle, Pencil, Trash2, MoreVertical, UserCheck, ChevronDown, ChevronLeft, ChevronRight, ReceiptText, Phone, Check, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import SafeRemoteImage from '@/components/ui/SafeRemoteImage';
import ListingPaymentVerificationTable from '@/components/admin/ListingPaymentVerificationTable';
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
import { hasPermission } from '@/lib/permissionUtils';
import { generateAdminListingDetailPath } from '@/lib/routePaths';
import { YEAR_SELECT_OPTIONS } from '@/lib/listingDateOptions';
import {
  isValidDigitsOnlyValue,
  isValidPinCodeValue,
  isValidYearValue,
  sanitizeListingFieldValue,
  sanitizeListingFormData,
} from '@/lib/listingFormSanitizers';
import ListingRtoFields from '@/components/listings/ListingRtoFields';
import { buildListingRtoDetails, emptyListingRtoForm, hasListingRtoInput, sanitizeListingRtoForm, validateListingRtoForm, type ListingRtoFormState } from '@/lib/listingRtoForm';

type ListingFormState = {
  category: string;
  brand: string;
  model: string;
  variant: string;
  manufacturingYear: string;
  registrationYear: string;
  registrationNo: string;
  chassisOrSerialNo: string;
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

type ListingSortKey = 'title' | 'price' | 'year' | 'location';

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

type ListingRecord = {
  id: string;
  title: string;
  price: string;
  manufacturingYear: number;
  locationState: string;
  locationCity: string;
  address?: string | null;
  status: string;
  createdAt: string;
  brand?: { name: string };
  model?: { name: string };
  category?: { id: string; name: string };
  condition?: string;
  operatingHours?: string;
  description?: string;
  additionalDescription?: string;
  grossPower?: string;
  isNegotiable?: boolean;
  views?: number;
  dealer?: string;
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
    hirePurchaseStatus: ListingRtoFormState['hirePurchaseStatus'];
    taxStatus: ListingRtoFormState['taxStatus']; taxValidUntil?: string | null;
    fitnessStatus: ListingRtoFormState['fitnessStatus']; fitnessValidUntil?: string | null;
    insuranceStatus: ListingRtoFormState['insuranceStatus']; insuranceValidUntil?: string | null;
    pucStatus: ListingRtoFormState['pucStatus']; pucValidUntil?: string | null;
    hsrpStatus: ListingRtoFormState['hsrpStatus']; rtoOffice?: string | null; rtoAgentName?: string | null;
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

const isProtectedListing = (listing: ListingRecord) => listing.partner?.role === 'SUPER_ADMIN';

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
  registrationYear: string;
  registrationNo: string;
  chassisOrSerialNo: string;
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
  registrationYear: '',
  registrationNo: '',
  chassisOrSerialNo: '',
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
const transmissions = ['Manual', 'Automatic'];
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
    .filter((item) => item.type === 'IMAGE')
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

  const videoMedia = media.find((item) => item.type === 'VIDEO');
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
const fieldClassName =
  'w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107]';

const imageUploadHelper = `Auto-compressed before upload. Max ${Math.round(MAX_IMAGE_INPUT_SIZE / (1024 * 1024))}MB input`;
const videoUploadHelper = `Auto-optimized MP4 (muted). Max ${Math.round(MAX_LISTING_VIDEO_INPUT_SIZE / (1024 * 1024))}MB`;

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
  registrationYear: '',
  registrationNo: '',
  chassisOrSerialNo: '',
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
    form.registrationYear ? `Registration year: ${form.registrationYear}` : '',
    form.registrationNo ? `Registration no: ${form.registrationNo}` : '',
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

const localizedAvailability = (status: string) => {
  switch (status.toUpperCase()) {
    case 'AVAILABLE':
      return 'Available';
    case 'PENDING':
      return 'Pending Approval';
    case 'RESERVED':
      return 'Reserved';
    case 'SOLD':
      return 'Sold';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
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
        className={`flex h-9 items-center justify-between gap-2 rounded-full border border-gray-300 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-2xs outline-none transition hover:border-gray-400 hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${
          isOpen ? 'border-[#FFC107] ring-1 ring-[#FFC107]' : ''
        }`}
      >
        <span className="truncate max-w-[140px]">{displayLabel}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[170px] max-w-[260px] max-h-60 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                className={`w-full text-left rounded-xl px-3.5 py-2 text-xs font-medium transition cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-gray-100 text-gray-950 font-bold'
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
        className={`flex h-9 items-center justify-between gap-2 rounded-full border border-gray-300 bg-white px-3.5 text-xs font-semibold text-gray-700 outline-none transition hover:border-gray-400 hover:bg-gray-50 shadow-2xs cursor-pointer ${
          isOpen ? 'border-[#FFC107] ring-1 ring-[#FFC107]' : ''
        }`}
      >
        <span className="truncate max-w-[140px]">{selectedOption?.label || 'All Availability'}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[170px] max-w-[260px] max-h-60 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                className={`w-full text-left rounded-xl px-3.5 py-2 text-xs font-medium transition cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-gray-100 text-gray-950 font-bold'
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
  openUpwards,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  disabled?: boolean;
  openUpwards?: boolean;
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

  const badgeClass = availabilityBadgeClassName[value] || 'border-gray-200 bg-white text-gray-700';

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`flex items-center justify-between gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-xs outline-none transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${badgeClass}`}
      >
        <span>{value}</span>
        <ChevronDown size={11} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute left-0 z-50 min-w-[120px] max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
          openUpwards ? 'bottom-full mb-1 origin-bottom-left' : 'top-full mt-1 origin-top-left'
        }`}>
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
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PartnerListingsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);

  const canEdit =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN' ||
    hasPermission(user?.permissions, 'listings.update') ||
    hasPermission(user?.permissions, 'listings.approve');
  const canDelete = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || hasPermission(user?.permissions, 'listings.delete');
  const canApprove = user?.role === 'SUPER_ADMIN' || hasPermission(user?.permissions, 'listings.approve');
  const canVerifyPayment =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN' ||
    hasPermission(user?.permissions, 'listings.verify_payment') ||
    hasPermission(user?.permissions, 'listings.approve');

  const [isModalOpen, setIsModalOpen] = useState(false);
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
  const [loadingListings, setLoadingListings] = useState(true);

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
  const [listingView, setListingView] = useState<'all' | 'pending' | 'payments'>(() => {
    const requestedView = searchParams.get('view');
    if (requestedView === 'payments' || requestedView === 'pending' || requestedView === 'all') {
      return requestedView;
    }
    return 'all';
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openPageSizeDropdown, setOpenPageSizeDropdown] = useState(false);
  // Sorting state
  const [sortKey, setSortKey] = useState<'title' | 'price' | 'year' | 'location' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [pendingPaymentVerificationsCount, setPendingPaymentVerificationsCount] = useState(0);
  const [deleteListingRecord, setDeleteListingRecord] = useState<ListingRecord | null>(null);
  const [updatingAvailabilityIds, setUpdatingAvailabilityIds] = useState<string[]>([]);
  const [moderatingListingIds, setModeratingListingIds] = useState<string[]>([]);
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);
  const { t } = useTranslation();
  const localizedCondition = useCallback((value: string) => t(`listingDetails.conditionOptions.${value}`, value), [t]);
  const localizedFuelType = useCallback((value: string) => t(`listingDetails.fuelOptions.${value}`, value), [t]);
  const localizedTransmission = useCallback((value: string) => t(`listingDetails.transmissionOptions.${value}`, value), [t]);

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
        const [listingResponse, paymentsResult] = await Promise.allSettled([
          api.get<{ listings: ListingRecord[] }>('/superadmin/listings?compact=true'),
          api.get<{ count?: number }>('/superadmin/listing-payments?status=PENDING_VERIFICATION&summary=true'),
        ]);

        if (cancelled) {
          return;
        }

        if (listingResponse.status === 'fulfilled') {
          setListings(listingResponse.value.data.listings || []);
        } else {
          setListings([]);
        }

        if (paymentsResult.status === 'fulfilled') {
          setPendingPaymentVerificationsCount(paymentsResult.value.data.count || 0);
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
  }, [allViewListings]);

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
    if (!sortKey) return filteredListings;
    return [...filteredListings].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sortKey === 'title') {
        aVal = a.title || '';
        bVal = b.title || '';
      } else if (sortKey === 'price') {
        const aNum = parseFloat(String(a.price || '0').replace(/[^\d.]/g, ''));
        const bNum = parseFloat(String(b.price || '0').replace(/[^\d.]/g, ''));
        return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
      } else if (sortKey === 'year') {
        return sortDir === 'asc'
          ? (a.manufacturingYear || 0) - (b.manufacturingYear || 0)
          : (b.manufacturingYear || 0) - (a.manufacturingYear || 0);
      } else if (sortKey === 'location') {
        aVal = `${a.locationCity || ''} ${a.locationState || ''}`;
        bVal = `${b.locationCity || ''} ${b.locationState || ''}`;
      }
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredListings, sortKey, sortDir]);

  const handleSort = (key: 'title' | 'price' | 'year' | 'location') => {
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



  const populateEditForm = (listing: ListingRecord, availableStates = states) => {
    setMessage('');
    setError('');
    setEditingListingId(listing.id);
    const parsedDetails = parseListingDescription(listing.description);
    const linkedRto = listing.rtoRecords?.[0];
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
      registrationYear: parsedDetails.registrationYear,
      registrationNo: linkedRto?.vehicleNumber || parsedDetails.registrationNo,
      chassisOrSerialNo: parsedDetails.chassisOrSerialNo,
      previousOwners: parsedDetails.previousOwners,
      condition: listing.condition || '',
      operatingHours: String(listing.operatingHours || ''),
      fuelType: parsedDetails.fuelType,
      transmission: parsedDetails.transmission,
      currentAvailability: listingStatusToAvailability(listing.status || 'DRAFT'),
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
      insuranceExpiry: linkedRto?.insuranceValidUntil ? String(linkedRto.insuranceValidUntil).split('T')[0] : parsedDetails.insuranceExpiry,
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
        taxStatus: (linkedRto?.taxStatus === 'EXPIRED' ? 'EXPIRED' : 'VALID'),
        taxValidUntil: linkedRto?.taxValidUntil ? String(linkedRto.taxValidUntil).split('T')[0] : '',
        fitnessStatus: (linkedRto?.fitnessStatus === 'EXPIRED' ? 'EXPIRED' : 'VALID'),
        fitnessValidUntil: linkedRto?.fitnessValidUntil ? String(linkedRto.fitnessValidUntil).split('T')[0] : '',
        insuranceStatus: (linkedRto?.insuranceStatus === 'EXPIRED' ? 'EXPIRED' : 'VALID'),
        pucStatus: (linkedRto?.pucStatus === 'EXPIRED' ? 'EXPIRED' : 'VALID'),
        pucValidUntil: linkedRto?.pucValidUntil ? String(linkedRto.pucValidUntil).split('T')[0] : '',
        hsrpStatus: linkedRto?.hsrpStatus === 'YES' ? 'YES' : 'NO',
        rtoOffice: linkedRto?.rtoOffice || '',
        rtoAgentName: linkedRto?.rtoAgentName || '',
        rtoExpenses: linkedRto?.rtoExpenses != null ? String(linkedRto.rtoExpenses) : '',
        vehicleMaintenanceCost: linkedRto?.vehicleMaintenanceCost != null ? String(linkedRto.vehicleMaintenanceCost) : '',
      },
    });

    const { nextMediaState, nextPreviewState } = buildMediaPreviewState(listing.media || []);

    setMediaState(nextMediaState);
    setPreviewState(nextPreviewState);
    setIsModalOpen(true);
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
    setForm(initialForm);
    setMediaState(createEmptyMediaState());
    setPreviewState(createEmptyPreviewState());
    setEditingListingId(null);
  };

  const updateField = <K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: typeof value === 'string' ? sanitizeListingFieldValue(key, value) : value,
    }));
  };

  const updateRtoField = <K extends keyof ListingRtoFormState>(key: K, value: ListingRtoFormState[K]) => {
    setForm((current) => ({ ...current, rtoDetails: { ...current.rtoDetails, [key]: value } }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const sanitizedForm = sanitizeListingFormData(form);
    const sanitizedRto = sanitizeListingRtoForm(sanitizedForm.rtoDetails);
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
      setForm({ ...sanitizedForm, rtoDetails: sanitizedRto });
      return;
    }

    if (!isValidDigitsOnlyValue(sanitizedForm.price)) {
      setError('Price must contain digits only.');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidYearValue(sanitizedForm.manufacturingYear)) {
      setError('Manufacturing year must be a 4-digit year.');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidDigitsOnlyValue(sanitizedForm.operatingHours)) {
      setError('Operating hours must contain digits only.');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidYearValue(sanitizedForm.registrationYear)) {
      setError('Registration year must be a 4-digit year.');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidDigitsOnlyValue(sanitizedForm.previousOwners)) {
      setError('Previous owners must contain digits only.');
      setForm(sanitizedForm);
      return;
    }

    if (!isValidPinCodeValue(sanitizedForm.pinCode)) {
      setError('Pin code must be exactly 6 digits.');
      setForm(sanitizedForm);
      return;
    }

    if (sanitizedForm.currentAvailability === 'SOLD') {
      if (!sanitizedForm.buyerName.trim()) {
        setError('Buyer Name is required when marking a vehicle as SOLD.');
        setForm(sanitizedForm);
        return;
      }

      if (sanitizedForm.buyerPhone.length !== 10) {
        setError('Buyer Mobile Number must be 10 digits when marking a vehicle as SOLD.');
        setForm(sanitizedForm);
        return;
      }

      if (!sanitizedForm.soldPrice || Number(sanitizedForm.soldPrice) <= 0) {
        setError('Final Sold Price is required when marking a vehicle as SOLD.');
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
        categoryId: sanitizedForm.category,
        brandName: sanitizedForm.brand,
        modelName: sanitizedForm.model,
        title: sanitizedForm.title || `${sanitizedForm.brand} ${sanitizedForm.model}`.trim(),
        status: availabilityToListingStatus(sanitizedForm.currentAvailability),
        price: sanitizedForm.price,
        manufacturingYear: sanitizedForm.manufacturingYear,
        operatingHours: sanitizedForm.operatingHours,
        locationState: sanitizedForm.state,
        locationCity: sanitizedForm.city,
        address: sanitizedForm.address,
        condition: sanitizedForm.condition,
        description: buildListingDescription(sanitizedForm),
        additionalDescription: sanitizedForm.additionalDescription,
        grossPower: sanitizedForm.grossPower,
        isNegotiable: sanitizedForm.isNegotiable,
        media: uploadedMedia,
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
        const shouldSyncAvailability =
          ['AVAILABLE', 'RESERVED', 'SOLD'].includes(sanitizedForm.currentAvailability.toUpperCase());

        if (shouldSyncAvailability) {
          response = await api.patch<{ listing: ListingRecord; message: string }>(`/listings/${editingListingId}/availability`, {
            status: availabilityToListingStatus(sanitizedForm.currentAvailability),
            buyerDetails: payload.buyerDetails,
          });
        } else {
          response = updateResponse;
        }
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

  return (
    <div className="space-y-4">
      {(message || error) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'
            }`}
        >
          {error || message}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* Top Tab Navigation Bar */}
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => {
                setListingView('all');
                setCurrentPage(1);
              }}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition cursor-pointer ${
                listingView === 'all'
                  ? 'bg-[#FFC107] text-black shadow-2xs font-extrabold'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-[#FFC107] hover:text-gray-900'
              }`}
            >
              All Listings ({listings.filter((l) => !isPendingApprovalListing(l.status)).length})
            </button>

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
                className={`whitespace-nowrap rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition cursor-pointer ${
                  listingView === 'pending'
                    ? 'bg-[#FFC107] text-black shadow-2xs font-extrabold'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-[#FFC107] hover:text-gray-900'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <span>Pending Approval ({pendingApprovalCount})</span>
                  {pendingApprovalCount > clearedPendingCount ? (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
                    </span>
                  ) : null}
                </span>
              </button>
            ) : null}

            {canVerifyPayment ? (
              <button
                type="button"
                onClick={() => {
                  setListingView('payments');
                  setCurrentPage(1);
                  if (user?.id) {
                    localStorage.setItem(`cleared_listings_payments_${user.id}`, pendingPaymentVerificationsCount.toString());
                    window.dispatchEvent(new CustomEvent('badge_refresh'));
                  }
                }}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition cursor-pointer ${
                  listingView === 'payments'
                    ? 'bg-[#FFC107] text-black shadow-2xs font-extrabold'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-[#FFC107] hover:text-gray-900'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <ReceiptText className="h-4 w-4" />
                  <span>Payment Verification ({pendingPaymentVerificationsCount})</span>
                  {pendingPaymentVerificationsCount > clearedPaymentsCount ? (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
                    </span>
                  ) : null}
                </span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Dedicated Filter Sub-Bar for "All Listings" */}
        {listingView === 'all' && (
          <div className="flex w-full flex-col gap-3 bg-gray-50/60 p-3 sm:p-4 border-b border-gray-100 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
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

              {(categoryFilter !== 'ALL' || brandFilter !== 'ALL' || stateFilter !== 'ALL' || availabilityFilter !== 'ALL' || fuelFilter !== 'ALL' || search) && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('ALL');
                    setBrandFilter('ALL');
                    setStateFilter('ALL');
                    setAvailabilityFilter('ALL');
                    setFuelFilter('ALL');
                    setSearch('');
                    setCurrentPage(1);
                  }}
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>

            {false && (
            <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 shrink-0">Quick:</span>
              {(['ALL', 'AVAILABLE', 'PENDING', 'RESERVED', 'SOLD'] as const).map((status) => {
                const isActive = availabilityFilter === status;
                const chipColors: Record<string, string> = {
                  ALL: isActive ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-400',
                  AVAILABLE: isActive ? 'bg-emerald-600 text-white border-emerald-600' : 'border-emerald-200 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50',
                  PENDING: isActive ? 'bg-amber-500 text-white border-amber-500' : 'border-amber-200 text-amber-700 hover:border-amber-400 hover:bg-amber-50',
                  RESERVED: isActive ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-200 text-blue-700 hover:border-blue-400 hover:bg-blue-50',
                  SOLD: isActive ? 'bg-rose-600 text-white border-rose-600' : 'border-rose-200 text-rose-700 hover:border-rose-400 hover:bg-rose-50',
                };
                const label = status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase();
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => { setAvailabilityFilter(status); setCurrentPage(1); }}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition cursor-pointer ${chipColors[status]}`}
                  >
                    {label}
                  </button>
                );
              })}
              {sortKey && (
                <button
                  type="button"
                  onClick={() => { setSortKey(null); setSortDir('asc'); }}
                  className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 cursor-pointer"
                >
                  ✕ Sort
                </button>
              )}
            </div>

            )}

            <div className="relative w-full sm:max-w-xs lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search title, brand, model, city..."
                className="w-full rounded-full border border-gray-300 bg-white py-2 pl-9 pr-8 text-xs text-gray-900 shadow-2xs placeholder:text-gray-400 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* Dedicated Filter Sub-Bar for "Pending Approval" */}
        {listingView === 'pending' && (
          <div className="flex w-full flex-col gap-3 bg-amber-50/40 p-3 sm:p-4 border-b border-gray-100 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
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

              {(pendingCategoryFilter !== 'ALL' || pendingBrandFilter !== 'ALL' || pendingDealerFilter !== 'ALL' || pendingSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingCategoryFilter('ALL');
                    setPendingBrandFilter('ALL');
                    setPendingDealerFilter('ALL');
                    setPendingSearch('');
                    setCurrentPage(1);
                  }}
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                >
                  Reset Filters
                </button>
              )}
            </div>

            <div className="relative w-full sm:max-w-xs lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={pendingSearch}
                onChange={(event) => {
                  setPendingSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search pending listing, dealer..."
                className="w-full rounded-full border border-amber-300 bg-white py-2 pl-9 pr-8 text-xs text-gray-900 shadow-2xs placeholder:text-gray-400 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
              />
              {pendingSearch ? (
                <button
                  type="button"
                  onClick={() => setPendingSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>
        )}

        {listingView === 'payments' ? (
          <div className="p-4 sm:p-6">
            <ListingPaymentVerificationTable onPendingCountChange={(count) => setPendingPaymentVerificationsCount(count)} />
          </div>
        ) : loadingListings ? (
          <BrandLoader variant="section" size="sm" bg="light" text="Loading your listings..." />
        ) : filteredListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
              <Truck size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              {listingView === 'pending' ? 'No pending approvals' : 'No listings found'}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              {listingView === 'pending'
                ? 'All submitted listings have already been reviewed.'
                : 'There are no vehicles or machinery listed yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-auto flex-1 max-h-[620px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full min-w-[1200px] border-collapse text-left text-sm text-gray-600">
                <thead className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50 uppercase text-gray-500 shadow-2xs">
                  <tr>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide cursor-pointer select-none hover:text-amber-600 transition-colors"
                      onClick={() => handleSort('title')}
                    >Vehicle Name<SortIcon col="title" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide">Dealer/Owner</th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide">Model</th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide">Category</th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide cursor-pointer select-none hover:text-amber-600 transition-colors"
                      onClick={() => handleSort('price')}
                    >Price<SortIcon col="price" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide cursor-pointer select-none hover:text-amber-600 transition-colors"
                      onClick={() => handleSort('year')}
                    >Year<SortIcon col="year" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide cursor-pointer select-none hover:text-amber-600 transition-colors"
                      onClick={() => handleSort('location')}
                    >Location<SortIcon col="location" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide">Fuel Type</th>
                    <th className="whitespace-nowrap px-4 py-3 text-center text-[11px] font-semibold tracking-wide">Availability</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {paginatedListings.map((listing, index) => {
                    const cover = getCoverMedia(listing);
                    const parsedDetails = parseListingDescription(listing.description);
                    const linkedRto = listing.rtoRecords?.[0];
                    const vehicleNumber = linkedRto?.vehicleNumber || parsedDetails.registrationNo;
                    const availability = listingStatusToAvailability(listing.status);
                    const isUpdatingAvailability = updatingAvailabilityIds.includes(listing.id);
                    const isModeratingListing = moderatingListingIds.includes(listing.id);
                    const isPendingListing = isPendingApprovalListing(listing.status);
                    const isNearBottom = index >= Math.max(paginatedListings.length - 3, 0);
                    return (
                      <tr
                        key={listing.id}
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
                        className="cursor-pointer transition hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FFC107]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-100">
                              {cover ? (
                                <SafeRemoteImage
                                  src={getAbsoluteFileUrl(cover.url)}
                                  alt={listing.title}
                                  className="h-full w-full object-cover"
                                  fallback={
                                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                                      <Truck className="h-5 w-5" />
                                    </div>
                                  }
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-gray-400">
                                  <Truck className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                            <span className="max-w-[150px] truncate text-xs font-semibold leading-tight text-gray-900" title={listing.title}>
                              {listing.title}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-gray-900">
                          <div className="flex flex-col">
                            <span>{listing.dealer || 'Unknown'}</span>
                            {listing.partner?.mobile || listing.partner?.phone || listing.partner?.partnerProfile?.phone ? (
                              <a
                                href={`tel:${listing.partner?.mobile || listing.partner?.phone || listing.partner?.partnerProfile?.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 transition hover:text-amber-950 hover:underline"
                                title={`Click to call ${listing.partner?.mobile || listing.partner?.phone || listing.partner?.partnerProfile?.phone}`}
                              >
                                <Phone className="h-3 w-3 text-amber-600 shrink-0" />
                                <span>{listing.partner?.mobile || listing.partner?.phone || listing.partner?.partnerProfile?.phone}</span>
                              </a>
                            ) : null}
                            <span className="mt-1 inline-flex w-fit rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                              {resolveDealerTypeLabel(listing)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-gray-600">
                          {[listing.brand?.name, listing.model?.name].filter(Boolean).join(' ') || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded border border-gray-200 bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                            {listing.category?.name || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-gray-900">{formatCurrency(listing.price)}</td>
                        <td className="px-4 py-3 text-xs font-medium text-gray-600">{listing.manufacturingYear || '-'}</td>
                        <td className="px-4 py-3 text-xs font-medium text-gray-600">
                          {listing.locationCity ? `${listing.locationCity}, ${listing.locationState}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-gray-600">
                          {parsedDetails.fuelType || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <TableAvailabilityDropdown
                              value={availability}
                              onChange={(val) => void handleUpdateAvailability(listing.id, val)}
                              options={availabilityTypes}
                              disabled={isUpdatingAvailability || !canEdit || isPendingListing}
                              openUpwards={isNearBottom}
                            />
                            <span className="min-h-[14px] text-[10px] text-gray-400">
                              {isPendingListing ? 'Awaiting approval' : isUpdatingAvailability ? 'Updating...' : ' '}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right sm:px-6 sm:py-4">
                          <div className="relative inline-block text-left action-dropdown-container">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setOpenActionDropdownId((prev) => prev === listing.id ? null : listing.id);
                              }}
                              className="inline-flex items-center justify-center rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                            >
                              <MoreVertical size={18} />
                            </button>

                            {openActionDropdownId === listing.id ? (
                              <div className={`absolute right-0 z-[100] w-44 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 focus:outline-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
                                isNearBottom ? 'bottom-full mb-1.5 origin-bottom-right' : 'top-full mt-1.5 origin-top-right'
                              }`}>
                                {canApprove && isPendingListing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        void handleListingModeration(listing.id, 'PUBLISHED');
                                        setOpenActionDropdownId(null);
                                      }}
                                      disabled={isModeratingListing}
                                      className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition cursor-pointer disabled:opacity-60"
                                    >
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        void handleListingModeration(listing.id, 'CHANGES_REQUESTED');
                                        setOpenActionDropdownId(null);
                                      }}
                                      disabled={isModeratingListing}
                                      className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition cursor-pointer disabled:opacity-60"
                                    >
                                      <X className="h-3.5 w-3.5 text-amber-600" />
                                      Reject
                                    </button>
                                  </>
                                ) : null}
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      openEditModal(listing);
                                      setOpenActionDropdownId(null);
                                    }}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-950 transition cursor-pointer"
                                  >
                                    <Pencil size={14} className="text-gray-500" />
                                    Edit Listing
                                  </button>
                                ) : null}
                                {canDelete && !isProtectedListing(listing) ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setDeleteListingRecord(listing);
                                      setOpenActionDropdownId(null);
                                    }}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition cursor-pointer"
                                  >
                                    <Trash2 size={14} className="text-red-500" />
                                    Delete Listing
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-4 border-t border-gray-100 bg-white px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-gray-500 sm:justify-start">
                <div>
                  Showing <span className="font-bold text-gray-900">{startItemIndex}</span> to{' '}
                  <span className="font-bold text-gray-900">{endItemIndex}</span> of{' '}
                  <span className="font-bold text-gray-900">{totalListings}</span> listings
                </div>

                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <div className="relative rows-per-page-dropdown-container">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenPageSizeDropdown((prev) => !prev);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-800 shadow-2xs transition hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    >
                      <span>{pageSize}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    </button>

                    {openPageSizeDropdown ? (
                      <div className="absolute bottom-full left-0 z-50 mb-1.5 w-20 origin-bottom-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                            className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-100 ${
                              pageSize === size ? 'bg-[#FFC107]/20 font-extrabold text-gray-900' : 'font-medium text-gray-700'
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
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {paginationItems.map((item, index) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setCurrentPage(item)}
                        className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                          currentPageForView === item ? 'bg-[#FFC107] text-black shadow-2xs' : 'text-gray-600 hover:bg-gray-100'
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
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{editingListingId ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form ref={modalFormRef} onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5">
              <div className="grid gap-6">
                <section className="rounded-2xl border border-gray-200 p-5">
                  <div className="mb-4 flex items-center gap-2 text-gray-900">
                    <Truck className="h-4 w-4" />
                    <h3 className="text-base font-semibold">Equipment Details</h3>
                  </div>
                  <div className="mb-4">
                    <Field label="Vehicle Name">
                      <input
                        value={form.title}
                        onChange={(event) => updateField('title', event.target.value)}
                        className={fieldClassName}
                        placeholder="Example: JCB 3DX Plus"
                      />
                    </Field>
                    <p className="mt-1 text-xs text-gray-500">
                      This name is used as the main listing title on the marketplace.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="Category">
                      <SearchableSelect
                        options={categories}
                        value={form.category}
                        displayValue={categories.find(c => c.id === form.category)?.name || form.category}
                        onChange={(option) => updateField('category', String(option.id))}
                        placeholder="Select category"
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label="Brand">
                      <SearchableSelect
                        options={brands}
                        value={form.brand}
                        displayValue={form.brand}
                        onChange={(option) => updateField('brand', option.name)}
                        placeholder="Select brand"
                        className="bg-[#F8FAFC]"
                      />
                    </Field>

                    <Field label="Model">
                      <input value={form.model} onChange={(event) => updateField('model', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Variant">
                      <input value={form.variant} onChange={(event) => updateField('variant', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Gross Power">
                      <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 bg-[#F8FAFC] focus-within:border-[#FFC107] transition">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={form.grossPower}
                          onChange={(event) => updateField('grossPower', event.target.value.replace(/[^0-9]/g, ''))}
                          onKeyDown={(event) => { if (!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab|Home|End/.test(event.key) && !event.ctrlKey && !event.metaKey) event.preventDefault(); }}
                          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-gray-900 outline-none"
                          placeholder="e.g. 170"
                        />
                        <span className="shrink-0 border-l border-gray-200 bg-gray-100 px-3 py-2.5 text-xs font-bold text-gray-500 select-none">HP</span>
                      </div>
                    </Field>
                    <Field label="Manufacture Year">
                      <SearchableSelect
                        options={YEAR_SELECT_OPTIONS}
                        value={form.manufacturingYear}
                        displayValue={form.manufacturingYear}
                        onChange={(option) => updateField('manufacturingYear', String(option.id))}
                        placeholder="Select manufacture year"
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label="Registration Year">
                      <SearchableSelect
                        options={YEAR_SELECT_OPTIONS}
                        value={form.registrationYear}
                        displayValue={form.registrationYear}
                        onChange={(option) => updateField('registrationYear', String(option.id))}
                        placeholder="Select registration year"
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label="Vehicle Number">
                      <input value={form.registrationNo} onChange={(event) => updateField('registrationNo', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Insurance Expiry Date">
                      <input type="date" value={form.insuranceExpiry} onChange={(event) => updateField('insuranceExpiry', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Chassis / Serial No.">
                      <input value={form.chassisOrSerialNo} onChange={(event) => updateField('chassisOrSerialNo', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Meter Reading">
                      <input value={form.operatingHours} onChange={(event) => updateField('operatingHours', event.target.value)} className={fieldClassName} placeholder="Hours / km" />
                    </Field>
                    <Field label="No. of Owners">
                      <input type="number" value={form.previousOwners} onChange={(event) => updateField('previousOwners', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Condition">
                      <SearchableSelect
                        options={conditions.map((option) => ({ id: option, name: localizedCondition(option) }))}
                        value={form.condition}
                        onChange={(opt) => updateField('condition', String(opt.id))}
                        placeholder="Select condition"
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label="Fuel Type">
                      <SearchableSelect
                        options={fuelTypes.map((option) => ({ id: option, name: localizedFuelType(option) }))}
                        value={form.fuelType}
                        onChange={(opt) => updateField('fuelType', String(opt.id))}
                        placeholder="Select fuel type"
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label="Transmission">
                      <SearchableSelect
                        options={transmissions.map((option) => ({ id: option, name: localizedTransmission(option) }))}
                        value={form.transmission}
                        onChange={(opt) => updateField('transmission', String(opt.id))}
                        placeholder="Select transmission"
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label="Availability">
                      <SearchableSelect
                        options={availabilityTypes.map(opt => ({ id: opt, name: opt }))}
                        value={form.currentAvailability}
                        onChange={(opt) => {
                          const val = String(opt.id);
                          updateField('currentAvailability', val);
                          if (val === 'SOLD') {
                            setTimeout(() => {
                              soldSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 100);
                          }
                        }}
                        placeholder="Select availability"
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                  </div>
                </section>

                <ListingRtoFields
                  value={form.rtoDetails}
                  onChange={updateRtoField}
                  insuranceExpiry={form.insuranceExpiry}
                  onInsuranceExpiryChange={(value) => updateField('insuranceExpiry', value)}
                  required={!editingListingId || hasListingRtoInput(form.rtoDetails)}
                />

                {form.currentAvailability === 'SOLD' && (
                  <section ref={soldSectionRef} className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
                    <div className="mb-4 flex items-center gap-2 border-b border-rose-200/60 pb-2 text-rose-900">
                      <UserCheck className="h-4 w-4 text-rose-600" />
                      <h3 className="text-xs font-bold uppercase tracking-wider">Buyer & Sale Record (Confidential)</h3>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Buyer Name *">
                        <input
                          ref={buyerNameInputRef}
                          type="text"
                          value={form.buyerName}
                          onChange={(event) => updateField('buyerName', event.target.value)}
                          placeholder="e.g. Ramesh Sharma / Contractor Name"
                          className={fieldClassName}
                        />
                      </Field>
                      <Field label="Buyer Mobile Number *">
                        <input
                          type="tel"
                          value={form.buyerPhone}
                          onChange={(event) => updateField('buyerPhone', event.target.value)}
                          placeholder="e.g. +91 98765 43210"
                          className={fieldClassName}
                        />
                      </Field>
                      <Field label="Final Sold Price (₹) *">
                        <input
                          type="number"
                          value={form.soldPrice}
                          onChange={(event) => updateField('soldPrice', event.target.value)}
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
                          className="bg-[#F8FAFC]"
                        />
                      </Field>
                    </div>
                  </section>
                )}

                <section className="rounded-2xl border border-gray-200 p-5">
                  <div className="mb-4 flex items-center gap-2 text-gray-900">
                    <Upload className="h-4 w-4" />
                    <h3 className="text-base font-semibold">Media Uploads</h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {mediaSlots.map((slot) => (
                      <ListingMediaUploadBox
                        key={slot.key}
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
                      />
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-200 p-5">
                  <div className="mb-4 flex items-center gap-2 text-gray-900">
                    <ImagePlus className="h-4 w-4" />
                    <h3 className="text-base font-semibold">Price and Location</h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="Price">
                      <input type="number" value={form.price} onChange={(event) => updateField('price', event.target.value)} className={fieldClassName} />
                    </Field>
                    <div className="flex items-end pb-1 md:pb-3">
                      <label className="flex items-center gap-2 cursor-pointer pt-2">
                        <input
                          type="checkbox"
                          checked={form.isNegotiable}
                          onChange={(e) => updateField('isNegotiable', e.target.checked)}
                          className="w-4 h-4 text-jcb-yellow rounded border-gray-300 focus:ring-jcb-yellow"
                        />
                        <span className="text-sm font-medium text-gray-700">Price is Negotiable</span>
                      </label>
                    </div>
                    <Field label="State">
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
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label={t('sellModal.address', 'Address')}>
                      <input value={form.address} onChange={(event) => updateField('address', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="City">
                      <SearchableSelect
                        options={cities}
                        value={form.selectedCityId || form.city}
                        displayValue={form.city}
                        onChange={(option) => {
                          updateField('city', option.name);
                          updateField('selectedCityId', String(option.id));
                        }}
                        placeholder={form.selectedStateId ? "Select city" : "Select state first"}
                        disabled={!form.selectedStateId}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label="PIN Code">
                      <input value={form.pinCode} onChange={(event) => updateField('pinCode', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Nearby Landmark">
                      <input value={form.nearbyLandmark} onChange={(event) => updateField('nearbyLandmark', event.target.value)} className={fieldClassName} />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Description">
                      <textarea
                        value={form.description}
                        onChange={(event) => updateField('description', event.target.value)}
                        rows={4}
                        className={fieldClassName}
                        placeholder="Short machine condition, issues, and selling points"
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Additional Description">
                      <textarea
                        value={form.additionalDescription}
                        onChange={(event) => updateField('additionalDescription', event.target.value)}
                        rows={4}
                        className={fieldClassName}
                        placeholder="Detailed specifications, tyre condition, cabin features, etc."
                      />
                    </Field>
                  </div>
                </section>
              </div>

              <div className="sticky bottom-0 mt-6 border-t border-gray-100 bg-white pt-4">
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {error ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:max-w-md">
                      {error}
                    </div>
                  ) : <div />}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-lg border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving || uploadingCount > 0}
                      className="rounded-lg bg-[#FFC107] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? (editingListingId ? 'Updating...' : 'Saving...') : uploadingCount > 0 ? 'Waiting for uploads...' : editingListingId ? 'Update' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}



      {deleteListingRecord && !isProtectedListing(deleteListingRecord) && (
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function ListingMediaUploadBox({
  label,
  kind,
  previewUrl,
  helperText,
  uploadedFile,
  onUploaded,
  onPreviewReady,
  onClear,
  onUploadingChange,
}: {
  label: string;
  kind: 'image' | 'video';
  previewUrl: string;
  helperText: string;
  uploadedFile: UploadedFileResult | null;
  onUploaded: (file: UploadedFileResult) => void;
  onPreviewReady: (previewUrl: string) => void;
  onClear: () => void;
  onUploadingChange: (isUploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = async (file?: File) => {
    if (!file) {
      return;
    }

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
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload the selected file.');
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="relative flex min-h-[154px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 p-4 transition hover:border-[#FFC107] hover:bg-[#FFC107]/5">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={label}
            fill
            unoptimized
            className="rounded-xl object-cover"
          />
        ) : null}

        {previewUrl && kind === 'video' ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/10">
            <div className="flex items-center gap-2 rounded-full bg-white/92 px-3 py-2 text-[#111827] shadow-lg">
              <PlayCircle className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Preview</span>
            </div>
          </div>
        ) : null}

        <div className={`relative z-20 flex flex-col items-center ${previewUrl ? 'rounded-lg bg-white/90 px-3 py-2 shadow-sm' : ''}`}>
          <Upload className="mb-2 h-5 w-5 text-gray-400" />
          <span className="text-center text-xs font-medium text-gray-600">{label}</span>
          {uploadedFile ? (
            <span className="mt-1 text-center text-[11px] text-gray-500">
              {kind === 'video'
                ? uploadedFile.originalName || `Max ${MAX_LISTING_VIDEO_DURATION_SECONDS} sec`
                : `Max ${Math.round(MAX_IMAGE_INPUT_SIZE / (1024 * 1024))}MB`}
            </span>
          ) : null}
          {uploading ? <span className="mt-1 text-[11px] text-[#9a7600]">Optimizing &amp; uploading...</span> : null}
        </div>

        <input
          type="file"
          accept={kind === 'video' ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov' : 'image/jpeg,image/png,image/webp'}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => void handleChange(event.target.files?.[0])}
          disabled={uploading}
        />
      </label>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-500">{helperText}</p>
        {uploadedFile ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-semibold text-red-600 transition hover:text-red-700"
          >
            Remove
          </button>
        ) : null}
      </div>

      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
