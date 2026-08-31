'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Truck, X, Upload, ImagePlus, PlayCircle, Pencil, Trash2, MoreVertical, Eye, UserCheck, ChevronDown } from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import { useTranslation } from '@/hooks/useTranslation';
import {
  MAX_IMAGE_INPUT_SIZE,
  MAX_LISTING_VIDEO_DURATION_SECONDS,
  MAX_LISTING_VIDEO_INPUT_SIZE,
  getAbsoluteFileUrl,
  type UploadedFileResult,
  uploadListingMediaToServer,
} from '@/lib/fileUpload';
import { generateAdminListingDetailPath } from '@/lib/routePaths';

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
  views?: number;
  partner?: {
    role?: string | null;
    partnerProfile?: {
      partnerType?: string | null;
    } | null;
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

const availabilityBadgeClassName: Record<string, string> = {
  AVAILABLE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  RESERVED: 'border-blue-200 bg-blue-50 text-blue-700',
  SOLD: 'border-rose-200 bg-rose-50 text-rose-700',
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
const videoUploadHelper = `Max ${Math.round(MAX_LISTING_VIDEO_INPUT_SIZE / (1024 * 1024))}MB`;

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

const isApprovalPendingStatus = (value?: string | null) =>
  ['PENDING_APPROVAL', 'CHANGES_REQUESTED'].includes((value || '').toUpperCase());

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

const getCoverMedia = (listing: ListingRecord) =>
  listing.media.find((item) => item.isFeatured && item.type === 'IMAGE') ||
  listing.media.find((item) => item.type === 'IMAGE') ||
  null;

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
    <div ref={containerRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full sm:w-auto h-10 flex items-center justify-between sm:justify-start gap-2 rounded-full border border-gray-300 bg-white px-4 text-xs font-bold text-gray-700 outline-none transition hover:border-gray-400 hover:bg-gray-100/70 shadow-xs cursor-pointer"
      >
        <span className="truncate">{selectedOption?.label || 'All Availability'}</span>
        <ChevronDown size={14} className={`text-gray-500 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-full sm:w-56 max-h-60 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
          <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-gray-400 border-b border-gray-100 mb-1">
            Filter Availability
          </div>
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
                className={`w-full text-left rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${isSelected
                    ? 'bg-gray-100 text-gray-950 font-extrabold'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                {opt.label}
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
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  disabled?: boolean;
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
        <div className="absolute left-0 mt-1 z-50 min-w-[120px] rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
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
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<ListingFormState>(initialForm);
  const modalFormRef = useRef<HTMLFormElement | null>(null);
  const soldSectionRef = useRef<HTMLDivElement | null>(null);
  const buyerNameInputRef = useRef<HTMLInputElement | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [buyerCities, setBuyerCities] = useState<Option[]>([]);
  const [listings, setListings] = useState<ListingRecord[]>([]);
  const [mediaState, setMediaState] = useState<MediaSlotState>(createEmptyMediaState);
  const [previewState, setPreviewState] = useState<MediaPreviewState>(createEmptyPreviewState);
  const [loadingListings, setLoadingListings] = useState(true);

  const openListingDetails = (listing: ListingRecord) => {
    router.push(generateAdminListingDetailPath('/partner/listings', listing));
  };

  const [saving, setSaving] = useState(false);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL');
  const { t } = useTranslation();
  const localizedCondition = (value: string) => t(`listingDetails.conditionOptions.${value}`, value);
  const localizedFuelType = (value: string) => t(`listingDetails.fuelOptions.${value}`, value);
  const localizedTransmission = (value: string) => t(`listingDetails.transmissionOptions.${value}`, value);

  const [deleteListingRecord, setDeleteListingRecord] = useState<ListingRecord | null>(null);
  const [updatingAvailabilityIds, setUpdatingAvailabilityIds] = useState<string[]>([]);
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);

  const refreshListings = async () => {
    const response = await api.get<{ listings: ListingRecord[] }>('/listings');
    setListings(response.data.listings || []);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.action-dropdown-container')) {
        setOpenActionDropdownId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [openActionDropdownId]);

  useEffect(() => {
    let cancelled = false;

    const loadPageData = async () => {
      try {
        const [categoryResponse, brandResponse, listingResponse, countriesResult] = await Promise.allSettled([
          api.get<{ data: CategoryOption[] }>('/master/categories'),
          api.get<{ data: Option[] }>('/master/brands'),
          api.get<{ listings: ListingRecord[] }>('/listings'),
          api.get<Option[]>('/locations/countries'),
        ]);

        if (cancelled) {
          return;
        }

        if (categoryResponse.status === 'fulfilled') {
          setCategories(categoryResponse.value.data.data || []);
        } else {
          throw categoryResponse.reason;
        }

        if (brandResponse.status === 'fulfilled') {
          setBrands(brandResponse.value.data.data || []);
        } else {
          setBrands([]);
        }

        if (listingResponse.status === 'fulfilled') {
          setListings(listingResponse.value.data.listings || []);
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

  const dynamicAvailabilityOptions = useMemo(() => {
    const uniqueStatuses = new Set<string>();
    listings.forEach((listing) => {
      const avail = listingStatusToAvailability(listing.status);
      if (avail) {
        uniqueStatuses.add(avail);
      }
    });

    const options: { value: string; label: string }[] = [
      { value: 'ALL', label: 'All Availability' },
    ];

    uniqueStatuses.forEach((status) => {
      const count = listings.filter((l) => listingStatusToAvailability(l.status) === status).length;
      options.push({
        value: status,
        label: `${localizedAvailability(status)} (${count})`,
      });
    });

    return options;
  }, [listings]);

  const filteredListings = useMemo(() => {
    let result = listings;
    if (availabilityFilter !== 'ALL') {
      result = result.filter((listing) => listingStatusToAvailability(listing.status) === availabilityFilter);
    }

    const query = search.trim().toLowerCase();
    if (!query) {
      return result;
    }

    return result.filter((listing) => {
      const parsedDetails = parseListingDescription(listing.description);
      const haystack = [
        listing.title,
        listing.brand?.name,
        listing.model?.name,
        listing.category?.name,
        listing.locationCity,
        listing.locationState,
        listing.condition,
        listing.description,
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
  }, [listings, search, availabilityFilter]);



  const openModal = () => {
    setMessage('');
    setError('');
    setForm(initialForm);
    setMediaState(createEmptyMediaState());
    setPreviewState(createEmptyPreviewState());
    setEditingListingId(null);
    setIsModalOpen(true);
  };

  const populateEditForm = (listing: ListingRecord) => {
    setMessage('');
    setError('');
    setEditingListingId(listing.id);
    const parsedDetails = parseListingDescription(listing.description);
    const buyerStateName = listing.saleRecord?.buyerState || '';
    const matchedBuyerState = states.find((s) => s.name.toLowerCase() === buyerStateName.toLowerCase());
    const initialBuyerStateId = matchedBuyerState ? String(matchedBuyerState.id) : '';

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
    });

    const { nextMediaState, nextPreviewState } = buildMediaPreviewState(listing.media || []);

    setMediaState(nextMediaState);
    setPreviewState(nextPreviewState);
    setIsModalOpen(true);
  };

  const openEditModal = async (listing: ListingRecord) => {
    try {
      const response = await api.get<{ listing: ListingRecord }>(`/listings/${listing.id}`);
      populateEditForm(response.data.listing || listing);
    } catch {
      populateEditForm(listing);
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
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

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
          throw new Error('Buyer Name is required when marking a vehicle as SOLD.');
        }
        if (!form.buyerPhone.trim()) {
          throw new Error('Buyer Mobile Number is required when marking a vehicle as SOLD.');
        }
        if (!form.soldPrice || Number(form.soldPrice) <= 0) {
          throw new Error('Final Sold Price (₹) is required when marking a vehicle as SOLD.');
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

      await refreshListings();
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-end gap-4">
        <div className="flex flex-col gap-3 w-full sm:flex-row sm:items-center sm:justify-end">
          <AvailabilityFilterDropdown
            value={availabilityFilter}
            onChange={setAvailabilityFilter}
            options={dynamicAvailabilityOptions}
          />
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search listings by title, model or brand..."
              className="w-full rounded-full border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            />
          </div>
          <button
            onClick={openModal}
            className="flex items-center justify-center gap-2 rounded-full bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-[#E5AD06]"
          >
            <Plus size={18} />
            Add Vehicle
          </button>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'
            }`}
        >
          {error || message}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {loadingListings ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading your listings...</div>
        ) : filteredListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
              <Truck size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No listings found</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              You haven&apos;t added any vehicles or machinery yet. Click &quot;Add Vehicle&quot; to create your first listing.
            </p>
            <button
              onClick={openModal}
              className="mt-6 flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06]"
            >
              <Plus size={18} />
              Add Vehicle
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[300px] pb-16">
            <table className="w-full text-left text-sm text-gray-600 border-collapse">
              <thead className="bg-gray-50 uppercase text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] tracking-wide">Vehicle Name</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] tracking-wide">Model</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] tracking-wide">Category</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] tracking-wide">Price</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] tracking-wide">Year</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] tracking-wide">Location</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] tracking-wide">Fuel Type</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] tracking-wide text-center">Availability</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-[11px] tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredListings.map((listing) => {
                  const cover = getCoverMedia(listing);
                  const parsedDetails = parseListingDescription(listing.description);
                  const availability = listingStatusToAvailability(listing.status);
                  const isUpdatingAvailability = updatingAvailabilityIds.includes(listing.id);
                  const isApprovalPending = isApprovalPendingStatus(listing.status);
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
                          <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded bg-gray-100 border border-gray-200">
                              {cover ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={getAbsoluteFileUrl(cover.url)}
                                  alt={listing.title}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                              <div className="flex h-full w-full items-center justify-center text-gray-400">
                                <Truck className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <span className="font-semibold text-gray-900 text-xs line-clamp-2 max-w-[150px] leading-tight" title={listing.title}>
                            {listing.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-medium">
                        {[listing.brand?.name, listing.model?.name].filter(Boolean).join(' ') || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-gray-100 border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                          {listing.category?.name || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900 text-xs">{formatCurrency(listing.price)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-medium">{listing.manufacturingYear || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-medium">
                        {listing.locationCity ? `${listing.locationCity}, ${listing.locationState}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-medium">
                        {parsedDetails.fuelType || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <TableAvailabilityDropdown
                            value={availability}
                            onChange={(val) => void handleUpdateAvailability(listing.id, val)}
                            options={isApprovalPending ? ['PENDING'] : editableAvailabilityTypes}
                            disabled={isUpdatingAvailability || isApprovalPending}
                          />
                          <span className="min-h-[14px] text-[10px] text-gray-400">
                            {isApprovalPending ? 'Awaiting admin approval' : isUpdatingAvailability ? 'Updating...' : ' '}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-block text-left action-dropdown-container">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenActionDropdownId(openActionDropdownId === listing.id ? null : listing.id);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 transition-colors ml-auto"
                          >
                            <MoreVertical className="h-5 w-5 text-gray-500" />
                          </button>

                          {openActionDropdownId === listing.id && (
                            <div className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-left">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenActionDropdownId(null);
                                  openListingDetails(listing);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                              >
                                <Eye className="h-4 w-4 text-gray-400" />
                                View Details
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenActionDropdownId(null);
                                  openEditModal(listing);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                              >
                                <Pencil className="h-4 w-4 text-gray-400" />
                                Edit Listing
                              </button>

                              {!isProtectedListing(listing) && (
                                <>
                                  <div className="my-1 h-px bg-gray-100" />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setOpenActionDropdownId(null);
                                      setDeleteListingRecord(listing);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                    Delete Listing
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                      <input value={form.grossPower} onChange={(event) => updateField('grossPower', event.target.value)} className={fieldClassName} placeholder="e.g. 76 hp (56 kW)" />
                    </Field>
                    <Field label="Manufacture Year">
                      <input type="number" value={form.manufacturingYear} onChange={(event) => updateField('manufacturingYear', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Registration Year">
                      <input type="number" value={form.registrationYear} onChange={(event) => updateField('registrationYear', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Registration No.">
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
                        options={(form.currentAvailability === 'PENDING' ? ['PENDING'] : editableAvailabilityTypes).map(opt => ({ id: opt, name: opt }))}
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
                        placeholder="Select availability"
                        searchable={false}
                        className="bg-[#F8FAFC]"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {form.currentAvailability === 'PENDING'
                          ? 'This listing is waiting for approval. Super admin or an authorized employee will publish it after review.'
                          : 'Availability changes apply to already approved listings only.'}
                      </p>
                    </Field>
                  </div>

                  {form.currentAvailability === 'SOLD' && (
                    <div ref={soldSectionRef} className="mt-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-4">
                      <div className="flex items-center gap-2 text-rose-900 border-b border-rose-200/60 pb-2">
                        <UserCheck className="h-4 w-4 text-rose-600" />
                        <h4 className="text-xs font-bold uppercase tracking-wider">Buyer & Sale Record (Confidential)</h4>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
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
                            placeholder={form.selectedBuyerStateId ? "Select buyer city" : "Select state first"}
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
                    <Field label="District">
                      <input value={form.district} onChange={(event) => updateField('district', event.target.value)} className={fieldClassName} />
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
          {uploading ? <span className="mt-1 text-[11px] text-[#9a7600]">Uploading...</span> : null}
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
