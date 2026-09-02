'use client';

import Image from 'next/image';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Fuel,
  Hash,
  ImageIcon,
  Info,
  MapPin,
  Pencil,
  Settings,
  ShieldCheck,
  Tag,
  Truck,
  Wrench,
  AlertCircle,
  Save,
  Upload,
  X,
  UserCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import api from '@/lib/api';
import SafeRemoteImage from '@/components/ui/SafeRemoteImage';
import {
  getAbsoluteFileUrl,
  MAX_IMAGE_INPUT_SIZE,
  MAX_LISTING_VIDEO_INPUT_SIZE,
  uploadListingMediaToServer,
  type UploadedFileResult,
} from '@/lib/fileUpload';
import { formatPortalCurrency, formatPortalDateTime, formatPortalLabel } from '@/lib/partnerPortal';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/permissionUtils';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import { useHeaderStore } from '@/store/headerStore';
import { resolveListingId } from '@/lib/routeResolvers';
import { generateAdminListingDetailPath } from '@/lib/routePaths';

type ListingDetail = {
  id: string;
  title: string;
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
  isNegotiable?: boolean;
  views?: number;
  partner?: {
    id: string;
    name: string;
    email: string;
    role: string;
    partnerProfile?: {
      businessName: string;
      partnerType: string;
    };
    customerPrimeSubscriptions?: Array<{ status: string }>;
  };
  registrationYear?: number;
  registrationNo?: string;
  chassisOrSerialNo?: string;
  previousOwners?: number;
  fuelType?: string;
  transmission?: string;
  insuranceExpiry?: string;
  pinCode?: string;
  nearbyLandmark?: string;
  dealer?: string;
  dealerCategory?: string;
  saleRecord?: {
    buyerName?: string;
    buyerPhone?: string;
    buyerCity?: string | null;
    buyerState?: string | null;
    soldPrice?: number | string;
    soldAt?: string;
  } | null;
  media: Array<{
    id: string;
    url: string;
    type: string;
    slot?: string | null;
    isFeatured: boolean;
  }>;
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

type DetailSection = 'header' | 'overview' | 'pricing' | 'sellerLocation' | 'technical';

type PendingMediaUpload = UploadedFileResult & {
  previewType: 'IMAGE' | 'VIDEO';
};

type ListingEditForm = {
  title: string;
  status: string;
  availability: string;
  price: string;
  isNegotiable: boolean;
  categoryId: string;
  categoryName: string;
  brandName: string;
  modelName: string;
  manufacturingYear: string;
  overview: string;
  additionalDescription: string;
  locationState: string;
  selectedStateId: string;
  locationCity: string;
  selectedCityId: string;
  district: string;
  pinCode: string;
  nearbyLandmark: string;
  condition: string;
  variant: string;
  operatingHours: string;
  fuelType: string;
  transmission: string;
  grossPower: string;
  chassisOrSerialNo: string;
  registrationNo: string;
  registrationYear: string;
  insuranceExpiry: string;
  previousOwners: string;
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
  if (!description) return parsed;

  const rawLines: string[] = [];
  for (const line of description.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!match) {
      rawLines.push(trimmed);
      continue;
    }
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    switch (key) {
      case 'variant': parsed.variant = value; break;
      case 'registration year': parsed.registrationYear = value; break;
      case 'registration no': parsed.registrationNo = value; break;
      case 'chassis/serial':
      case 'chassis / serial':
      case 'chassis or serial': parsed.chassisOrSerialNo = value; break;
      case 'owners': parsed.previousOwners = value; break;
      case 'fuel': parsed.fuelType = value; break;
      case 'transmission': parsed.transmission = value; break;
      case 'district': parsed.district = value; break;
      case 'pin':
      case 'pin code': parsed.pinCode = value; break;
      case 'landmark': parsed.nearbyLandmark = value; break;
      case 'insurance expiry': parsed.insuranceExpiry = value; break;
      case 'area': break;
      default: rawLines.push(trimmed); break;
    }
  }
  parsed.rawDescription = rawLines.join('\n');
  return parsed;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 border-gray-200',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  CHANGES_REQUESTED: 'bg-amber-100 text-amber-800 border-amber-200',
  PUBLISHED: 'bg-green-100 text-green-800 border-green-200',
  PAUSED: 'bg-slate-100 text-slate-700 border-slate-200',
  RESERVED: 'bg-blue-100 text-blue-800 border-blue-200',
  SOLD: 'bg-gray-200 text-gray-800 border-gray-300',
};

const CONDITION_OPTIONS = ['Excellent', 'Good', 'Fair', 'Needs Repair'];
const FUEL_OPTIONS = ['Diesel', 'Electric', 'Petrol', 'Hybrid', 'Other'];
const TRANSMISSION_OPTIONS = ['Manual', 'Automatic'];

const inputClassName =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20';

const textareaClassName =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20';

const imageUploadHelper = `Images up to ${Math.round(MAX_IMAGE_INPUT_SIZE / (1024 * 1024))}MB`;
const videoUploadHelper = `Videos up to ${Math.round(MAX_LISTING_VIDEO_INPUT_SIZE / (1024 * 1024))}MB`;

