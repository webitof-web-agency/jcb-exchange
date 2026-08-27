'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Truck, X, Upload, ImagePlus, PlayCircle, Trash2, UserCheck } from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import { useTranslation } from '@/hooks/useTranslation';
import { useToastStore } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
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
  district: string;
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
};

type CategoryOption = {
  id: string;
  name: string;
};

type ListingRecord = {
  id: string;
  title: string;
  price: string;
  manufacturingYear: number;
  locationState: string;
  locationCity: string;
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
  media: Array<{
    id: string;
    url: string;
    type: string;
    slot?: string | null;
    isFeatured: boolean;
  }>;
};

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
  district: string;
  pinCode: string;
  nearbyLandmark: string;
  insuranceExpiry: string;
};

export type EditableListing = {
  id: string;
  title?: string | null;
  price?: string | number | null;
  manufacturingYear?: number | null;
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
  district: '',
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
const editableAvailabilityTypes = ['AVAILABLE', 'RESERVED', 'SOLD'];

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
    form.district ? `District: ${form.district}` : '',
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
  const modalFormRef = useRef<HTMLFormElement | null>(null);
  const soldSectionRef = useRef<HTMLDivElement | null>(null);
  const buyerNameInputRef = useRef<HTMLInputElement | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [, setListings] = useState<ListingRecord[]>([]);
  const [mediaState, setMediaState] = useState<MediaSlotState>(createEmptyMediaState);
  const [previewState, setPreviewState] = useState<MediaPreviewState>(createEmptyPreviewState);
  const [saving, setSaving] = useState(false);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [viewListing, setViewListing] = useState<ListingRecord | null>(null);
  const [deleteListingRecord, setDeleteListingRecord] = useState<ListingRecord | null>(null);
  const showToast = useToastStore((state) => state.showToast);
  const { token, user, hasHydrated, setAuthModalOpen } = useAuthStore();
  const imageUploadHelper = `${t('sellModal.autoCompressed')} ${Math.round(MAX_IMAGE_INPUT_SIZE / (1024 * 1024))}MB ${t('sellModal.inputMaxSuffix')}`;
  const videoUploadHelper = `${t('sellModal.maxLabel')} ${Math.round(MAX_LISTING_VIDEO_INPUT_SIZE / (1024 * 1024))}MB ${t('sellModal.andLabel')} ${MAX_LISTING_VIDEO_DURATION_SECONDS} ${t('sellModal.secondsShort')}`;
  const localizedMediaLabels: Record<MediaSlotKey, string> = {
    'front-view': t('sellModal.mediaSlots.frontView'),
    'rear-view': t('sellModal.mediaSlots.rearView'),
    'left-side': t('sellModal.mediaSlots.leftSide'),
    'right-side': t('sellModal.mediaSlots.rightSide'),
    'front-left-angle': t('sellModal.mediaSlots.frontLeftAngle'),
    'front-right-angle': t('sellModal.mediaSlots.frontRightAngle'),
    'rear-left-angle': t('sellModal.mediaSlots.rearLeftAngle'),
    'rear-right-angle': t('sellModal.mediaSlots.rearRightAngle'),
    'chassis-number': t('sellModal.mediaSlots.chassisNumber'),
    'meter-reading': t('sellModal.mediaSlots.meterReading'),
    'dashboard-front': t('sellModal.mediaSlots.dashboardFront'),
    'dashboard-left': t('sellModal.mediaSlots.dashboardLeft'),
    'dashboard-right': t('sellModal.mediaSlots.dashboardRight'),
    'walkaround-video': t('sellModal.mediaSlots.walkaroundVideo'),
  };
  const localizedAvailability = (value: string) => t(`sellModal.availability.${value}`);
  const localizedCondition = (value: string) => t(`machineDetails.conditionOptions.${value}`, value);
  const localizedFuelType = (value: string) => t(`machineDetails.fuelOptions.${value}`, value);
  const localizedTransmission = (value: string) => t(`machineDetails.transmissionOptions.${value}`, value);
  const localizedStatus = (value: string) => {
    const upper = value.toUpperCase();
    if (upper === 'DRAFT') return t('sellModal.status.saved');
    const knownStatuses = ['PUBLISHED', 'PAUSED', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'RESERVED', 'SOLD'];
    return knownStatuses.includes(upper) ? t(`sellModal.status.${upper}`) : upper;
  };

  useEffect(() => {
    if (!isOpen || !hasHydrated) {
      return;
    }

    let cancelled = false;

    const loadPageData = async () => {
      try {
        const [categoryResult, brandResult, listingResult, countriesResult] = await Promise.allSettled([
          api.get<{ data: CategoryOption[] }>('/master/categories'),
          api.get<{ data: Option[] }>('/master/brands'),
          token ? api.get<{ listings: ListingRecord[] }>('/listings') : Promise.resolve(null),
          api.get<Option[]>('/locations/countries'),
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

        if (countriesResult.status === 'fulfilled') {
          const india = countriesResult.value.data.find((c) => c.name === 'India');
          if (india) {
            const statesResult = await api.get<Option[]>(`/locations/states/${india.id}`);
            setStates(statesResult.data);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : t('sellModal.loadDataFailed'));
        }
      } finally {
        if (!cancelled) {
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



  function resetFormState() {
    setMessage('');
    setError('');
    setForm(initialForm);
    setMediaState(createEmptyMediaState());
    setPreviewState(createEmptyPreviewState());
    setEditingListingId(null);
  }

  const openEditModal = useCallback((listing: EditableListing) => {
    setMessage('');
    setError('');

    const parsedDetails = parseListingDescription(listing.description);
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
      registrationYear: parsedDetails.registrationYear,
      registrationNo: parsedDetails.registrationNo,
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
      district: parsedDetails.district,
      city: listing.locationCity || '',
      pinCode: parsedDetails.pinCode,
      nearbyLandmark: parsedDetails.nearbyLandmark,
      description: parsedDetails.rawDescription,
      additionalDescription: listing.additionalDescription || '',
      grossPower: listing.grossPower || '',
      isNegotiable: Boolean(listing.isNegotiable),
      insuranceExpiry: parsedDetails.insuranceExpiry,
      selectedStateId: '', // To be handled optimally if we only have names
      selectedCityId: '',
      buyerName: listing.saleRecord?.buyerName || '',
      buyerPhone: listing.saleRecord?.buyerPhone || '',
      buyerCity: listing.saleRecord?.buyerCity || '',
      buyerState: buyerStateName,
      soldPrice: listing.saleRecord?.soldPrice ? String(listing.saleRecord.soldPrice) : String(listing.price || ''),
      soldAt: listing.saleRecord?.soldAt ? new Date(listing.saleRecord.soldAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      selectedBuyerStateId: initialBuyerStateId,
      selectedBuyerCityId: '',
    });

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
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    let shouldCloseAfterSave = false;

    if (!hasHydrated) {
      setError(t('sellModal.verifySession'));
      return;
    }

    if (!token || !user) {
      setError(t('sellModal.signInRequired'));
      setAuthModalOpen(true);
      return;
    }

    const validationError = form.pinCode.trim() && !/^\d{6}$/.test(form.pinCode.trim())
      ? t('sellModal.pinValidation')
      : null;
    if (validationError) {
      setError(validationError);
      showToast({
        title: t('sellModal.notSubmitted'),
        description: validationError,
        variant: 'error',
      });
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
        categoryId: form.category,
        brandName: form.brand,
        modelName: form.model,
        title: form.title || `${form.brand} ${form.model}`.trim(),
        price: form.price,
        manufacturingYear: form.manufacturingYear,
        operatingHours: form.operatingHours,
        locationState: form.state,
        locationCity: form.city,
        condition: form.condition,
        description: buildListingDescription(form),
        additionalDescription: form.additionalDescription,
        grossPower: form.grossPower,
        isNegotiable: form.isNegotiable,
        media: uploadedMedia,
      };

      if (form.currentAvailability !== 'PENDING') {
        payload.status = availabilityToListingStatus(form.currentAvailability);
      }

      if (form.currentAvailability === 'SOLD') {
        if (!form.buyerName.trim()) {
          throw new Error(t('sellModal.buyerNameRequired'));
        }
        if (!form.buyerPhone.trim()) {
          throw new Error(t('sellModal.buyerPhoneRequired'));
        }
        if (!form.soldPrice || Number(form.soldPrice) <= 0) {
          throw new Error(t('sellModal.soldPriceRequired'));
        }

        payload.buyerDetails = {
          buyerName: form.buyerName.trim(),
          buyerPhone: form.buyerPhone.trim(),
          buyerCity: form.buyerCity.trim() || undefined,
          buyerState: form.buyerState.trim() || undefined,
          soldPrice: form.soldPrice,
          soldAt: form.soldAt || new Date().toISOString().split('T')[0],
        };
      }

      let response;

      if (editingListingId) {
        const updateResponse = await api.put<{ listing: ListingRecord; message: string }>(`/listings/${editingListingId}`, payload);
        const shouldSyncAvailability = form.currentAvailability !== 'PENDING';

        if (shouldSyncAvailability) {
          response = await api.patch<{ listing: ListingRecord; message: string }>(`/listings/${editingListingId}/availability`, {
            status: availabilityToListingStatus(form.currentAvailability),
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
      const successMessage =
        response.data.message || (editingListingId ? t('sellModal.updatedSuccessfully') : t('sellModal.postedSuccessfully'));
      setMessage(successMessage);
      showToast({
        title: editingListingId ? t('sellModal.vehicleUpdated') : t('sellModal.vehicleSubmitted'),
        description: successMessage,
        variant: 'success',
      });
      resetFormState();
      shouldCloseAfterSave = true;
    } catch (submitError) {
      const submitErrorMessage = getApiErrorMessage(
        submitError,
        editingListingId ? t('sellModal.updateFailed') : t('sellModal.postFailed')
      );
      setError(submitErrorMessage);
      showToast({
        title: editingListingId ? t('sellModal.vehicleUpdateFailed') : t('sellModal.vehicleSubmitFailed'),
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
      setMessage(response.data.message || t('sellModal.deletedSuccessfully'));
      setDeleteListingRecord(null);
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, t('sellModal.deleteFailed')));
    } finally {
      setDeletingListingId(null);
    }
  };

  return (
    <>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{editingListingId ? t('sellModal.editVehicle') : t('sellModal.addVehicle')}</h2>
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
                {message ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {message}
                  </div>
                ) : null}
                <section className="rounded-2xl border border-gray-200 p-5">
                  <div className="mb-4 flex items-center gap-2 text-gray-900">
                    <Truck className="h-4 w-4" />
                    <h3 className="text-base font-semibold">{t('sellModal.equipmentDetails')}</h3>
                  </div>
                  <div className="mb-4">
                    <Field label={t('sellModal.vehicleName')}>
                      <input
                        value={form.title}
                        onChange={(event) => updateField('title', event.target.value)}
                        className={fieldClassName}
                        placeholder={t('sellModal.vehicleNamePlaceholder')}
                      />
                    </Field>
                    <p className="mt-1 text-xs text-gray-500">
                      {t('sellModal.vehicleNameHelp')}
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field label={t('sellModal.category')}>
                      <select value={form.category} onChange={(event) => updateField('category', event.target.value)} className={fieldClassName}>
                        <option value="">{t('sellModal.selectCategory')}</option>
                        {categories.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t('sellModal.brand')}>
                      <SearchableSelect
                        options={brands}
                        value={form.brand}
                        displayValue={form.brand}
                        onChange={(option) => updateField('brand', option.name)}
                        placeholder={t('sellModal.selectBrand')}
                        searchPlaceholder={t('sellModal.searchOptions')}
                        noResultsText={t('sellModal.noResults')}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label={t('sellModal.model')}>
                      <input value={form.model} onChange={(event) => updateField('model', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label={t('sellModal.variant')}>
                      <input value={form.variant} onChange={(event) => updateField('variant', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label={t('sellModal.grossPower')}>
                      <input value={form.grossPower} onChange={(event) => updateField('grossPower', event.target.value)} className={fieldClassName} placeholder={t('sellModal.grossPowerPlaceholder')} />
                    </Field>
                    <Field label={t('sellModal.manufactureYear')}>
                      <input type="number" value={form.manufacturingYear} onChange={(event) => updateField('manufacturingYear', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label={t('sellModal.registrationYear')}>
                      <input type="number" value={form.registrationYear} onChange={(event) => updateField('registrationYear', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label={t('sellModal.registrationNumber')}>
                      <input value={form.registrationNo} onChange={(event) => updateField('registrationNo', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label={t('sellModal.insuranceExpiryDate')}>
                      <input type="date" value={form.insuranceExpiry} onChange={(event) => updateField('insuranceExpiry', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label={t('sellModal.chassisSerialNumber')}>
                      <input value={form.chassisOrSerialNo} onChange={(event) => updateField('chassisOrSerialNo', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label={t('sellModal.meterReading')}>
                      <input value={form.operatingHours} onChange={(event) => updateField('operatingHours', event.target.value)} className={fieldClassName} placeholder={t('sellModal.meterReadingPlaceholder')} />
                    </Field>
                    <Field label={t('sellModal.numberOfOwners')}>
                      <input type="number" value={form.previousOwners} onChange={(event) => updateField('previousOwners', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label={t('sellModal.condition')}>
                      <SearchableSelect
                        options={conditions.map((option) => ({ id: option, name: localizedCondition(option) }))}
                        value={form.condition}
                        onChange={(opt) => updateField('condition', String(opt.id))}
                        placeholder={t('sellModal.selectCondition')}
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label={t('sellModal.fuelType')}>
                      <SearchableSelect
                        options={fuelTypes.map((option) => ({ id: option, name: localizedFuelType(option) }))}
                        value={form.fuelType}
                        onChange={(opt) => updateField('fuelType', String(opt.id))}
                        placeholder={t('sellModal.selectFuelType')}
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label={t('sellModal.transmission')}>
                      <SearchableSelect
                        options={transmissions.map((option) => ({ id: option, name: localizedTransmission(option) }))}
                        value={form.transmission}
                        onChange={(opt) => updateField('transmission', String(opt.id))}
                        placeholder={t('sellModal.selectTransmission')}
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label={t('sellModal.currentAvailability')}>
                      <SearchableSelect
                        options={(form.currentAvailability === 'PENDING' ? ['PENDING'] : editableAvailabilityTypes).map((option) => ({ id: option, name: localizedAvailability(option) }))}
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
                        disabled={form.currentAvailability === 'PENDING'}
                        placeholder={t('sellModal.currentAvailability')}
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {form.currentAvailability === 'PENDING'
                          ? t('sellModal.pendingAvailabilityHelp')
                          : t('sellModal.availabilityHelp')}
                      </p>
                    </Field>
                  </div>

                  {form.currentAvailability === 'SOLD' && (
                    <div ref={soldSectionRef} className="mt-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-4">
                      <div className="flex items-center gap-2 text-rose-900 border-b border-rose-200/60 pb-2">
                        <UserCheck className="h-4 w-4 text-rose-600" />
                        <h4 className="text-xs font-bold uppercase tracking-wider">{t('sellModal.buyerRecordTitle')}</h4>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={t('sellModal.buyerName')}>
                          <input
                            ref={buyerNameInputRef}
                            type="text"
                            value={form.buyerName}
                            onChange={(event) => updateField('buyerName', event.target.value)}
                            placeholder={t('sellModal.buyerNamePlaceholder')}
                            className={fieldClassName}
                          />
                        </Field>

                        <Field label={t('sellModal.buyerPhone')}>
                          <input
                            type="tel"
                            value={form.buyerPhone}
                            onChange={(event) => updateField('buyerPhone', event.target.value)}
                            placeholder={t('sellModal.buyerPhonePlaceholder')}
                            className={fieldClassName}
                          />
                        </Field>

                        <Field label={t('sellModal.finalSoldPrice')}>
                          <input
                            type="number"
                            value={form.soldPrice}
                            onChange={(event) => updateField('soldPrice', event.target.value)}
                            placeholder="e.g. 2450000"
                            className={fieldClassName}
                          />
                        </Field>

                        <Field label={t('sellModal.saleDate')}>
                          <input
                            type="date"
                            value={form.soldAt}
                            onChange={(event) => updateField('soldAt', event.target.value)}
                            className={fieldClassName}
                          />
                        </Field>

                        <Field label={t('sellModal.buyerState')}>
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
                            placeholder={t('sellModal.selectState')}
                            className="bg-[#F8FAFC]"
                          />
                        </Field>

                        <Field label={t('sellModal.buyerCity')}>
                          <SearchableSelect
                            options={form.selectedBuyerStateId ? buyerCities : []}
                            value={form.selectedBuyerCityId || form.buyerCity}
                            displayValue={form.buyerCity}
                            onChange={(option) => {
                              updateField('buyerCity', option.name);
                              updateField('selectedBuyerCityId', String(option.id));
                            }}
                            placeholder={form.selectedBuyerStateId ? t('sellModal.selectCity') : t('sellModal.selectStateFirst')}
                            disabled={!form.selectedBuyerStateId}
                            className="bg-[#F8FAFC]"
                          />
                        </Field>
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-gray-200 p-5">
                  <div className="mb-4 flex items-center gap-2 text-gray-900">
                    <Upload className="h-4 w-4" />
                    <h3 className="text-base font-semibold">{t('sellModal.mediaUploads')}</h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {mediaSlots.map((slot) => (
                      <ListingMediaUploadBox
                        key={slot.key}
                        label={localizedMediaLabels[slot.key]}
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
                        }
                        }
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
                    <h3 className="text-base font-semibold">{t('sellModal.priceAndLocation')}</h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field label={t('sellModal.price')}>
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
                        <span className="text-sm font-medium text-gray-700">{t('sellModal.priceNegotiable')}</span>
                      </label>
                    </div>
                    <Field label={t('sellModal.state')}>
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
                        placeholder={t('sellModal.selectState')}
                        searchPlaceholder={t('sellModal.searchOptions')}
                        noResultsText={t('sellModal.noResults')}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label={t('sellModal.district')}>
                      <input value={form.district} onChange={(event) => updateField('district', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label={t('sellModal.city')}>
                      <SearchableSelect
                        options={cities}
                        value={form.selectedCityId || form.city}
                        displayValue={form.city}
                        onChange={(option) => {
                          updateField('city', option.name);
                          updateField('selectedCityId', String(option.id));
                        }}
                        placeholder={form.selectedStateId ? t('sellModal.selectCity') : t('sellModal.selectStateFirst')}
                        searchPlaceholder={t('sellModal.searchOptions')}
                        noResultsText={t('sellModal.noResults')}
                        disabled={!form.selectedStateId}
                        className="bg-[#F8FAFC]"
                      />
                    </Field>
                    <Field label={t('sellModal.pinCode')}>
                      <input value={form.pinCode} onChange={(event) => updateField('pinCode', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label={t('sellModal.nearbyLandmark')}>
                      <input value={form.nearbyLandmark} onChange={(event) => updateField('nearbyLandmark', event.target.value)} className={fieldClassName} />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label={t('sellModal.description')}>
                      <textarea
                        value={form.description}
                        onChange={(event) => updateField('description', event.target.value)}
                        rows={4}
                        className={fieldClassName}
                        placeholder={t('sellModal.descriptionPlaceholder')}
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label={t('sellModal.additionalDescription')}>
                      <textarea
                        value={form.additionalDescription}
                        onChange={(event) => updateField('additionalDescription', event.target.value)}
                        rows={4}
                        className={fieldClassName}
                        placeholder={t('sellModal.additionalDescriptionPlaceholder')}
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
                      {t('sellModal.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={saving || uploadingCount > 0}
                      className="rounded-lg bg-[#FFC107] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? (editingListingId ? t('sellModal.updating') : t('sellModal.posting')) : uploadingCount > 0 ? t('sellModal.waitingForUploads') : editingListingId ? t('sellModal.update') : t('sellModal.post')}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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
                  { label: t('sellModal.price'), value: formatCurrency(viewListing.price) + (viewListing.isNegotiable ? ` (${t('sellModal.negotiable')})` : '') },
                  { label: t('sellModal.statusLabel'), value: localizedStatus(viewListing.status) },
                  { label: t('sellModal.availabilityLabel'), value: localizedAvailability(availability) },
                  { label: t('sellModal.year'), value: String(viewListing.manufacturingYear || t('sellModal.na')) },
                  { label: t('sellModal.condition'), value: viewListing.condition || t('sellModal.na') },
                  { label: t('sellModal.operatingHoursLabel'), value: viewListing.operatingHours ? String(viewListing.operatingHours) : t('sellModal.na') },
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
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('sellModal.vehicleName')}</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{viewListing.title}</p>
                        <p className="mt-1 text-sm text-gray-600">{brandModel || t('sellModal.na')}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('sellModal.location')}</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{viewListing.locationCity}, {viewListing.locationState}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('sellModal.category')}</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{viewListing.category?.name || t('sellModal.na')}</p>
                      </div>
                    </div>

                    <div className="mb-8 grid gap-6 lg:grid-cols-2">
                      <section className="rounded-2xl border border-gray-100 bg-white p-5">
                        <h3 className="text-base font-bold text-gray-900">{t('sellModal.registrationIdentity')}</h3>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <DetailItem label={t('sellModal.variant')} value={parsedDetails.variant || t('sellModal.na')} />
                          <DetailItem label={t('sellModal.registrationYear')} value={parsedDetails.registrationYear || t('sellModal.na')} />
                          <DetailItem label={t('sellModal.registrationNumber')} value={parsedDetails.registrationNo || t('sellModal.na')} />
                          <DetailItem label={t('sellModal.chassisSerialNumber')} value={parsedDetails.chassisOrSerialNo || t('sellModal.na')} />
                          <DetailItem label={t('sellModal.previousOwners')} value={parsedDetails.previousOwners || t('sellModal.na')} />
                          <DetailItem label={t('sellModal.insuranceExpiry')} value={parsedDetails.insuranceExpiry || t('sellModal.na')} />
                        </div>
                      </section>

                      <section className="rounded-2xl border border-gray-100 bg-white p-5">
                        <h3 className="text-base font-bold text-gray-900">{t('sellModal.mechanicalLocation')}</h3>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <DetailItem label={t('sellModal.fuelType')} value={parsedDetails.fuelType || t('sellModal.na')} />
                          <DetailItem label={t('sellModal.transmission')} value={parsedDetails.transmission || t('sellModal.na')} />
                          <DetailItem label={t('sellModal.grossPower')} value={viewListing.grossPower || t('sellModal.na')} />
                          <DetailItem label={t('sellModal.district')} value={parsedDetails.district || t('sellModal.na')} />
                          <DetailItem label={t('sellModal.pinCode')} value={parsedDetails.pinCode || t('sellModal.na')} />
                          <DetailItem label={t('sellModal.nearbyLandmark')} value={parsedDetails.nearbyLandmark || t('sellModal.na')} />
                        </div>
                      </section>
                    </div>

                    {(parsedDetails.rawDescription || viewListing.description || viewListing.additionalDescription) && (
                      <div className="mb-8 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                        <h3 className="text-base font-bold text-gray-900">{t('sellModal.description')}</h3>
                        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-700">
                          {parsedDetails.rawDescription || viewListing.description || t('sellModal.noDescription')}
                        </p>
                        {viewListing.additionalDescription && (
                          <>
                            <h4 className="mt-6 text-sm font-bold text-gray-900">{t('sellModal.additionalDescription')}</h4>
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

              <h3 className="mb-4 text-lg font-bold text-gray-900">{t('sellModal.mediaCount', { count: viewListing.media.length })}</h3>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {viewListing.media.map((m) => (
                  <div key={m.id} className="relative aspect-video overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                    {m.type === 'VIDEO' ? (
                      <video src={getAbsoluteFileUrl(m.url)} controls className="h-full w-full object-contain" />
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
                            {t('sellModal.viewFull')}
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">{t('sellModal.deleteListing')}</h3>
            <p className="mt-2 text-sm text-gray-500">
              {t('sellModal.deleteListingConfirm', { title: deleteListingRecord.title })}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteListingRecord(null)}
                disabled={deletingListingId === deleteListingRecord.id}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                {t('sellModal.cancel')}
              </button>
              <button
                onClick={() => void handleDeleteListing()}
                disabled={deletingListingId === deleteListingRecord.id}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {deletingListingId === deleteListingRecord.id ? t('sellModal.deleting') : t('sellModal.delete')}
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
  const { token, setAuthModalOpen } = useAuthStore();
  const { t } = useTranslation();

  const handleChange = async (file?: File) => {
    if (!file) {
      return;
    }

    if (!token) {
      setError(t('sellModal.signInToUpload'));
      setAuthModalOpen(true);
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
      if (axios.isAxiosError(uploadError) && (uploadError.response?.status === 401 || uploadError.response?.status === 403)) {
        setError(t('sellModal.uploadSessionExpired'));
        setAuthModalOpen(true);
        return;
      }

      setError(uploadError instanceof Error ? uploadError.message : t('sellModal.uploadSelectedFileFailed'));
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
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">{t('sellModal.preview')}</span>
            </div>
          </div>
        ) : null}

        <div className={`relative z-20 flex flex-col items-center ${previewUrl ? 'rounded-lg bg-white/90 px-3 py-2 shadow-sm' : ''}`}>
          <Upload className="mb-2 h-5 w-5 text-gray-400" />
          <span className="text-center text-xs font-medium text-gray-600">{label}</span>
          {uploadedFile ? (
            <span className="mt-1 text-center text-[11px] text-gray-500">
              {kind === 'video'
                ? uploadedFile.originalName || `${t('sellModal.maxLabel')} ${MAX_LISTING_VIDEO_DURATION_SECONDS} ${t('sellModal.secondsShort')}`
                : `${t('sellModal.maxLabel')} ${Math.round(MAX_IMAGE_INPUT_SIZE / (1024 * 1024))}MB`}
            </span>
          ) : null}
          {uploading ? <span className="mt-1 text-[11px] text-[#9a7600]">{t('sellModal.uploading')}</span> : null}
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
            {t('sellModal.remove')}
          </button>
        ) : null}
      </div>

      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}





