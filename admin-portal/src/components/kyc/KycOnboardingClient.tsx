'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import axios from 'axios';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Globe,
  Hash,
  HelpCircle,
  History,
  Info,
  Layers,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  User,
  Users,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { resolvePartnerId } from '@/lib/routeResolvers';
import { generateAdminPartnerEditPath } from '@/lib/routePaths';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import {
  getOnboardingProgressStep,
  getPartnerOnboardingStepError,
  getStepToKeepAfterDraftSave,
} from '@/lib/partnerOnboardingValidation';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import { findLocationOptionId, normalizeLocationOptions } from '@/lib/locationSelection.mjs';
import {
  getKycVerificationDisplay,
  isKycVerificationSuccessful,
  normalizeKycDocumentNumber,
  validateKycDocumentNumber,
  type KycVerificationDocumentType,
} from '@/lib/kycVerification';
import {
  uploadFileToServer,
  type UploadPurpose,
  getPassportPhotoUploadValidationError,
  getUploadValidationError,
} from '@/lib/fileUpload';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';
import { ApiSparkleIcon } from '@/components/ui/ApiFillBadge';

const toTitleCase = (str: string) => {
  if (!str) return str;
  return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

const toSentenceCase = (str: string) => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const toUpperCase = (str: string) => (str || '').toUpperCase();
const toLowerCase = (str: string) => (str || '').toLowerCase();
const partnerTypeOptions = ['SHOWROOM'];
const businessPartnerTypes = new Set(['SHOWROOM']);
const contactPreferenceOptions = ['PHONE_CALL', 'WHATSAPP', 'EMAIL'];

const documentLabels: Record<string, string> = {
  PAN_CARD: 'Company PAN / PAN Card',
  AADHAAR_CARD: 'Aadhaar / Accepted ID',
  PASSPORT_PHOTO: 'Passport-size Photo',
  CANCELLED_CHEQUE: 'Cancelled Cheque',
  GST_CERTIFICATE: 'GST Certificate',
  AUTHORIZED_PERSON_ID: 'Authorized Place ID',
};

const individualKycDocumentTypes = [
  'PAN_CARD',
  'AADHAAR_CARD',
  'PASSPORT_PHOTO',
];

const businessKycDocumentTypes = [
  'PAN_CARD',
  'GST_CERTIFICATE',
  'AADHAAR_CARD',
  'PASSPORT_PHOTO',
];

const optionalIndividualKycDocumentTypes: string[] = [];

const agreementLabels: Record<string, string> = {
  MARKETPLACE_TERMS: 'Marketplace terms',
  PARTNER_TERMS: 'Partner terms',
  LISTING_AUTHENTICITY: 'Listing authenticity declaration',
  MEDIA_OWNERSHIP: 'Media ownership declaration',
  CUSTOMER_DATA_USAGE: 'Customer data usage policy',
  FRAUD_POLICY: 'Fraud policy',
  COMMISSION_POLICY: 'Commission policy',
};

const agreementDescriptions: Record<string, string> = {
  MARKETPLACE_TERMS: 'Confirms platform rules, account conduct, and approval flow.',
  PARTNER_TERMS: 'Confirms your responsibilities as an approved broker or authorized place partner.',
  LISTING_AUTHENTICITY: 'Declares that listing details, pricing, and inventory claims shared by you are genuine.',
  MEDIA_OWNERSHIP: 'Confirms that photos, videos, and uploaded assets can be legally used for the listing.',
  CUSTOMER_DATA_USAGE: 'Confirms responsible use of buyer, seller, and lead information.',
  FRAUD_POLICY: 'Confirms zero tolerance for fake listings, misrepresentation, or payment abuse.',
  COMMISSION_POLICY: 'Confirms commission, payout, and settlement understanding before approval.',
};

type OnboardingProfile = {
  ownerName: string;
  businessName: string;
  partnerType: string;
  primaryContact: string;
  alternateMobile: string;
  whatsappNumber: string;
  email: string;
  state: string;
  district: string;
  city: string;
  pinCode: string;
  businessAddress: string;
  googleMapsLocation: string;
  businessDescription: string;
  businessExperience: string;
  expectedMonthlyListings: string | number;
  serviceAreas: string;
  workingHours: string;
  gstNumber: string;
  businessRegistrationNumber: string;
  websiteUrl: string;
  socialLinks: string;
  yearsInBusiness: string | number;
  teamSize: string | number;
  contactPreference: string;
  referralCode: string;
};

type KycDocumentForm = {
  documentType: string;
  fileUrl: string;
  fileName: string;
  documentNumber: string;
  nameOnDocument: string;
  issueDate: string;
  expiryDate: string;
  submittedNote: string;
  status?: string;
  reviewComment?: string;
  verificationStatus?: 'NOT_STARTED' | 'VERIFYING' | 'VERIFIED' | 'FAILED' | 'MANUAL_REVIEW';
  verificationRecordId?: string;
  verificationCacheHit?: boolean;
  verificationResult?: Record<string, unknown> | null;
  verificationMessage?: string;
};

type AgreementForm = {
  agreementType: string;
  title?: string;
  summary?: string;
  content?: string;
  version?: string;
  isRequired?: boolean;
  checked: boolean;
};

type OnboardingResponse = {
  user?: ReturnType<typeof useAuthStore.getState>['user'];
  profile: OnboardingProfile;
  requiredDocuments: string[];
  kycDocuments: KycDocumentForm[];
  agreements: AgreementForm[];
  reviewHistory: Array<{
    id: string;
    action: string;
    comment: string | null;
    createdAt: string;
  }>;
  progress: {
    profileComplete: boolean;
    documentsComplete: boolean;
    agreementsComplete: boolean;
    readyForSubmission: boolean;
  };
};

const emptyProfile = (email = '', name = '', mobile = '', city = '', state = ''): OnboardingProfile => ({
  ownerName: name,
  businessName: '',
  partnerType: '',
  primaryContact: mobile,
  alternateMobile: '',
  whatsappNumber: mobile,
  email,
  state,
  district: '',
  city,
  pinCode: '',
  businessAddress: '',
  googleMapsLocation: '',
  businessDescription: '',
  businessExperience: '',
  expectedMonthlyListings: '',
  serviceAreas: '',
  workingHours: '',
  gstNumber: '',
  businessRegistrationNumber: '',
  websiteUrl: '',
  socialLinks: '',
  yearsInBusiness: '',
  teamSize: '',
  contactPreference: 'PHONE_CALL',
  referralCode: '',
});

const legacyDraftComment = 'Partner saved onboarding draft.';

const getReviewActionLabel = (action: string, partnerType?: string | null, partnerName?: string | null) => {
  const resolvedPartnerType = formatPartnerTypeLabel(partnerType);
  const resolvedPartnerName = partnerName?.trim() || 'Unknown';
  const labels: Record<string, string> = {
    PARTNER_SAVED_ONBOARDING_DRAFT: 'Draft saved',
    PARTNER_SUBMITTED_FULL_ONBOARDING: `${resolvedPartnerType} ${resolvedPartnerName} submitted full onboarding`,
  };

  if (labels[action]) {
    return labels[action];
  }

  return action.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};

const getReviewComment = (action: string, comment: string | null) => {
  if (action === 'PARTNER_SAVED_ONBOARDING_DRAFT' && comment === legacyDraftComment) {
    return 'Legacy draft entry. Newer draft saves include step and field summaries.';
  }

  return comment;
};

const getRequiredDocumentsForPartnerType = (partnerType?: string | null) => {
  if (!partnerType) {
    return [];
  }

  return businessPartnerTypes.has(partnerType) ? businessKycDocumentTypes : individualKycDocumentTypes;
};

const getOptionalDocumentsForPartnerType = (partnerType?: string | null) => {
  if (!partnerType || businessPartnerTypes.has(partnerType)) {
    return [];
  }

  return optionalIndividualKycDocumentTypes;
};

const getDocumentLabel = (documentType: string, partnerType?: string | null) => {
  if (documentType === 'PAN_CARD') {
    return businessPartnerTypes.has(partnerType || '') ? 'Company PAN' : 'PAN Card';
  }

  if (documentType === 'SIGNATURE') {
    return businessPartnerTypes.has(partnerType || '') ? 'Signature / Company Stamp' : 'Signature';
  }

  return documentLabels[documentType] || documentType;
};

const getPartnerTypeMeta = (partnerType?: string | null) => {
  if (partnerType === 'SHOWROOM') {
    return {
      ownerLabel: 'Authorized place owner / signatory name',
      ownerPlaceholder: 'Authorized place owner or director name',
      businessNameLabel: 'Authorized place name',
      businessNamePlaceholder: 'e.g. Amar Equipment Authorized Showroom',
      addressLabel: 'Full physical address',
      addressPlaceholder: 'Unit / Floor, Building Name, Street / Landmark, Industrial Area',
      experienceLabel: 'Industry experience',
      experiencePlaceholder: 'e.g. 6 years in earthmoving machinery retail & service',
      descriptionPlaceholder: 'Describe your machinery dealership, inventory mix, and service capabilities',
      serviceAreasPlaceholder: 'e.g. Raipur, Durg, Bilaspur, Central Chhattisgarh',
      alternateMobilePlaceholder: 'Authorized place alternate mobile',
    };
  }

  return {
    ownerLabel: 'Broker / authorized representative name',
    ownerPlaceholder: 'Broker name or primary representative',
    businessNameLabel: 'Broker / firm trade name',
    businessNamePlaceholder: 'e.g. Amar Equipment Brokerage & Sourcing',
    addressLabel: 'Operating / registered address',
    addressPlaceholder: 'Office address or main working depot location',
    experienceLabel: 'Brokering experience',
    experiencePlaceholder: 'e.g. 4 years in equipment sourcing & valuation',
    descriptionPlaceholder: 'Describe your broker network, machinery sourcing, and client coverage',
    serviceAreasPlaceholder: 'e.g. Raipur, Kanpur, regional sourcing corridors',
    alternateMobilePlaceholder: 'Backup broker contact',
  };
};

export default function KycOnboardingClient({ partnerId }: { partnerId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const { user, updateUser } = useAuthStore();
  const requestedPartnerId = partnerId || (typeof params?.id === 'string' ? params.id : undefined);
  const isAdminMode = Boolean(requestedPartnerId);
  const partnerPortalBasePath = pathname.startsWith('/employee') ? '/employee/partners' : '/admin/partners';
  const editorReturnPath = pathname.startsWith('/employee') ? '/employee/verifications' : '/admin/verifications';
  const [loadedUser, setLoadedUser] = useState<Parameters<typeof updateUser>[0] | null>(null);
  const currentUser = isAdminMode ? loadedUser : user;
  const [resolvedPartnerId, setResolvedPartnerId] = useState<string | null>(requestedPartnerId || null);

  const [profile, setProfile] = useState<OnboardingProfile>(
    emptyProfile(
      currentUser?.email || '',
      currentUser?.name || '',
      currentUser?.mobile || '',
      currentUser?.city || '',
      currentUser?.state || ''
    )
  );
  const [requiredDocuments, setRequiredDocuments] = useState<string[]>([]);
  const [kycDocuments, setKycDocuments] = useState<KycDocumentForm[]>([]);
  const [agreements, setAgreements] = useState<AgreementForm[]>([]);
  const [reviewHistory, setReviewHistory] = useState<OnboardingResponse['reviewHistory']>([]);
  const [progress, setProgress] = useState<OnboardingResponse['progress']>({
    profileComplete: false,
    documentsComplete: false,
    agreementsComplete: false,
    readyForSubmission: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifyingDocumentType, setVerifyingDocumentType] = useState<KycVerificationDocumentType | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [locationStates, setLocationStates] = useState<Option[]>([]);
  const [locationCities, setLocationCities] = useState<Option[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [locationsError, setLocationsError] = useState('');
  const sensitiveInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Preview & Modal states
  const [previewingDoc, setPreviewingDoc] = useState<{ url: string; title: string; isPdf?: boolean } | null>(null);
  const [readingAgreement, setReadingAgreement] = useState<AgreementForm | null>(null);
  const [showAadhaarNumber, setShowAadhaarNumber] = useState(false);

  const currentStatus = currentUser?.kycStatus || 'NOT_STARTED';
  const isApproved = currentUser?.accountStatus === 'ACTIVE' && currentUser?.onboardingStatus === 'APPROVED' && currentUser?.kycStatus === 'APPROVED';
  const canReadPartners = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || hasAnyPermission(user?.permissions, ['partners.read']);
  const canEditPartnerRecord = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || hasAnyPermission(user?.permissions, ['kyc.edit.override']);
  const canEdit = isAdminMode
    ? canEditPartnerRecord
    : !isApproved && currentStatus !== 'UNDER_REVIEW' && currentStatus !== 'SUBMITTED';

  useEffect(() => {
    if (!isAdminMode || !resolvedPartnerId || !currentUser || !pathname.endsWith('/edit') || !canReadPartners) {
      return;
    }

    const canonicalPath = generateAdminPartnerEditPath(partnerPortalBasePath, {
      id: resolvedPartnerId,
      name: currentUser.name,
      businessName: profile.businessName || currentUser.name,
      district: profile.district || currentUser.city || '',
    });

    if (pathname !== canonicalPath) {
      router.replace(canonicalPath);
    }
  }, [isAdminMode, resolvedPartnerId, currentUser, pathname, partnerPortalBasePath, profile.businessName, profile.district, canReadPartners, router]);

  const steps = useMemo(
    () => [
      { id: 'profile', number: '01', title: 'Account', description: 'Primary contact & signatory identity', icon: User },
      { id: 'business', number: '02', title: 'Business', description: 'Business profile & operating details', icon: Building2 },
      { id: 'kyc', number: '03', title: 'KYC Docs', description: 'Identity, business & bank document vault', icon: CreditCard },
      { id: 'agreements', number: '04', title: 'Agreements', description: 'Mandatory platform & compliance declarations', icon: ShieldCheck },
      { id: 'review', number: '05', title: 'Review', description: 'Check completeness & submit for approval', icon: FileCheck2 },
    ],
    []
  );
  const progressStep = getOnboardingProgressStep(currentStep, steps.length, isApproved);

  useEffect(() => {
    let cancelled = false;

    const loadOnboarding = async () => {
      try {
        const targetPartnerId = isAdminMode && requestedPartnerId
          ? (await resolvePartnerId(requestedPartnerId)) || requestedPartnerId
          : requestedPartnerId;
        if (!cancelled) {
          setResolvedPartnerId(targetPartnerId || null);
        }
        const response = await api.get<OnboardingResponse>(
          isAdminMode && targetPartnerId
            ? `/superadmin/partners/${targetPartnerId}/onboarding`
            : '/auth/partner/onboarding'
        );
        if (cancelled) {
          return;
        }

        const data = response.data;
        if (data.user && !isAdminMode) {
          updateUser(data.user);
        }
        if (data.user && isAdminMode) {
          setLoadedUser(data.user);
        }

        setProfile(data.profile);
        setRequiredDocuments(data.requiredDocuments);
        setKycDocuments(data.kycDocuments);
        setAgreements(data.agreements);
        setReviewHistory(data.reviewHistory);
        setProgress(data.progress);

        const accountComplete = !!(
          data.profile.ownerName?.trim() &&
          data.profile.businessName?.trim() &&
          data.profile.partnerType &&
          data.profile.primaryContact?.trim() &&
          data.profile.whatsappNumber?.trim()
        );
        const businessComplete = !!(
          data.profile.state?.trim() &&
          data.profile.city?.trim() &&
          data.profile.pinCode?.trim() &&
          data.profile.businessAddress?.trim() &&
          data.profile.businessExperience?.trim() &&
          (data.profile.partnerType === 'SHOWROOM' || String(data.profile.expectedMonthlyListings || '').trim()) &&
          (data.profile.partnerType === 'SHOWROOM' || data.profile.contactPreference?.trim())
        );
        setCurrentStep(
          !accountComplete ? 0
            : !businessComplete ? 1
              : !data.progress.documentsComplete ? 2
                : !data.progress.agreementsComplete ? 3
                  : 4,
        );
      } catch (err) {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(err)) {
          setError(err.response?.data?.error || 'Unable to load onboarding data.');
        } else {
          setError('Unable to load onboarding data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadOnboarding();

    return () => {
      cancelled = true;
    };
  }, [isAdminMode, requestedPartnerId, updateUser]);

  const effectiveRequiredDocuments = useMemo(() => {
    const derivedDocuments = getRequiredDocumentsForPartnerType(profile.partnerType);
    return derivedDocuments.length > 0 ? derivedDocuments : requiredDocuments;
  }, [profile.partnerType, requiredDocuments]);

  const optionalDocuments = useMemo(
    () => getOptionalDocumentsForPartnerType(profile.partnerType),
    [profile.partnerType]
  );

  const visiblePartnerTypeOptions = useMemo(() => {
    if (profile.partnerType && !partnerTypeOptions.includes(profile.partnerType)) {
      return [profile.partnerType, ...partnerTypeOptions];
    }

    return partnerTypeOptions;
  }, [profile.partnerType]);

  const documentsByType = useMemo(() => {
    const map = new Map(kycDocuments.map((document) => [document.documentType, document]));
    return effectiveRequiredDocuments.map((documentType) => {
      const existing = map.get(documentType);
      return (
        existing || {
          documentType,
          fileUrl: '',
          fileName: '',
          documentNumber: '',
          nameOnDocument: '',
          issueDate: '',
          expiryDate: '',
          submittedNote: '',
          status: 'NOT_UPLOADED',
          reviewComment: '',
        }
      );
    });
  }, [effectiveRequiredDocuments, kycDocuments]);

  const optionalDocumentsByType = useMemo(() => {
    const map = new Map(kycDocuments.map((document) => [document.documentType, document]));
    return optionalDocuments.map((documentType) => {
      const existing = map.get(documentType);
      return (
        existing || {
          documentType,
          fileUrl: '',
          fileName: '',
          documentNumber: '',
          nameOnDocument: '',
          issueDate: '',
          expiryDate: '',
          submittedNote: '',
          status: 'NOT_UPLOADED',
          reviewComment: '',
        }
      );
    });
  }, [kycDocuments, optionalDocuments]);

  useEffect(() => {
    if (loading) return;

    const clearBrowserInjectedValues = () => {
      documentsByType.forEach((document) => {
        if (!document.documentNumber) {
          const input = sensitiveInputRefs.current[document.documentType];
          if (input) input.value = '';
        }
      });
    };

    clearBrowserInjectedValues();
    const timer = window.setTimeout(clearBrowserInjectedValues, 350);
    return () => window.clearTimeout(timer);
  }, [documentsByType, loading]);

  const checkedAgreementTypes = useMemo(
    () => agreements.filter((agreement) => agreement.checked).map((agreement) => agreement.agreementType),
    [agreements]
  );

  const isAccountComplete = !!(
    profile.ownerName?.trim() &&
    profile.businessName?.trim() &&
    profile.partnerType &&
    profile.primaryContact?.trim() &&
    profile.whatsappNumber?.trim()
  );
  const isBusinessComplete = !!(
    profile.state?.trim() &&
    profile.city?.trim() &&
    profile.pinCode?.trim() &&
    profile.businessAddress?.trim() &&
    profile.businessExperience?.trim() &&
    (profile.partnerType === 'SHOWROOM' || String(profile.expectedMonthlyListings || '').trim()) &&
    (profile.partnerType === 'SHOWROOM' || profile.contactPreference?.trim())
  );
  const areAgreementsComplete = agreements
    .filter((agreement) => agreement.isRequired)
    .every((agreement) => agreement.checked);

  const reviewChecklist = useMemo(
    () => [
      { label: 'Account & Signatory Identity', stepIndex: 0, done: isAccountComplete, subtitle: profile.ownerName || 'Not configured' },
      { label: 'Business & Operating Profile', stepIndex: 1, done: isBusinessComplete, subtitle: profile.businessName ? `${profile.businessName} · ${profile.city || ''}` : 'Location pending' },
      { label: 'Mandatory KYC Documents', stepIndex: 2, done: progress.documentsComplete, subtitle: `${documentsByType.filter(d => d.fileUrl).length} of ${documentsByType.length} uploaded` },
      { label: 'Compliance & Declarations', stepIndex: 3, done: progress.agreementsComplete && areAgreementsComplete, subtitle: `${agreements.filter(a => a.checked).length} of ${agreements.length} accepted` },
    ],
    [progress, isAccountComplete, isBusinessComplete, areAgreementsComplete, profile, documentsByType, agreements]
  );

  const submitBlockers = useMemo(
    () =>
      [
        !isAccountComplete ? 'Account & Signatory details are incomplete (Step 1)' : '',
        !isBusinessComplete ? 'Business information & location are incomplete (Step 2)' : '',
        !progress.documentsComplete ? 'Required KYC documents are pending (Step 3)' : '',
        !(progress.agreementsComplete && areAgreementsComplete) ? 'Mandatory platform agreements must be accepted (Step 4)' : '',
      ].filter(Boolean),
    [isAccountComplete, isBusinessComplete, progress.documentsComplete, progress.agreementsComplete, areAgreementsComplete]
  );

  const submitStatus = useMemo(() => {
    if (!canEdit) {
      if (currentStatus === 'UNDER_REVIEW') {
        return 'Submission is locked while your application is under review.';
      }
      if (currentStatus === 'SUBMITTED') {
        return 'Application submitted. Our verification team is actively reviewing your dossier.';
      }
      return 'Submission is locked for the current onboarding status.';
    }

    if (submitBlockers.length > 0) {
      return `Pending items: ${submitBlockers.join(', ')}.`;
    }

    return 'All requirements are fulfilled. Your application is ready for final review.';
  }, [canEdit, currentStatus, submitBlockers]);

  const canSubmitOnboarding = canEdit && !submitting && submitBlockers.length === 0;

  const isBusinessPartner = businessPartnerTypes.has(profile.partnerType);
  const partnerTypeMeta = useMemo(() => getPartnerTypeMeta(profile.partnerType), [profile.partnerType]);

  useEffect(() => {
    let cancelled = false;

    const loadStates = async () => {
      setLocationsLoading(true);
      setLocationsError('');

      try {
        const countriesResponse = await api.get<Option[]>('/locations/countries');
        const india = (countriesResponse.data || []).find(
          (option) => option.name.trim().toLowerCase() === 'india',
        );

        if (!india) {
          throw new Error('India location data is not available.');
        }

        const statesResponse = await api.get<Option[]>(`/locations/states/${india.id}`);
        if (!cancelled) {
          setLocationStates(normalizeLocationOptions(statesResponse.data));
        }
      } catch {
        if (!cancelled) {
          setLocationStates([]);
          setLocationsError('Unable to load states from database.');
        }
      } finally {
        if (!cancelled) {
          setLocationsLoading(false);
        }
      }
    };

    void loadStates();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedStateId = useMemo(() => {
    return findLocationOptionId(locationStates, profile.state);
  }, [locationStates, profile.state]);

  const selectedCityId = useMemo(() => {
    return findLocationOptionId(locationCities, profile.city);
  }, [locationCities, profile.city]);

  useEffect(() => {
    if (!selectedStateId) {
      return;
    }

    let cancelled = false;

    const loadCities = async () => {
      setCitiesLoading(true);
      setLocationsError('');
      try {
        const response = await api.get<Option[]>(`/locations/cities/${selectedStateId}`);
        if (!cancelled) {
          setLocationCities(normalizeLocationOptions(response.data));
        }
      } catch {
        if (!cancelled) {
          setLocationCities([]);
          setLocationsError('Unable to load cities for selected state.');
        }
      } finally {
        if (!cancelled) {
          setCitiesLoading(false);
        }
      }
    };

    void loadCities();

    return () => {
      cancelled = true;
    };
  }, [selectedStateId]);

  const handleStateChange = (option: Option) => {
    setLocationCities([]);
    setLocationsError('');
    setProfile((current) => ({ ...current, state: option.name, city: '' }));
  };

  const handleCityChange = (option: Option) => {
    setProfile((current) => ({ ...current, city: option.name }));
  };

  const refreshWithResponse = (
    data: { user: Parameters<typeof updateUser>[0]; onboarding?: OnboardingResponse },
    keepCurrentStep = false,
  ) => {
    if (isAdminMode) {
      setLoadedUser(data.user);
    } else {
      updateUser(data.user);
    }
    if (data.onboarding) {
      setProfile(data.onboarding.profile);
      setRequiredDocuments(data.onboarding.requiredDocuments);
      setKycDocuments(data.onboarding.kycDocuments);
      setAgreements(data.onboarding.agreements);
      setReviewHistory(data.onboarding.reviewHistory);
      setProgress(data.onboarding.progress);

      const accountComplete = !!(
        data.onboarding.profile.ownerName?.trim() &&
        data.onboarding.profile.businessName?.trim() &&
        data.onboarding.profile.partnerType &&
        data.onboarding.profile.primaryContact?.trim() &&
        data.onboarding.profile.whatsappNumber?.trim()
      );
      const businessComplete = !!(
        data.onboarding.profile.state?.trim() &&
        data.onboarding.profile.city?.trim() &&
        data.onboarding.profile.pinCode?.trim() &&
        data.onboarding.profile.businessAddress?.trim() &&
        data.onboarding.profile.businessExperience?.trim() &&
        (data.onboarding.profile.partnerType === 'SHOWROOM' || String(data.onboarding.profile.expectedMonthlyListings || '').trim()) &&
        (data.onboarding.profile.partnerType === 'SHOWROOM' || data.onboarding.profile.contactPreference?.trim())
      );
      if (keepCurrentStep) {
        setCurrentStep(getStepToKeepAfterDraftSave(currentStep));
      } else {
        setCurrentStep(
          !accountComplete ? 0
            : !businessComplete ? 1
              : !data.onboarding.progress.documentsComplete ? 2
                : !data.onboarding.progress.agreementsComplete ? 3
                  : 4,
        );
      }
    }
  };

  const buildReviewTrailComment = (stepIndex: number, mode: 'draft' | 'submit') => {
    const stepId = steps[stepIndex]?.id;
    const stepName = steps[stepIndex]?.title || 'Onboarding form';
    const uploadedDocuments = kycDocuments.filter((document) => document.fileUrl || document.fileName || document.documentNumber);
    const acceptedAgreements = agreements.filter((agreement) => agreement.checked).length;
    const totalAgreements = agreements.length;

    if (mode === 'submit') {
      return `Partner submitted full onboarding package for review. Owner: ${profile.ownerName || 'N/A'}, business: ${profile.businessName || 'N/A'}, KYC docs: ${uploadedDocuments.length}, agreements: ${acceptedAgreements}/${totalAgreements}.`;
    }

    const submissionPrefix = `Partner saved draft for ${stepName}.`;

    if (stepId === 'profile') {
      return `${submissionPrefix} Owner: ${profile.ownerName || 'N/A'}, business: ${profile.businessName || 'N/A'}, partner type: ${profile.partnerType || 'N/A'}, contact: ${profile.primaryContact || 'N/A'}.`;
    }

    if (stepId === 'business') {
      return `${submissionPrefix} Location: ${[profile.city, profile.state].filter(Boolean).join(', ') || 'N/A'}, address: ${profile.businessAddress || 'N/A'}.`;
    }

    if (stepId === 'kyc') {
      const documentPreview = uploadedDocuments
        .slice(0, 3)
        .map((document) => getDocumentLabel(document.documentType, profile.partnerType))
        .join(', ');

      return `${submissionPrefix} Uploaded ${uploadedDocuments.length} KYC document${uploadedDocuments.length === 1 ? '' : 's'}${documentPreview ? `: ${documentPreview}.` : '.'}`;
    }

    if (stepId === 'agreements') {
      return `${submissionPrefix} Accepted ${acceptedAgreements}/${totalAgreements} required agreements.`;
    }

    return submissionPrefix;
  };

  const buildPayload = () => {
    const profileWithoutLegacyGst = Object.fromEntries(
      Object.entries(profile).filter(([key]) => key !== 'gstNumber'),
    );
    return {
      profile: {
        ...profileWithoutLegacyGst,
        primaryContact: profile.primaryContact.replace(/[^0-9]/g, '').slice(0, 10),
        alternateMobile: profile.alternateMobile.replace(/[^0-9]/g, '').slice(0, 10),
        whatsappNumber: profile.whatsappNumber.replace(/[^0-9]/g, '').slice(0, 10),
        pinCode: profile.pinCode.replace(/[^0-9]/g, '').slice(0, 6),
        partnerType: profile.partnerType || '',
      },
      kycDocuments: documentsByType,
      agreements: checkedAgreementTypes,
    };
  };

  const handleStepNavigation = (targetIndex: number) => {
    if (!isAdminMode && targetIndex > currentStep) {
      const stepError = getPartnerOnboardingStepError(steps[currentStep]?.id || '', profile);
      if (stepError) {
        setError(stepError);
        return;
      }
    }

    setError('');
    setCurrentStep(targetIndex);
  };

  const handleSaveDraft = async () => {
    if (isAdminMode && !canEdit) {
      setError('You do not have permission to edit this partner KYC record.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        ...buildPayload(),
        actionComment: buildReviewTrailComment(currentStep, 'draft'),
      };

      const targetPartnerId = isAdminMode ? resolvedPartnerId || requestedPartnerId : null;
      const response = await api.put(
        isAdminMode && targetPartnerId
          ? `/superadmin/partners/${targetPartnerId}/onboarding`
          : '/auth/partner/onboarding',
        payload
      );
      refreshWithResponse(response.data, true);
      if (isAdminMode) {
        router.push(editorReturnPath);
        return;
      }

      setSuccess(response.data.message || 'Onboarding draft saved successfully.');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Unable to save onboarding draft.');
      } else {
        setError('Unable to save onboarding draft.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const targetPartnerId = isAdminMode ? resolvedPartnerId || requestedPartnerId : null;
      const response = await api.post(
        isAdminMode && targetPartnerId
          ? `/superadmin/partners/${targetPartnerId}/onboarding/submit`
          : '/auth/partner/onboarding/submit',
        {
          ...buildPayload(),
          actionComment: buildReviewTrailComment(currentStep, 'submit'),
        }
      );
      refreshWithResponse(response.data);
      if (isAdminMode) {
        router.push(editorReturnPath);
        return;
      }

      setSuccess(response.data.message || 'Onboarding submitted successfully.');
      setCurrentStep(steps.length - 1);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Unable to submit onboarding package.');
      } else {
        setError('Unable to submit onboarding package.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateDocument = (documentType: string, patch: Partial<KycDocumentForm>) => {
    setKycDocuments((current) => {
      const existing = current.find((document) => document.documentType === documentType);
      if (existing) {
        return current.map((document) =>
          document.documentType === documentType ? { ...document, ...patch } : document
        );
      }

      return [
        ...current,
        {
          documentType,
          fileUrl: '',
          fileName: '',
          documentNumber: '',
          nameOnDocument: '',
          issueDate: '',
          expiryDate: '',
          submittedNote: '',
          status: 'NOT_UPLOADED',
          reviewComment: '',
          ...patch,
        },
      ];
    });
  };

  const verifyKycDocument = async (documentType: KycVerificationDocumentType) => {
    const document = documentsByType.find((item) => item.documentType === documentType);
    const documentNumber = normalizeKycDocumentNumber(documentType, document?.documentNumber || '');
    const validationError = validateKycDocumentNumber(documentType, documentNumber);
    if (validationError) {
      updateDocument(documentType, { verificationStatus: 'FAILED', verificationMessage: validationError });
      setError(validationError);
      setSuccess('');
      return;
    }

    setVerifyingDocumentType(documentType);
    setError('');
    setSuccess('');
    updateDocument(documentType, { documentNumber, verificationStatus: 'VERIFYING', verificationMessage: '' });

    try {
      const targetPartnerId = isAdminMode ? resolvedPartnerId || requestedPartnerId : null;
      const endpoint = isAdminMode && targetPartnerId
        ? documentType === 'PAN_CARD' ? '/pan-verification/comprehensive-v2' : '/gst-verification/verify'
        : documentType === 'PAN_CARD' ? '/auth/partner/kyc/verify-pan' : '/auth/partner/kyc/verify-gstin';
      const response = await api.post(endpoint, { id_number: documentNumber });
      const verificationResult = (response.data?.result || null) as Record<string, unknown> | null;
      const display = getKycVerificationDisplay(documentType, verificationResult);
      const verified = isKycVerificationSuccessful(documentType, verificationResult);
      const cacheHit = response.data?.cacheHit === true;

      updateDocument(documentType, {
        documentNumber,
        nameOnDocument: display.displayName || document?.nameOnDocument || '',
        verificationStatus: verified ? 'VERIFIED' : 'MANUAL_REVIEW',
        verificationRecordId: response.data?.record?.id || '',
        verificationCacheHit: cacheHit,
        verificationResult,
        verificationMessage: verified
          ? ''
          : 'Official record retrieved, but requires manual team sign-off before approval.',
      });
      setSuccess(
        verified
          ? cacheHit
            ? `${documentType === 'PAN_CARD' ? 'Company PAN' : 'GSTIN'} verified from saved database registry.`
            : `${documentType === 'PAN_CARD' ? 'Company PAN' : 'GSTIN'} verified successfully via Government portal.`
          : 'Verification result stored for review.',
      );
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || 'Verification could not be completed.'
        : 'Verification could not be completed.';
      updateDocument(documentType, { verificationStatus: 'FAILED', verificationMessage: message });
      setError(message);
    } finally {
      setVerifyingDocumentType(null);
    }
  };

  // Stepper completion calculation
  const totalSteps = steps.length;
  const completedStepsCount = [
    isAccountComplete,
    isBusinessComplete,
    progress.documentsComplete,
    progress.agreementsComplete && areAgreementsComplete,
    currentUser?.onboardingStatus === 'SUBMITTED' || isApproved,
  ].filter(Boolean).length;
  const progressPercent = Math.round((completedStepsCount / totalSteps) * 100);

  // Status badge styling
  const renderPartnerStatusBadge = () => {
    if (isApproved) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-3 w-3" /> Approved & Active
        </span>
      );
    }
    if (currentStatus === 'SUBMITTED' || currentStatus === 'UNDER_REVIEW') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">
          <Clock className="h-3 w-3" /> Under Verification
        </span>
      );
    }
    if (currentUser?.onboardingStatus === 'CHANGES_REQUESTED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200">
          <AlertCircle className="h-3 w-3" /> Changes Requested
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
        <Sparkles className="h-3 w-3 text-[#FFC107]" /> Draft In Progress
      </span>
    );
  };

  if (loading) {
    return (
      <BrandLoader variant="section" size="md" bg="light" text="Loading KYC onboarding workspace..." />
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* ── 1. EXECUTIVE STEPPER & WORKSPACE HEADER ── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs">
        {/* Header Ribbon */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-600 border border-amber-200/60 shadow-2xs">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  {isAdminMode ? 'SuperAdmin KYC Dossier Editor' : 'Partner Onboarding & KYC Hub'}
                </span>
                {renderPartnerStatusBadge()}
              </div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-tight mt-0.5">
                {isAdminMode
                  ? `Editing KYC: ${profile.businessName || profile.ownerName || 'Partner'}`
                  : 'Official Commercial Onboarding & Verification'}
              </h1>
            </div>
          </div>

          {/* Right Action / Progress Ribbon */}
          <div className="flex items-center gap-3 self-end sm:self-center">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Progress</span>
              <span className="text-xs font-semibold text-slate-800">{completedStepsCount} of {totalSteps} Complete ({progressPercent}%)</span>
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all shadow-2xs disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span>Save Draft</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 5-Step Progress Stepper Navigation */}
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-2">
            {steps.map((step, index) => {
              const isActive = currentStep === index;
              const isPast = isApproved ? index < steps.length : index < currentStep;

              let isCompleted = isApproved;
              switch (step.id) {
                case 'profile':
                  isCompleted = isAccountComplete;
                  break;
                case 'business':
                  isCompleted = isBusinessComplete;
                  break;
                case 'kyc':
                  isCompleted = progress.documentsComplete;
                  break;
                case 'agreements':
                  isCompleted = progress.agreementsComplete && areAgreementsComplete;
                  break;
                case 'review':
                  isCompleted = isApproved || currentUser?.onboardingStatus === 'SUBMITTED';
                  break;
              }

              const StepIcon = step.icon;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => handleStepNavigation(index)}
                  className={`group relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                    isActive
                      ? 'border-[#FFC107] bg-amber-50/50 shadow-2xs ring-1 ring-[#FFC107]/40'
                      : isCompleted
                      ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/70'
                      : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-[#FFC107] text-slate-950 shadow-2xs font-bold'
                        : isCompleted
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : isPast
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isCompleted ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : step.number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold truncate ${
                        isActive ? 'text-amber-950 font-bold' : isCompleted ? 'text-emerald-950' : 'text-slate-700'
                      }`}
                    >
                      {step.title}
                    </p>
                    <p className="text-[11px] font-normal text-slate-400 truncate hidden lg:block">
                      {isCompleted ? 'Completed' : isActive ? 'Active Now' : 'Pending'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 2. SYSTEM ALERTS (Errors / Success / Changes Requested) ── */}
      {currentUser?.onboardingStatus === 'CHANGES_REQUESTED' && currentStatus !== 'SUBMITTED' && (
        <div className="rounded-xl border border-rose-300 bg-rose-50/90 p-3.5 shadow-2xs flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            <AlertCircle className="h-4.5 w-4.5" />
          </div>
          <div className="text-xs">
            <h4 className="font-bold text-rose-950">Action Required: Compliance Review Requested Updates</h4>
            <p className="mt-0.5 text-rose-800 leading-relaxed">
              SuperAdmin has reviewed your dossier and requested corrections. Please review notes in the <b>Current Review Trail</b> (Step 05), update the flagged documents or details, and re-submit for approval.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 shadow-2xs flex items-center justify-between gap-2 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="font-semibold">{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="text-rose-500 hover:text-rose-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 shadow-2xs flex items-center justify-between gap-2 text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess('')} className="text-emerald-500 hover:text-emerald-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── 3. MAIN WORKSPACE CONTAINER ── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        {/* Step Banner */}
        <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFC107] text-xs font-bold text-slate-950">
              {steps[currentStep].number}
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                {steps[currentStep].description}
              </h2>
              <p className="text-xs font-normal text-slate-500 mt-0.5">
                {steps[currentStep].id === 'profile' && 'Authorized signatory details and commercial identity classification'}
                {steps[currentStep].id === 'business' && 'Authorized place location, experience, operating scale and address details'}
                {steps[currentStep].id === 'kyc' && 'Government PAN, GSTIN verification, ID proofs and official photos'}
                {steps[currentStep].id === 'agreements' && 'Mandatory regulatory declarations, authenticities and broker covenants'}
                {steps[currentStep].id === 'review' && 'Final readiness validation, audit history and submission confirmation'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Step {currentStep + 1} of {steps.length}</span>
          </div>
        </div>

        {/* Step Body */}
        <div className="p-4 sm:p-6">
          {/* ══════════════════════════════════════════════════════════════
              STEP 0: ACCOUNT & SIGNATORY BASICS
             ══════════════════════════════════════════════════════════════ */}
          {steps[currentStep].id === 'profile' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5 mb-3.5">
                  <User className="h-4 w-4 text-amber-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Primary Signatory & Account Credentials
                  </h3>
                </div>

                <div className="grid gap-3.5 sm:grid-cols-2">
                  <FormField label={partnerTypeMeta.ownerLabel} required>
                    <div className="relative">
                      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input data-sanitize="name"
                        value={profile.ownerName}
                        onChange={(event) => setProfile((current) => ({ ...current, ownerName: toTitleCase(event.target.value) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5`}
                        placeholder={partnerTypeMeta.ownerPlaceholder}
                      />
                    </div>
                  </FormField>

                  <FormField label="Official partner category / type" required>
                    <div className="relative">
                      <select
                        value={profile.partnerType}
                        onChange={(event) => {
                          const newPartnerType = event.target.value;
                          setProfile((current) => ({ ...current, partnerType: newPartnerType }));
                          if (!isAdminMode && user) {
                            updateUser({ ...user, partnerType: newPartnerType });
                          }
                        }}
                        disabled={!canEdit}
                        className={`${inputCompactClassName}`}
                      >
                        <option value="">Select partner type</option>
                        {visiblePartnerTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {formatPartnerTypeLabel(option)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </FormField>

                  <FormField label="Primary mobile number (OTP enabled)" required>
                    <div className="relative">
                      <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={profile.primaryContact}
                        onChange={(event) => setProfile((current) => ({ ...current, primaryContact: event.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5 font-mono`}
                        placeholder="9876543210"
                        maxLength={10}
                      />
                    </div>
                  </FormField>

                  <FormField label="WhatsApp business number" required>
                    <div className="relative">
                      <MessageCircle className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />
                      <input
                        value={profile.whatsappNumber}
                        onChange={(event) => setProfile((current) => ({ ...current, whatsappNumber: event.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5 font-mono`}
                        placeholder="9876543210"
                        maxLength={10}
                      />
                      {canEdit && profile.primaryContact && profile.whatsappNumber !== profile.primaryContact && (
                        <button
                          type="button"
                          onClick={() => setProfile(c => ({ ...c, whatsappNumber: c.primaryContact }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200"
                        >
                          Same as primary
                        </button>
                      )}
                    </div>
                  </FormField>

                  <FormField label="Official email address" required fullWidth>
                    <div className="relative">
                      <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input data-sanitize="email"
                        value={profile.email}
                        onChange={(event) => setProfile((current) => ({ ...current, email: toLowerCase(event.target.value) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5`}
                        placeholder="authorized@dealership.com"
                      />
                    </div>
                  </FormField>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 1: BUSINESS PROFILE & OPERATING DETAILS (SCREENSHOT 1)
             ══════════════════════════════════════════════════════════════ */}
          {steps[currentStep].id === 'business' && (
            <div className="space-y-4">
              {/* Block A: Operating Entity Profile */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5 mb-3.5">
                  <Building2 className="h-4 w-4 text-amber-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Entity Profile & Commercial Experience
                  </h3>
                </div>

                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField label={partnerTypeMeta.businessNameLabel} required>
                    <div className="relative">
                      <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={profile.businessName}
                        onChange={(event) => setProfile((current) => ({ ...current, businessName: toTitleCase(event.target.value) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5`}
                        placeholder={partnerTypeMeta.businessNamePlaceholder}
                      />
                    </div>
                  </FormField>

                  <FormField label={partnerTypeMeta.experienceLabel} required>
                    <div className="relative">
                      <Award className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={profile.businessExperience}
                        onChange={(event) => setProfile((current) => ({ ...current, businessExperience: toSentenceCase(event.target.value) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5`}
                        placeholder={partnerTypeMeta.experiencePlaceholder}
                      />
                    </div>
                  </FormField>

                  <FormField label="Years in business" required>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={profile.yearsInBusiness}
                        onChange={(event) => setProfile((current) => ({ ...current, yearsInBusiness: event.target.value.replace(/[^0-9]/g, '').slice(0, 3) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5`}
                        placeholder="e.g. 8"
                      />
                    </div>
                  </FormField>

                  <FormField label="Team / Staff size">
                    <div className="relative">
                      <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={profile.teamSize}
                        onChange={(event) => setProfile((current) => ({ ...current, teamSize: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5`}
                        placeholder="e.g. 15"
                      />
                    </div>
                  </FormField>

                  <FormField label="Alternate mobile contact">
                    <div className="relative">
                      <PhoneCall className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={profile.alternateMobile}
                        onChange={(event) => setProfile((current) => ({ ...current, alternateMobile: event.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5 font-mono`}
                        placeholder={partnerTypeMeta.alternateMobilePlaceholder}
                        maxLength={10}
                      />
                    </div>
                  </FormField>

                  {profile.partnerType !== 'BROKER' && profile.partnerType !== 'SHOWROOM' && (
                    <FormField label="Expected monthly listings">
                      <input
                        value={profile.expectedMonthlyListings}
                        onChange={(event) => setProfile((current) => ({ ...current, expectedMonthlyListings: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))}
                        disabled={!canEdit}
                        className={inputCompactClassName}
                        placeholder="12"
                      />
                    </FormField>
                  )}
                </div>
              </div>

              {/* Block B: Physical Location & Address */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5 mb-3.5">
                  <MapPin className="h-4 w-4 text-amber-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Physical Yard / Showroom Location
                  </h3>
                </div>

                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField label="State" required>
                    <SearchableSelect
                      options={locationStates}
                      value={selectedStateId || profile.state}
                      displayValue={profile.state}
                      onChange={handleStateChange}
                      placeholder={locationsLoading ? 'Loading states...' : 'Select state'}
                      disabled={!canEdit}
                      size="sm"
                    />
                    {locationsError ? <p className="mt-1 text-[11px] text-red-600">{locationsError}</p> : null}
                  </FormField>

                  <FormField label="City / District" required>
                    <SearchableSelect
                      options={selectedStateId ? locationCities : []}
                      value={selectedCityId || profile.city}
                      displayValue={profile.city}
                      onChange={handleCityChange}
                      placeholder={citiesLoading ? 'Loading cities...' : selectedStateId ? 'Select city' : 'Select state first'}
                      disabled={!canEdit || !selectedStateId || citiesLoading}
                      size="sm"
                    />
                  </FormField>

                  <FormField label="PIN Code" required>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={profile.pinCode}
                        onChange={(event) => setProfile((current) => ({ ...current, pinCode: event.target.value.replace(/[^0-9]/g, '').slice(0, 6) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5 font-mono`}
                        placeholder="492001"
                        maxLength={6}
                      />
                    </div>
                  </FormField>

                  <FormField label="Google Maps link / Coordinates" fullWidth>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Compass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          value={profile.googleMapsLocation}
                          onChange={(event) => setProfile((current) => ({ ...current, googleMapsLocation: event.target.value }))}
                          disabled={!canEdit}
                          className={`${inputCompactClassName} pl-8.5`}
                          placeholder="https://maps.app.goo.gl/... or share link"
                        />
                      </div>
                      {profile.googleMapsLocation && (
                        <a
                          href={profile.googleMapsLocation}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>View Map</span>
                        </a>
                      )}
                    </div>
                  </FormField>

                  <FormField label={partnerTypeMeta.addressLabel} required fullWidth>
                    <textarea
                      value={profile.businessAddress}
                      onChange={(event) => setProfile((current) => ({ ...current, businessAddress: toSentenceCase(event.target.value) }))}
                      disabled={!canEdit}
                      rows={2}
                      className={textareaCompactClassName}
                      placeholder={partnerTypeMeta.addressPlaceholder}
                    />
                  </FormField>
                </div>
              </div>

              {/* Block C: Market Reach & Web Presence */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5 mb-3.5">
                  <Globe className="h-4 w-4 text-amber-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Service Reach & Digital Channels
                  </h3>
                </div>

                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField label="Service areas / Districts covered">
                    <input
                      value={profile.serviceAreas}
                      onChange={(event) => setProfile((current) => ({ ...current, serviceAreas: toTitleCase(event.target.value) }))}
                      disabled={!canEdit}
                      className={inputCompactClassName}
                      placeholder={partnerTypeMeta.serviceAreasPlaceholder}
                    />
                  </FormField>

                  <FormField label="Official website">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          value={profile.websiteUrl}
                          onChange={(event) => setProfile((current) => ({ ...current, websiteUrl: toLowerCase(event.target.value) }))}
                          disabled={!canEdit}
                          className={`${inputCompactClassName} pl-8.5`}
                          placeholder="https://dealership.com"
                        />
                      </div>
                      {profile.websiteUrl && (
                        <a
                          href={profile.websiteUrl.startsWith('http') ? profile.websiteUrl : `https://${profile.websiteUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </FormField>

                  <FormField label="Social media profile URLs">
                    <div className="relative">
                      <Share2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={profile.socialLinks}
                        onChange={(event) => setProfile((current) => ({ ...current, socialLinks: toLowerCase(event.target.value) }))}
                        disabled={!canEdit}
                        className={`${inputCompactClassName} pl-8.5`}
                        placeholder="Instagram, LinkedIn, Facebook profiles"
                      />
                    </div>
                  </FormField>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 2: KYC DOCS VAULT (SCREENSHOTS 2, 3, 4)
             ══════════════════════════════════════════════════════════════ */}
          {steps[currentStep].id === 'kyc' && (
            <div className="space-y-4">
              {/* Document Overview Strip */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-semibold text-slate-800">KYC Verification Vault:</span>
                  <span className="text-xs font-normal text-slate-600">
                    {documentsByType.filter(d => d.fileUrl).length} of {documentsByType.length} Required Documents Ready
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {documentsByType.map(doc => {
                    const isUploaded = Boolean(doc.fileUrl);
                    const isVerified = doc.verificationStatus === 'VERIFIED';
                    return (
                      <span
                        key={doc.documentType}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium leading-none ${
                          isVerified
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : isUploaded
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-slate-200 text-slate-600 border border-slate-300'
                        }`}
                      >
                        {isVerified ? '✓ ' : isUploaded ? '↑ ' : '— '}
                        {doc.documentType === 'PAN_CARD' ? 'PAN' : doc.documentType === 'GST_CERTIFICATE' ? 'GST' : doc.documentType === 'AADHAAR_CARD' ? 'Aadhaar' : 'Photo'}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Document Cards Grid */}
              <div className="grid gap-3.5 lg:grid-cols-2">
                {documentsByType.map((document) => {
                  const canVerify = document.documentType === 'PAN_CARD' || document.documentType === 'GST_CERTIFICATE';
                  const isVerifying = verifyingDocumentType === document.documentType;
                  const verDisplay = document.verificationResult
                    ? getKycVerificationDisplay(document.documentType as KycVerificationDocumentType, document.verificationResult)
                    : null;
                  const docLabel = document.documentType === 'PAN_CARD'
                    ? 'Company PAN number'
                    : document.documentType === 'GST_CERTIFICATE'
                      ? 'GSTIN'
                      : document.documentType === 'AADHAAR_CARD'
                        ? 'Aadhaar / Accepted ID number'
                        : 'Document reference number';

                  return (
                    <CompactKycDocumentCard
                      key={document.documentType}
                      document={document}
                      docLabel={docLabel}
                      partnerType={profile.partnerType}
                      canEdit={canEdit}
                      canVerify={canVerify}
                      isVerifying={isVerifying}
                      verDisplay={verDisplay}
                      sensitiveInputRef={(el) => {
                        sensitiveInputRefs.current[document.documentType] = el;
                      }}
                      onUpdate={(patch) => updateDocument(document.documentType, patch)}
                      onVerify={() => void verifyKycDocument(document.documentType as KycVerificationDocumentType)}
                      onPreview={(url, title, isPdf) => setPreviewingDoc({ url, title, isPdf })}
                      showAadhaarNumber={showAadhaarNumber}
                      onToggleAadhaarVisibility={() => setShowAadhaarNumber(!showAadhaarNumber)}
                    />
                  );
                })}
              </div>

              {/* Optional Documents if any */}
              {optionalDocumentsByType.length > 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Additional Secondary Documents (Optional)
                  </span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {optionalDocumentsByType.map((document) => (
                      <CompactKycDocumentCard
                        key={document.documentType}
                        document={document}
                        docLabel="Document number"
                        partnerType={profile.partnerType}
                        canEdit={canEdit}
                        canVerify={false}
                        isVerifying={false}
                        verDisplay={null}
                        sensitiveInputRef={() => {}}
                        onUpdate={(patch) => updateDocument(document.documentType, patch)}
                        onVerify={() => {}}
                        onPreview={(url, title, isPdf) => setPreviewingDoc({ url, title, isPdf })}
                        showAadhaarNumber={false}
                        onToggleAadhaarVisibility={() => {}}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 3: COMPLIANCE DECLARATIONS & AGREEMENTS (SCREENSHOT 5)
             ══════════════════════════════════════════════════════════════ */}
          {steps[currentStep].id === 'agreements' && (
            <div className="space-y-4">
              {/* Select All Ribbon */}
              {(() => {
                const allChecked = agreements.length > 0 && agreements.every((a) => a.checked);
                const acceptedCount = agreements.filter(a => a.checked).length;
                return (
                  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-all shadow-2xs ${
                    allChecked ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-slate-50/60'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        allChecked ? 'bg-[#FFC107] text-slate-950 font-bold' : 'bg-slate-200 text-slate-600'
                      }`}>
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-900">
                            Mandatory Regulatory Declarations & Covenants
                          </h3>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            allChecked ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {acceptedCount} of {agreements.length} Accepted
                          </span>
                        </div>
                        <p className="text-xs font-normal text-slate-500 mt-0.5">
                          Review and accept all statutory declarations before final KYC dossier submission.
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 self-start sm:self-center cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors shadow-2xs">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        disabled={!canEdit || agreements.length === 0}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setAgreements((current) => current.map((item) => ({ ...item, checked })));
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                      />
                      <span>Select All Declarations</span>
                    </label>
                  </div>
                );
              })()}

              {/* Bento Agreement Cards Grid */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {agreements.map((agreement) => {
                  const title = agreement.title || agreementLabels[agreement.agreementType] || agreement.agreementType.replaceAll('_', ' ');
                  const summary = agreement.summary || agreementDescriptions[agreement.agreementType] || 'Confirms platform operating policies and regulatory covenants.';

                  return (
                    <div
                      key={agreement.agreementType}
                      className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all shadow-2xs ${
                        agreement.checked
                          ? 'border-[#FFC107] bg-amber-50/20 ring-1 ring-[#FFC107]/40'
                          : 'border-slate-200/90 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div>
                        {/* Top Metadata */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                              §
                            </span>
                            <span className="text-[11px] font-mono font-medium text-slate-500">
                              {agreement.version || 'v1.0'}
                            </span>
                          </div>
                          {agreement.isRequired && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 ring-1 ring-rose-200">
                              Mandatory
                            </span>
                          )}
                        </div>

                        {/* Title & Summary */}
                        <h4 className="text-xs font-bold text-slate-900 leading-snug">{title}</h4>
                        <p className="mt-1 text-xs font-normal text-slate-600 line-clamp-3 leading-relaxed">
                          {summary}
                        </p>
                      </div>

                      {/* Footer Actions: Read Clauses & Checkbox */}
                      <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        {agreement.content ? (
                          <button
                            type="button"
                            onClick={() => setReadingAgreement(agreement)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800 transition-colors"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>Read Clauses</span>
                          </button>
                        ) : (
                          <span className="text-xs font-normal text-slate-400">Standard Covenant</span>
                        )}

                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={agreement.checked}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setAgreements((current) =>
                                current.map((item) =>
                                  item.agreementType === agreement.agreementType ? { ...item, checked: event.target.checked } : item
                                )
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                          />
                          <span className={`text-xs font-medium ${agreement.checked ? 'text-amber-950 font-semibold' : 'text-slate-600'}`}>
                            {agreement.checked ? 'Accepted' : 'Accept'}
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 4: REVIEW & SUBMIT DOSSIER
             ══════════════════════════════════════════════════════════════ */}
          {steps[currentStep].id === 'review' && (
            <div className="space-y-4">
              {/* Readiness Dossier Grid */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {reviewChecklist.map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-xl border p-3.5 transition-all shadow-2xs flex flex-col justify-between ${
                      item.done ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/30'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                          Step 0{item.stepIndex + 1}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            item.done
                              ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
                              : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
                          }`}
                        >
                          {item.done ? <Check className="h-3 w-3 stroke-[3]" /> : <Clock className="h-3 w-3" />}
                          {item.done ? 'Verified' : 'Pending'}
                        </span>
                      </div>
                      <h4 className="mt-1.5 text-xs font-bold text-slate-900 leading-snug">{item.label}</h4>
                      <p className="mt-0.5 text-xs font-normal text-slate-500 truncate">{item.subtitle}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStepNavigation(item.stepIndex)}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                    >
                      <span>Review Details</span>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Submission Readiness Alert Banner */}
              <div
                className={`rounded-xl border p-4 shadow-2xs ${
                  submitBlockers.length === 0
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : 'border-amber-200 bg-amber-50/70'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      submitBlockers.length === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {submitBlockers.length === 0 ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 text-xs">
                    <h3
                      className={`font-bold ${
                        submitBlockers.length === 0 ? 'text-emerald-950' : 'text-amber-950'
                      }`}
                    >
                      {submitBlockers.length === 0
                        ? 'All Verification & Compliance Gates Cleared'
                        : 'Action Required Before Final Approval'}
                    </h3>
                    <p
                      className={`mt-0.5 leading-relaxed ${
                        submitBlockers.length === 0 ? 'text-emerald-800' : 'text-amber-800'
                      }`}
                    >
                      {submitStatus}
                    </p>
                  </div>
                </div>
              </div>

              {/* Review History Trail */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-amber-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Audit Trail & Verification History
                    </h3>
                  </div>
                  <span className="text-xs font-normal text-slate-500">{reviewHistory.length} Recorded Events</span>
                </div>

                {reviewHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    No review history recorded yet. Saving drafts or submitting updates initiates the audit trail.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {reviewHistory.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs text-slate-800 transition hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-900 leading-tight">
                            {getReviewActionLabel(item.action, profile.partnerType, profile.businessName || profile.ownerName)}
                          </p>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {new Intl.DateTimeFormat('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }).format(new Date(item.createdAt))}
                          </span>
                        </div>
                        {getReviewComment(item.action, item.comment) && (
                          <p className="mt-1 text-xs text-slate-600 leading-relaxed bg-white p-2 rounded border border-slate-200/60 font-mono">
                            {getReviewComment(item.action, item.comment)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 4. STEPPER CONTROLS & BOTTOM ACTION BAR ── */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentStep((c) => Math.max(0, c - 1))}
              disabled={currentStep === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-all shadow-2xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>

            {currentStep < steps.length - 1 && (
              <button
                type="button"
                onClick={() => handleStepNavigation(Math.min(steps.length - 1, currentStep + 1))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-all shadow-2xs"
              >
                <span>Next Step</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            {isAdminMode && canEdit ? (
              <>
                <button
                  type="button"
                  onClick={() => router.push(editorReturnPath)}
                  disabled={saving}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveDraft()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#E5AD06] shadow-2xs disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save KYC Updates'}
                </button>
              </>
            ) : null}

            {!isAdminMode && currentStep < steps.length - 1 && canEdit && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveDraft()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-all shadow-2xs disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span>Save Progress</span>
                  </>
                )}
              </button>
            )}

            {!isAdminMode && currentStep === steps.length - 1 && (
              <button
                type="button"
                onClick={() => void handleFinalSubmit()}
                disabled={!canSubmitOnboarding}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-5 py-2 text-xs font-bold text-slate-950 hover:bg-[#E5AD06] shadow-2xs transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-950" />
                    <span>Submitting Dossier...</span>
                  </>
                ) : currentStatus === 'SUBMITTED' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Dossier Submitted</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Submit Full Onboarding Package</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 5. LIGHTBOX DOCUMENT PREVIEW MODAL ── */}
      {previewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">{previewingDoc.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                {previewingDoc.url && (
                  <a
                    href={previewingDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    <Download className="h-3 w-3" />
                    <span>Download</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewingDoc(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-900/5 p-4 min-h-[300px] max-h-[500px] overflow-auto">
              {previewingDoc.isPdf ? (
                <div className="text-center p-6 space-y-3">
                  <FileText className="mx-auto h-16 w-16 text-slate-400" />
                  <p className="text-xs font-bold text-slate-700">PDF Document Stored Securely</p>
                  <a
                    href={previewingDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#E5AD06]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Open / Download PDF</span>
                  </a>
                </div>
              ) : (
                <Image
                  src={previewingDoc.url}
                  alt={previewingDoc.title}
                  width={800}
                  height={600}
                  unoptimized
                  className="max-h-[460px] w-auto rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 6. AGREEMENT CLAUSES FULL READING MODAL ── */}
      {readingAgreement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-mono font-medium text-amber-800">
                  {readingAgreement.version || 'v1.0'}
                </span>
                <h3 className="mt-1 text-sm font-bold text-slate-900 leading-snug">
                  {readingAgreement.title || agreementLabels[readingAgreement.agreementType] || readingAgreement.agreementType}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReadingAgreement(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="my-4 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-xs font-sans text-slate-800 leading-relaxed whitespace-pre-wrap">
              {readingAgreement.content || 'Official clause text will be generated during contract execution.'}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-[11px] text-slate-500">
                {readingAgreement.checked ? '✓ Currently Accepted' : 'Pending Acceptance'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReadingAgreement(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                {!readingAgreement.checked && (
                  <button
                    type="button"
                    onClick={() => {
                      setAgreements((current) =>
                        current.map((item) =>
                          item.agreementType === readingAgreement.agreementType ? { ...item, checked: true } : item
                        )
                      );
                      setReadingAgreement(null);
                    }}
                    className="rounded-lg bg-[#FFC107] px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-[#E5AD06]"
                  >
                    Accept & Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT KYC DOCUMENT CARD SUBCOMPONENT
// ─────────────────────────────────────────────────────────────────────────────

type CompactKycDocumentCardProps = {
  document: KycDocumentForm;
  docLabel: string;
  partnerType?: string | null;
  canEdit: boolean;
  canVerify: boolean;
  isVerifying: boolean;
  verDisplay: ReturnType<typeof getKycVerificationDisplay> | null;
  sensitiveInputRef: (el: HTMLInputElement | null) => void;
  onUpdate: (patch: Partial<KycDocumentForm>) => void;
  onVerify: () => void;
  onPreview: (url: string, title: string, isPdf?: boolean) => void;
  showAadhaarNumber: boolean;
  onToggleAadhaarVisibility: () => void;
};

function CompactKycDocumentCard({
  document,
  docLabel,
  partnerType,
  canEdit,
  canVerify,
  isVerifying,
  verDisplay,
  sensitiveInputRef,
  onUpdate,
  onVerify,
  onPreview,
  showAadhaarNumber,
  onToggleAadhaarVisibility,
}: CompactKycDocumentCardProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccessJustCompleted, setUploadSuccessJustCompleted] = useState(false);
  const [localInstantPreviewUrl, setLocalInstantPreviewUrl] = useState('');
  const [uploadingFileMeta, setUploadingFileMeta] = useState<{ name: string; size: string; isPdf?: boolean } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [previewObjectUrl, setPreviewObjectUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const title = getDocumentLabel(document.documentType, partnerType);
  const isPassportPhoto = document.documentType === 'PASSPORT_PHOTO';
  const isAadhaar = document.documentType === 'AADHAAR_CARD';
  const isPdf = document.fileName?.toLowerCase().endsWith('.pdf') || uploadingFileMeta?.isPdf;

  // Load preview blob securely
  useEffect(() => {
    if (!document.fileUrl || isPdf) {
      setPreviewObjectUrl('');
      return;
    }

    let cancelled = false;
    let objectUrl = '';

    const loadPreview = async () => {
      setPreviewLoading(true);
      try {
        const response = await api.get(normalizeSecureDocumentPath(document.fileUrl), { responseType: 'blob' });
        const mimeType = response.data.type || 'image/jpeg';
        objectUrl = URL.createObjectURL(new Blob([response.data], { type: mimeType }));
        if (!cancelled) {
          setPreviewObjectUrl(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setPreviewObjectUrl('');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document.fileUrl, isPdf]);

  const handleFileChange = async (file?: File) => {
    if (!file) return;
    setUploadError('');

    const validationError = isPassportPhoto
      ? getPassportPhotoUploadValidationError(file)
      : getUploadValidationError(file);

    if (validationError) {
      setUploadError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Instant local preview for images
    const isImageFile = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(file.name);
    let localUrl = '';
    if (isImageFile) {
      localUrl = URL.createObjectURL(file);
      setLocalInstantPreviewUrl(localUrl);
    }

    const formattedSize = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(file.size / 1024)} KB`;

    const isFilePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    setUploadingFileMeta({ name: file.name, size: formattedSize, isPdf: isFilePdf });
    setUploading(true);
    setUploadProgress(15);

    // Smooth visual progress ticker
    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 88) return prev;
        return prev + Math.floor(Math.random() * 14 + 8);
      });
    }, 140);

    try {
      const uploadedFile = await uploadFileToServer({
        file,
        visibility: 'secure',
        purpose: isPassportPhoto ? 'passport-photo' : 'document',
      });

      clearInterval(progressTimer);
      setUploadProgress(100);
      setUploadSuccessJustCompleted(true);

      onUpdate({
        fileName: uploadedFile.originalName,
        fileUrl: uploadedFile.fileUrl,
        status: 'UPLOADED',
        verificationStatus: 'NOT_STARTED',
        verificationRecordId: '',
        verificationCacheHit: false,
        verificationResult: null,
        verificationMessage: '',
      });

      setTimeout(() => {
        setUploadSuccessJustCompleted(false);
        setUploading(false);
      }, 1000);
    } catch (err) {
      clearInterval(progressTimer);
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setUploading(false);
      setUploadingFileMeta(null);
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
        setLocalInstantPreviewUrl('');
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const effectivePreviewUrl = localInstantPreviewUrl || previewObjectUrl || document.fileUrl;

  const getDocIcon = () => {
    switch (document.documentType) {
      case 'PAN_CARD':
        return CreditCard;
      case 'GST_CERTIFICATE':
        return Building2;
      case 'AADHAAR_CARD':
        return Shield;
      case 'PASSPORT_PHOTO':
        return User;
      default:
        return FileText;
    }
  };

  const DocIcon = getDocIcon();

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden flex flex-col justify-between">
      {/* Card Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 text-amber-700 border border-amber-200/60 shadow-2xs">
            <DocIcon className="h-3.5 w-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 leading-tight">{title}</h4>
            <span className="text-[11px] text-slate-500 font-normal">
              {document.documentType === 'PASSPORT_PHOTO' ? 'Identity Photo' : 'Verified Document'}
            </span>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1.5">
          {document.verificationStatus === 'VERIFIED' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
              <Check className="h-3 w-3 stroke-[2.5]" /> Verified
            </span>
          )}
          {document.verificationStatus === 'MANUAL_REVIEW' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
              ⚑ Manual Review
            </span>
          )}
          {document.verificationStatus === 'FAILED' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200">
              ✕ Failed
            </span>
          )}
          {document.status === 'UPLOADED' && document.verificationStatus !== 'VERIFIED' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">
              ↑ Uploaded
            </span>
          )}
          {(!document.status || document.status === 'NOT_UPLOADED') && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
              Pending
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-3.5 space-y-3 flex-1">
        {/* Document Number Input (Except for Passport Photo) */}
        {!isPassportPhoto && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{docLabel}</label>
            {canVerify ? (
              <div className="flex items-stretch gap-1.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    name={`kyc_${document.documentType.toLowerCase()}_num`}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    ref={sensitiveInputRef}
                    value={document.documentNumber}
                    onChange={(event) => {
                      const nextValue = normalizeKycDocumentNumber(document.documentType as KycVerificationDocumentType, event.target.value);
                      onUpdate({
                        documentNumber: nextValue,
                        verificationStatus: 'NOT_STARTED',
                        verificationRecordId: '',
                        verificationCacheHit: false,
                        verificationResult: null,
                        verificationMessage: '',
                      });
                    }}
                    disabled={!canEdit}
                    className={`${inputCompactClassName} pl-8.5 font-mono uppercase tracking-wider text-xs font-medium`}
                    placeholder={document.documentType === 'PAN_CARD' ? 'ABCDE1234F' : '22AADCW3373Q1ZW'}
                    maxLength={document.documentType === 'PAN_CARD' ? 10 : 15}
                  />
                  <ApiSparkleIcon
                    label={document.documentType === 'PAN_CARD' ? 'PAN API Verification' : 'GSTIN API Verification'}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 drop-shadow-[0_1px_1px_rgba(59,97,217,0.22)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={onVerify}
                  disabled={!canEdit || isVerifying || document.verificationStatus === 'VERIFIED' || !document.documentNumber}
                  className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shadow-2xs disabled:opacity-40 ${
                    document.verificationStatus === 'VERIFIED'
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'bg-[#FFC107] text-slate-950 hover:bg-[#E5AD06]'
                  }`}
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Checking</span>
                    </>
                  ) : document.verificationStatus === 'VERIFIED' ? (
                    <>
                      <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                      <span>Verified</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-slate-950" />
                      <span>Verify</span>
                    </>
                  )}
                </button>
              </div>
            ) : isAadhaar ? (
              <div className="relative">
                <input
                  type={showAadhaarNumber ? 'text' : 'password'}
                  name="kyc_aadhaar_number"
                  autoComplete="new-password"
                  spellCheck={false}
                  ref={sensitiveInputRef}
                  value={document.documentNumber}
                  onChange={(event) =>
                    onUpdate({
                      documentNumber: event.target.value.replace(/\D/g, '').slice(0, 16),
                    })
                  }
                  disabled={!canEdit}
                  className={`${inputCompactClassName} pl-8.5 font-mono tracking-widest text-xs font-medium pr-8.5`}
                  placeholder="•••• •••• •••• ••••"
                  maxLength={16}
                />
                <ApiSparkleIcon
                  label="Aadhaar / VID Government ID"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 drop-shadow-[0_1px_1px_rgba(59,97,217,0.22)]"
                />
                <button
                  type="button"
                  onClick={onToggleAadhaarVisibility}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  title={showAadhaarNumber ? 'Hide number' : 'Show number'}
                >
                  {showAadhaarNumber ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={document.documentNumber}
                onChange={(event) => onUpdate({ documentNumber: toUpperCase(event.target.value) })}
                disabled={!canEdit}
                className={inputCompactClassName}
                placeholder="Document reference number"
              />
            )}

            {/* Error or Review message */}
            {document.verificationStatus === 'FAILED' && document.verificationMessage && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                <AlertCircle className="h-3 w-3 shrink-0" /> {document.verificationMessage}
              </p>
            )}
            {document.verificationStatus === 'MANUAL_REVIEW' && document.verificationMessage && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {document.verificationMessage}
              </p>
            )}
          </div>
        )}

        {/* Verification Success Pill */}
        {verDisplay && (verDisplay.displayName || verDisplay.status || verDisplay.maskedNumber) && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-950">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="min-w-0 flex-1">
                {verDisplay.displayName && (
                  <p className="font-semibold text-emerald-950 leading-tight truncate">{verDisplay.displayName}</p>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-normal text-emerald-800">
                  {verDisplay.maskedNumber && <span className="font-mono font-medium">{verDisplay.maskedNumber}</span>}
                  {verDisplay.status && <span>· {verDisplay.status}</span>}
                  {verDisplay.category && <span>· {verDisplay.category}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* File Upload Section */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {isPassportPhoto ? 'Passport-size photo' : 'Official document copy (PDF / Image)'}
          </label>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={isPassportPhoto ? '.png,.jpg,.jpeg,.webp' : '.pdf,.png,.jpg,.jpeg,.webp'}
            disabled={!canEdit || uploading}
            onChange={(e) => void handleFileChange(e.target.files?.[0])}
            className="hidden"
          />

          {uploading ? (
            /* Uploading Progress Animation Container */
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 shadow-2xs space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {localInstantPreviewUrl ? (
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-amber-300 bg-white shadow-2xs">
                      <Image
                        src={localInstantPreviewUrl}
                        alt="Instant preview"
                        width={44}
                        height={44}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-amber-500/10 backdrop-blur-[0.5px]" />
                    </div>
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shadow-2xs">
                      {uploadingFileMeta?.isPdf ? (
                        <FileText className="h-6 w-6 text-rose-500 animate-pulse" />
                      ) : (
                        <UploadCloud className="h-6 w-6 text-amber-600 animate-bounce" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {uploadSuccessJustCompleted ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 animate-in zoom-in-75 duration-200" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                      )}
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {uploadSuccessJustCompleted ? 'Upload Complete!' : 'Uploading Document Securely...'}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5 font-mono">
                      {uploadingFileMeta?.name} {uploadingFileMeta?.size ? `(${uploadingFileMeta.size})` : ''}
                    </p>
                  </div>
                </div>

                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold font-mono transition-colors ${
                    uploadSuccessJustCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200/70 text-amber-900'
                  }`}
                >
                  {uploadProgress}%
                </span>
              </div>

              {/* Dynamic Glowing Progress Bar */}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className={`h-full rounded-full transition-all duration-300 ease-out ${
                    uploadSuccessJustCompleted
                      ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]'
                      : 'bg-gradient-to-r from-amber-400 via-[#FFC107] to-amber-500 shadow-[0_0_8px_rgba(255,193,7,0.7)]'
                  }`}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className={uploadSuccessJustCompleted ? 'text-emerald-700 font-medium' : 'text-amber-800 font-normal'}>
                  {uploadSuccessJustCompleted ? '✓ Verified & stored in encrypted vault' : 'Encrypting & syncing to cloud vault...'}
                </span>
                {localInstantPreviewUrl && (
                  <span className="font-medium text-emerald-700 flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Instant preview active
                  </span>
                )}
              </div>
            </div>
          ) : document.fileUrl ? (
            /* Uploaded State Tile with Instant Preview */
            <div className="flex items-center justify-between gap-2.5 rounded-lg border border-slate-200/90 bg-slate-50/60 p-2 transition-all hover:border-slate-300">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Thumbnail */}
                <div
                  onClick={() => onPreview(effectivePreviewUrl, title, isPdf)}
                  className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white overflow-hidden group shadow-2xs"
                  title="Click to view full preview"
                >
                  {isPdf ? (
                    <FileText className="h-5 w-5 text-rose-500" />
                  ) : previewLoading && !localInstantPreviewUrl ? (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                  ) : effectivePreviewUrl ? (
                    <Image
                      src={effectivePreviewUrl}
                      alt={title}
                      width={44}
                      height={44}
                      unoptimized
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <FileText className="h-4 w-4 text-slate-400" />
                  )}
                  <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Eye className="h-3.5 w-3.5 text-white" />
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate leading-snug">
                    {document.fileName || 'Uploaded Document'}
                  </p>
                  <p className="text-[11px] text-emerald-700 font-normal flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Secure Cloud Encrypted
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onPreview(effectivePreviewUrl, title, isPdf)}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-colors"
                  title="View Full Preview"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (localInstantPreviewUrl) {
                          URL.revokeObjectURL(localInstantPreviewUrl);
                          setLocalInstantPreviewUrl('');
                        }
                        onUpdate({
                          fileName: '',
                          fileUrl: '',
                          status: 'NOT_UPLOADED',
                        });
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Upload Dropzone */
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canEdit || uploading}
              className="group flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 py-3 px-3 text-center transition hover:border-amber-400 hover:bg-amber-50/30 disabled:opacity-50"
            >
              <UploadCloud className="h-4 w-4 text-amber-500 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-slate-700">Choose file or drag & drop</span>
              <span className="text-[11px] font-normal text-slate-400">· Max 3MB</span>
            </button>
          )}

          {uploadError && (
            <p className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" /> {uploadError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT FORM FIELD WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

function FormField({
  label,
  required = false,
  fullWidth = false,
  children,
}: {
  label: string;
  required?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={fullWidth ? 'sm:col-span-2 lg:col-span-3' : ''}>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-rose-500 font-bold">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCompactClassName =
  'w-full h-9 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-normal text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:cursor-not-allowed disabled:bg-slate-100 shadow-2xs';

const textareaCompactClassName =
  'w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs font-normal text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:cursor-not-allowed disabled:bg-slate-100 shadow-2xs';