const resolveDealerTypeLabel = (listing: ListingDetail) => {
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

const buildListingDescription = (form: ListingEditForm) => {
  const detailLines = [
    ['Variant', form.variant],
    ['Registration Year', form.registrationYear],
    ['Registration No', form.registrationNo],
    ['Chassis / Serial', form.chassisOrSerialNo],
    ['Owners', form.previousOwners],
    ['Fuel', form.fuelType],
    ['Transmission', form.transmission],
    ['District', form.district],
    ['Pin Code', form.pinCode],
    ['Landmark', form.nearbyLandmark],
    ['Insurance Expiry', form.insuranceExpiry],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value.trim()}`);

  const overview = form.overview.trim();
  return [overview, ...detailLines].filter(Boolean).join('\n');
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data &&
    typeof error.response.data === 'object' &&
    'error' in error.response.data &&
    typeof error.response.data.error === 'string'
  ) {
    return error.response.data.error;
  }

  return fallback;
};

const listingStatusToAvailability = (value?: string | null) => {
  switch ((value || '').toUpperCase()) {
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

const availabilityToListingStatus = (availability: string, currentStatus: string) => {
  switch (availability) {
    case 'AVAILABLE':
      if (currentStatus === 'PAUSED') return 'PAUSED';
      if (currentStatus === 'DRAFT') return 'DRAFT';
      return 'PUBLISHED';
    case 'PENDING':
      if (currentStatus === 'CHANGES_REQUESTED') return 'CHANGES_REQUESTED';
      return 'PENDING_APPROVAL';
    case 'RESERVED':
      return 'RESERVED';
    case 'SOLD':
      return 'SOLD';
    default:
      return currentStatus || 'PUBLISHED';
  }
};

const createEditForm = (listing: ListingDetail): ListingEditForm => {
  const parsed = parseListingDescription(listing.description);

  return {
    title: listing.title || '',
    status: listing.status || 'DRAFT',
    availability: listingStatusToAvailability(listing.status),
    price: listing.price ? String(listing.price) : '',
    isNegotiable: Boolean(listing.isNegotiable),
    categoryId: listing.category?.id || '',
    categoryName: listing.category?.name || '',
    brandName: listing.brand?.name || '',
    modelName: listing.model?.name || '',
    manufacturingYear: listing.manufacturingYear ? String(listing.manufacturingYear) : '',
    overview: parsed.rawDescription || '',
    additionalDescription: listing.additionalDescription || '',
    locationState: listing.locationState || '',
    selectedStateId: '',
    locationCity: listing.locationCity || '',
    selectedCityId: '',
    district: parsed.district || '',
    pinCode: parsed.pinCode || '',
    nearbyLandmark: parsed.nearbyLandmark || '',
    condition: listing.condition || '',
    variant: parsed.variant || '',
    operatingHours: listing.operatingHours ? String(listing.operatingHours) : '',
    fuelType: parsed.fuelType || '',
    transmission: parsed.transmission || '',
    grossPower: listing.grossPower || '',
    chassisOrSerialNo: parsed.chassisOrSerialNo || '',
    registrationNo: parsed.registrationNo || '',
    registrationYear: parsed.registrationYear || '',
    insuranceExpiry: parsed.insuranceExpiry || '',
    previousOwners: parsed.previousOwners || '',
  };
};

const toComparableValue = (value: unknown) => String(value ?? '').trim();

const sectionHasChanges = (section: DetailSection, current: ListingEditForm, base: ListingEditForm) => {
  const fieldsBySection: Record<DetailSection, Array<keyof ListingEditForm>> = {
    header: ['title', 'availability'],
    overview: ['overview', 'additionalDescription'],
    pricing: ['price', 'isNegotiable', 'categoryId', 'categoryName', 'brandName', 'modelName', 'manufacturingYear'],
    sellerLocation: ['locationState', 'locationCity', 'district', 'pinCode', 'nearbyLandmark', 'condition'],
    technical: [
      'variant',
      'operatingHours',
      'fuelType',
      'transmission',
      'grossPower',
      'chassisOrSerialNo',
      'registrationNo',
      'registrationYear',
      'insuranceExpiry',
      'previousOwners',
    ],
  };

  return fieldsBySection[section].some((field) => toComparableValue(current[field]) !== toComparableValue(base[field]));
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  );
}

export default function ListingDetailPage({ listingId }: { listingId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const currentUserRole = user?.role;
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [form, setForm] = useState<ListingEditForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [unavailableMediaIds, setUnavailableMediaIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [savingSection, setSavingSection] = useState<DetailSection | null>(null);
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [pendingMediaUploads, setPendingMediaUploads] = useState<PendingMediaUpload[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';
  const isEmployee = currentUserRole === 'EMPLOYEE';
  const isPartner = currentUserRole === 'PARTNER';
  const canEdit =
    currentUserRole === 'PARTNER' ||
    currentUserRole === 'SUPER_ADMIN' ||
    currentUserRole === 'ADMIN' ||
    hasPermission(user?.permissions, 'listings.update');
  const backHref = isSuperAdmin ? '/superadmin/listings' : isEmployee ? '/employee/listings' : '/partner/listings';
  const effectiveSelectedStateId =
    form?.selectedStateId ||
    states.find((state) => state.name.trim().toLowerCase() === form?.locationState.trim().toLowerCase())?.id?.toString() ||
    '';

  useEffect(() => {
    const fetchListing = async () => {
      try {
        setLoading(true);
        setError(null);
        const resolvedListingId = (await resolveListingId(listingId)) || listingId;
        const res = await api.get<{ listing: ListingDetail }>(`/listings/${resolvedListingId}`);
        setListing(res.data.listing);
        setForm(createEditForm(res.data.listing));
        setUnavailableMediaIds([]);
        setActiveMediaIndex(0);
      } catch (err: unknown) {
        console.error('Failed to load listing details:', err);
        setError(getErrorMessage(err, 'Failed to load listing details.'));
      } finally {
        setLoading(false);
      }
    };

    if (listingId) {
      void fetchListing();
    }
  }, [listingId]);

  useEffect(() => {
    if (!listing) {
      return;
    }

    const canonicalPath = generateAdminListingDetailPath(backHref, listing);
    if (pathname !== canonicalPath) {
      router.replace(canonicalPath);
    }
  }, [listing, backHref, pathname, router]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    let cancelled = false;

    const loadEditDependencies = async () => {
      try {
        const [categoryRes, brandRes, countriesRes] = await Promise.all([
          api.get<{ data: Option[] }>('/master/categories'),
          api.get<{ data: Option[] }>('/master/brands'),
          api.get<Option[]>('/locations/countries'),
        ]);

        if (cancelled) {
          return;
        }

        setCategories(categoryRes.data.data || []);
        setBrands(brandRes.data.data || []);

        const india = countriesRes.data.find((item) => item.name === 'India');
        if (!india) {
          setStates([]);
          return;
        }

        const statesRes = await api.get<Option[]>(`/locations/states/${india.id}`);
        if (cancelled) {
          return;
        }

        setStates(statesRes.data || []);
      } catch (dependencyError) {
        console.error('Failed to load listing edit dependencies:', dependencyError);
      }
    };

    void loadEditDependencies();

    return () => {
      cancelled = true;
    };
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing || !effectiveSelectedStateId) {
      return;
    }

    let cancelled = false;

    api
      .get<Option[]>(`/locations/cities/${effectiveSelectedStateId}`)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setCities(response.data || []);
      })
      .catch((cityError) => {
        console.error('Failed to load cities:', cityError);
        if (!cancelled) {
          setCities([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveSelectedStateId, isEditing]);

  const sortedMedia = useMemo(() => {
    if (!listing) {
      return [];
    }

    return [...listing.media].sort((a, b) => {
      if (a.isFeatured) return -1;
      if (b.isFeatured) return 1;
      if (a.type === b.type) return 0;
      return a.type === 'IMAGE' ? -1 : 1;
    });
  }, [listing]);

  const availableMedia = useMemo(
    () => sortedMedia.filter((mediaItem) => !unavailableMediaIds.includes(mediaItem.id)),
    [sortedMedia, unavailableMediaIds]
  );
  const displayedActiveMediaIndex =
    availableMedia.length === 0 ? 0 : Math.min(activeMediaIndex, availableMedia.length - 1);
  const activeMedia = availableMedia[displayedActiveMediaIndex];

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLightboxOpen(false);
      if (e.key === 'ArrowLeft') {
        setActiveMediaIndex((prev) => (prev > 0 ? prev - 1 : availableMedia.length - 1));
      }
      if (e.key === 'ArrowRight') {
        setActiveMediaIndex((prev) => (prev < availableMedia.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, availableMedia.length]);

  useEffect(() => {
    if (isLightboxOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isLightboxOpen]);
  const parsedDetails = useMemo(() => parseListingDescription(listing?.description), [listing?.description]);
  const baseForm = useMemo(() => (listing ? createEditForm(listing) : null), [listing]);
  const hasPendingMediaChanges = pendingMediaUploads.length > 0;
  const conditionOptions = useMemo(
    () =>
      CONDITION_OPTIONS.map((condition) => ({
        value: condition,
        label: t(`listingDetails.conditionOptions.${condition}`),
      })),
    [t]
  );
  const fuelOptions = useMemo(
    () =>
      FUEL_OPTIONS.map((fuel) => ({
        value: fuel,
        label: t(`listingDetails.fuelOptions.${fuel}`),
      })),
    [t]
  );
  const transmissionOptions = useMemo(
    () =>
      TRANSMISSION_OPTIONS.map((item) => ({
        value: item,
        label: t(`listingDetails.transmissionOptions.${item}`),
      })),
    [t]
  );

  const updateForm = useCallback(<K extends keyof ListingEditForm>(field: K, value: ListingEditForm[K]) => {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  }, []);

  const markMediaUnavailable = useCallback((mediaId: string) => {
    setUnavailableMediaIds((current) => (current.includes(mediaId) ? current : [...current, mediaId]));
  }, []);

  const clearPendingMediaUploads = useCallback(() => {
    setPendingMediaUploads([]);
    if (mediaInputRef.current) {
      mediaInputRef.current.value = '';
    }
  }, []);

  const resetSection = useCallback((section: DetailSection) => {
    if (!baseForm) {
      return;
    }

    setForm((current) => {
      if (!current) {
        return current;
      }

      const next = { ...current };

      if (section === 'header') {
        next.title = baseForm.title;
        next.status = baseForm.status;
        next.availability = baseForm.availability;
      }

      if (section === 'overview') {
        next.overview = baseForm.overview;
        next.additionalDescription = baseForm.additionalDescription;
      }

      if (section === 'pricing') {
        next.price = baseForm.price;
        next.isNegotiable = baseForm.isNegotiable;
        next.categoryId = baseForm.categoryId;
        next.categoryName = baseForm.categoryName;
        next.brandName = baseForm.brandName;
        next.modelName = baseForm.modelName;
        next.manufacturingYear = baseForm.manufacturingYear;
      }

      if (section === 'sellerLocation') {
        next.locationState = baseForm.locationState;
        next.selectedStateId = baseForm.selectedStateId;
        next.locationCity = baseForm.locationCity;
        next.selectedCityId = baseForm.selectedCityId;
        next.district = baseForm.district;
        next.pinCode = baseForm.pinCode;
        next.nearbyLandmark = baseForm.nearbyLandmark;
        next.condition = baseForm.condition;
      }

      if (section === 'technical') {
        next.variant = baseForm.variant;
        next.operatingHours = baseForm.operatingHours;
        next.fuelType = baseForm.fuelType;
        next.transmission = baseForm.transmission;
        next.grossPower = baseForm.grossPower;
        next.chassisOrSerialNo = baseForm.chassisOrSerialNo;
        next.registrationNo = baseForm.registrationNo;
        next.registrationYear = baseForm.registrationYear;
        next.insuranceExpiry = baseForm.insuranceExpiry;
        next.previousOwners = baseForm.previousOwners;
      }

      return next;
    });
  }, [baseForm]);

  const saveSection = useCallback(async (section: DetailSection) => {
    if (!listing || !form || !baseForm) {
      return;
    }

    if (section === 'header' && uploadingMedia) {
      setError(t('listingDetails.waitForUpload'));
      return;
    }

    if (!sectionHasChanges(section, form, baseForm)) {
      setMessage(t('listingDetails.noChangesInSection'));
      return;
    }

    const payload: Record<string, unknown> = {};

    if (section === 'header') {
      payload.title = form.title.trim();
      payload.status = availabilityToListingStatus(form.availability, listing.status);
    }

    if (section === 'overview') {
      payload.description = buildListingDescription(form);
      payload.additionalDescription = form.additionalDescription.trim();
    }

    if (section === 'pricing') {
      payload.price = form.price.trim();
      payload.isNegotiable = form.isNegotiable;
      payload.categoryId = form.categoryId;
      payload.brandName = form.brandName.trim();
      payload.modelName = form.modelName.trim();
      payload.manufacturingYear = form.manufacturingYear.trim();
    }

    if (section === 'sellerLocation') {
      payload.locationState = form.locationState.trim();
      payload.locationCity = form.locationCity.trim();
      payload.condition = form.condition.trim();
      payload.description = buildListingDescription(form);
    }

    if (section === 'technical') {
      payload.operatingHours = form.operatingHours.trim();
      payload.grossPower = form.grossPower.trim();
      payload.description = buildListingDescription(form);
    }

    try {
      setSavingSection(section);
      setError(null);
      setMessage(null);

      const response = await api.put<{ listing: ListingDetail; message: string }>(`/listings/${listing.id}`, payload);
      setListing(response.data.listing);
      setForm(createEditForm(response.data.listing));
      setMessage(response.data.message || t('listingDetails.updatedSuccessfully'));
    } catch (saveError: unknown) {
      console.error('Failed to update listing section:', saveError);
      setError(getErrorMessage(saveError, t('listingDetails.updateFailed')));
    } finally {
      setSavingSection(null);
    }
  }, [baseForm, form, listing, t, uploadingMedia]);

  const savePartnerMedia = async () => {
    if (!listing) {
      return;
    }

    if (!hasPendingMediaChanges) {
      setMessage(t('listingDetails.noNewMedia'));
      return;
    }

    try {
      setSavingSection('header');
      setError(null);
      setMessage(null);

      const existingMedia = listing.media.map((item) => ({
        url: item.url,
        type: item.type,
        slot: item.slot || (item.isFeatured && item.type === 'IMAGE' ? 'front-view' : null),
        isFeatured: item.isFeatured,
      }));

      const hasFeaturedImage = existingMedia.some((item) => item.type === 'IMAGE' && item.isFeatured);
      const payloadMedia = [
        ...existingMedia,
        ...pendingMediaUploads.map((item, index) => ({
          url: item.fileUrl,
          type: item.previewType,
          slot: !hasFeaturedImage && index === 0 && item.previewType === 'IMAGE' ? 'front-view' : null,
          isFeatured: !hasFeaturedImage && index === 0 && item.previewType === 'IMAGE',
        })),
      ];

      const response = await api.put<{ listing: ListingDetail; message: string }>(`/listings/${listing.id}`, {
        media: payloadMedia,
      });

      setListing(response.data.listing);
      setForm(createEditForm(response.data.listing));
      clearPendingMediaUploads();
      setActiveMediaIndex(0);
      setMessage(response.data.message || t('listingDetails.mediaUpdatedSuccessfully'));
    } catch (saveError: unknown) {
      console.error('Failed to update listing media:', saveError);
      setError(getErrorMessage(saveError, t('listingDetails.mediaUpdateFailed')));
    } finally {
      setSavingSection(null);
    }
  };

  const handlePartnerMediaSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      setUploadingMedia(true);
      setError(null);
      setMessage(null);

      const uploadedResults: PendingMediaUpload[] = [];

      for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        const uploadedFile = await uploadListingMediaToServer({
          file,
          kind: isVideo ? 'video' : 'image',
        });

        uploadedResults.push({
          ...uploadedFile,
          previewType: isVideo ? 'VIDEO' : 'IMAGE',
        });
      }

      setPendingMediaUploads((current) => [...current, ...uploadedResults]);
      setMessage(t('listingDetails.mediaReadyToSave', { count: uploadedResults.length }));
    } catch (uploadError: unknown) {
      console.error('Failed to upload listing media:', uploadError);
      setError(getErrorMessage(uploadError, t('listingDetails.uploadFailed')));
    } finally {
      setUploadingMedia(false);
      if (mediaInputRef.current) {
        mediaInputRef.current.value = '';
      }
    }
  };

  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);

  useEffect(() => {
    if (listing && form) {
      setCustomHeader(
        <div className="flex w-full items-center justify-between gap-1.5 sm:gap-4 overflow-hidden">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
            <Link
              href={backHref}
              className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 shadow-sm transition hover:bg-gray-100 hover:text-gray-900"
            >
              <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <input
                  value={form.title}
                  onChange={(event) => updateForm('title', event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-xs sm:text-sm font-medium text-gray-700 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] max-w-[110px] sm:max-w-none"
                />
              ) : (
                <h1 className="text-xs sm:text-lg font-bold text-gray-900 truncate max-w-[110px] sm:max-w-none" title={listing.title}>
                  {listing.title}
                </h1>
              )}
              <div className="mt-0.5 flex items-center gap-1.5 text-[9px] sm:text-xs text-gray-500 min-w-0">
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.25 font-bold uppercase tracking-wider text-[8px] sm:text-[9px] shrink-0 ${STATUS_COLORS[listing.status] || STATUS_COLORS.DRAFT}`}>
                  {listing.status.replace('_', ' ')}
                </span>
                <span className="hidden sm:flex items-center gap-0.5 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[80px] sm:max-w-none">{listing.locationCity || t('listingDetails.notSpecified')}</span>
                </span>
              </div>
            </div>
          </div>

          {canEdit ? (
            <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveSection('header')}
                    disabled={savingSection === 'header' || uploadingMedia}
                    className="inline-flex h-7 sm:h-8 items-center justify-center gap-1 rounded-full bg-[#FFC107] px-2 sm:px-3 text-[11px] sm:text-xs font-semibold text-black shadow-sm transition hover:bg-[#E5AD06] disabled:opacity-60"
                    title={t('listingDetails.saveTitle')}
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{savingSection === 'header' ? t('listingDetails.saving') : t('listingDetails.save')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetSection('header');
                      setForm(createEditForm(listing));
                      setIsEditing(false);
                      clearPendingMediaUploads();
                      setMessage(null);
                      setError(null);
                    }}
                    className="inline-flex h-7 sm:h-8 items-center justify-center gap-1 rounded-full border border-gray-200 bg-white px-2 sm:px-3 text-[11px] sm:text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                    title={t('listingDetails.close')}
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t('listingDetails.close')}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex h-7 sm:h-8 items-center justify-center gap-1 rounded-full bg-[#FFC107] px-2.5 sm:px-3 text-[11px] sm:text-xs font-bold text-black shadow-sm transition hover:bg-[#E5AD06]"
                >
                  <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>{t('listingDetails.edit')}</span>
                </button>
              )}
            </div>
          ) : null}
        </div>
      );
    }
    return () => setCustomHeader(null);
  }, [listing, form, isEditing, savingSection, uploadingMedia, backHref, canEdit, setCustomHeader, resetSection, updateForm, saveSection, clearPendingMediaUploads, t]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent"></div>
        <p className="mt-4 text-sm font-medium text-gray-500">{t('listingDetails.loadingVehicleDetails')}</p>
      </div>
    );
  }

  if (error || !listing || !form) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h3 className="mt-3 text-lg font-bold text-gray-900">{error || t('listingDetails.notFound')}</h3>
          <p className="mt-1 text-sm text-gray-600">{t('listingDetails.notFoundDescription')}</p>
          <div className="mt-6">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('listingDetails.backToListings')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12">


      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-gray-500" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900">{t('listingDetails.mediaGallery')}</h3>
              </div>
              {isEditing && isPartner ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                    multiple
                    className="hidden"
                    onChange={handlePartnerMediaSelection}
                  />
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    disabled={uploadingMedia || savingSection === 'header'}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingMedia ? t('listingDetails.uploading') : t('listingDetails.addMedia')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void savePartnerMedia()}
                    disabled={!hasPendingMediaChanges || uploadingMedia || savingSection === 'header'}
                    className="rounded-xl bg-[#FFC107] px-3 py-2 text-xs font-semibold text-gray-900 transition hover:bg-[#f4b400] disabled:opacity-60"
                  >
                    {savingSection === 'header' && hasPendingMediaChanges ? t('listingDetails.saving') : t('listingDetails.saveMedia')}
                  </button>
                  {hasPendingMediaChanges ? (
                    <button
                      type="button"
                      onClick={clearPendingMediaUploads}
                      disabled={uploadingMedia || savingSection === 'header'}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                    >
                      {t('listingDetails.clearPending')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {isEditing && isPartner ? (
              <div className="mb-4 rounded-xl border border-dashed border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-800">
                {t('listingDetails.partnerMediaHint')}
                <div className="mt-1 text-amber-700">{imageUploadHelper} . {videoUploadHelper}</div>
              </div>
            ) : null}

            {isEditing && isPartner && hasPendingMediaChanges ? (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('listingDetails.pendingUploads')}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {pendingMediaUploads.map((mediaItem) => (
                    <div key={mediaItem.fileUrl} className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-black">
                        {mediaItem.previewType === 'VIDEO' ? (
                          <video src={mediaItem.absoluteUrl} controls className="h-full w-full object-cover" />
                        ) : (
                          <Image
                            src={mediaItem.absoluteUrl}
                            alt={mediaItem.originalName}
                            fill
                            unoptimized
                            sizes="(max-width: 640px) 50vw, 33vw"
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="px-3 py-2">
                        <p className="truncate text-xs font-medium text-gray-700">{mediaItem.originalName}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">{mediaItem.previewType}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {availableMedia.length > 0 ? (
              <div className="space-y-4">
                <div 
                  className={`relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-black ${
                    activeMedia?.type !== 'VIDEO' ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => {
                    if (activeMedia?.type !== 'VIDEO') {
                      setIsLightboxOpen(true);
                    }
                  }}
                >
                  {activeMedia?.type === 'VIDEO' ? (
                    <video
                      src={getAbsoluteFileUrl(activeMedia.url)}
                      controls
                      className="max-h-full max-w-full object-contain"
                      onError={() => markMediaUnavailable(activeMedia.id)}
                    />
                  ) : (
                    <SafeRemoteImage
                      src={getAbsoluteFileUrl(activeMedia?.url)}
                      alt={t('listingDetails.listingMediaAlt')}
                      className="h-full w-full object-contain"
                      onError={() => activeMedia && markMediaUnavailable(activeMedia.id)}
                      fallback={
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-950 text-gray-300">
                          <ImageIcon className="h-10 w-10" />
                          <p className="text-sm font-medium">{t('listingDetails.noMedia')}</p>
                        </div>
                      }
                    />
                  )}
                  {activeMedia?.isFeatured ? (
                    <div className="absolute left-4 top-4 rounded-full bg-[#FFC107] px-3 py-1 text-xs font-bold text-black shadow">{t('listingDetails.coverImage')}</div>
                  ) : null}
                </div>

                <div 
                  className="flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden w-full"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {availableMedia.map((mediaItem, index) => (
                    <button
                      key={mediaItem.id}
                      type="button"
                      onClick={() => setActiveMediaIndex(index)}
                      className={`relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                        index === displayedActiveMediaIndex ? 'border-[#FFC107] ring-2 ring-[#FFC107]/20' : 'border-transparent hover:border-gray-300'
                      }`}
                    >
                      {mediaItem.type === 'VIDEO' ? (
                        <div className="relative flex h-full w-full items-center justify-center bg-gray-900 text-white">
                          <video
                            src={getAbsoluteFileUrl(mediaItem.url)}
                            className="absolute inset-0 h-full w-full object-cover opacity-50"
                            onError={() => markMediaUnavailable(mediaItem.id)}
                          />
                          <AlertCircle className="relative z-10 h-6 w-6" />
                        </div>
                      ) : (
                        <SafeRemoteImage
                          src={getAbsoluteFileUrl(mediaItem.url)}
                          alt={t('listingDetails.thumbnailAlt')}
                          className="h-full w-full object-cover"
                          onError={() => markMediaUnavailable(mediaItem.id)}
                          fallback={
                            <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                              <ImageIcon className="h-5 w-5" />
                            </div>
                          }
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-400">
                <Truck className="mb-2 h-12 w-12 text-gray-300" />
                <p>{t('listingDetails.noMedia')}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-gray-500" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900">{t('listingDetails.descriptionNotes')}</h3>
              </div>
              {isEditing ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => resetSection('overview')}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    {t('listingDetails.reset')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSection('overview')}
                    disabled={savingSection === 'overview'}
                    className="rounded-xl bg-[#FFC107] px-3 py-2 text-xs font-semibold text-gray-900 transition hover:bg-[#f4b400] disabled:opacity-60"
                  >
                    {savingSection === 'overview' ? t('listingDetails.saving') : t('listingDetails.saveSection')}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="space-y-6">
              <Field label={t('listingDetails.overview')}>
                {isEditing ? (
                  <textarea
                    value={form.overview}
                    onChange={(event) => updateForm('overview', event.target.value)}
                    rows={5}
                    className={textareaClassName}
                    placeholder={t('listingDetails.overviewPlaceholder')}
                  />
                ) : (
                  <div className="min-h-[4rem] whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    {parsedDetails.rawDescription || <span className="italic text-gray-400">{t('listingDetails.noDescription')}</span>}
                  </div>
                )}
              </Field>

              <Field label={t('listingDetails.additionalDescription')}>
                {isEditing ? (
                  <textarea
                    value={form.additionalDescription}
                    onChange={(event) => updateForm('additionalDescription', event.target.value)}
                    rows={4}
                    className={textareaClassName}
                    placeholder={t('listingDetails.additionalDescriptionPlaceholder')}
                  />
                ) : (
                  <div className="min-h-[4rem] whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    {listing.additionalDescription || <span className="italic text-gray-400">{t('listingDetails.noAdditionalDescription')}</span>}
                  </div>
                )}
              </Field>
            </div>
          </div>

          {/* Buyer & Sale Record Card (Rendered if Sold or SaleRecord exists) */}
          {(listing.status === 'SOLD' || listing.saleRecord) && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-rose-200/60 pb-3">
                <div className="flex items-center gap-2 text-rose-900">
                  <UserCheck className="h-5 w-5 text-rose-600 shrink-0" />
                  <h3 className="text-sm sm:text-base font-bold text-rose-900">Buyer & Sale Record (Confidential)</h3>
                </div>
                <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-rose-700 shrink-0">
                  SOLD RECORD
                </span>
              </div>

              {listing.saleRecord ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-xl border border-rose-200/70 bg-white p-3.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Buyer Name</p>
                    <p className="text-sm font-bold text-gray-900">{listing.saleRecord.buyerName || 'N/A'}</p>
                  </div>

                  <div className="rounded-xl border border-rose-200/70 bg-white p-3.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Buyer Mobile Number</p>
                    <p className="text-sm font-bold text-gray-900">{listing.saleRecord.buyerPhone || 'N/A'}</p>
                  </div>

                  <div className="rounded-xl border border-rose-200/70 bg-white p-3.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Final Sold Price (₹)</p>
                    <p className="text-sm font-extrabold text-emerald-600">
                      {listing.saleRecord.soldPrice ? formatPortalCurrency(Number(listing.saleRecord.soldPrice)) : 'N/A'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-rose-200/70 bg-white p-3.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sale Date</p>
                    <p className="text-sm font-bold text-gray-900">
                      {listing.saleRecord.soldAt ? new Date(listing.saleRecord.soldAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-rose-200/70 bg-white p-3.5 space-y-1 sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Buyer Location</p>
                    <p className="text-sm font-bold text-gray-900">
                      {[listing.saleRecord.buyerCity, listing.saleRecord.buyerState].filter(Boolean).join(', ') || 'Not specified'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-rose-200 bg-white p-4 text-center text-xs text-rose-600 font-medium">
                  This vehicle is marked as SOLD, but detailed buyer record was not filled. You can edit vehicle details to update buyer information.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex h-full flex-col gap-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-5 border-b border-gray-100 pb-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{t('listingDetails.askingPrice')}</p>
              {isEditing ? (
                <div className="grid gap-4">
                  <Field label={t('listingDetails.price')}>
                    <input value={form.price} onChange={(event) => updateForm('price', event.target.value)} className={inputClassName} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.isNegotiable}
                      onChange={(event) => updateForm('isNegotiable', event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-[#FFC107] focus:ring-[#FFC107]"
                    />
                    {t('listingDetails.priceNegotiable')}
                  </label>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <h2 className="text-3xl font-black text-amber-600">
                    {Number(listing.price) > 0 ? formatPortalCurrency(Number(listing.price)) : t('listingDetails.priceOnRequest')}
                  </h2>
                  {listing.isNegotiable ? (
                    <span className="mb-1 rounded bg-gray-100 px-2 py-0.5 text-sm font-medium text-gray-500">{t('listingDetails.negotiable')}</span>
                  ) : null}
                </div>
              )}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">{t('listingDetails.primaryInfo')}</h3>
              {isEditing ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => resetSection('pricing')}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    {t('listingDetails.reset')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSection('pricing')}
                    disabled={savingSection === 'pricing'}
                    className="rounded-xl bg-[#FFC107] px-3 py-2 text-xs font-semibold text-gray-900 transition hover:bg-[#f4b400] disabled:opacity-60"
                  >
                    {savingSection === 'pricing' ? t('listingDetails.saving') : t('listingDetails.saveSection')}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('listingDetails.category')}>
                {isEditing ? (
                  <SearchableSelect
                    options={categories}
                    value={form.categoryId || form.categoryName}
                    displayValue={form.categoryName}
                    onChange={(option) => {
                      updateForm('categoryId', String(option.id));
                      updateForm('categoryName', option.name);
                    }}
                    placeholder={t('listingDetails.selectCategory')}
                  />
                ) : (
                  <div className="font-semibold text-gray-900">{listing.category?.name || t('listingDetails.na')}</div>
                )}
              </Field>

              <Field label={t('listingDetails.brand')}>
                {isEditing ? (
                  <SearchableSelect
                    options={brands}
                    value={form.brandName}
                    displayValue={form.brandName}
                    onChange={(option) => updateForm('brandName', option.name)}
                    placeholder={t('listingDetails.selectBrand')}
                  />
                ) : (
                  <div className="font-semibold text-gray-900">{listing.brand?.name || t('listingDetails.na')}</div>
                )}
              </Field>

              <Field label={t('listingDetails.model')}>
                {isEditing ? (
                  <input value={form.modelName} onChange={(event) => updateForm('modelName', event.target.value)} className={inputClassName} />
                ) : (
                  <div className="font-semibold text-gray-900">{listing.model?.name || t('listingDetails.na')}</div>
                )}
              </Field>

              <Field label={t('listingDetails.year')}>
                {isEditing ? (
                  <input value={form.manufacturingYear} onChange={(event) => updateForm('manufacturingYear', event.target.value)} className={inputClassName} />
                ) : (
                  <div className="font-semibold text-gray-900">{listing.manufacturingYear || t('listingDetails.na')}</div>
                )}
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-gray-500" />
                <h3 className="text-base font-bold text-gray-900">{t('listingDetails.locationStatusSeller')}</h3>
              </div>
              {isEditing ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => resetSection('sellerLocation')}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    {t('listingDetails.reset')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSection('sellerLocation')}
                    disabled={savingSection === 'sellerLocation'}
                    className="rounded-xl bg-[#FFC107] px-3 py-2 text-xs font-semibold text-gray-900 transition hover:bg-[#f4b400] disabled:opacity-60"
                  >
                    {savingSection === 'sellerLocation' ? t('listingDetails.saving') : t('listingDetails.saveSection')}
                  </button>
                </div>
              ) : null}
            </div>

            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Tag className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('listingDetails.listedBy', { type: resolveDealerTypeLabel(listing) })}</p>
                  <p className="text-sm font-semibold text-gray-900 capitalize">{listing.partner?.name || listing.dealer || t('listingDetails.unknown')}</p>
                </div>
              </li>

              <li className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-gray-400" />
                  <div className="w-full">
                    <p className="text-xs font-medium text-gray-500">{t('listingDetails.location')}</p>
                    {isEditing ? (
                      <div className="mt-2 grid gap-3">
                        <Field label={t('listingDetails.state')}>
                          <SearchableSelect
                            options={states}
                            value={effectiveSelectedStateId || form.locationState}
                            displayValue={form.locationState}
                            onChange={(option) => {
                              updateForm('locationState', option.name);
                              updateForm('selectedStateId', String(option.id));
                              updateForm('locationCity', '');
                              updateForm('selectedCityId', '');
                            }}
                            placeholder={t('listingDetails.selectState')}
                          />
                        </Field>
                        <Field label={t('listingDetails.city')}>
                          <SearchableSelect
                            options={cities}
                            value={form.selectedCityId || form.locationCity}
                            displayValue={form.locationCity}
                            onChange={(option) => {
                              updateForm('locationCity', option.name);
                              updateForm('selectedCityId', String(option.id));
                            }}
                            placeholder={effectiveSelectedStateId ? t('listingDetails.selectCity') : t('listingDetails.selectStateFirst')}
                            disabled={!effectiveSelectedStateId}
                          />
                        </Field>
                        <Field label={t('listingDetails.district')}>
                          <input value={form.district} onChange={(event) => updateForm('district', event.target.value)} className={inputClassName} />
                        </Field>
                        <Field label={t('listingDetails.pinCode')}>
                          <input value={form.pinCode} onChange={(event) => updateForm('pinCode', event.target.value)} className={inputClassName} />
                        </Field>
                        <Field label={t('listingDetails.nearbyLandmark')}>
                          <input value={form.nearbyLandmark} onChange={(event) => updateForm('nearbyLandmark', event.target.value)} className={inputClassName} />
                        </Field>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-gray-900">
                          {[listing.locationCity, parsedDetails.district, listing.locationState].filter(Boolean).join(', ')}
                          {parsedDetails.pinCode ? ` - ${parsedDetails.pinCode}` : ''}
                        </p>
                        {parsedDetails.nearbyLandmark ? (
                          <p className="mt-0.5 text-xs text-gray-500">{t('listingDetails.nearLabel', { landmark: parsedDetails.nearbyLandmark })}</p>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <Eye className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('listingDetails.totalViews')}</p>
                  <p className="text-sm font-semibold text-gray-900">{t('listingDetails.totalViewsValue', { count: listing.views || 0 })}</p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-gray-400" />
                <div className="w-full">
                  <p className="text-xs font-medium text-gray-500">{t('listingDetails.overallCondition')}</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={conditionOptions.map((opt) => ({ id: opt.value, name: opt.label }))}
                      value={form.condition}
                      onChange={(opt) => updateForm('condition', String(opt.id))}
                      placeholder={t('listingDetails.selectCondition')}
                      searchable={false}
                      className="mt-2"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-gray-900">{formatPortalLabel(listing.condition || 'N/A')}</p>
                  )}
                </div>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-gray-500" />
                <h3 className="text-base font-bold text-gray-900">{t('listingDetails.technicalSpecs')}</h3>
              </div>
              {isEditing ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => resetSection('technical')}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    {t('listingDetails.reset')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSection('technical')}
                    disabled={savingSection === 'technical'}
                    className="rounded-xl bg-[#FFC107] px-3 py-2 text-xs font-semibold text-gray-900 transition hover:bg-[#f4b400] disabled:opacity-60"
                  >
                    {savingSection === 'technical' ? t('listingDetails.saving') : t('listingDetails.saveSection')}
                  </button>
                </div>
              ) : null}
            </div>

            {isEditing ? (
              <div className="grid gap-4 h-[320px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <Field label={t('listingDetails.variant')}>
                  <input value={form.variant} onChange={(event) => updateForm('variant', event.target.value)} className={inputClassName} />
                </Field>
                <Field label={t('listingDetails.operatingHours')}>
                  <input value={form.operatingHours} onChange={(event) => updateForm('operatingHours', event.target.value)} className={inputClassName} />
                </Field>
                <Field label={t('listingDetails.fuelType')}>
                  <SearchableSelect
                    options={fuelOptions.map((opt) => ({ id: opt.value, name: opt.label }))}
                    value={form.fuelType}
                    onChange={(opt) => updateForm('fuelType', String(opt.id))}
                    placeholder={t('listingDetails.selectFuelType')}
                    searchable={false}
                  />
                </Field>
                <Field label={t('listingDetails.transmission')}>
                  <SearchableSelect
                    options={transmissionOptions.map((opt) => ({ id: opt.value, name: opt.label }))}
                    value={form.transmission}
                    onChange={(opt) => updateForm('transmission', String(opt.id))}
                    placeholder={t('listingDetails.selectTransmission')}
                    searchable={false}
                  />
                </Field>
                <Field label={t('listingDetails.grossPower')}>
                  <input value={form.grossPower} onChange={(event) => updateForm('grossPower', event.target.value)} className={inputClassName} />
                </Field>
                <Field label={t('listingDetails.chassisSerialNo')}>
                  <input value={form.chassisOrSerialNo} onChange={(event) => updateForm('chassisOrSerialNo', event.target.value)} className={inputClassName} />
                </Field>
                <Field label={t('listingDetails.registrationNo')}>
                  <input value={form.registrationNo} onChange={(event) => updateForm('registrationNo', event.target.value)} className={inputClassName} />
                </Field>
                <Field label={t('listingDetails.registrationYear')}>
                  <input value={form.registrationYear} onChange={(event) => updateForm('registrationYear', event.target.value)} className={inputClassName} />
                </Field>
                <Field label={t('listingDetails.insuranceExpiry')}>
                  <input value={form.insuranceExpiry} onChange={(event) => updateForm('insuranceExpiry', event.target.value)} className={inputClassName} />
                </Field>
                <Field label={t('listingDetails.numberOfOwners')}>
                  <input value={form.previousOwners} onChange={(event) => updateForm('previousOwners', event.target.value)} className={inputClassName} />
                </Field>
              </div>
            ) : (
              <div className="space-y-3 h-[320px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500"><Tag className="h-4 w-4 text-gray-400" /> {t('listingDetails.variant')}</span>
                  <span className="text-sm font-semibold text-gray-900">{parsedDetails.variant || t('listingDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500"><Clock className="h-4 w-4 text-gray-400" /> {t('listingDetails.operatingHours')}</span>
                  <span className="text-sm font-semibold text-gray-900">{listing.operatingHours ? t('listingDetails.operatingHoursValue', { count: listing.operatingHours }) : t('listingDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500"><Fuel className="h-4 w-4 text-gray-400" /> {t('listingDetails.fuelType')}</span>
                  <span className="text-sm font-semibold text-gray-900">{parsedDetails.fuelType ? t(`listingDetails.fuelOptions.${parsedDetails.fuelType}`) : t('listingDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500"><Settings className="h-4 w-4 text-gray-400" /> {t('listingDetails.transmission')}</span>
                  <span className="text-sm font-semibold text-gray-900">{parsedDetails.transmission ? t(`listingDetails.transmissionOptions.${parsedDetails.transmission}`) : t('listingDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500"><Wrench className="h-4 w-4 text-gray-400" /> {t('listingDetails.grossPower')}</span>
                  <span className="text-sm font-semibold text-gray-900">{listing.grossPower || t('listingDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500"><Hash className="h-4 w-4 text-gray-400" /> {t('listingDetails.chassisSerialNo')}</span>
                  <span className="text-sm font-semibold text-gray-900">{parsedDetails.chassisOrSerialNo || t('listingDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500"><Hash className="h-4 w-4 text-gray-400" /> {t('listingDetails.registrationNo')}</span>
                  <span className="text-sm font-semibold text-gray-900">{parsedDetails.registrationNo || t('listingDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500"><Calendar className="h-4 w-4 text-gray-400" /> {t('listingDetails.registrationYear')}</span>
                  <span className="text-sm font-semibold text-gray-900">{parsedDetails.registrationYear || t('listingDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500"><ShieldCheck className="h-4 w-4 text-gray-400" /> {t('listingDetails.insuranceExpiry')}</span>
                  <span className="text-sm font-semibold text-gray-900">{parsedDetails.insuranceExpiry ? formatPortalDateTime(parsedDetails.insuranceExpiry).split(',')[0] : t('listingDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500"><Info className="h-4 w-4 text-gray-400" /> {t('listingDetails.numberOfOwners')}</span>
                  <span className="text-sm font-semibold text-gray-900">{parsedDetails.previousOwners || '1'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isLightboxOpen && activeMedia && activeMedia.type !== 'VIDEO' && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm transition-all duration-300"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsLightboxOpen(false); }}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 z-[110] rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-7 w-7" />
          </button>
          
          <div className="h-full w-full max-h-screen max-w-7xl flex items-center justify-center p-4 sm:p-12 md:p-16" onClick={(e) => e.stopPropagation()}>
            <div className="relative h-full w-full">
              <SafeRemoteImage
                src={getAbsoluteFileUrl(activeMedia.url)}
                alt={t('listingDetails.listingMediaAlt')}
                className="h-full w-full object-contain"
                quality={100}
                priority
              />
            </div>
          </div>

          {availableMedia.length > 1 && (
            <>
              <button 
                type="button"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setActiveMediaIndex((prev) => (prev > 0 ? prev - 1 : availableMedia.length - 1));
                }}
                className="absolute left-2 sm:left-8 z-[110] rounded-full bg-black/40 sm:bg-white/10 p-2 sm:p-3 text-white hover:bg-white/20 transition-all backdrop-blur-md sm:hover:scale-110"
              >
                <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
              </button>
              <button 
                type="button"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setActiveMediaIndex((prev) => (prev < availableMedia.length - 1 ? prev + 1 : 0));
                }}
                className="absolute right-2 sm:right-8 z-[110] rounded-full bg-black/40 sm:bg-white/10 p-2 sm:p-3 text-white hover:bg-white/20 transition-all backdrop-blur-md sm:hover:scale-110"
              >
                <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
              </button>
            </>
          )}

          {availableMedia.length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[110] rounded-full bg-black/50 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md">
              {displayedActiveMediaIndex + 1} / {availableMedia.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
