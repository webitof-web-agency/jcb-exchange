'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Truck,
  X,
  Upload,
  ImagePlus,
  PlayCircle,
  Trash2,
  UserCheck,
  Sparkles,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  MapPin,
  Eye,
  Camera,
  LayoutGrid,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  TrendingUp,
  Handshake,
} from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import { useTranslation } from '@/hooks/useTranslation';
import { useToastStore } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import ListingRtoFields from '@/components/sell/ListingRtoFields';
import { ApiFillBox, ApiFillLegend } from '@/components/ui/ApiFillBadge';
import {
  buildListingRtoDetails,
  emptyListingRtoForm,
  hasListingRtoInput,
  sanitizeListingRtoForm,
  validateListingRtoForm,
  type ListingRtoFormState,
} from '@/lib/listingRtoForm';
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
import {
  getProviderVehicleIdentityMismatch,
  getVehicleVerificationButtonState,
  getVehicleVerificationSubmitValidationError,
  mapProviderVehicleToListing,
  type VehicleVerificationSource,
} from '@/lib/sellVehicleVerification';
import { getListingSaveResponse } from '@/lib/listingSaveResponse';
import { getSellVehicleSampleMedia } from '@/lib/sellVehicleSampleMedia.mjs';
import { getListingVerificationDisplay } from '@/lib/listingVerificationDisplay.mjs';
import { isAuthenticationFailure, isUsableAuthToken } from '@/lib/authSession.mjs';
import { getListingFormValidationError } from '@/lib/listingRequirements.mjs';
import {
  MAX_IMAGE_INPUT_SIZE,
  MAX_LISTING_VIDEO_DURATION_SECONDS,
  MAX_LISTING_VIDEO_INPUT_SIZE,
  getAbsoluteFileUrl,
  type UploadedFileResult,
  uploadListingMediaToServer,
} from '@/lib/fileUpload';

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

type ListingRecord = {
  id: string;
  title: string;
  ownerName?: string | null;
  price: string;
  manufacturingYear: number;
  locationState: string;
  locationCity: string;
  status: string;
  createdAt: string;
  brand?: { id?: string; name: string };
  model?: { id?: string; name: string };
  category?: { id: string; name: string };
  condition?: string;
  operatingHours?: string;
  description?: string;
  additionalDescription?: string;
  grossPower?: string;
  engineNumber?: string | null;
  isNegotiable?: boolean;
  address?: string | null;
  media: Array<{
    id: string;
    url: string;
    type: string;
    slot?: string | null;
    isFeatured: boolean;
  }>;
  vehicleVerification?: {
    verificationRecordId?: string | null;
    verificationSource?: VehicleVerificationSource | null;
    verifiedRegistrationNumber?: string | null;
    verifiedChassisNumber?: string | null;
    verifiedEngineNumber?: string | null;
    status?: 'NOT_VERIFIED' | 'API_VERIFIED' | 'MANUALLY_MODIFIED' | 'REVERIFICATION_REQUIRED' | null;
  } | null;
  rtoRecords?: Array<{
    vehicleNumber?: string | null;
    hirePurchaseStatus: ListingRtoFormState['hirePurchaseStatus'];
    financerName?: string | null;
    taxStatus: ListingRtoFormState['taxStatus'];
    taxValidUntil?: string | null;
    fitnessStatus: ListingRtoFormState['fitnessStatus'];
    fitnessValidUntil?: string | null;
    insuranceStatus: ListingRtoFormState['insuranceStatus'];
    insuranceValidUntil?: string | null;
    pucStatus: ListingRtoFormState['pucStatus'];
    pucValidUntil?: string | null;
    hsrpStatus: ListingRtoFormState['hsrpStatus'];
    hsrpNumber?: string | null;
    rtoOffice?: string | null;
    rtoAgentName?: string | null;
    rtoExpenses?: number | string;
    vehicleMaintenanceCost?: number | string;
    hourRunning?: number | null;
  }>;
};

type ChassisVerificationResponse = {
  success: boolean;
  record?: { id?: string | null };
  result?: Record<string, unknown>;
  cacheHit?: boolean;
};

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

type ChassisVerificationStatus = 'UNVERIFIED' | 'VERIFYING' | 'VERIFIED' | 'FAILED';

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

