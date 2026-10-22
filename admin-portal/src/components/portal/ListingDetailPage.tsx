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
  Camera,
  Play,
  Trash2,
  Loader2,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Share2,
  Printer,
  BarChart3,
  CreditCard,
  Building2,
  Phone,
  User,
  Gauge,
  Zap,
  CheckCircle,
  AlertTriangle,
  Award,
  Download,
  Maximize2,
} from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import SafeRemoteImage from '@/components/ui/SafeRemoteImage';
import SafeRemoteVideo from '@/components/ui/SafeRemoteVideo';
import {
  getMediaSourceCandidates,
  MAX_IMAGE_INPUT_SIZE,
  MAX_LISTING_VIDEO_INPUT_SIZE,
  uploadListingMediaToServer,
  type UploadedFileResult,
} from '@/lib/fileUpload';
import { normalizeListingPayload } from '@/lib/listingMedia';
import { formatPortalCurrency, formatPortalDate, formatPortalLabel } from '@/lib/partnerPortal';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/permissionUtils';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import { useHeaderStore } from '@/store/headerStore';
import { resolveListingId } from '@/lib/routeResolvers';
import { generateAdminListingDetailPath } from '@/lib/routePaths';
import { YEAR_SELECT_OPTIONS } from '@/lib/listingDateOptions';
import {
  isValidDigitsOnlyValue,
  isValidDateValue,
  isValidPinCodeValue,
  isValidYearValue,
  sanitizeListingFieldValue,
  sanitizeListingFormData,
} from '@/lib/listingFormSanitizers';
import ListingRtoFields from '@/components/listings/ListingRtoFields';
import { buildListingRtoDetails, emptyListingRtoForm, hasListingRtoInput, sanitizeListingRtoForm, validateListingRtoForm, type ListingRtoFormState } from '@/lib/listingRtoForm';
import { findMasterOption, mapChassisToRcVehicle, normalizeMasterName } from '@/lib/listingVehicleVerification';
import { ApiFillBox } from '@/components/ui/ApiFillBadge';
import { getListingRtoOptionalTextFields } from '@/lib/listingRtoDisplay';
import { buildVerificationCacheKey, getVerificationCache, setVerificationCache } from '@/lib/verificationRequestCache';

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
  vehicleVerification?: {
    verificationRecordId?: string | null;
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
  address?: string;
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
  rtoRecords?: Array<{
    vehicleNumber?: string | null;
    hirePurchaseStatus: ListingRtoFormState['hirePurchaseStatus'];
    financerName?: string | null;
    taxStatus: string;
    taxValidUntil?: string | null;
    fitnessStatus: string;
    fitnessValidUntil?: string | null;
    insuranceStatus: string;
    insuranceValidUntil?: string | null;
    pucStatus: string;
    pucValidUntil?: string | null;
    hsrpStatus: string;
    hsrpNumber?: string | null;
    rtoOffice?: string | null;
    rtoAgentName?: string | null;
    rtoExpenses?: number | string;
    vehicleMaintenanceCost?: number | string;
    hourRunning?: number | null;
  }>;
  media: Array<{
    id: string;
    url: string;
    type: string;
    slot?: string | null;
    isFeatured: boolean;
  }>;
};

type ChassisVerificationResponse = {
  success: boolean;
  cacheHit?: boolean;
  record?: { id?: string };
  result?: Record<string, unknown> | null;
};

const normalizeListingResponse = (payload: unknown) =>
  normalizeListingPayload(payload) as unknown as ListingDetail;

const verificationStatusMeta = (status?: string | null) => {
  switch (String(status || 'NOT_VERIFIED').toUpperCase()) {
    case 'API_VERIFIED':
      return {
        label: 'API Verified',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        iconColor: 'text-emerald-600',
      };
    case 'MANUALLY_MODIFIED':
      return {
        label: 'Manually Modified',
        className: 'border-amber-200 bg-amber-50 text-amber-900',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
        iconColor: 'text-amber-600',
      };
    case 'REVERIFICATION_REQUIRED':
      return {
        label: 'Re-verification Required',
        className: 'border-rose-200 bg-rose-50 text-rose-800',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
        iconColor: 'text-rose-600',
      };
    default:
      return {
        label: 'Not Verified',
        className: 'border-slate-200 bg-slate-50 text-slate-700',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        iconColor: 'text-slate-500',
      };
  }
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
  address: string;
  pinCode: string;
  nearbyLandmark: string;
  condition: string;
  variant: string;
  operatingHours: string;
  fuelType: string;
  transmission: string;
  grossPower: string;
  ownerName: string;
  chassisOrSerialNo: string;
  engineNumber: string;
  registrationNo: string;
  registrationDate: string;
  registrationUpto: string;
  insuranceExpiry: string;
  previousOwners: string;
  rtoDetails: ListingRtoFormState;
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
      case 'registration date': parsed.registrationDate = value; break;
      case 'registration upto':
      case 'registration up to': parsed.registrationUpto = value; break;
      case 'registration no': parsed.registrationNo = value; break;
      case 'owner name': parsed.ownerName = value; break;
      case 'chassis/serial':
      case 'chassis / serial':
      case 'chassis or serial': parsed.chassisOrSerialNo = value; break;
      case 'engine number':
      case 'engine no': parsed.engineNumber = value; break;
      case 'owners': parsed.previousOwners = value; break;
      case 'fuel': parsed.fuelType = value; break;
      case 'transmission': parsed.transmission = value; break;
      case 'address': parsed.address = value; break;
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

const formatRegistrationNumber = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '';

  const compact = normalized.replace(/[\s-]+/g, '');
  const standardMatch = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
  if (standardMatch) return [standardMatch[1], standardMatch[2], standardMatch[3], standardMatch[4]].join('-');

  const stateAndNumberMatch = compact.match(/^([A-Z]{2})(\d{1,2})(\d{1,4})$/);
  if (stateAndNumberMatch) return [stateAndNumberMatch[1], stateAndNumberMatch[2], stateAndNumberMatch[3]].join('-');

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

const formatLocationSummary = (address?: string | null, city?: string | null, state?: string | null, pinCode?: string | null) => {
  const cleanAddress = formatAddressWithoutPinCode(address, pinCode);
  const addressText = cleanAddress.toLowerCase();
  const locationParts = [city, state]
    .map((part) => String(part || '').trim())
    .filter((part) => part && !addressText.includes(part.toLowerCase()));

  return [cleanAddress, ...locationParts].filter(Boolean).join(', ');
};

const calculateVehicleAge = (year?: number | string | null) => {
  if (!year) return null;
  const y = typeof year === 'string' ? parseInt(year, 10) : year;
  if (isNaN(y) || y < 1970) return null;
  const currentYear = new Date().getFullYear();
  const age = currentYear - y;
  if (age <= 0) return '< 1 yr old';
  return `${age} ${age === 1 ? 'yr' : 'yrs'} old`;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-800 border-slate-300',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-900 border-amber-300',
  CHANGES_REQUESTED: 'bg-orange-100 text-orange-900 border-orange-300',
  PUBLISHED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  PAUSED: 'bg-slate-100 text-slate-700 border-slate-300',
  RESERVED: 'bg-blue-100 text-blue-900 border-blue-300',
  SOLD: 'bg-rose-100 text-rose-900 border-rose-300',
};

const CONDITION_OPTIONS = ['Excellent', 'Good', 'Fair', 'Needs Repair'];
const FUEL_OPTIONS = ['Diesel', 'Electric', 'Petrol', 'Hybrid', 'Other'];

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 placeholder:text-slate-400';

const textareaClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 placeholder:text-slate-400';

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
    ['Registration Date', form.registrationDate],
    ['Registration Upto', form.registrationUpto],
    ['Registration No', form.registrationNo],
    ['Owner Name', form.ownerName],
    ['Chassis / Serial', form.chassisOrSerialNo],
    ['Owners', form.previousOwners],
    ['Fuel', form.fuelType],
    ['Transmission', form.transmission],
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

const getListingSectionValidationError = (section: DetailSection, form: ListingEditForm) => {
  if (section === 'pricing') {
    if (!isValidDigitsOnlyValue(form.price)) {
      return 'Price must contain digits only.';
    }

    if (!isValidYearValue(form.manufacturingYear)) {
      return 'Manufacturing year must be a 4-digit year.';
    }
  }

  if (section === 'sellerLocation' && !isValidPinCodeValue(form.pinCode)) {
    return 'Pin code must be exactly 6 digits.';
  }

  if (section === 'technical') {
    if (!isValidDigitsOnlyValue(form.operatingHours)) {
      return 'Operating hours must contain digits only.';
    }

    if (!isValidDateValue(form.registrationDate) || !isValidDateValue(form.registrationUpto)) {
      return 'Registration dates must be valid calendar dates.';
    }

    if (form.registrationDate && form.registrationUpto && form.registrationDate > form.registrationUpto) {
      return 'Registration upto cannot be before the registration date.';
    }

    if (!isValidDigitsOnlyValue(form.previousOwners)) {
      return 'Previous owners must contain digits only.';
    }
  }

  return '';
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
  const linkedRto = listing.rtoRecords?.[0];

  return sanitizeListingFormData({
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
    address: formatAddressWithoutPinCode(listing.address || parsed.address || parsed.district, parsed.pinCode),
    pinCode: parsed.pinCode || '',
    nearbyLandmark: parsed.nearbyLandmark || '',
    condition: listing.condition || '',
    variant: parsed.variant || '',
    operatingHours: listing.operatingHours ? String(listing.operatingHours) : '',
    fuelType: parsed.fuelType || '',
    transmission: parsed.transmission || '',
    grossPower: (listing.grossPower || '').replace(/\s*(hp|HP|kw|kW|kWh|w|W).*$/i, '').trim(),
    ownerName: listing.ownerName || parsed.ownerName || '',
    chassisOrSerialNo: parsed.chassisOrSerialNo || '',
    engineNumber: listing.engineNumber || listing.vehicleVerification?.verifiedEngineNumber || parsed.engineNumber || '',
    registrationNo: linkedRto?.vehicleNumber || parsed.registrationNo || '',
    registrationDate: parsed.registrationDate || '',
    registrationUpto: parsed.registrationUpto || '',
    insuranceExpiry: linkedRto
      ? linkedRto.insuranceStatus === 'VALID' && linkedRto.insuranceValidUntil
        ? String(linkedRto.insuranceValidUntil).split('T')[0]
        : ''
      : parsed.insuranceExpiry || '',
    previousOwners: parsed.previousOwners || '',
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
      hsrpStatus: linkedRto?.hsrpStatus === 'YES' ? 'YES' : linkedRto?.hsrpStatus === 'NO' ? 'NO' : linkedRto?.hsrpStatus === 'NOT_APPLICABLE' || linkedRto?.hsrpStatus === 'NOT_REQUIRED' ? 'NOT_APPLICABLE' : 'PENDING',
      hsrpNumber: linkedRto?.hsrpNumber || '',
      rtoOffice: linkedRto?.rtoOffice || '',
      rtoAgentName: linkedRto?.rtoAgentName || '',
      rtoExpenses: linkedRto?.rtoExpenses != null ? String(linkedRto.rtoExpenses) : '',
      vehicleMaintenanceCost: linkedRto?.vehicleMaintenanceCost != null ? String(listing.rtoRecords?.[0]?.vehicleMaintenanceCost || '') : '',
    },
  });
};