export type EditableListing = {
  id: string;
  title?: string | null;
  ownerName?: string | null;
  price?: string | number | null;
  manufacturingYear?: number | null;
  address?: string | null;
  locationState?: string | null;
  locationCity?: string | null;
  status?: string | null;
  category?: { id?: string; name?: string | null } | null;
  brand?: { id?: string; name?: string | null } | null;
  model?: { id?: string; name?: string | null } | null;
  condition?: string | null;
  operatingHours?: string | number | null;
  description?: string | null;
  additionalDescription?: string | null;
  grossPower?: string | null;
  engineNumber?: string | null;
  isNegotiable?: boolean;
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
  media?: Array<{
    id: string;
    url: string;
    type: string;
    slot?: string | null;
    isFeatured: boolean;
  }>;
  rtoRecords?: ListingRecord['rtoRecords'];
  vehicleVerification?: {
    verificationRecordId?: string | null;
    verificationSource?: VehicleVerificationSource | null;
    verifiedRegistrationNumber?: string | null;
    verifiedChassisNumber?: string | null;
    verifiedEngineNumber?: string | null;
    status?: 'NOT_VERIFIED' | 'API_VERIFIED' | 'MANUALLY_MODIFIED' | 'REVERIFICATION_REQUIRED' | null;
  } | null;
};

type ModalTabKey = 'equipment' | 'rto' | 'media' | 'pricing' | 'sale' | 'all';

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

const fieldClassName =
  'w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:ring-1 focus:ring-[#FFC107]';

const normalizeMasterName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const findMasterOption = <T extends { id: string | number; name: string }>(options: T[], value: string) => {
  const normalized = normalizeMasterName(value);
  if (!normalized) return null;
  return options.find((option) => normalizeMasterName(option.name) === normalized) || null;
};

const formatCurrency = (value: string | number) => {
  const numericValue = typeof value === 'number' ? value : Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numericValue || 0);
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

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.response?.data?.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
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

export default function SellVehicleModal({
  isOpen,
  onClose,
  listingToEdit,
}: {
  isOpen: boolean;
  onClose: () => void;
  listingToEdit?: EditableListing | null;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ListingFormState>(initialForm);
  const [modalTab, setModalTab] = useState<ModalTabKey>('equipment');
  const [sampleGuideSlot, setSampleGuideSlot] = useState<MediaSlotKey | null>(null);
  const [guideLanguage, setGuideLanguage] = useState<'both' | 'en' | 'hi'>('both');
  const modalFormRef = useRef<HTMLFormElement | null>(null);
  const soldSectionRef = useRef<HTMLDivElement | null>(null);
  const buyerNameInputRef = useRef<HTMLInputElement | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [listings, setListings] = useState<ListingRecord[]>([]);
  const [mediaState, setMediaState] = useState<MediaSlotState>(createEmptyMediaState);
  const [previewState, setPreviewState] = useState<MediaPreviewState>(createEmptyPreviewState);
  const [saving, setSaving] = useState(false);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [chassisVerificationStatus, setChassisVerificationStatus] = useState<ChassisVerificationStatus>('UNVERIFIED');
  const [verifiedChassisNumber, setVerifiedChassisNumber] = useState('');
  const [verifiedRegistrationNumber, setVerifiedRegistrationNumber] = useState('');
  const [vehicleVerificationSource, setVehicleVerificationSource] = useState<VehicleVerificationSource | ''>('');
  const [verificationLoadingSource, setVerificationLoadingSource] = useState<VehicleVerificationSource | ''>('');
  const [chassisVerificationId, setChassisVerificationId] = useState('');
  const [listingVerificationPolicy, setListingVerificationPolicy] = useState<ListingVerificationPolicyResponse['vehicleListingVerification'] | null>(null);
  const chassisVerificationRequestRef = useRef(0);
  const originalChassisNumberRef = useRef('');
  const [viewListing, setViewListing] = useState<ListingRecord | null>(null);
  const [deleteListingRecord, setDeleteListingRecord] = useState<ListingRecord | null>(null);
  const showToast = useToastStore((state) => state.showToast);
  const { token, user, hasHydrated, setAuthModalOpen } = useAuthStore();
  const imageUploadHelper = `${t('sellModal.autoCompressed', 'Auto-compressed')} ${Math.round(MAX_IMAGE_INPUT_SIZE / (1024 * 1024))}MB max`;
  const videoUploadHelper = `${t('sellModal.autoOptimizedVideo', 'Auto-compressed video (muted).')} Max ${Math.round(MAX_LISTING_VIDEO_INPUT_SIZE / (1024 * 1024))}MB, ${MAX_LISTING_VIDEO_DURATION_SECONDS}s`;

  const localizedAvailability = (value: string) => {
    switch (value.toUpperCase()) {
      case 'AVAILABLE':
        return 'Available';
      case 'SOLD':
        return 'Sold Vehicle';
      case 'PENDING':
        return 'Pending Moderation';
      case 'RESERVED':
        return 'Reserved';
      default:
        return value;
    }
  };
  const localizedCondition = (value: string) => t(`machineDetails.conditionOptions.${value}`, value);
  const localizedFuelType = (value: string) => t(`machineDetails.fuelOptions.${value}`, value);
  const localizedStatus = (value: string) => {
    const upper = value.toUpperCase();
    if (upper === 'DRAFT') return t('sellModal.status.saved', 'Saved Draft');
    const knownStatuses = ['PUBLISHED', 'PAUSED', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'RESERVED', 'SOLD'];
    return knownStatuses.includes(upper) ? t(`sellModal.status.${upper}`, upper) : upper;
  };

  useEffect(() => {
    if (!isOpen || !hasHydrated) {
      return;
    }

    let cancelled = false;

    const loadPageData = async () => {
      try {
        const [categoryResult, brandResult, listingResult, countriesResult, verificationPolicyResult] = await Promise.allSettled([
          api.get<{ data: CategoryOption[] }>('/master/categories'),
          api.get<{ data: Option[] }>('/master/brands'),
          token ? api.get<{ listings: ListingRecord[] }>('/listings') : Promise.resolve(null),
          api.get<Option[]>('/locations/countries'),
          token ? api.get<ListingVerificationPolicyResponse>('/listings/verification-policy') : Promise.resolve(null),
        ]);

        if (cancelled) {
          return;
        }

        if (categoryResult.status === 'fulfilled') {
          setCategories(categoryResult.value.data.data || []);
        } else {
          throw categoryResult.reason;
        }

        if (brandResult.status === 'fulfilled') {
          setBrands(brandResult.value.data.data || []);
        } else {
          setBrands([]);
        }

        if (listingResult.status === 'fulfilled' && listingResult.value) {
          setListings(listingResult.value.data.listings || []);
        } else {
          setListings([]);
        }

        if (verificationPolicyResult.status === 'fulfilled' && verificationPolicyResult.value) {
          const policy = verificationPolicyResult.value.data.vehicleListingVerification;
          setListingVerificationPolicy({
            ...policy,
            chassisEnabled: policy.chassisEnabled ?? policy.enabled,
            registrationEnabled: policy.registrationEnabled ?? false,
            chassisRequired: policy.chassisRequired ?? policy.required,
            registrationRequired: policy.registrationRequired ?? false,
          });
        } else {
          setListingVerificationPolicy(null);
        }

        if (countriesResult.status === 'fulfilled') {
          const india = countriesResult.value.data.find((c) => c.name === 'India');
          if (india) {
            const statesResult = await api.get<Option[]>(`/locations/states/${india.id}`);
            setStates(statesResult.data);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : t('sellModal.loadDataFailed', 'Failed to load form metadata.'));
        }
      }
    };

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, isOpen, t, token]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen]);

  const [buyerCities, setBuyerCities] = useState<Option[]>([]);

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

    return () => {
      cancelled = true;
    };
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

    return () => {
      cancelled = true;
    };
  }, [form.selectedBuyerStateId]);

  function resetFormState() {
    chassisVerificationRequestRef.current += 1;
    originalChassisNumberRef.current = '';
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
    setSampleGuideSlot(null);
  }

  const openEditModal = useCallback((listing: EditableListing) => {
    chassisVerificationRequestRef.current += 1;
    setMessage('');
    setError('');
    setModalTab('equipment');
    setSampleGuideSlot(null);

    const parsedDetails = parseListingDescription(listing.description);
    originalChassisNumberRef.current = parsedDetails.chassisOrSerialNo;
    const linkedRto = listing.rtoRecords?.[0];
    const buyerStateName = listing.saleRecord?.buyerState || '';
    const initialBuyerStateId =
      states.find((option) => option.name.toLowerCase() === buyerStateName.toLowerCase())?.id
        ? String(states.find((option) => option.name.toLowerCase() === buyerStateName.toLowerCase())?.id)
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
      ownerName: listing.ownerName || parsedDetails.ownerName || '',
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
      buyerState: buyerStateName,
      soldPrice: listing.saleRecord?.soldPrice ? String(listing.saleRecord.soldPrice) : String(listing.price || ''),
      soldAt: listing.saleRecord?.soldAt ? new Date(listing.saleRecord.soldAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
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

    const savedVerification = listing.vehicleVerification;
    const hasReusableVerification = Boolean(
      savedVerification?.verificationRecordId
      && ['API_VERIFIED', 'MANUALLY_MODIFIED'].includes(savedVerification.status || ''),
    );
    setChassisVerificationStatus(hasReusableVerification ? 'VERIFIED' : 'UNVERIFIED');
    setVerifiedChassisNumber(hasReusableVerification ? savedVerification?.verifiedChassisNumber || parsedDetails.chassisOrSerialNo : '');
    setVerifiedRegistrationNumber(hasReusableVerification ? savedVerification?.verifiedRegistrationNumber || parsedDetails.registrationNo : '');
    setVehicleVerificationSource(hasReusableVerification ? savedVerification?.verificationSource || 'CHASSIS' : '');
    setChassisVerificationId(hasReusableVerification ? savedVerification?.verificationRecordId || '' : '');

    const { nextMediaState, nextPreviewState } = buildMediaPreviewState(listing.media || []);

    setMediaState(nextMediaState);
    setPreviewState(nextPreviewState);
    setEditingListingId(listing.id);
  }, [states]);

  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        if (listingToEdit) {
          openEditModal(listingToEdit);
        } else {
          resetFormState();
        }
      });
    }
  }, [isOpen, listingToEdit, openEditModal]);

  useEffect(() => {
    if (!isOpen || form.currentAvailability !== 'SOLD') {
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
  }, [form.currentAvailability, isOpen]);

  const closeModal = () => {
    if (saving || uploadingCount > 0) {
      return;
    }

    resetFormState();
    onClose();
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
      [key]: typeof value === 'string' ? sanitizeListingFieldValue(String(key), value) : value,
    }));
  };

  const updateRtoField = <K extends keyof ListingRtoFormState>(key: K, value: ListingRtoFormState[K]) => {
    setForm((current) => ({ ...current, rtoDetails: { ...current.rtoDetails, [key]: value } }));
  };

  const handleChassisVerification = async () => {
    if (listingVerificationPolicy?.chassisEnabled !== true) {
      setError('Chassis verification is currently disabled. Enter the vehicle details manually or use vehicle number verification.');
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
      const response = await api.post<ChassisVerificationResponse>('/chassis-to-rc/verify', {
        chassis_number: chassisNumber,
      });
      if (requestId !== chassisVerificationRequestRef.current) {
        return;
      }

      const verificationRecordId = response.data.record?.id || '';
      if (!response.data.success || !verificationRecordId) {
        throw new Error('Vehicle verification did not return a usable verification record.');
      }

      const result = response.data.result || {};
      const mapped = mapProviderVehicleToListing(result);
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
        rtoDetails: {
          ...current.rtoDetails,
          ...mapped.rtoDetails,
        },
      }));
      setVerifiedChassisNumber(mapped.chassisOrSerialNo || chassisNumber);
      setVerifiedRegistrationNumber(mapped.registrationNo);
      setVehicleVerificationSource('CHASSIS');
      setChassisVerificationId(verificationRecordId);
      setChassisVerificationStatus('VERIFIED');
      setMessage(response.data.cacheHit ? 'Vehicle verification loaded from the recent secure result.' : 'Vehicle verified. Available details have been auto-filled.');
    } catch (verificationError) {
      if (requestId !== chassisVerificationRequestRef.current) {
        return;
      }

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
      setError('Vehicle number verification is currently disabled. Enter the vehicle details manually or use chassis verification.');
      return;
    }

    const registrationNumber = form.registrationNo.trim();
    if (!registrationNumber) {
      setChassisVerificationStatus('FAILED');
      setError('Enter a vehicle number before verification.');
      return;
    }

    const requestId = ++chassisVerificationRequestRef.current;
    setVerificationLoadingSource('RC_FULL');
    setChassisVerificationStatus('VERIFYING');
    setError('');
    setMessage('');

    try {
      const response = await api.post<ChassisVerificationResponse>('/listings/vehicle-verification/rc-full', {
        id_number: registrationNumber,
      });
      if (requestId !== chassisVerificationRequestRef.current) return;

      const verificationRecordId = response.data.record?.id || '';
      if (!response.data.success || !verificationRecordId) {
        throw new Error('Vehicle verification did not return a usable verification record.');
      }

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
      setError(getApiErrorMessage(verificationError, 'Vehicle verification failed. Please check the vehicle number and try again.'));
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
    let shouldCloseAfterSave = false;

    if (!hasHydrated) {
      setError(t('sellModal.verifySession', 'Please verify your session.'));
      return;
    }

    if (!token || !user || !isUsableAuthToken(token)) {
      if (token && !isUsableAuthToken(token)) {
        useAuthStore.getState().logout();
      }
      setError(t('sellModal.signInRequired', 'Please sign in to proceed.'));
      setAuthModalOpen(true, 'login');
      return;
    }

    const vehicleVerificationRequired = listingVerificationPolicy?.required === true;
    const vehicleVerificationError = getVehicleVerificationSubmitValidationError({
      required: vehicleVerificationRequired,
      source: vehicleVerificationSource,
      currentRegistrationNumber: form.registrationNo,
      currentChassisNumber: form.chassisOrSerialNo,
      verifiedRegistrationNumber,
      verifiedChassisNumber,
      verifiedSource: vehicleVerificationSource,
    });
    if (vehicleVerificationError || (vehicleVerificationRequired && !chassisVerificationId)) {
      const safeError = vehicleVerificationError || 'Verify the current vehicle identity before posting this vehicle.';
      setError(safeError);
      showToast({
        title: t('sellModal.notSubmitted', 'Not Submitted'),
        description: safeError,
        variant: 'error',
      });
      return;
    }

    const sanitizedForm = sanitizeListingFormData(form);

    const mediaRequirementError = getListingFormValidationError({
      category: sanitizedForm.category,
      brand: sanitizedForm.brand,
      imageCount: mediaSlots.filter((slot) => slot.kind === 'image' && mediaState[slot.key]).length,
      hasVideo: Boolean(mediaState['walkaround-video']),
    });
    if (mediaRequirementError) {
      setError(mediaRequirementError);
      showToast({
        title: t('sellModal.notSubmitted', 'Not Submitted'),
        description: mediaRequirementError,
        variant: 'error',
      });
      return;
    }

    const validationError = !sanitizedForm.price || Number(sanitizedForm.price) <= 0
      ? 'Price is required and must be greater than 0.'
      : !isValidDigitsOnlyValue(sanitizedForm.price)
        ? 'Price must contain digits only.'
        : !sanitizedForm.state.trim()
          ? 'State is required.'
          : !sanitizedForm.city.trim()
            ? 'City is required.'
            : !sanitizedForm.address.trim()
              ? 'Address is required.'
              : !sanitizedForm.pinCode.trim()
                ? 'PIN Code is required.'
                : !isValidPinCodeValue(sanitizedForm.pinCode) || sanitizedForm.pinCode.length !== 6
                  ? (t('sellModal.pinValidation') || 'PIN code must be a valid 6-digit number.')
                  : !sanitizedForm.nearbyLandmark.trim()
                    ? 'Nearby Landmark is required.'
                    : !isValidYearValue(sanitizedForm.manufacturingYear)
                      ? 'Manufacturing year must be a 4-digit year.'
                      : !isValidDigitsOnlyValue(sanitizedForm.operatingHours)
                        ? 'Operating hours must contain digits only.'
                        : !isValidDateValue(sanitizedForm.registrationDate) || !isValidDateValue(sanitizedForm.registrationUpto)
                          ? 'Registration dates must be valid calendar dates.'
                          : sanitizedForm.registrationDate && sanitizedForm.registrationUpto && sanitizedForm.registrationDate > sanitizedForm.registrationUpto
                            ? 'Registration upto cannot be before the registration date.'
                          : !isValidDigitsOnlyValue(sanitizedForm.previousOwners)
                            ? 'Previous owners must contain digits only.'
                            : null;
    if (validationError) {
      setError(validationError);
      setForm(sanitizedForm);
      showToast({
        title: t('sellModal.notSubmitted', 'Not Submitted'),
        description: validationError,
        variant: 'error',
      });
      return;
    }

    const sanitizedRto = sanitizeListingRtoForm(sanitizedForm.rtoDetails);
    if (sanitizedRto.insuranceStatus !== 'VALID') {
      sanitizedForm.insuranceExpiry = '';
    }
    const rtoBase = {
      registrationNo: sanitizedForm.registrationNo,
      vehicleType: categories.find((item) => item.id === sanitizedForm.category)?.name || '',
      vehicleModel: sanitizedForm.model,
      operatingHours: sanitizedForm.operatingHours,
      insuranceExpiry: sanitizedForm.insuranceExpiry,
    };
    const shouldSyncRto = !editingListingId || hasListingRtoInput(sanitizedRto);
    const rtoValidationError = shouldSyncRto ? validateListingRtoForm(sanitizedRto, rtoBase) : null;
    if (rtoValidationError) {
      setError(rtoValidationError);
      setForm({ ...sanitizedForm, rtoDetails: sanitizedRto });
      return;
    }

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
        chassisOrSerialNo: sanitizedForm.chassisOrSerialNo,
        ownerName: sanitizedForm.ownerName,
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
        ...(shouldSyncRto ? { rtoDetails: buildListingRtoDetails(sanitizedRto, rtoBase) } : {}),
      };

      if (['AVAILABLE', 'SOLD'].includes(sanitizedForm.currentAvailability)) {
        payload.status = availabilityToListingStatus(sanitizedForm.currentAvailability);
      }

      if (sanitizedForm.currentAvailability === 'SOLD') {
        if (!sanitizedForm.buyerName.trim()) {
          throw new Error(t('sellModal.buyerNameRequired', 'Buyer name is required for sold vehicles.'));
        }
        if (!sanitizedForm.buyerPhone.trim()) {
          throw new Error(t('sellModal.buyerPhoneRequired', 'Buyer phone is required for sold vehicles.'));
        }
        if (!sanitizedForm.soldPrice || Number(sanitizedForm.soldPrice) <= 0) {
          throw new Error(t('sellModal.soldPriceRequired', 'Final sold price is required.'));
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
        const shouldSyncAvailability = ['AVAILABLE', 'SOLD'].includes(sanitizedForm.currentAvailability);
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
      const savedCategory = response.data.listing.category;
      const savedBrand = response.data.listing.brand;
      if (savedCategory?.id && savedCategory.name) {
        setCategories((current) => current.some((item) => item.id === savedCategory.id)
          ? current
          : [...current, { id: savedCategory.id, name: savedCategory.name }]);
      }
      if (savedBrand?.id && savedBrand.name) {
        const savedBrandId = savedBrand.id;
        setBrands((current) => current.some((item) => String(item.id) === String(savedBrandId))
          ? current
          : [...current, { id: savedBrandId, name: savedBrand.name }]);
      }
      const successMessage =
        response.data.message || (editingListingId ? t('sellModal.updatedSuccessfully', 'Vehicle listing updated successfully.') : t('sellModal.postedSuccessfully', 'Vehicle listing submitted successfully.'));
      setMessage(successMessage);
      showToast({
        title: editingListingId ? t('sellModal.vehicleUpdated', 'Vehicle Updated') : t('sellModal.vehicleSubmitted', 'Vehicle Submitted'),
        description: successMessage,
        variant: 'success',
      });
      resetFormState();
      shouldCloseAfterSave = true;
    } catch (submitError) {
      const isSessionExpired = axios.isAxiosError(submitError) && isAuthenticationFailure(submitError);
      if (isSessionExpired) {
        useAuthStore.getState().logout();
        setAuthModalOpen(true, 'login');
      }
      const submitErrorMessage = isSessionExpired
        ? t('sellModal.signInRequired', 'Please sign in to proceed.')
        : getApiErrorMessage(
          submitError,
          editingListingId ? t('sellModal.updateFailed', 'Failed to update vehicle.') : t('sellModal.postFailed', 'Failed to post vehicle.')
        );
      setError(submitErrorMessage);
      showToast({
        title: editingListingId ? t('sellModal.vehicleUpdateFailed', 'Update Failed') : t('sellModal.vehicleSubmitFailed', 'Submit Failed'),
        description: submitErrorMessage,
        variant: 'error',
      });
    } finally {
      setSaving(false);

      if (shouldCloseAfterSave) {
        onClose();
      }
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
      if (viewListing?.id === deleteListingRecord.id) {
        setViewListing(null);
      }
      setMessage(response.data.message || t('sellModal.deletedSuccessfully', 'Listing deleted successfully.'));
      setDeleteListingRecord(null);
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, t('sellModal.deleteFailed', 'Failed to delete listing.')));
    } finally {
      setDeletingListingId(null);
    }
  };

  const chassisButtonState = getVehicleVerificationButtonState('CHASSIS', verificationLoadingSource, vehicleVerificationSource);
  // Fields that RC / chassis verification can fill carry the AI badge; solid once actually filled.
  const vehicleVerificationFilled = chassisVerificationStatus === 'VERIFIED';
  const vehicleApiFill = listingVerificationPolicy?.enabled ? { source: 'RC / chassis verification', filled: vehicleVerificationFilled } : null;
  const registrationApiFill = listingVerificationPolicy?.chassisEnabled ? { source: 'chassis verification', filled: vehicleVerificationFilled && vehicleVerificationSource === 'CHASSIS' } : null;
  const chassisApiFill = listingVerificationPolicy?.registrationEnabled ? { source: 'registration (RC) verification', filled: vehicleVerificationFilled && vehicleVerificationSource === 'RC_FULL' } : null;
  const registrationButtonState = getVehicleVerificationButtonState('RC_FULL', verificationLoadingSource, vehicleVerificationSource);

  const editingListingRecord = editingListingId
    ? (listingToEdit?.id === editingListingId ? listingToEdit : listings.find((item) => item.id === editingListingId) || null)
    : null;
  const editingVerification = getListingVerificationDisplay(editingListingRecord?.vehicleVerification?.status);

  return (
    <>
      {isOpen && (() => {
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
          <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
            <div className="relative flex h-[100dvh] sm:h-auto sm:max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
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
              <form ref={modalFormRef} onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 sm:py-4 space-y-4">
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
                          aria-describedby={listingVerificationPolicy?.enabled ? 'sell-vehicle-verification-status' : undefined}
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
                        <p id="sell-vehicle-verification-status" className={`text-[10px] font-medium truncate ${registrationButtonState.isVerified ? 'text-emerald-600' : chassisVerificationStatus === 'FAILED' ? 'text-red-600' : 'text-gray-400'}`}>
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
                          aria-describedby={listingVerificationPolicy?.enabled ? 'sell-chassis-verification-status' : undefined}
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
                        <p id="sell-chassis-verification-status" className={`text-[10px] font-medium truncate ${chassisButtonState.isVerified ? 'text-emerald-600' : chassisVerificationStatus === 'FAILED' ? 'text-red-600' : 'text-gray-400'}`}>
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

                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                      {t(
                        'sellModal.adminPricingNote',
                        'Your listing goes live after admin approval. The admin can add the JCB Exchange margin and expenses (transport, paperwork, RTO) to your price, so buyers will see the final price. You can see the full breakdown in My Listings.',
                      )}
                    </p>

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
                          <span>Buyer & Sale Record (Confidential)</span>
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
                <div className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-3 sm:-mb-4 mt-4 border-t border-gray-200 bg-white px-4 sm:px-5 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-20">
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    {error ? (
                      <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 max-w-full sm:max-w-md">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        <span className="truncate">{error}</span>
                      </div>
                    ) : modalTab !== 'all' ? (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                        <span className="rounded-full bg-amber-100 text-amber-900 border border-amber-300/60 px-2 py-0.5 text-[10px] font-bold">
                          Step {activeTabIndex + 1} of {tabKeys.length}
                        </span>
                        <span className="font-bold text-gray-800 text-xs truncate max-w-[200px]">
                          {modalTabs[activeTabIndex]?.label}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
                    {modalTab !== 'all' && (
                      <>
                        <button
                          type="button"
                          onClick={handlePrevTab}
                          disabled={activeTabIndex <= 0}
                          className="h-10 sm:h-[34px] px-3 inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          <span>Prev</span>
                        </button>

                        {activeTabIndex < tabKeys.length - 1 && (
                          <button
                            type="button"
                            onClick={handleNextTab}
                            className="h-10 sm:h-[34px] px-3.5 inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer shrink-0"
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
                      className="h-10 sm:h-[34px] px-3.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer shrink-0"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={saving || uploadingCount > 0}
                      className="flex-1 sm:flex-none h-10 sm:h-[34px] px-4 rounded-lg bg-[#FFC107] text-xs font-bold text-gray-950 shadow-xs hover:bg-[#E5AD06] transition flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer whitespace-nowrap"
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

      {viewListing ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{viewListing.title}</h2>
                <p className="text-sm text-gray-500">{viewListing.brand?.name} {viewListing.model?.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewListing(null)}
                className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-6">
              {(() => {
                const parsedDetails = parseListingDescription(viewListing.description);
                const brandModel = [viewListing.brand?.name, viewListing.model?.name].filter(Boolean).join(' ');
                const availability = listingStatusToAvailability(viewListing.status);
                const summaryCards = [
                  { label: t('sellModal.price', 'Price'), value: formatCurrency(viewListing.price) + (viewListing.isNegotiable ? ' (Negotiable)' : '') },
                  { label: t('sellModal.statusLabel', 'Status'), value: localizedStatus(viewListing.status) },
                  { label: t('sellModal.availabilityLabel', 'Availability'), value: localizedAvailability(availability) },
                  { label: t('sellModal.year', 'Year'), value: String(viewListing.manufacturingYear || 'N/A') },
                  { label: t('sellModal.condition', 'Condition'), value: viewListing.condition || 'N/A' },
                  { label: t('sellModal.operatingHoursLabel', 'Hours'), value: viewListing.operatingHours ? String(viewListing.operatingHours) : 'N/A' },
                ];

                return (
                  <>
                    <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {summaryCards.map((item) => (
                        <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{item.label}</p>
                          <p className="mt-1 text-lg font-bold text-gray-900">{item.value}</p>
                        </div>
                      ))}
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('sellModal.vehicleName', 'Vehicle Name')}</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{viewListing.title}</p>
                        <p className="mt-1 text-sm text-gray-600">{brandModel || 'N/A'}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('sellModal.location', 'Location')}</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{viewListing.locationCity}, {viewListing.locationState}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('sellModal.category', 'Category')}</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{viewListing.category?.name || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="mb-8 grid gap-6 lg:grid-cols-2">
                      <section className="rounded-2xl border border-gray-100 bg-white p-5">
                        <h3 className="text-base font-bold text-gray-900">{t('sellModal.registrationIdentity', 'Registration & Identity')}</h3>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <DetailItem label={t('sellModal.variant', 'Variant')} value={parsedDetails.variant || 'N/A'} />
                          <DetailItem label={t('sellModal.registrationDate', 'Registration Date')} value={parsedDetails.registrationDate || parsedDetails.registrationYear || 'N/A'} />
                          <DetailItem label={t('sellModal.registrationUpto', 'Registration Upto')} value={parsedDetails.registrationUpto || 'N/A'} />
                          <DetailItem label={t('sellModal.registrationNumber', 'Registration No.')} value={viewListing.rtoRecords?.[0]?.vehicleNumber || parsedDetails.registrationNo || 'N/A'} />
                          <DetailItem label="Owner Name" value={viewListing.ownerName || parsedDetails.ownerName || 'N/A'} />
                          <DetailItem label={t('sellModal.chassisSerialNumber', 'Chassis/Serial No.')} value={parsedDetails.chassisOrSerialNo || 'N/A'} />
                          <DetailItem
                            label={t('sellModal.engineNumber', 'Engine Number')}
                            value={viewListing.engineNumber || viewListing.vehicleVerification?.verifiedEngineNumber || parsedDetails.engineNumber || 'N/A'}
                          />
                          <DetailItem label={t('sellModal.previousOwners', 'Owners')} value={parsedDetails.previousOwners || 'N/A'} />
                          <DetailItem label={t('sellModal.insuranceExpiry', 'Insurance Expiry')} value={viewListing.rtoRecords?.[0] && viewListing.rtoRecords[0].insuranceStatus !== 'VALID' ? 'N/A' : parsedDetails.insuranceExpiry || 'N/A'} />
                        </div>
                      </section>

                      <section className="rounded-2xl border border-gray-100 bg-white p-5">
                        <h3 className="text-base font-bold text-gray-900">{t('sellModal.mechanicalLocation', 'Location & Mechanics')}</h3>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <DetailItem label={t('sellModal.fuelType', 'Fuel Type')} value={parsedDetails.fuelType || 'N/A'} />
                          {parsedDetails.transmission ? <DetailItem label={t('sellModal.transmission', 'Transmission')} value={parsedDetails.transmission} /> : null}
                          <DetailItem label={t('sellModal.grossPower', 'Power')} value={viewListing.grossPower || 'N/A'} />
                          <DetailItem label={t('sellModal.address', 'Address')} value={viewListing.address || parsedDetails.address || parsedDetails.district || 'N/A'} />
                          <DetailItem label={t('sellModal.pinCode', 'PIN Code')} value={parsedDetails.pinCode || 'N/A'} />
                          <DetailItem label={t('sellModal.nearbyLandmark', 'Landmark')} value={parsedDetails.nearbyLandmark || 'N/A'} />
                        </div>
                      </section>
                    </div>

                    {(parsedDetails.rawDescription || viewListing.description || viewListing.additionalDescription) && (
                      <div className="mb-8 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                        <h3 className="text-base font-bold text-gray-900">{t('sellModal.description', 'Description')}</h3>
                        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-700">
                          {parsedDetails.rawDescription || viewListing.description || 'No description provided.'}
                        </p>
                        {viewListing.additionalDescription && (
                          <>
                            <h4 className="mt-6 text-sm font-bold text-gray-900">{t('sellModal.additionalDescription', 'Additional Description')}</h4>
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-700">
                              {viewListing.additionalDescription}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              <h3 className="mb-4 text-lg font-bold text-gray-900">Media ({viewListing.media.length})</h3>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {viewListing.media.map((m) => (
                  <div key={m.id} className="relative aspect-video overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                    {m.type === 'VIDEO' ? (
                      <video src={getAbsoluteFileUrl(m.url)} controls muted playsInline className="h-full w-full object-contain" />
                    ) : (
                      <a href={getAbsoluteFileUrl(m.url)} target="_blank" rel="noreferrer" className="group block h-full w-full">
                        <Image
                          src={getAbsoluteFileUrl(m.url)}
                          alt="Media"
                          fill
                          unoptimized
                          className="object-contain transition-opacity group-hover:opacity-90"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
                          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-black opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                            View Full
                          </span>
                        </div>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteListingRecord && (
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
    </>
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

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
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
  const { token, setAuthModalOpen } = useAuthStore();
  const sampleMedia = getSellVehicleSampleMedia(slotKey);
  const hasUploadedPreview = Boolean(previewUrl);

  const handleChange = async (file?: File) => {
    if (!file) return;

    if (!token || !isUsableAuthToken(token)) {
      if (token && !isUsableAuthToken(token)) {
        useAuthStore.getState().logout();
      }
      setError('Please sign in to upload photos or videos.');
      setAuthModalOpen(true, 'login');
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
      if (axios.isAxiosError(uploadError) && isAuthenticationFailure(uploadError)) {
        setError('Session expired. Please sign in again.');
        useAuthStore.getState().logout();
        setAuthModalOpen(true, 'login');
        return;
      }
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