const toComparableValue = (value: unknown) => String(value ?? '').trim();

const sectionHasChanges = (section: DetailSection, current: ListingEditForm, base: ListingEditForm) => {
  const fieldsBySection: Record<DetailSection, Array<keyof ListingEditForm>> = {
    header: ['title', 'availability'],
    overview: ['overview', 'additionalDescription'],
    pricing: ['price', 'isNegotiable', 'categoryId', 'categoryName', 'brandName', 'modelName', 'manufacturingYear'],
    sellerLocation: ['locationState', 'locationCity', 'address', 'pinCode', 'nearbyLandmark', 'condition'],
    technical: [
      'variant',
      'operatingHours',
      'fuelType',
      'transmission',
      'grossPower',
      'chassisOrSerialNo',
      'engineNumber',
      'registrationNo',
      'registrationDate',
      'registrationUpto',
      'insuranceExpiry',
      'previousOwners',
    ],
  };

  return fieldsBySection[section].some((field) => toComparableValue(current[field]) !== toComparableValue(base[field]))
    || (section === 'technical' && JSON.stringify(current.rtoDetails) !== JSON.stringify(base.rtoDetails));
};

function Field({
  label,
  children,
  apiFill = null,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  apiFill?: { source: string; filled?: boolean } | null;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <ApiFillBox apiFill={apiFill}>{children}</ApiFillBox>
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [savingSection, setSavingSection] = useState<DetailSection | 'all' | null>(null);
  const [chassisVerificationStatus, setChassisVerificationStatus] = useState<'UNVERIFIED' | 'VERIFYING' | 'VERIFIED' | 'FAILED'>('UNVERIFIED');
  const vehicleApiFill = { source: 'chassis verification', filled: chassisVerificationStatus === 'VERIFIED' };
  const [chassisVerificationId, setChassisVerificationId] = useState('');
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [pendingMediaUploads, setPendingMediaUploads] = useState<PendingMediaUpload[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const thumbnailStripRef = useRef<HTMLDivElement | null>(null);

  const copyText = useCallback((text: string, key: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const scrollThumbnails = (direction: 'left' | 'right') => {
    if (thumbnailStripRef.current) {
      const scrollAmount = direction === 'left' ? -220 : 220;
      thumbnailStripRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';
  const isEmployee = currentUserRole === 'EMPLOYEE';
  const isPartner = currentUserRole === 'PARTNER';
  const canEdit =
    currentUserRole === 'PARTNER' ||
    currentUserRole === 'SUPER_ADMIN' ||
    currentUserRole === 'ADMIN' ||
    hasPermission(user?.permissions, 'listings.update');
  const canDelete =
    currentUserRole === 'SUPER_ADMIN' ||
    currentUserRole === 'PARTNER' ||
    currentUserRole === 'CUSTOMER' ||
    (currentUserRole === 'EMPLOYEE' && hasPermission(user?.permissions, 'listings.delete'));

  const backHref = isSuperAdmin ? '/admin/listings' : isEmployee ? '/employee/listings' : '/partner/listings';
  const effectiveSelectedStateId =
    form?.selectedStateId ||
    states.find((state) => state.name.trim().toLowerCase() === form?.locationState.trim().toLowerCase())?.id?.toString() ||
    '';

  const publicListingUrl = useMemo(() => {
    if (!listing) return '#';
    const frontendBase = process.env.NEXT_PUBLIC_FRONTEND_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000` : '');
    return `${frontendBase}/machines/${listing.id}`;
  }, [listing]);

  const analyticsUrl = useMemo(() => {
    if (!listing) return '#';
    return isSuperAdmin ? `/admin/analytics/${listing.id}` : `/employee/analytics/${listing.id}`;
  }, [listing, isSuperAdmin]);

  const paymentsUrl = useMemo(() => {
    if (!listing) return '#';
    return isSuperAdmin ? `/admin/listings/payments/${listing.id}` : `/employee/listings/payments/${listing.id}`;
  }, [listing, isSuperAdmin]);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        setLoading(true);
        setError(null);
        const resolvedListingId = (await resolveListingId(listingId)) || listingId;
        const res = await api.get<unknown>(`/listings/${resolvedListingId}`);
        const normalizedListing = normalizeListingResponse(res.data);
        setListing(normalizedListing);
        setForm(createEditForm(normalizedListing));
        setChassisVerificationId(normalizedListing.vehicleVerification?.verificationRecordId || '');
        setChassisVerificationStatus(normalizedListing.vehicleVerification?.status === 'API_VERIFIED' ? 'VERIFIED' : 'UNVERIFIED');
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
        label: t(`listingDetails.conditionOptions.${condition}`, condition),
      })),
    [t]
  );

  const fuelOptions = useMemo(
    () =>
      FUEL_OPTIONS.map((fuel) => ({
        value: fuel,
        label: t(`listingDetails.fuelOptions.${fuel}`, fuel),
      })),
    [t]
  );

  const updateForm = useCallback(<K extends keyof ListingEditForm>(field: K, value: ListingEditForm[K]) => {
    if (field === 'chassisOrSerialNo' || field === 'engineNumber') {
      setChassisVerificationId('');
      setChassisVerificationStatus('UNVERIFIED');
    }
    setForm((current) =>
      current
        ? {
            ...current,
            [field]: typeof value === 'string' ? sanitizeListingFieldValue(field, value) : value,
          }
        : current
    );
  }, []);

  const handleChassisVerification = useCallback(async () => {
    if (!form) return;
    const chassisNumber = form.chassisOrSerialNo.trim();
    if (!chassisNumber) {
      setChassisVerificationStatus('FAILED');
      setError('Enter a chassis number before verification.');
      return;
    }

    setChassisVerificationStatus('VERIFYING');
    setError(null);
    try {
      const cacheKey = buildVerificationCacheKey('chassis-to-rc', chassisNumber);
      const cachedResponse = getVerificationCache<ChassisVerificationResponse>(cacheKey);
      const responseData: ChassisVerificationResponse = cachedResponse
        ? { ...cachedResponse, cacheHit: true }
        : (await api.post<ChassisVerificationResponse>('/chassis-to-rc/verify', { chassis_number: chassisNumber })).data;
      const recordId = responseData.record?.id || '';
      if (!responseData.success || !recordId) throw new Error('Vehicle verification did not return a usable verification record.');
      if (!cachedResponse) setVerificationCache(cacheKey, responseData);
      const mapped = mapChassisToRcVehicle(responseData.result || {});
      const normalizeIdentity = (value: string) => value.toUpperCase().replace(/\s+/g, '');
      if (normalizeIdentity(mapped.chassisOrSerialNo || chassisNumber) !== normalizeIdentity(chassisNumber)) {
        throw new Error('The verified chassis number does not match the entered chassis number.');
      }

      const categoryMatch = findMasterOption(categories, mapped.categoryName);
      const brandMatch = findMasterOption(brands, mapped.brandName);
      const categoryId = categoryMatch?.id
        ? String(categoryMatch.id)
        : mapped.categoryName
          ? `__provider_category__${normalizeMasterName(mapped.categoryName)}`
          : form.categoryId;
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

      setForm((current) => current ? {
        ...current,
        categoryId,
        categoryName: categoryMatch?.name || mapped.categoryName || current.categoryName,
        brandName: brandMatch?.name || mapped.brandName || current.brandName,
        modelName: mapped.model || current.modelName,
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
      } : current);
      setChassisVerificationId(recordId);
      setChassisVerificationStatus('VERIFIED');
      setMessage(responseData.cacheHit
        ? 'Vehicle verification loaded from the temporary cache.'
        : 'Vehicle verified. Available details have been auto-filled.');
    } catch (verificationError: unknown) {
      setChassisVerificationId('');
      setChassisVerificationStatus('FAILED');
      setError(getErrorMessage(verificationError, 'Vehicle verification failed. Please check the chassis number and try again.'));
    }
  }, [brands, categories, form]);

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
        next.address = baseForm.address;
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
        next.engineNumber = baseForm.engineNumber;
        next.registrationNo = baseForm.registrationNo;
        next.registrationDate = baseForm.registrationDate;
        next.registrationUpto = baseForm.registrationUpto;
        next.insuranceExpiry = baseForm.insuranceExpiry;
        next.previousOwners = baseForm.previousOwners;
        next.rtoDetails = baseForm.rtoDetails;
      }

      return next;
    });
  }, [baseForm]);

  const saveSection = useCallback(async (section: DetailSection) => {
    if (!listing || !form || !baseForm) {
      return;
    }

    if (section === 'header' && uploadingMedia) {
      setError(t('listingDetails.waitForUpload', 'Please wait for media uploads to finish.'));
      return;
    }

    if (!sectionHasChanges(section, form, baseForm)) {
      setMessage(t('listingDetails.noChangesInSection', 'No changes detected in this section.'));
      return;
    }

    const sanitizedForm = sanitizeListingFormData(form);
    const sanitizedRto = sanitizeListingRtoForm(sanitizedForm.rtoDetails);
    if (sanitizedRto.insuranceStatus !== 'VALID') {
      sanitizedForm.insuranceExpiry = '';
    }
    const shouldSyncRto = Boolean(listing.rtoRecords?.length) || hasListingRtoInput(sanitizedRto);
    const rtoValidationError = section === 'technical' && shouldSyncRto
      ? validateListingRtoForm(sanitizedRto, {
          registrationNo: sanitizedForm.registrationNo,
          vehicleType: sanitizedForm.categoryName,
          vehicleModel: sanitizedForm.modelName,
          operatingHours: sanitizedForm.operatingHours,
          insuranceExpiry: sanitizedForm.insuranceExpiry,
        })
      : null;
    if (rtoValidationError) {
      setError(rtoValidationError);
      setForm({ ...sanitizedForm, rtoDetails: sanitizedRto });
      return;
    }
    const validationError = getListingSectionValidationError(section, sanitizedForm);

    if (validationError) {
      setError(validationError);
      setForm({ ...sanitizedForm, rtoDetails: sanitizedRto });
      return;
    }

    setForm({ ...sanitizedForm, rtoDetails: sanitizedRto });

    const payload: Record<string, unknown> = {};

    if (section === 'header') {
      payload.title = sanitizedForm.title.trim();
      payload.status = availabilityToListingStatus(sanitizedForm.availability, listing.status);
    }

    if (section === 'overview') {
      payload.description = buildListingDescription(sanitizedForm);
      payload.additionalDescription = sanitizedForm.additionalDescription.trim();
    }

    if (section === 'pricing') {
      payload.price = sanitizedForm.price.trim();
      payload.isNegotiable = sanitizedForm.isNegotiable;
      if (sanitizedForm.categoryId.startsWith('__provider_category__')) {
        payload.categoryName = sanitizedForm.categoryName.trim();
      } else {
        payload.categoryId = sanitizedForm.categoryId;
      }
      payload.brandName = sanitizedForm.brandName.trim();
      payload.modelName = sanitizedForm.modelName.trim();
      payload.manufacturingYear = sanitizedForm.manufacturingYear.trim();
    }

    if (section === 'sellerLocation') {
      payload.locationState = sanitizedForm.locationState.trim();
      payload.locationCity = sanitizedForm.locationCity.trim();
      payload.address = sanitizedForm.address.trim();
      payload.condition = sanitizedForm.condition.trim();
      payload.description = buildListingDescription(sanitizedForm);
    }

    if (section === 'technical') {
      payload.operatingHours = sanitizedForm.operatingHours.trim();
      payload.grossPower = sanitizedForm.grossPower.trim();
      payload.ownerName = sanitizedForm.ownerName.trim();
      payload.engineNumber = sanitizedForm.engineNumber.trim();
      if (shouldSyncRto) {
        payload.rtoDetails = buildListingRtoDetails(sanitizedRto, {
          registrationNo: sanitizedForm.registrationNo,
          vehicleType: sanitizedForm.categoryName,
          vehicleModel: sanitizedForm.modelName,
          operatingHours: sanitizedForm.operatingHours,
          insuranceExpiry: sanitizedForm.insuranceExpiry,
        });
      }
      payload.description = buildListingDescription(sanitizedForm);
      if (chassisVerificationId) {
        payload.chassisVerificationId = chassisVerificationId;
      }
      payload.chassisOrSerialNo = sanitizedForm.chassisOrSerialNo.trim();
    }

    if (chassisVerificationId) {
      payload.chassisVerificationId = chassisVerificationId;
      payload.chassisOrSerialNo = sanitizedForm.chassisOrSerialNo.trim();
    }

    try {
      setSavingSection(section);
      setError(null);
      setMessage(null);

      const response = await api.put<{ listing: ListingDetail; message: string }>(`/listings/${listing.id}`, payload);
      const normalizedListing = normalizeListingResponse(response.data);
      setListing(normalizedListing);
      setForm(createEditForm(normalizedListing));
      setMessage(response.data.message || t('listingDetails.updatedSuccessfully', 'Listing section updated successfully.'));
    } catch (saveError: unknown) {
      console.error('Failed to update listing section:', saveError);
      setError(getErrorMessage(saveError, t('listingDetails.updateFailed', 'Failed to update section.')));
    } finally {
      setSavingSection(null);
    }
  }, [baseForm, chassisVerificationId, form, listing, t, uploadingMedia]);

  const saveAllChanges = useCallback(async () => {
    if (!listing || !form || !baseForm) return;

    if (uploadingMedia) {
      setError(t('listingDetails.waitForUpload', 'Please wait for media uploads to finish.'));
      return;
    }

    const sections: DetailSection[] = ['header', 'pricing', 'technical', 'sellerLocation', 'overview'];
    const changedSections = sections.filter((s) => sectionHasChanges(s, form, baseForm));

    if (changedSections.length === 0) {
      setMessage(t('listingDetails.noChanges', 'No changes to save.'));
      setIsEditing(false);
      return;
    }

    const sanitizedForm = sanitizeListingFormData(form);
    const sanitizedRto = sanitizeListingRtoForm(sanitizedForm.rtoDetails);
    if (sanitizedRto.insuranceStatus !== 'VALID') {
      sanitizedForm.insuranceExpiry = '';
    }

    for (const section of changedSections) {
      const err = getListingSectionValidationError(section, sanitizedForm);
      if (err) {
        setError(err);
        return;
      }
    }

    const shouldSyncRto = Boolean(listing.rtoRecords?.length) || hasListingRtoInput(sanitizedRto);
    if (shouldSyncRto) {
      const rtoErr = validateListingRtoForm(sanitizedRto, {
        registrationNo: sanitizedForm.registrationNo,
        vehicleType: sanitizedForm.categoryName,
        vehicleModel: sanitizedForm.modelName,
        operatingHours: sanitizedForm.operatingHours,
        insuranceExpiry: sanitizedForm.insuranceExpiry,
      });
      if (rtoErr) {
        setError(rtoErr);
        return;
      }
    }

    const payload: Record<string, unknown> = {
      title: sanitizedForm.title.trim(),
      status: availabilityToListingStatus(sanitizedForm.availability, listing.status),
      price: sanitizedForm.price.trim(),
      isNegotiable: sanitizedForm.isNegotiable,
      brandName: sanitizedForm.brandName.trim(),
      modelName: sanitizedForm.modelName.trim(),
      manufacturingYear: sanitizedForm.manufacturingYear.trim(),
      locationState: sanitizedForm.locationState.trim(),
      locationCity: sanitizedForm.locationCity.trim(),
      address: sanitizedForm.address.trim(),
      condition: sanitizedForm.condition.trim(),
      operatingHours: sanitizedForm.operatingHours.trim(),
      grossPower: sanitizedForm.grossPower.trim(),
      ownerName: sanitizedForm.ownerName.trim(),
      engineNumber: sanitizedForm.engineNumber.trim(),
      description: buildListingDescription(sanitizedForm),
      additionalDescription: sanitizedForm.additionalDescription.trim(),
      chassisOrSerialNo: sanitizedForm.chassisOrSerialNo.trim(),
    };

    if (sanitizedForm.categoryId.startsWith('__provider_category__')) {
      payload.categoryName = sanitizedForm.categoryName.trim();
    } else {
      payload.categoryId = sanitizedForm.categoryId;
    }

    if (shouldSyncRto) {
      payload.rtoDetails = buildListingRtoDetails(sanitizedRto, {
        registrationNo: sanitizedForm.registrationNo,
        vehicleType: sanitizedForm.categoryName,
        vehicleModel: sanitizedForm.modelName,
        operatingHours: sanitizedForm.operatingHours,
        insuranceExpiry: sanitizedForm.insuranceExpiry,
      });
    }

    if (chassisVerificationId) {
      payload.chassisVerificationId = chassisVerificationId;
    }

    try {
      setSavingSection('all');
      setError(null);
      setMessage(null);

      const response = await api.put<{ listing: ListingDetail; message: string }>(`/listings/${listing.id}`, payload);
      const normalizedListing = normalizeListingResponse(response.data);
      setListing(normalizedListing);
      setForm(createEditForm(normalizedListing));
      setIsEditing(false);
      setMessage(response.data.message || 'All changes saved successfully.');
    } catch (saveError: unknown) {
      console.error('Failed to update listing:', saveError);
      setError(getErrorMessage(saveError, 'Failed to save changes.'));
    } finally {
      setSavingSection(null);
    }
  }, [baseForm, chassisVerificationId, form, listing, t, uploadingMedia]);

  const savePartnerMedia = async () => {
    if (!listing) {
      return;
    }

    if (!hasPendingMediaChanges) {
      setMessage(t('listingDetails.noNewMedia', 'No new media to upload.'));
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

      const normalizedListing = normalizeListingResponse(response.data);
      setListing(normalizedListing);
      setForm(createEditForm(normalizedListing));
      clearPendingMediaUploads();
      setActiveMediaIndex(0);
      setMessage(response.data.message || t('listingDetails.mediaUpdatedSuccessfully', 'Media gallery updated successfully.'));
    } catch (saveError: unknown) {
      console.error('Failed to update listing media:', saveError);
      setError(getErrorMessage(saveError, t('listingDetails.mediaUpdateFailed', 'Failed to update media gallery.')));
    } finally {
      setSavingSection(null);
    }
  };

  const handleDeleteListing = async () => {
    if (!listing || isDeleting) return;

    try {
      setIsDeleting(true);
      setError(null);
      await api.delete(`/listings/${listing.id}`);
      router.push(backHref);
    } catch (deleteError: unknown) {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
      setError(getErrorMessage(deleteError, t('listingDetails.deleteFailed', 'Failed to delete listing.')));
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
      setError(getErrorMessage(uploadError, t('listingDetails.uploadFailed', 'Failed to upload media.')));
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
        <div className="flex w-full items-center justify-between gap-2 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Link
              href={backHref}
              className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 shadow-2xs transition hover:bg-slate-100 hover:text-slate-900"
              title="Back to listings"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    value={form.title}
                    onChange={(event) => updateForm('title', event.target.value)}
                    className="w-full rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs sm:text-sm font-semibold text-slate-900 outline-none transition focus:ring-2 focus:ring-amber-400/30 max-w-xs sm:max-w-md"
                    placeholder="Listing title"
                  />
                  <select
                    value={form.availability}
                    onChange={(e) => updateForm('availability', e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 outline-none"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="PENDING">Pending</option>
                    <option value="RESERVED">Reserved</option>
                    <option value="SOLD">Sold</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 truncate" title={listing.title}>
                    {listing.title}
                  </h1>
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${STATUS_COLORS[listing.status] || STATUS_COLORS.DRAFT}`}>
                    {listing.status.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-500">
                <span className="truncate">{listing.brand?.name || 'Equipment'} • {listing.manufacturingYear || 'Year N/A'}</span>
                <span>•</span>
                <span className="flex items-center gap-0.5 truncate">
                  <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                  <span className="truncate">{listing.locationCity || 'Location N/A'}</span>
                </span>
              </div>
            </div>
          </div>

          {canEdit ? (
            <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveAllChanges()}
                    disabled={savingSection !== null || uploadingMedia}
                    className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] px-3 sm:px-4 text-xs font-bold text-slate-950 shadow-2xs transition hover:bg-[#E5AD06] disabled:opacity-60 cursor-pointer"
                    title="Save all modified changes"
                  >
                    {savingSection === 'all' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span>{savingSection === 'all' ? 'Saving...' : 'Save All'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(createEditForm(listing));
                      setIsEditing(false);
                      clearPendingMediaUploads();
                      setMessage(null);
                      setError(null);
                    }}
                    className="inline-flex h-8 sm:h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 sm:px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                    title="Cancel editing"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Cancel</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] px-3 sm:px-3.5 text-xs font-bold text-slate-950 shadow-2xs transition hover:bg-[#E5AD06] cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Edit Vehicle</span>
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => setIsDeleteDialogOpen(true)}
                      className="inline-flex h-8 sm:h-9 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 sm:px-3 text-xs font-bold text-rose-700 shadow-2xs transition hover:bg-rose-100 cursor-pointer"
                      title="Delete listing"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      );
    }
    return () => setCustomHeader(null);
  }, [listing, form, isEditing, savingSection, uploadingMedia, backHref, canEdit, canDelete, setCustomHeader, resetSection, updateForm, saveSection, saveAllChanges, clearPendingMediaUploads, t]);

  if (loading) {
    return (
      <BrandLoader variant="section" size="md" bg="light" text={t('listingDetails.loadingVehicleDetails', 'Loading vehicle profile...')} />
    );
  }

  if (error && !listing) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h3 className="mt-4 text-base font-bold text-slate-900">{error || t('listingDetails.notFound', 'Vehicle Not Found')}</h3>
          <p className="mt-1 text-xs text-slate-500">{t('listingDetails.notFoundDescription', 'The vehicle listing you requested could not be loaded.')}</p>
          <div className="mt-6">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('listingDetails.backToListings', 'Back to Listings')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!listing || !form) {
    return null;
  }

  const verificationMeta = verificationStatusMeta(listing.vehicleVerification?.status);
  const formattedRegPlate = formatRegistrationNumber(listing.rtoRecords?.[0]?.vehicleNumber || parsedDetails.registrationNo);
  const rto = listing.rtoRecords?.[0];

  const statusBadge = (val: string | null | undefined, type: 'validity' | 'hp' | 'hsrp') => {
    const v = (val || '').toUpperCase();
    let cls = 'bg-slate-100 text-slate-600 border-slate-200';
    let label = val || '—';
    if (type === 'validity') {
      if (v === 'VALID') { cls = 'bg-emerald-50 text-emerald-700 border-emerald-200'; label = 'Valid'; }
      else if (v === 'EXPIRED') { cls = 'bg-rose-50 text-rose-700 border-rose-200'; label = 'Expired'; }
      else if (v === 'LIFETIME') { cls = 'bg-amber-50 text-amber-800 border-amber-200'; label = 'Lifetime'; }
      else if (v === 'NOT_AVAILABLE') { cls = 'bg-slate-100 text-slate-500 border-slate-200'; label = 'N/A'; }
    } else if (type === 'hp') {
      if (v === 'TERMINATED') { cls = 'bg-emerald-50 text-emerald-700 border-emerald-200'; label = 'Terminated'; }
      else if (v === 'ACTIVE') { cls = 'bg-rose-50 text-rose-700 border-rose-200'; label = 'Active (Financed)'; }
      else if (v === 'NOT_APPLICABLE') { cls = 'bg-slate-100 text-slate-500 border-slate-200'; label = 'Not Applicable'; }
      else { cls = 'bg-yellow-50 text-yellow-800 border-yellow-200'; label = 'Pending'; }
    } else if (type === 'hsrp') {
      if (v === 'YES') { cls = 'bg-emerald-50 text-emerald-700 border-emerald-200'; label = 'Fitted'; }
      else if (v === 'NO') { cls = 'bg-rose-50 text-rose-700 border-rose-200'; label = 'Not Fitted'; }
      else if (v === 'NOT_APPLICABLE') { cls = 'bg-slate-100 text-slate-500 border-slate-200'; label = 'N/A'; }
      else { cls = 'bg-yellow-50 text-yellow-800 border-yellow-200'; label = 'Pending'; }
    }
    return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>{label}</span>;
  };

  return (
    <div className="space-y-4 pb-16 profile-print-target">
      {/* Toast Alerts */}
      {message ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 shadow-2xs profile-no-print">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{message}</span>
          </div>
          <button type="button" onClick={() => setMessage(null)} className="text-emerald-700 hover:text-emerald-950">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 shadow-2xs profile-no-print">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-700 hover:text-rose-950">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Sub-header & Action Toolbar (Compact, Modern Bar) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-2xs profile-no-print">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Link href={backHref} className="hover:text-slate-900 transition flex items-center gap-1 font-semibold text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Listings</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-700">{listing.brand?.name || 'Tata Hitachi'}</span>
          <span className="text-slate-300">/</span>
          <span className="font-bold text-slate-900 truncate max-w-[160px] sm:max-w-xs">{listing.title}</span>

          <div className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-600 border border-slate-200">
            <span>ID: {listing.id.slice(0, 8)}</span>
            <button
              type="button"
              onClick={() => copyText(listing.id, 'listingId')}
              className="text-slate-400 hover:text-slate-800 transition"
              title="Copy Listing ID"
            >
              {copiedKey === 'listingId' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={publicListingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
            title="Open machine on public website"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
            <span>View Live</span>
          </a>

          {(isSuperAdmin || isEmployee) && (
            <Link
              href={analyticsUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
              title="View listing visitor analytics"
            >
              <BarChart3 className="h-3.5 w-3.5 text-indigo-600" />
              <span>Analytics</span>
            </Link>
          )}

          {(isSuperAdmin || isEmployee) && (
            <Link
              href={paymentsUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
              title="View payment proof submissions"
            >
              <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
              <span>Payments</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => copyText(typeof window !== 'undefined' ? window.location.href : '', 'pageUrl')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            title="Copy shareable link"
          >
            {copiedKey === 'pageUrl' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copied</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5 text-slate-500" />
                <span>Share</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            title="Print vehicle spec sheet"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* KPI / Key Metrics Executive Strip (Dense, High-Value) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {/* Stat 1: Price */}
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/70 to-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Asking Price</span>
            <Tag className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="mt-1">
            <span className="text-base sm:text-lg font-black text-amber-600 tracking-tight">
              {Number(listing.price) > 0 ? formatPortalCurrency(Number(listing.price)) : 'Price on Request'}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
            {listing.isNegotiable ? (
              <span className="text-emerald-700">Negotiable</span>
            ) : (
              <span className="text-slate-600">Fixed Price</span>
            )}
          </div>
        </div>

        {/* Stat 2: Manufacturing Year */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Year &amp; Age</span>
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {listing.manufacturingYear || 'N/A'}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">
            {calculateVehicleAge(listing.manufacturingYear) || 'Model Year'}
          </div>
        </div>

        {/* Stat 3: Operating Hours */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Meter Hours</span>
            <Gauge className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {listing.operatingHours ? `${Number(listing.operatingHours).toLocaleString('en-IN')} hrs` : 'N/A'}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">
            Total Working Hours
          </div>
        </div>

        {/* Stat 4: Fuel & Power */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fuel &amp; Power</span>
            <Fuel className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
            {listing.grossPower ? `${listing.grossPower.replace(/\s*(hp|HP|kw|kW).*$/i, '').trim()} HP` : parsedDetails.fuelType || 'Diesel'}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500 truncate">
            {parsedDetails.fuelType || 'Heavy Equipment'}
          </div>
        </div>

        {/* Stat 5: Location */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Location</span>
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate" title={listing.locationCity}>
            {listing.locationCity || 'N/A'}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500 truncate">
            {listing.locationState || 'India'}
          </div>
        </div>

        {/* Stat 6: Traffic & Views */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Views</span>
            <Eye className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {(listing.views || 0).toLocaleString('en-IN')}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">
            Customer Enquiries
          </div>
        </div>
      </div>

      {/* Verification Status Banner (Compact & Integrated) */}
      <div className={`flex flex-wrap items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs ${verificationMeta.className} profile-no-print`}>
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-4 w-4 ${verificationMeta.iconColor} shrink-0`} />
          <span className="font-bold">Vehicle Verification:</span>
          <span className={`rounded-md border px-2 py-0.5 font-bold uppercase tracking-wider text-[10px] ${verificationMeta.badgeClass}`}>
            {verificationMeta.label}
          </span>
          {listing.vehicleVerification?.lastVerifiedAt ? (
            <span className="text-slate-500 text-[11px] hidden md:inline">
              (Verified: {new Date(listing.vehicleVerification.lastVerifiedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {listing.vehicleVerification?.changedFields?.length ? (
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-500 font-medium">Changed:</span>
              {listing.vehicleVerification.changedFields.map((field) => (
                <span key={field} className="rounded bg-white/80 px-1.5 py-0.25 text-[10px] font-bold border border-slate-300">
                  {field}
                </span>
              ))}
            </div>
          ) : null}

          {chassisVerificationStatus === 'VERIFIED' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 border border-emerald-300 rounded px-1.5 py-0.5">
              <Sparkles className="h-3 w-3 text-emerald-600" />
              RC Live Synced
            </span>
          )}
        </div>
      </div>

      {/* Main Responsive Grid Layout (7/5 Split on Desktop, Stacked on Mobile) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* LEFT COLUMN: Media Gallery, Tech Specs, Overview (7 cols) */}
        <div className="space-y-4 lg:col-span-7 xl:col-span-8">
          {/* CARD 1: Media Gallery */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {t('listingDetails.mediaGallery', 'Media Gallery')}
                </h3>
                <span className="rounded bg-slate-200/70 px-1.5 py-0.25 text-[10px] font-bold text-slate-700">
                  {availableMedia.length} Photos/Videos
                </span>
              </div>

              {isEditing && isPartner ? (
                <div className="flex flex-wrap items-center gap-1.5">
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
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{uploadingMedia ? 'Uploading...' : 'Add Photos/Videos'}</span>
                  </button>
                  {hasPendingMediaChanges ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void savePartnerMedia()}
                        disabled={uploadingMedia || savingSection === 'header'}
                        className="rounded-lg bg-[#FFC107] px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-[#E5AD06] disabled:opacity-60 cursor-pointer"
                      >
                        Save Media
                      </button>
                      <button
                        type="button"
                        onClick={clearPendingMediaUploads}
                        disabled={uploadingMedia || savingSection === 'header'}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        Clear
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            {isEditing && isPartner && (
              <div className="border-b border-dashed border-amber-200 bg-amber-50/50 px-4 py-2 text-xs text-amber-800">
                {imageUploadHelper} • {videoUploadHelper}
              </div>
            )}

            {isEditing && isPartner && hasPendingMediaChanges ? (
              <div className="p-3 border-b border-slate-100 bg-slate-50">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Pending Uploads ({pendingMediaUploads.length})</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {pendingMediaUploads.map((mediaItem) => (
                    <div key={mediaItem.fileUrl} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xs">
                      <div className="relative aspect-video bg-black">
                        {mediaItem.previewType === 'VIDEO' ? (
                          <video src={mediaItem.absoluteUrl} controls muted playsInline className="h-full w-full object-cover" />
                        ) : (
                          <Image src={mediaItem.absoluteUrl} alt={mediaItem.originalName} fill unoptimized sizes="120px" className="object-cover" />
                        )}
                      </div>
                      <div className="p-1.5">
                        <p className="truncate text-[11px] font-medium text-slate-700">{mediaItem.originalName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {availableMedia.length > 0 ? (
              <div className="p-3 sm:p-4 space-y-3">
                {/* Main Media Preview Box */}
                <div
                  className={`group relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl bg-slate-950 shadow-inner ${
                    activeMedia?.type !== 'VIDEO' ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => {
                    if (activeMedia?.type !== 'VIDEO') {
                      setIsLightboxOpen(true);
                    }
                  }}
                >
                  {activeMedia?.type === 'VIDEO' ? (
                    <SafeRemoteVideo
                      src={getMediaSourceCandidates(activeMedia.url)[0]}
                      fallbackSrcs={getMediaSourceCandidates(activeMedia.url).slice(1)}
                      controls
                      muted
                      playsInline
                      className="max-h-full max-w-full object-contain"
                      onError={() => markMediaUnavailable(activeMedia.id)}
                    />
                  ) : (
                    <SafeRemoteImage
                      src={getMediaSourceCandidates(activeMedia?.url)[0]}
                      fallbackSrcs={getMediaSourceCandidates(activeMedia?.url).slice(1)}
                      alt={listing.title}
                      className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                      onError={() => activeMedia && markMediaUnavailable(activeMedia.id)}
                      fallback={
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-900 text-slate-400">
                          <ImageIcon className="h-8 w-8" />
                          <p className="text-xs font-medium">Image unavailable</p>
                        </div>
                      }
                    />
                  )}

                  {/* Top Left: Cover Badge */}
                  {activeMedia?.isFeatured ? (
                    <div className="absolute left-3 top-3 rounded-md bg-[#FFC107] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-950 shadow z-10">
                      Cover Photo
                    </div>
                  ) : null}

                  {/* Top Right: Watch Video button if video exists */}
                  {availableMedia.some((m) => m.type === 'VIDEO') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const firstVideoIndex = availableMedia.findIndex((m) => m.type === 'VIDEO');
                        if (firstVideoIndex !== -1) {
                          setActiveMediaIndex(firstVideoIndex);
                        }
                      }}
                      className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-md border border-white/20 bg-slate-900/80 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm shadow transition hover:bg-slate-900 cursor-pointer"
                    >
                      <Play className="h-3 w-3 fill-red-500 text-red-500" />
                      <span>Watch Video</span>
                    </button>
                  )}

                  {/* Navigation Arrows */}
                  {availableMedia.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMediaIndex((prev) => (prev > 0 ? prev - 1 : availableMedia.length - 1));
                        }}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white shadow-md backdrop-blur-xs transition hover:bg-black hover:scale-105"
                        aria-label="Previous"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMediaIndex((prev) => (prev < availableMedia.length - 1 ? prev + 1 : 0));
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white shadow-md backdrop-blur-xs transition hover:bg-black hover:scale-105"
                        aria-label="Next"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}

                  {/* Bottom Overlays: Counter & Lightbox Expand */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-2 z-10">
                    <div className="flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                      <Camera className="h-3 w-3" />
                      <span>{displayedActiveMediaIndex + 1} / {availableMedia.length}</span>
                    </div>
                    {activeMedia?.type !== 'VIDEO' && (
                      <div className="flex items-center justify-center rounded-md bg-black/70 p-1 text-white backdrop-blur-sm group-hover:bg-[#FFC107] group-hover:text-black transition">
                        <Maximize2 className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>

                  {listing?.createdAt && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-slate-300 backdrop-blur-sm z-10">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(listing.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                  )}
                </div>

                {/* Thumbnails Filmstrip */}
                <div className="relative pt-1">
                  {availableMedia.length > 4 && (
                    <button
                      type="button"
                      onClick={() => scrollThumbnails('left')}
                      className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-700 shadow-md border border-slate-200 hover:bg-slate-50"
                      aria-label="Scroll left"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  )}

                  <div
                    ref={thumbnailStripRef}
                    className="flex overflow-x-auto gap-2 py-1 scroll-smooth snap-x [&::-webkit-scrollbar]:hidden px-6"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {availableMedia.map((mediaItem, index) => (
                      <button
                        key={mediaItem.id}
                        type="button"
                        onClick={() => setActiveMediaIndex(index)}
                        className={`relative aspect-[4/3] h-14 sm:h-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all snap-center cursor-pointer ${
                          index === displayedActiveMediaIndex
                            ? 'border-[#FFC107] ring-2 ring-[#FFC107]/30 scale-95'
                            : 'border-transparent opacity-80 hover:opacity-100 hover:border-slate-300'
                        }`}
                      >
                        {mediaItem.type === 'VIDEO' ? (
                          <div className="relative flex h-full w-full items-center justify-center bg-slate-900 text-white">
                            <SafeRemoteVideo
                              src={getMediaSourceCandidates(mediaItem.url)[0]}
                              fallbackSrcs={getMediaSourceCandidates(mediaItem.url).slice(1)}
                              muted
                              playsInline
                              className="absolute inset-0 h-full w-full object-cover opacity-60"
                              onError={() => markMediaUnavailable(mediaItem.id)}
                            />
                            <div className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow">
                              <Play className="h-2.5 w-2.5 fill-white ml-0.5" />
                            </div>
                          </div>
                        ) : (
                          <SafeRemoteImage
                            src={getMediaSourceCandidates(mediaItem.url)[0]}
                            fallbackSrcs={getMediaSourceCandidates(mediaItem.url).slice(1)}
                            alt={t('listingDetails.thumbnailAlt', 'Thumbnail')}
                            className="h-full w-full object-cover"
                            onError={() => markMediaUnavailable(mediaItem.id)}
                            fallback={
                              <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            }
                          />
                        )}
                      </button>
                    ))}
                  </div>

                  {availableMedia.length > 4 && (
                    <button
                      type="button"
                      onClick={() => scrollThumbnails('right')}
                      className="absolute -right-1 top-1/2 -translate-y-1/2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-700 shadow-md border border-slate-200 hover:bg-slate-50"
                      aria-label="Scroll right"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center border-t border-dashed border-slate-200 bg-slate-50 text-slate-400">
                <Truck className="mb-2 h-10 w-10 text-slate-300" />
                <p className="text-xs font-medium">{t('listingDetails.noMedia', 'No images or videos uploaded for this machine.')}</p>
              </div>
            )}
          </div>

          {/* CARD 2: Technical Specifications & Machine Performance (Compact Grid, NO 320px inner scroll!) */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {t('listingDetails.technicalSpecs', 'Machine Specifications & Performance')}
                </h3>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => resetSection('technical')}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSection('technical')}
                    disabled={savingSection === 'technical'}
                    className="rounded-md bg-[#FFC107] px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-[#E5AD06] disabled:opacity-60 cursor-pointer"
                  >
                    {savingSection === 'technical' ? 'Saving...' : 'Save Specs'}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="p-4">
              {isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t('listingDetails.variant', 'Variant')} apiFill={vehicleApiFill}>
                    <input
                      value={form.variant}
                      onChange={(event) => updateForm('variant', event.target.value)}
                      className={inputClassName}
                      placeholder="e.g. Standard / Heavy Duty"
                    />
                  </Field>

                  <Field label={t('listingDetails.operatingHours', 'Operating Hours (Meter)')}>
                    <input
                      value={form.operatingHours}
                      onChange={(event) => updateForm('operatingHours', event.target.value)}
                      className={inputClassName}
                      placeholder="e.g. 4500"
                    />
                  </Field>

                  <Field label={t('listingDetails.fuelType', 'Fuel Type')} apiFill={vehicleApiFill}>
                    <SearchableSelect
                      options={fuelOptions.map((opt) => ({ id: opt.value, name: opt.label }))}
                      value={form.fuelType}
                      onChange={(opt) => updateForm('fuelType', String(opt.id))}
                      placeholder={t('listingDetails.selectFuelType', 'Select fuel type')}
                      searchable={false}
                    />
                  </Field>

                  <Field label={t('listingDetails.grossPower', 'Gross Power (Engine HP)')}>
                    <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-[#FFC107] focus-within:ring-2 focus-within:ring-[#FFC107]/20 transition">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={form.grossPower}
                        onChange={(event) => updateForm('grossPower', event.target.value.replace(/[^0-9]/g, ''))}
                        className="flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm text-slate-900 outline-none"
                        placeholder="e.g. 110"
                      />
                      <span className="shrink-0 border-l border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-500">HP</span>
                    </div>
                  </Field>

                  <Field label={t('listingDetails.chassisSerialNo', 'Chassis / Serial No.')}>
                    <div className="flex gap-2">
                      <input
                        value={form.chassisOrSerialNo}
                        onChange={(event) => updateForm('chassisOrSerialNo', event.target.value)}
                        className={inputClassName}
                        placeholder="Enter Chassis No."
                      />
                      <button
                        type="button"
                        onClick={() => void handleChassisVerification()}
                        disabled={chassisVerificationStatus === 'VERIFYING' || !form.chassisOrSerialNo.trim()}
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-[#FFC107] px-3 py-2 text-xs font-bold text-slate-950 hover:bg-[#E5AD06] disabled:opacity-50 cursor-pointer"
                        title="Verify chassis with RTO database"
                      >
                        {chassisVerificationStatus === 'VERIFYING' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : chassisVerificationStatus === 'VERIFIED' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-800" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        <span>{chassisVerificationStatus === 'VERIFIED' ? 'Verified' : 'Verify'}</span>
                      </button>
                    </div>
                  </Field>

                  <Field label={t('listingDetails.engineNumber', 'Engine Number')} apiFill={vehicleApiFill}>
                    <input
                      value={form.engineNumber}
                      onChange={(event) => updateForm('engineNumber', event.target.value)}
                      className={inputClassName}
                      placeholder="e.g. 4HK1-123456"
                      maxLength={40}
                    />
                  </Field>

                  <Field label={t('listingDetails.ownerName', 'Owner / RC Holder Name')} apiFill={vehicleApiFill}>
                    <input
                      value={form.ownerName}
                      onChange={(event) => updateForm('ownerName', event.target.value)}
                      className={inputClassName}
                      placeholder="e.g. Rajesh Kumar"
                    />
                  </Field>

                  <Field label={t('listingDetails.numberOfOwners', 'Previous Owners')} apiFill={vehicleApiFill}>
                    <input
                      value={form.previousOwners}
                      onChange={(event) => updateForm('previousOwners', event.target.value)}
                      className={inputClassName}
                      placeholder="1, 2, 3..."
                    />
                  </Field>

                  <Field label={t('listingDetails.registrationNo', 'Registration No.')} apiFill={vehicleApiFill}>
                    <input
                      value={form.registrationNo}
                      onChange={(event) => updateForm('registrationNo', event.target.value)}
                      className={inputClassName}
                      placeholder="e.g. CG-13-AB-1234"
                    />
                  </Field>

                  <Field label={t('listingDetails.registrationDate', 'Registration Date')} apiFill={vehicleApiFill}>
                    <input
                      type="date"
                      value={form.registrationDate}
                      onChange={(event) => updateForm('registrationDate', event.target.value)}
                      className={inputClassName}
                    />
                  </Field>

                  <Field label={t('listingDetails.registrationUpto', 'Registration Upto (FC Validity)')} apiFill={vehicleApiFill}>
                    <input
                      type="date"
                      value={form.registrationUpto}
                      onChange={(event) => updateForm('registrationUpto', event.target.value)}
                      className={inputClassName}
                    />
                  </Field>

                  {form.rtoDetails.insuranceStatus === 'VALID' && (
                    <Field label={t('listingDetails.insuranceExpiry', 'Insurance Expiry')} apiFill={vehicleApiFill}>
                      <input
                        type="date"
                        value={form.insuranceExpiry}
                        onChange={(event) => updateForm('insuranceExpiry', event.target.value)}
                        className={inputClassName}
                      />
                    </Field>
                  )}

                  <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                    <ListingRtoFields
                      apiFillSource={vehicleApiFill?.source || ''}
                      apiFilled={Boolean(vehicleApiFill?.filled)}
                      value={form.rtoDetails}
                      onChange={(key, value) => updateForm('rtoDetails', { ...form.rtoDetails, [key]: value })}
                      insuranceExpiry={form.insuranceExpiry}
                      onInsuranceExpiryChange={(value) => updateForm('insuranceExpiry', value)}
                      required={Boolean(listing.rtoRecords?.length) || hasListingRtoInput(form.rtoDetails)}
                      compact={true}
                    />
                  </div>
                </div>
              ) : (
                /* VIEW MODE: Clean 2-column key-value grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <Tag className="h-3.5 w-3.5 text-slate-400" /> Category
                    </span>
                    <span className="font-semibold text-slate-900">{listing.category?.name || 'N/A'}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <Wrench className="h-3.5 w-3.5 text-slate-400" /> Brand
                    </span>
                    <span className="font-semibold text-slate-900">{listing.brand?.name || 'N/A'}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <Truck className="h-3.5 w-3.5 text-slate-400" /> Model
                    </span>
                    <span className="font-semibold text-slate-900">{listing.model?.name || 'N/A'}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <Tag className="h-3.5 w-3.5 text-slate-400" /> Variant
                    </span>
                    <span className="font-semibold text-slate-900">{parsedDetails.variant || 'Standard'}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" /> Mfg Year
                    </span>
                    <span className="font-semibold text-slate-900">{listing.manufacturingYear || 'N/A'}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <Gauge className="h-3.5 w-3.5 text-slate-400" /> Operating Usage
                    </span>
                    <span className="font-semibold text-slate-900">
                      {listing.operatingHours ? `${Number(listing.operatingHours).toLocaleString('en-IN')} hrs` : 'N/A'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <Zap className="h-3.5 w-3.5 text-slate-400" /> Gross Power
                    </span>
                    <span className="font-semibold text-slate-900">
                      {listing.grossPower ? `${listing.grossPower.replace(/\s*(hp|HP|kw|kW).*$/i, '').trim()} HP` : 'N/A'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <Fuel className="h-3.5 w-3.5 text-slate-400" /> Fuel Type
                    </span>
                    <span className="font-semibold text-slate-900">{parsedDetails.fuelType || 'Diesel'}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <Settings className="h-3.5 w-3.5 text-slate-400" /> Transmission
                    </span>
                    <span className="font-semibold text-slate-900">{parsedDetails.transmission || 'Standard'}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <Award className="h-3.5 w-3.5 text-slate-400" /> Overall Condition
                    </span>
                    <span className="font-semibold text-slate-900">{listing.condition || 'Good'}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <User className="h-3.5 w-3.5 text-slate-400" /> Previous Owners
                    </span>
                    <span className="font-semibold text-slate-900">{parsedDetails.previousOwners || '1'}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                      <UserCheck className="h-3.5 w-3.5 text-slate-400" /> Registered Owner
                    </span>
                    <span className="font-semibold text-slate-900 truncate max-w-[140px]" title={listing.ownerName || parsedDetails.ownerName || ''}>
                      {listing.ownerName || parsedDetails.ownerName || 'N/A'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CARD 3: Overview & Description Notes */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {t('listingDetails.descriptionNotes', 'Overview & Condition Notes')}
                </h3>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => resetSection('overview')}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSection('overview')}
                    disabled={savingSection === 'overview'}
                    className="rounded-md bg-[#FFC107] px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-[#E5AD06] disabled:opacity-60 cursor-pointer"
                  >
                    {savingSection === 'overview' ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="p-4 space-y-3">
              <div>
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t('listingDetails.overview', 'Vehicle Overview')}
                </span>
                {isEditing ? (
                  <textarea
                    value={form.overview}
                    onChange={(event) => updateForm('overview', event.target.value)}
                    rows={4}
                    className={textareaClassName}
                    placeholder="General description, condition highlights, attachments included..."
                  />
                ) : (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {parsedDetails.rawDescription || <span className="italic text-slate-400">No overview provided.</span>}
                  </div>
                )}
              </div>

              <div>
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t('listingDetails.additionalDescription', 'Additional Inspection Notes / Remarks')}
                </span>
                {isEditing ? (
                  <textarea
                    value={form.additionalDescription}
                    onChange={(event) => updateForm('additionalDescription', event.target.value)}
                    rows={3}
                    className={textareaClassName}
                    placeholder="Inspection findings, tyre condition, hydraulic health..."
                  />
                ) : (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {listing.additionalDescription || <span className="italic text-slate-400">No additional remarks provided.</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CARD 4: Confidential Buyer & Sale Record (if Sold or SaleRecord exists) */}
          {(listing.status === 'SOLD' || listing.saleRecord) && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-rose-200/60 pb-2.5">
                <div className="flex items-center gap-2 text-rose-950">
                  <UserCheck className="h-4 w-4 text-rose-600 shrink-0" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900">Buyer &amp; Sale Record (Confidential)</h3>
                </div>
                <span className="rounded bg-rose-100 border border-rose-300 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-800">
                  DEAL COMPLETED
                </span>
              </div>

              {listing.saleRecord ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-lg border border-rose-100 bg-white p-2.5 space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buyer Name</p>
                    <p className="text-xs font-bold text-slate-900">{listing.saleRecord.buyerName || 'N/A'}</p>
                  </div>

                  <div className="rounded-lg border border-rose-100 bg-white p-2.5 space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buyer Mobile</p>
                    <p className="text-xs font-bold text-slate-900">{listing.saleRecord.buyerPhone || 'N/A'}</p>
                  </div>

                  <div className="rounded-lg border border-rose-100 bg-white p-2.5 space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Final Sold Price</p>
                    <p className="text-xs font-extrabold text-emerald-700">
                      {listing.saleRecord.soldPrice ? formatPortalCurrency(Number(listing.saleRecord.soldPrice)) : 'N/A'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-rose-100 bg-white p-2.5 space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sale Date</p>
                    <p className="text-xs font-bold text-slate-900">
                      {listing.saleRecord.soldAt ? new Date(listing.saleRecord.soldAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-rose-100 bg-white p-2.5 space-y-0.5 sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buyer Location</p>
                    <p className="text-xs font-bold text-slate-900">
                      {[listing.saleRecord.buyerCity, listing.saleRecord.buyerState].filter(Boolean).join(', ') || 'Not specified'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-rose-200 bg-white p-3 text-center text-xs text-rose-600 font-medium">
                  Vehicle marked as SOLD, detailed buyer record not attached.
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Legal & RTO, Primary Pricing & Specs, Seller & Location (5 cols) */}
        <div className="space-y-4 lg:col-span-5 xl:col-span-4">
          {/* CARD 1: Legal Registration & Vehicle Identity (with realistic HSRP Number Plate) */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Registration &amp; Vehicle Identity
                </h3>
              </div>
            </div>

            <div className="p-4 space-y-3.5">
              {/* Authentic Indian High Security Registration Plate Graphic */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 self-start">
                  High Security Registration Plate
                </span>
                <div className="relative inline-flex items-center rounded-md border-2 border-slate-900 bg-white shadow-xs overflow-hidden text-slate-900 font-mono tracking-wider font-black select-all">
                  {/* Left blue strip */}
                  <div className="flex flex-col items-center justify-center bg-blue-700 px-1.5 py-1 text-white self-stretch">
                    <div className="text-[7px] font-bold leading-tight">IND</div>
                    <div className="h-1.5 w-1.5 rounded-full border border-amber-300 bg-blue-900 my-0.5"></div>
                  </div>
                  {/* Registration text */}
                  <div className="px-3 py-1 text-sm sm:text-base font-black uppercase tracking-widest text-slate-950">
                    {formattedRegPlate || 'UNREGISTERED'}
                  </div>
                  {formattedRegPlate ? (
                    <button
                      type="button"
                      onClick={() => copyText(formattedRegPlate, 'regNo')}
                      title="Copy registration number"
                      className="border-l border-slate-200 px-2 py-1 text-slate-400 hover:text-slate-800 transition"
                    >
                      {copiedKey === 'regNo' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-center justify-between w-full text-[11px] text-slate-500 font-medium">
                  <span>Reg Date: <strong className="text-slate-700">{parsedDetails.registrationDate || 'N/A'}</strong></span>
                  <span>Fitness Upto: <strong className="text-slate-700">{parsedDetails.registrationUpto || 'N/A'}</strong></span>
                </div>
              </div>

              {/* Chassis & Engine ID details */}
              <div className="space-y-2 text-xs">
                {/* Chassis No */}
                <div className="flex items-center justify-between rounded-lg bg-slate-50/80 p-2.5 border border-slate-100">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Chassis / Serial No</span>
                    <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm truncate block" title={parsedDetails.chassisOrSerialNo}>
                      {parsedDetails.chassisOrSerialNo || 'N/A'}
                    </span>
                  </div>
                  {parsedDetails.chassisOrSerialNo ? (
                    <button
                      type="button"
                      onClick={() => copyText(parsedDetails.chassisOrSerialNo, 'chassis')}
                      className="shrink-0 p-1.5 text-slate-400 hover:text-slate-800 transition"
                      title="Copy Chassis Number"
                    >
                      {copiedKey === 'chassis' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  ) : null}
                </div>

                {/* Engine No */}
                <div className="flex items-center justify-between rounded-lg bg-slate-50/80 p-2.5 border border-slate-100">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Engine Number</span>
                    <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm truncate block">
                      {listing.engineNumber || listing.vehicleVerification?.verifiedEngineNumber || parsedDetails.engineNumber || 'N/A'}
                    </span>
                  </div>
                  {(listing.engineNumber || parsedDetails.engineNumber) ? (
                    <button
                      type="button"
                      onClick={() => copyText(listing.engineNumber || parsedDetails.engineNumber || '', 'engine')}
                      className="shrink-0 p-1.5 text-slate-400 hover:text-slate-800 transition"
                      title="Copy Engine Number"
                    >
                      {copiedKey === 'engine' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  ) : null}
                </div>

                {/* Registered Owner Name */}
                <div className="flex items-center justify-between rounded-lg bg-slate-50/80 p-2.5 border border-slate-100">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">RC Registered Owner</span>
                    <span className="font-semibold text-slate-900 text-xs truncate block">
                      {listing.ownerName || parsedDetails.ownerName || 'N/A'}
                    </span>
                  </div>
                  <UserCheck className="h-4 w-4 text-slate-400 shrink-0" />
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: RTO & Compliance Hub */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  RTO &amp; Legal Compliance
                </h3>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {rto?.rtoOffice || 'Regional Transport Office'}
              </span>
            </div>

            <div className="p-4 space-y-3">
              {rto ? (
                <>
                  {/* Badges Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* Tax */}
                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Road Tax</span>
                        {statusBadge(rto.taxStatus, 'validity')}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-700 truncate">
                        {rto.taxStatus === 'VALID' && rto.taxValidUntil ? formatPortalDate(rto.taxValidUntil) : rto.taxStatus === 'LIFETIME' ? 'One-time Lifetime' : '—'}
                      </div>
                    </div>

                    {/* Fitness */}
                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fitness (FC)</span>
                        {statusBadge(rto.fitnessStatus, 'validity')}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-700 truncate">
                        {rto.fitnessStatus === 'VALID' && rto.fitnessValidUntil ? formatPortalDate(rto.fitnessValidUntil) : parsedDetails.registrationUpto || '—'}
                      </div>
                    </div>

                    {/* Insurance */}
                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Insurance</span>
                        {statusBadge(rto.insuranceStatus, 'validity')}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-700 truncate">
                        {rto.insuranceStatus === 'VALID' && rto.insuranceValidUntil ? formatPortalDate(rto.insuranceValidUntil) : parsedDetails.insuranceExpiry ? formatPortalDate(parsedDetails.insuranceExpiry) : '—'}
                      </div>
                    </div>

                    {/* PUC */}
                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pollution (PUC)</span>
                        {statusBadge(rto.pucStatus, 'validity')}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-700 truncate">
                        {rto.pucStatus === 'VALID' && rto.pucValidUntil ? formatPortalDate(rto.pucValidUntil) : '—'}
                      </div>
                    </div>

                    {/* HSRP */}
                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">HSRP Status</span>
                        {statusBadge(rto.hsrpStatus, 'hsrp')}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-700 truncate">
                        {rto.hsrpNumber ? `Plate: ${rto.hsrpNumber}` : 'High Security Plate'}
                      </div>
                    </div>

                    {/* Hypothecation */}
                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Finance (HP)</span>
                        {statusBadge(rto.hirePurchaseStatus, 'hp')}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-700 truncate" title={rto.financerName || ''}>
                        {rto.financerName || 'No active loan'}
                      </div>
                    </div>
                  </div>

                  {/* Optional extra RTO fields */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                    {rto.rtoOffice && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">RTO Office</span>
                        <span className="font-semibold text-slate-900">{rto.rtoOffice}</span>
                      </div>
                    )}
                    {rto.rtoAgentName && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">RTO Handling Agent</span>
                        <span className="font-semibold text-slate-900">{rto.rtoAgentName}</span>
                      </div>
                    )}
                    {rto.rtoExpenses != null && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">RTO Work Expenses</span>
                        <span className="font-semibold text-slate-900">{formatPortalCurrency(Number(rto.rtoExpenses))}</span>
                      </div>
                    )}
                    {rto.vehicleMaintenanceCost != null && (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-500">Maintenance Spent</span>
                        <span className="font-semibold text-slate-900">{formatPortalCurrency(Number(rto.vehicleMaintenanceCost))}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                  No detailed RTO compliance records linked. You can edit vehicle details to synchronize RTO records.
                </div>
              )}
            </div>
          </div>

          {/* CARD 3: Seller, Partner & Location Details */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Seller &amp; Machine Location
                </h3>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => resetSection('sellerLocation')}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSection('sellerLocation')}
                    disabled={savingSection === 'sellerLocation'}
                    className="rounded-md bg-[#FFC107] px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-[#E5AD06] disabled:opacity-60 cursor-pointer"
                  >
                    {savingSection === 'sellerLocation' ? 'Saving...' : 'Save Location'}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="p-4 space-y-3.5">
              {/* Partner Profile Badge */}
              <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-[#E5AD06] text-slate-950 font-black text-sm shadow-2xs">
                  {(listing.partner?.name || listing.dealer || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                      {listing.partner?.name || listing.dealer || 'Unknown Seller'}
                    </p>
                    {listing.partner?.customerPrimeSubscriptions?.length ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.25 text-[9px] font-black text-amber-900 border border-amber-300">
                        PRIME
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {resolveDealerTypeLabel(listing)} • {listing.partner?.email || 'Partner'}
                  </p>
                </div>
              </div>

              {/* Location details */}
              {isEditing ? (
                <div className="space-y-3">
                  <Field label={t('listingDetails.state', 'State')}>
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
                      placeholder={t('listingDetails.selectState', 'Select State')}
                    />
                  </Field>

                  <Field label={t('listingDetails.city', 'City')}>
                    <SearchableSelect
                      options={cities}
                      value={form.selectedCityId || form.locationCity}
                      displayValue={form.locationCity}
                      onChange={(option) => {
                        updateForm('locationCity', option.name);
                        updateForm('selectedCityId', String(option.id));
                      }}
                      placeholder={effectiveSelectedStateId ? t('listingDetails.selectCity', 'Select City') : t('listingDetails.selectStateFirst', 'Select State first')}
                      disabled={!effectiveSelectedStateId}
                    />
                  </Field>

                  <Field label={t('listingDetails.address', 'Address')}>
                    <input
                      value={form.address}
                      onChange={(event) => updateForm('address', event.target.value)}
                      className={inputClassName}
                      placeholder="Street, area, plot no."
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t('listingDetails.pinCode', 'Pin Code')}>
                      <input
                        value={form.pinCode}
                        onChange={(event) => updateForm('pinCode', event.target.value)}
                        className={inputClassName}
                        placeholder="6 digits PIN"
                      />
                    </Field>

                    <Field label={t('listingDetails.nearbyLandmark', 'Landmark')}>
                      <input
                        value={form.nearbyLandmark}
                        onChange={(event) => updateForm('nearbyLandmark', event.target.value)}
                        className={inputClassName}
                        placeholder="Near bypass, toll plaza..."
                      />
                    </Field>
                  </div>

                  <Field label={t('listingDetails.overallCondition', 'Condition')}>
                    <SearchableSelect
                      options={conditionOptions.map((opt) => ({ id: opt.value, name: opt.label }))}
                      value={form.condition}
                      onChange={(opt) => updateForm('condition', String(opt.id))}
                      placeholder={t('listingDetails.selectCondition', 'Select condition')}
                      searchable={false}
                    />
                  </Field>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2.5 text-slate-700">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900 leading-snug">
                        {formatLocationSummary(
                          listing.address || parsedDetails.address || parsedDetails.district,
                          listing.locationCity,
                          listing.locationState,
                          parsedDetails.pinCode
                        ) || 'Location not specified'}
                      </p>
                      {parsedDetails.nearbyLandmark ? (
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Near: <span className="text-slate-700 font-medium">{parsedDetails.nearbyLandmark}</span>
                        </p>
                      ) : null}
                      {parsedDetails.pinCode ? (
                        <p className="mt-0.5 text-[11px] text-slate-500 font-mono">
                          PIN: <span className="font-bold text-slate-700">{parsedDetails.pinCode}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Award className="h-3.5 w-3.5 text-slate-400" /> Equipment Condition
                    </span>
                    <span className="font-bold text-slate-900">{listing.condition || 'Good'}</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Eye className="h-3.5 w-3.5 text-slate-400" /> Availability Status
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatPortalLabel(listingStatusToAvailability(listing.status))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal (Full Screen Photo Viewer) */}
      {isLightboxOpen && activeMedia && activeMedia.type !== 'VIDEO' && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 backdrop-blur-md transition-all duration-300"
          onClick={() => setIsLightboxOpen(false)}
        >
          {/* Top Bar: Controls */}
          <div className="absolute top-4 left-4 right-4 z-[130] flex items-center justify-between text-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-white/10 px-3 py-1 text-xs font-semibold">
                {displayedActiveMediaIndex + 1} of {availableMedia.length}
              </span>
              <span className="text-xs text-slate-300 hidden sm:inline truncate max-w-sm">
                {listing.title}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={getMediaSourceCandidates(activeMedia.url)[0]}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
                title="Download image"
              >
                <Download className="h-5 w-5" />
              </a>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Main Zoomed Image Container */}
          <div className="h-full w-full max-h-screen max-w-7xl flex items-center justify-center p-4 sm:p-12" onClick={(e) => e.stopPropagation()}>
            <div className="relative h-full w-full">
              <SafeRemoteImage
                src={getMediaSourceCandidates(activeMedia.url)[0]}
                fallbackSrcs={getMediaSourceCandidates(activeMedia.url).slice(1)}
                alt={listing.title}
                className="h-full w-full object-contain select-none"
                fallback={
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-950 text-slate-400">
                    <ImageIcon className="h-10 w-10" />
                    <p className="text-sm font-medium">Image could not be loaded</p>
                  </div>
                }
              />
            </div>
          </div>

          {/* Previous / Next navigation */}
          {availableMedia.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMediaIndex((prev) => (prev > 0 ? prev - 1 : availableMedia.length - 1));
                }}
                className="absolute left-3 sm:left-6 z-[130] rounded-full bg-black/60 p-3 text-white hover:bg-white/20 backdrop-blur-md transition-all hover:scale-110"
                aria-label="Previous"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMediaIndex((prev) => (prev < availableMedia.length - 1 ? prev + 1 : 0));
                }}
                className="absolute right-3 sm:right-6 z-[130] rounded-full bg-black/60 p-3 text-white hover:bg-white/20 backdrop-blur-md transition-all hover:scale-110"
                aria-label="Next"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteDialogOpen && listing && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <Trash2 className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">
              {t('listingDetails.deleteListing', 'Delete Machine Listing?')}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              {t(
                'listingDetails.deleteListingConfirmation',
                'This will permanently remove this machine, its specifications, and uploaded gallery media from the database. This action cannot be reversed.'
              )}
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(false)}
                disabled={isDeleting}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
              >
                {t('listingDetails.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteListing()}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
