'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { resolvePartnerId } from '@/lib/routeResolvers';
import { generateAdminPartnerEditPath } from '@/lib/routePaths';
import { FileUploadField } from '@/components/upload/FileUploadField';
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
  PAN_CARD: 'PAN Card / Company PAN',
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
      ownerLabel: 'Owner / authorized place manager name',
      ownerPlaceholder: 'Authorized place owner or manager',
      businessNameLabel: 'Authorized place name',
      businessNamePlaceholder: 'Amar Equipment Authorized Place',
      addressLabel: 'Address',
      addressPlaceholder: 'Complete address',
      experienceLabel: 'Authorized place experience',
      experiencePlaceholder: '6 years in used equipment retail',
      descriptionPlaceholder: 'Describe your authorized place, inventory mix, and customer reach',
      serviceAreasPlaceholder: 'Lucknow, Kanpur, Delhi NCR',
      alternateMobilePlaceholder: 'Authorized place alternate contact',
    };
  }

  return {
    ownerLabel: 'Broker / authorized place name',
    ownerPlaceholder: 'Broker name or authorized contact',
    businessNameLabel: 'Broker / firm name',
    businessNamePlaceholder: 'Amar Equipment Brokerage',
    addressLabel: 'Address',
    addressPlaceholder: 'Office address or main working location',
    experienceLabel: 'Brokering experience',
    experiencePlaceholder: '4 years in sourcing and resale support',
    descriptionPlaceholder: 'Describe your broker network, sourcing process, and support coverage',
    serviceAreasPlaceholder: 'Lucknow, Kanpur, remote sourcing regions',
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
  const partnerPortalBasePath = pathname.startsWith('/employee') ? '/employee/partners' : '/superadmin/partners';
  const editorReturnPath = pathname.startsWith('/employee') ? '/employee/verifications' : '/superadmin/verifications';
  const [loadedUser, setLoadedUser] = useState<Parameters<typeof updateUser>[0] | null>(null);
  const currentUser = isAdminMode ? loadedUser : user;
  const [resolvedPartnerId, setResolvedPartnerId] = useState<string | null>(requestedPartnerId || null);

  const [profile, setProfile] = useState<OnboardingProfile>(
    emptyProfile('', '', '', '', '')
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
      { id: 'profile', title: 'Account', description: 'Primary contact and registration basics' },
      { id: 'business', title: 'Business', description: 'Business profile and operating details' },
      { id: 'kyc', title: 'KYC Docs', description: 'Identity, business, and bank document metadata' },
      { id: 'agreements', title: 'Agreements', description: 'Mandatory platform and compliance declarations' },
      { id: 'review', title: 'Review', description: 'Check completeness and submit for approval' },
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

  // Password managers sometimes inject old GST/PAN/Aadhaar values after React
  // renders, even when the API returned an empty value. Clear only those DOM
  // injections; values returned by the API remain untouched.
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
  // Keep the review gate aligned with the backend: optional agreements must not
  // block onboarding submission when every required agreement is accepted.
  const areAgreementsComplete = agreements
    .filter((agreement) => agreement.isRequired)
    .every((agreement) => agreement.checked);

  const reviewChecklist = useMemo(
    () => [
      { label: 'Account details complete', done: isAccountComplete },
      { label: 'Business information complete', done: isBusinessComplete },
      { label: 'Required KYC documents complete', done: progress.documentsComplete },
      { label: 'All required agreements accepted', done: progress.agreementsComplete && areAgreementsComplete },
    ],
    [progress, isAccountComplete, isBusinessComplete, areAgreementsComplete]
  );
  const submitBlockers = useMemo(
    () =>
      [
        !isAccountComplete ? 'Account details are incomplete' : '',
        !isBusinessComplete ? 'Business information is incomplete' : '',
        !progress.documentsComplete ? 'Required KYC documents are pending' : '',
        !(progress.agreementsComplete && areAgreementsComplete) ? 'All mandatory agreements must be accepted' : '',
      ].filter(Boolean),
    [isAccountComplete, isBusinessComplete, progress.documentsComplete, progress.agreementsComplete, areAgreementsComplete]
  );
  const submitStatus = useMemo(() => {
    if (!canEdit) {
      if (currentStatus === 'UNDER_REVIEW') {
        return 'Submission is locked while your application is under review.';
      }

      if (currentStatus === 'SUBMITTED') {
        return 'Submitted';
      }

      return 'Submission is locked for the current onboarding status.';
    }

    if (submitBlockers.length > 0) {
      return `Partial submission is allowed. Pending items right now: ${submitBlockers.join(', ')}.`;
    }

    return 'All requirements are complete. You can submit the full onboarding package.';
  }, [canEdit, currentStatus, submitBlockers]);
  const canSubmitOnboarding = canEdit && !submitting;

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
          setLocationsError('Unable to load states from the database.');
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
          setLocationsError('Unable to load cities for the selected state.');
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
          : 'Provider returned the record, but its status needs manual review before approval.',
      });
      setSuccess(
        verified
          ? cacheHit
            ? `${documentType === 'PAN_CARD' ? 'PAN' : 'GSTIN'} verified from the saved database result. No new API charge was made.`
            : `${documentType === 'PAN_CARD' ? 'PAN' : 'GSTIN'} verified successfully. API usage was charged and saved securely.`
          : 'Verification result saved for manual review.',
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

  const stepContent = () => {
    const stepId = steps[currentStep]?.id;
    if (stepId === 'profile') {
      return (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={partnerTypeMeta.ownerLabel}>
              <input
                value={profile.ownerName}
                onChange={(event) => setProfile((current) => ({ ...current, ownerName: toTitleCase(event.target.value) }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder={partnerTypeMeta.ownerPlaceholder}
              />
            </Field>
            <Field label="Primary mobile number">
              <input
                value={profile.primaryContact}
                onChange={(event) => setProfile((current) => ({ ...current, primaryContact: event.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder="9876543210"
              />
            </Field>
            <Field label="WhatsApp number">
              <input
                value={profile.whatsappNumber}
                onChange={(event) => setProfile((current) => ({ ...current, whatsappNumber: event.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder="9876543210"
              />
            </Field>
            <Field label="Email address">
              <input
                value={profile.email}
                onChange={(event) => setProfile((current) => ({ ...current, email: toLowerCase(event.target.value) }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder="name@business.com"
              />
            </Field>
            <Field label="Partner type">
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
                className={inputClassName}
              >
                <option value="">Select partner type</option>
                {visiblePartnerTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatPartnerTypeLabel(option)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      );
    }

    if (stepId === 'business') {
      return (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={partnerTypeMeta.businessNameLabel}>
              <input
                value={profile.businessName}
                onChange={(event) => setProfile((current) => ({ ...current, businessName: toTitleCase(event.target.value) }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder={partnerTypeMeta.businessNamePlaceholder}
              />
            </Field>
            <Field label="Alternate mobile">
              <input
                value={profile.alternateMobile}
                onChange={(event) => setProfile((current) => ({ ...current, alternateMobile: event.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder={partnerTypeMeta.alternateMobilePlaceholder}
              />
            </Field>
            <Field label="State">
              <SearchableSelect
                options={locationStates}
                value={selectedStateId || profile.state}
                displayValue={profile.state}
                onChange={handleStateChange}
                placeholder={locationsLoading ? 'Loading states...' : 'Select state'}
                disabled={!canEdit}
              />
              {locationsError ? <p className="mt-1 text-xs text-red-600">{locationsError}</p> : null}
            </Field>
            <Field label="City">
              <SearchableSelect
                options={selectedStateId ? locationCities : []}
                value={selectedCityId || profile.city}
                displayValue={profile.city}
                onChange={handleCityChange}
                placeholder={citiesLoading ? 'Loading cities...' : selectedStateId ? 'Select city' : 'Select state first'}
                disabled={!canEdit || !selectedStateId || citiesLoading}
              />
            </Field>
            <Field label="PIN code">
              <input
                value={profile.pinCode}
                onChange={(event) => setProfile((current) => ({ ...current, pinCode: event.target.value.replace(/[^0-9]/g, '').slice(0, 6) }))}
                disabled={!canEdit}
                className={inputClassName}
              />
            </Field>
            <Field label={partnerTypeMeta.experienceLabel}>
              <input
                value={profile.businessExperience}
                onChange={(event) => setProfile((current) => ({ ...current, businessExperience: toSentenceCase(event.target.value) }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder={partnerTypeMeta.experiencePlaceholder}
              />
            </Field>
            {profile.partnerType !== 'BROKER' && profile.partnerType !== 'SHOWROOM' && (
              <Field label="Expected monthly listings">
                <input
                  value={profile.expectedMonthlyListings}
                  onChange={(event) => setProfile((current) => ({ ...current, expectedMonthlyListings: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))}
                  disabled={!canEdit}
                  className={inputClassName}
                  placeholder="12"
                />
              </Field>
            )}
            {profile.partnerType !== 'BROKER' && (
              <Field label="Years in business">
                <input
                  value={profile.yearsInBusiness}
                  onChange={(event) => setProfile((current) => ({ ...current, yearsInBusiness: event.target.value.replace(/[^0-9]/g, '').slice(0, 3) }))}
                  disabled={!canEdit}
                  className={inputClassName}
                  placeholder="8"
                />
              </Field>
            )}
            {isBusinessPartner ? (
              <>
                <Field label="Team size">
                  <input
                    value={profile.teamSize}
                    onChange={(event) => setProfile((current) => ({ ...current, teamSize: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))}
                    disabled={!canEdit}
                    className={inputClassName}
                    placeholder="15"
                  />
                </Field>
                {profile.partnerType !== 'SHOWROOM' && (
                  <Field label="Business registration number">
                    <input
                      value={profile.businessRegistrationNumber}
                      onChange={(event) => setProfile((current) => ({ ...current, businessRegistrationNumber: toUpperCase(event.target.value) }))}
                      disabled={!canEdit}
                      className={inputClassName}
                      placeholder="Registration / incorporation number"
                    />
                  </Field>
                )}
              </>
            ) : (
              <>
                <Field label="Service specialization">
                  <input
                    value={profile.businessRegistrationNumber}
                    onChange={(event) => setProfile((current) => ({ ...current, businessRegistrationNumber: toSentenceCase(event.target.value) }))}
                    disabled={!canEdit}
                    className={inputClassName}
                    placeholder="Broker network, sourcing, recovery support, inspections"
                  />
                </Field>
              </>
            )}
            {profile.partnerType !== 'BROKER' && profile.partnerType !== 'SHOWROOM' && (
              <>
                <Field label="Working hours">
                  <input
                    value={profile.workingHours}
                    onChange={(event) => setProfile((current) => ({ ...current, workingHours: event.target.value }))}
                    disabled={!canEdit}
                    className={inputClassName}
                    placeholder="Mon-Sat, 10am-7pm"
                  />
                </Field>
                <Field label="Preferred contact method">
                  <select
                    value={profile.contactPreference}
                    onChange={(event) => setProfile((current) => ({ ...current, contactPreference: event.target.value }))}
                    disabled={!canEdit}
                    className={inputClassName}
                  >
                    {contactPreferenceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <Field label="Website URL">
              <input
                value={profile.websiteUrl}
                onChange={(event) => setProfile((current) => ({ ...current, websiteUrl: toLowerCase(event.target.value) }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder="https://example.com"
              />
            </Field>
            <Field label="Google Maps location / link">
              <input
                value={profile.googleMapsLocation}
                onChange={(event) => setProfile((current) => ({ ...current, googleMapsLocation: event.target.value }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder="Shareable map URL or coordinates"
              />
            </Field>
            <Field label="Service areas">
              <input
                value={profile.serviceAreas}
                onChange={(event) => setProfile((current) => ({ ...current, serviceAreas: toTitleCase(event.target.value) }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder={partnerTypeMeta.serviceAreasPlaceholder}
              />
            </Field>
            <Field label="Social links">
              <input
                value={profile.socialLinks}
                onChange={(event) => setProfile((current) => ({ ...current, socialLinks: toLowerCase(event.target.value) }))}
                disabled={!canEdit}
                className={inputClassName}
                placeholder="LinkedIn / Facebook / Instagram URLs"
              />
            </Field>
            <Field label={partnerTypeMeta.addressLabel} fullWidth>
              <textarea
                value={profile.businessAddress}
                onChange={(event) => setProfile((current) => ({ ...current, businessAddress: toSentenceCase(event.target.value) }))}
                disabled={!canEdit}
                rows={4}
                className={textareaClassName}
                placeholder={partnerTypeMeta.addressPlaceholder}
              />
            </Field>
            {profile.partnerType !== 'SHOWROOM' && (
              <Field label="Business description" fullWidth>
                <textarea
                  value={profile.businessDescription}
                  onChange={(event) => setProfile((current) => ({ ...current, businessDescription: toSentenceCase(event.target.value) }))}
                  disabled={!canEdit}
                  rows={4}
                  className={textareaClassName}
                  placeholder={partnerTypeMeta.descriptionPlaceholder}
                />
              </Field>
            )}
          </div>
        </div>
      );
    }

    if (stepId === 'kyc') {
      const getStatusBadge = (status?: string) => {
        switch (status) {
          case 'APPROVED':
            return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">✓ Approved</span>;
          case 'REJECTED':
            return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200">✕ Rejected</span>;
          case 'UPLOADED':
            return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">↑ Uploaded</span>;
          case 'PENDING_REVIEW':
            return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">⏳ Pending</span>;
          default:
            return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-bold text-gray-500 ring-1 ring-gray-200">— Not uploaded</span>;
        }
      };

      const getVerifyBadge = (verificationStatus?: string) => {
        switch (verificationStatus) {
          case 'VERIFIED':
            return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ Verified</span>;
          case 'MANUAL_REVIEW':
            return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚑ Review</span>;
          case 'FAILED':
            return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">✕ Failed</span>;
          case 'VERIFYING':
            return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">◌ Checking…</span>;
          default:
            return null;
        }
      };

      return (
        <div className="space-y-4">
          {!profile.partnerType ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5">
              <h3 className="text-base font-bold text-amber-900">Select partner type to unlock KYC fields</h3>
              <div className="mt-4 max-w-xs">
                <label className="mb-1.5 block text-sm font-medium text-amber-800">Partner type</label>
                <select
                  value={profile.partnerType}
                  onChange={(event) => setProfile((current) => ({ ...current, partnerType: event.target.value }))}
                  disabled={!canEdit}
                  className={inputClassName}
                >
                  <option value="">Select type</option>
                  {visiblePartnerTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatPartnerTypeLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <>
              {documentsByType.map((document) => {
                const canVerify = document.documentType === 'PAN_CARD' || document.documentType === 'GST_CERTIFICATE';
                const isVerifying = verifyingDocumentType === document.documentType;
                const verDisplay = document.verificationResult
                  ? getKycVerificationDisplay(document.documentType as KycVerificationDocumentType, document.verificationResult)
                  : null;
                const docLabel = document.documentType === 'PAN_CARD'
                  ? 'PAN number'
                  : document.documentType === 'GST_CERTIFICATE'
                    ? 'GSTIN'
                    : document.documentType === 'AADHAAR_CARD'
                      ? 'Aadhaar / VID'
                      : 'Document number';
                const fileLabel = document.documentType === 'PASSPORT_PHOTO'
                  ? 'Passport-size photo'
                  : 'Upload document file';

                return (
                  <div key={document.documentType} className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.07)] overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFC107]/10 text-sm font-bold text-[#9A7600]">
                          {getDocumentLabel(document.documentType, profile.partnerType).charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 leading-tight">
                            {getDocumentLabel(document.documentType, profile.partnerType)}
                          </p>
                          {document.reviewComment && (
                            <p className="text-xs text-orange-600 font-medium mt-0.5">{document.reviewComment}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {canVerify && getVerifyBadge(document.verificationStatus)}
                        {getStatusBadge(document.status)}
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-5 space-y-4">
                      {/* File upload and document input grid */}
                      <div className={document.documentType === 'PASSPORT_PHOTO' ? 'space-y-2' : 'grid gap-5 lg:grid-cols-2 lg:items-start'}>
                        {/* File upload column with aligned label */}
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">{fileLabel}</label>
                          <FileUploadField
                            accept={document.documentType === 'PASSPORT_PHOTO' ? '.png,.jpg,.jpeg,.webp' : '.pdf,.png,.jpg,.jpeg,.webp'}
                            disabled={!canEdit}
                            helperText={document.documentType === 'PASSPORT_PHOTO'
                              ? 'Clear passport-size photo · JPG / PNG / WEBP · max 3 MB'
                              : 'PDF / JPG / PNG · PDFs max 3 MB · images compressed to WEBP'}
                            onUploaded={(uploadedFile) =>
                          updateDocument(document.documentType, {
                            fileName: uploadedFile.originalName,
                            fileUrl: uploadedFile.fileUrl,
                            status: 'UPLOADED',
                            verificationStatus: 'NOT_STARTED',
                            verificationRecordId: '',
                            verificationCacheHit: false,
                            verificationResult: null,
                            verificationMessage: '',
                          })
                            }
                            uploadedFileName={document.fileName}
                            uploadedFileUrl={document.fileUrl}
                            uploadPurpose={document.documentType === 'PASSPORT_PHOTO' ? 'passport-photo' : 'document'}
                            visibility="secure"
                          />
                        </div>

                        {/* Document number column with aligned label */}
                        {document.documentType !== 'PASSPORT_PHOTO' && (
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">{docLabel}</label>

                            {canVerify ? (
                              /* PAN / GSTIN — number + verify inline */
                              <div className="flex items-stretch gap-2">
                                <input
                                  type="text"
                                  name={`kyc_${document.documentType.toLowerCase()}_document_number`}
                                  autoComplete="off"
                                  autoCorrect="off"
                                  autoCapitalize="characters"
                                  spellCheck={false}
                                  data-lpignore="true"
                                  data-1p-ignore="true"
                                  data-bwignore="true"
                                  data-form-type="other"
                                  ref={(input) => {
                                    sensitiveInputRefs.current[document.documentType] = input;
                                  }}
                                  value={document.documentNumber}
                                  onChange={(event) => {
                                    const nextValue = normalizeKycDocumentNumber(document.documentType as KycVerificationDocumentType, event.target.value);
                                    updateDocument(document.documentType, {
                                      documentNumber: nextValue,
                                      verificationStatus: 'NOT_STARTED',
                                      verificationRecordId: '',
                                      verificationCacheHit: false,
                                      verificationResult: null,
                                      verificationMessage: '',
                                    });
                                  }}
                                  disabled={!canEdit}
                                  className={`${inputClassName} h-[46px] flex-1 font-mono tracking-wider`}
                                  placeholder={document.documentType === 'PAN_CARD' ? 'ABCDE1234F' : 'e.g. 27ABCDE1234F1Z5'}
                                  maxLength={document.documentType === 'PAN_CARD' ? 10 : 15}
                                />
                                <button
                                  type="button"
                                  onClick={() => void verifyKycDocument(document.documentType as KycVerificationDocumentType)}
                                  disabled={!canEdit || verifyingDocumentType !== null || document.verificationStatus === 'VERIFYING' || !document.documentNumber}
                                  className={`h-[46px] flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${document.verificationStatus === 'VERIFIED'
                                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                      : 'bg-[#FFC107] text-black hover:bg-[#E5AD06]'
                                    }`}
                                >
                                  {isVerifying ? (
                                    <>
                                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                      </svg>
                                      Checking
                                    </>
                                  ) : document.verificationStatus === 'VERIFIED' ? (
                                    '✓ Verified'
                                  ) : (
                                    'Verify'
                                  )}
                                </button>
                              </div>
                            ) : (
                              /* Aadhaar — just the input */
                              <input
                                type="password"
                                name="kyc_aadhaar_vid_document_number"
                                autoComplete="new-password"
                                autoCorrect="off"
                                spellCheck={false}
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-bwignore="true"
                                data-form-type="other"
                                ref={(input) => {
                                  sensitiveInputRefs.current[document.documentType] = input;
                                }}
                                value={document.documentNumber}
                                onChange={(event) =>
                                  updateDocument(document.documentType, {
                                    documentNumber: event.target.value.replace(/\D/g, '').slice(0, 16),
                                  })
                                }
                                disabled={!canEdit}
                                className={`${inputClassName} h-[46px] font-mono tracking-wider`}
                                inputMode="numeric"
                                maxLength={16}
                                placeholder="••••  ••••  ••••  ••••"
                              />
                            )}

                            {/* Verification failed message */}
                            {document.verificationStatus === 'FAILED' && document.verificationMessage && (
                              <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
                                <span>✕</span> {document.verificationMessage}
                              </p>
                            )}
                            {document.verificationStatus === 'MANUAL_REVIEW' && document.verificationMessage && (
                              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                                <span>⚑</span> {document.verificationMessage}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Verification result card */}
                      {verDisplay && (verDisplay.displayName || verDisplay.status || verDisplay.maskedNumber) && (
                        <div className={`rounded-xl border px-4 py-3.5 ${document.verificationStatus === 'VERIFIED'
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-amber-200 bg-amber-50'
                          }`}>
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${document.verificationStatus === 'VERIFIED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                              }`}>
                              {document.verificationStatus === 'VERIFIED' ? '✓' : '⚑'}
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              {verDisplay.displayName && (
                                <p className={`text-sm font-bold leading-tight ${document.verificationStatus === 'VERIFIED' ? 'text-emerald-900' : 'text-amber-900'}`}>
                                  {verDisplay.displayName}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {verDisplay.maskedNumber && (
                                  <span className="text-xs font-mono text-gray-600">{verDisplay.maskedNumber}</span>
                                )}
                                {verDisplay.status && (
                                  <span className={`text-xs font-semibold ${document.verificationStatus === 'VERIFIED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {verDisplay.status}
                                  </span>
                                )}
                                {verDisplay.category && (
                                  <span className="text-xs text-gray-500">{verDisplay.category}</span>
                                )}
                                {verDisplay.extra && (
                                  <span className="text-xs text-gray-500">{verDisplay.extra}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Optional documents section */}
              {optionalDocumentsByType.length > 0 && (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-4 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Optional Documents</p>
                  {optionalDocumentsByType.map((document) => (
                    <div key={document.documentType} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-900">{getDocumentLabel(document.documentType, profile.partnerType)}</p>
                        {getStatusBadge(document.status)}
                      </div>
                      <div className={!['CANCELLED_CHEQUE', 'PASSPORT_PHOTO'].includes(document.documentType) ? 'grid gap-4 lg:grid-cols-2 lg:items-start' : 'space-y-1'}>
                        <div className="space-y-1">
                          <label className="mb-1 block text-xs font-medium text-gray-600">Upload document copy</label>
                          <FileUploadField
                            accept=".pdf,.png,.jpg,.jpeg,.webp"
                            disabled={!canEdit}
                            helperText="Stored in secure private document storage."
                            onUploaded={(uploadedFile) =>
                            updateDocument(document.documentType, {
                              fileName: uploadedFile.originalName,
                              fileUrl: uploadedFile.fileUrl,
                              status: 'UPLOADED',
                            })
                            }
                            uploadedFileName={document.fileName}
                            uploadedFileUrl={document.fileUrl}
                            visibility="secure"
                          />
                        </div>
                        {!['CANCELLED_CHEQUE', 'PASSPORT_PHOTO'].includes(document.documentType) && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <label className="mb-1 block text-xs font-medium text-gray-600">Document number</label>
                              <input
                                value={document.documentNumber}
                                onChange={(event) => updateDocument(document.documentType, { documentNumber: toUpperCase(event.target.value) })}
                                disabled={!canEdit}
                                className={`${inputClassName} h-[46px]`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="mb-1 block text-xs font-medium text-gray-600">Name on document</label>
                              <input
                                value={document.nameOnDocument}
                                onChange={(event) => updateDocument(document.documentType, { nameOnDocument: toTitleCase(event.target.value) })}
                                disabled={!canEdit}
                                className={`${inputClassName} h-[46px]`}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    if (stepId === 'agreements') {
      const allChecked = agreements.length > 0 && agreements.every((a) => a.checked);

      return (
        <div className="space-y-4">
          <label className={`inline-flex w-fit items-start gap-3 rounded-xl border px-4 py-4 mb-2 ${allChecked ? 'border-[#FFC107] bg-[#FFF8DC]' : 'border-gray-300 bg-gray-50'}`}>
            <input
              type="checkbox"
              checked={allChecked}
              disabled={!canEdit || agreements.length === 0}
              onChange={(event) => {
                const checked = event.target.checked;
                setAgreements((current) => current.map((item) => ({ ...item, checked })));
              }}
              className="mt-1 h-4 w-4"
            />
            <div>
              <p className="text-sm font-bold text-gray-900">Select All Agreements</p>
              <p className="mt-1 text-xs text-gray-500">Accept all mandatory declarations at once.</p>
            </div>
          </label>
          <hr className="border-gray-200" />
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {agreements.map((agreement) => (
              <div
                key={agreement.agreementType}
                className={`flex h-full items-start gap-3 rounded-xl border px-4 py-4 ${agreement.checked ? 'border-[#FFC107] bg-[#FFF8DC]' : 'border-gray-200 bg-white'}`}
              >
                <input
                  id={`agreement-${agreement.agreementType}`}
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
                  className="mt-1 h-4 w-4"
                />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`agreement-${agreement.agreementType}`} className="cursor-pointer text-sm font-semibold text-gray-900">
                    {agreement.title || agreementLabels[agreement.agreementType] || agreement.agreementType.replaceAll('_', ' ')}
                  </label>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {agreement.version && <span>Version {agreement.version}</span>}
                    {agreement.isRequired && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">Required</span>}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    {agreement.summary || agreementDescriptions[agreement.agreementType] || 'Please read and accept this agreement before submission.'}
                  </p>
                  {agreement.content && (
                    <details className="mt-3 text-xs text-gray-600">
                      <summary className="cursor-pointer font-semibold text-gray-700">Read full agreement</summary>
                      <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/80 p-3 leading-5 ring-1 ring-gray-200">
                        {agreement.content}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {reviewChecklist.map((item) => (
            <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {item.done ? 'Ready' : 'Pending'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <h3 className="text-lg font-bold text-gray-900">Current review trail</h3>
          {reviewHistory.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No review history yet. Save your onboarding draft or submit the package to start the trail.</p>
          ) : (
            <>
              <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                {reviewHistory.map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:shadow-md">
                    <p className="text-sm font-semibold text-gray-900">
                      {getReviewActionLabel(item.action, profile.partnerType, profile.businessName || profile.ownerName)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</p>
                    {getReviewComment(item.action, item.comment) ? (
                      <p className="mt-2 text-sm text-gray-600 leading-relaxed">{getReviewComment(item.action, item.comment)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                  width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                  background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                  background-color: #cbd5e1;
                  border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background-color: #94a3b8;
                }
                .custom-scrollbar {
                  scrollbar-width: thin;
                  scrollbar-color: #cbd5e1 transparent;
                }
              `}</style>
            </>
          )}
        </div>

      </div>
    );
  };

  if (loading) {
    return (
      <BrandLoader variant="section" size="md" bg="light" text="Loading onboarding workspace..." />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* ── Premium Progress Stepper Card ── */}
      <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-[0_4px_24px_-6px_rgba(0,0,0,0.1)]">
        {/* Dark header strip */}
        <div className="bg-gradient-to-r from-[#1A1A1A] via-[#222222] to-[#2a2a2a] px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FFC107]/70 mb-0.5">
              {isAdminMode ? 'KYC Editor' : 'Onboarding'}
            </p>
            <h2 className="text-[15px] font-bold text-white leading-tight">
              {isAdminMode ? 'Edit Partner KYC and Profile' : 'Partner Onboarding Progress'}
            </h2>
          </div>
          {!isAdminMode && (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <span className="text-[11px] text-gray-400 font-medium">Step</span>
              <span className="text-xl font-extrabold text-white leading-none">{progressStep + 1}</span>
              <span className="text-sm font-normal text-gray-500">/ {steps.length}</span>
            </div>
          )}
        </div>

        {isAdminMode && !canEdit ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This partner record is view-only. KYC Edit Override permission is required to make changes.
          </div>
        ) : null}

        {/* Stepper body */}
        <div className="px-6 pt-6 pb-8">
          {isAdminMode ? (
            /* ── Admin Tab Bar ── */
            <div className="flex w-full items-center gap-1.5 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden">
              {steps.map((step, index) => {
                const isActive = currentStep === index;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => handleStepNavigation(index)}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${isActive
                        ? 'bg-[#FFC107] text-black shadow-sm ring-2 ring-[#FFC107]/30'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                  >
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${isActive ? 'bg-black/15 text-black' : 'bg-gray-200 text-gray-500'
                      }`}>{index + 1}</span>
                    {step.title}
                  </button>
                );
              })}
            </div>
          ) : (
            /* ── Partner Stepper ── */
            <div className="relative flex items-start">
              {/* Background track */}
              <div className="absolute top-5 left-0 right-0 h-[2px] bg-gray-100 rounded-full" />

              {steps.map((step, index) => {
                const isActive = !isApproved && currentStep === index;
                const isPast = isApproved ? index < steps.length : index < currentStep;

                let isCompleted = isApproved;
                switch (step.id) {
                  case 'profile':
                  case 'business':
                    isCompleted = isPast && progress.profileComplete;
                    break;
                  case 'kyc':
                    isCompleted = isPast && progress.documentsComplete;
                    break;
                  case 'agreements':
                    isCompleted = isPast && progress.agreementsComplete;
                    break;
                  case 'review':
                    isCompleted = isPast && progress.readyForSubmission && currentUser?.onboardingStatus === 'SUBMITTED';
                    break;
                }

                return (
                  <div key={step.id} className="relative flex flex-1 flex-col items-center">
                    {/* Left half connecting line (from prev step center to this node) */}
                    {index !== 0 && (
                      <div
                        className={`absolute top-5 right-1/2 h-[2px] w-1/2 rounded-full transition-colors duration-500 ${isPast || isActive ? 'bg-[#FFC107]' : 'bg-gray-100'
                          }`}
                      />
                    )}
                    {/* Right half connecting line (from this node to next step center) */}
                    {index !== steps.length - 1 && (
                      <div
                        className={`absolute top-5 left-1/2 h-[2px] w-1/2 rounded-full transition-colors duration-500 ${isPast ? 'bg-[#FFC107]' : 'bg-gray-100'
                          }`}
                      />
                    )}

                    {/* Step node button */}
                    <button
                      type="button"
                      onClick={() => handleStepNavigation(index)}
                      title={step.title}
                      className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107] ${isActive
                          ? 'h-10 w-10 bg-[#FFC107] shadow-[0_0_0_4px_rgba(255,193,7,0.2)] ring-2 ring-[#FFC107]'
                          : isCompleted
                            ? 'h-10 w-10 bg-[#FFC107] shadow-sm'
                            : isPast
                              ? 'h-10 w-10 bg-amber-50 border-2 border-[#FFC107]/50'
                              : 'h-10 w-10 border-2 border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50'
                        }`}
                    >
                      {isCompleted ? (
                        <svg className="h-4 w-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isActive ? (
                        <span className="text-sm font-extrabold text-black">{index + 1}</span>
                      ) : isPast ? (
                        <span className="text-sm font-bold text-amber-500">{index + 1}</span>
                      ) : (
                        <span className="text-sm font-semibold text-gray-400">{index + 1}</span>
                      )}
                    </button>

                    {/* Step label */}
                    <div className="mt-3 flex flex-col items-center gap-1 px-1">
                      <span
                        className={`text-[11px] font-semibold leading-tight text-center whitespace-nowrap transition-colors ${isActive ? 'text-gray-900' : isCompleted || isPast ? 'text-gray-700' : 'text-gray-400'
                          }`}
                      >
                        {step.title}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFC107]/15 px-2 py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#FFC107] animate-pulse" />
                          <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700">Active</span>
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600">Done</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {currentUser?.onboardingStatus === 'CHANGES_REQUESTED' && currentStatus !== 'SUBMITTED' ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 flex items-start gap-4 shadow-sm">
            <div className="flex-shrink-0 mt-1">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-900">Action Required: Admin Requested Changes</h3>
              <p className="mt-1 text-sm text-red-800">
                An admin has reviewed your application and requested some updates. Please check the <b>Current review trail</b> in the Review section for specific notes, make the necessary changes, and submit again.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        ) : null}

        {isApproved && !isAdminMode && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-6">
            <h3 className="text-lg font-bold text-green-900">Account approved and activated</h3>
            {!requestedPartnerId && (
              <button
                type="button"
                onClick={() => router.push('/partner/dashboard')}
                className="mt-5 rounded-lg bg-[#FFC107] px-5 py-3 font-semibold text-black transition hover:bg-[#E5AD06]"
              >
                Open Partner Dashboard
              </button>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{steps[currentStep].title}</p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">{steps[currentStep].description}</h2>
          </div>

          {stepContent()}

          <div className="mt-8 flex flex-col-reverse gap-4 border-t border-gray-100 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="grid grid-cols-2 gap-3 md:flex md:w-auto">
              <button
                type="button"
                onClick={() => setCurrentStep((c) => Math.max(0, c - 1))}
                disabled={currentStep === 0}
                className="w-full rounded-lg border border-gray-200 px-5 py-3 text-center font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 md:w-auto"
              >
                Previous
              </button>

              <button
                type="button"
                onClick={() => handleStepNavigation(Math.min(steps.length - 1, currentStep + 1))}
                disabled={currentStep === steps.length - 1}
                className="w-full rounded-lg bg-gray-900 px-5 py-3 text-center font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 md:w-auto"
              >
                Next
              </button>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              {isAdminMode && canEdit ? (
                <div className="grid grid-cols-2 gap-3 md:flex md:w-auto">
                  <button
                    type="button"
                    onClick={() => router.push(editorReturnPath)}
                    disabled={saving}
                    className="w-full rounded-lg border border-gray-300 px-5 py-3 text-center font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 md:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveDraft()}
                    className="w-full rounded-lg border border-[#FFC107] bg-[#FFC107] px-5 py-3 text-center font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-50 md:w-auto"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              ) : null}

              {!isAdminMode && currentStep < steps.length - 1 && canEdit && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveDraft()}
                  className="rounded-lg border border-[#FFC107] px-5 py-3 font-semibold text-[#FFC107] transition hover:bg-[#FFC107] hover:text-black disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save progress'}
                </button>
              )}

              {!isAdminMode && currentStep === steps.length - 1 && (
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleFinalSubmit()}
                    disabled={!canSubmitOnboarding}
                    className="w-full rounded-lg bg-[#FFC107] px-5 py-3 font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-50 sm:w-auto"
                  >
                    {submitting ? 'Submitting...' : currentStatus === 'SUBMITTED' ? 'Submitted' : 'Submit full onboarding'}
                  </button>
                  {!canSubmitOnboarding && submitBlockers.length > 0 && currentStatus !== 'UNDER_REVIEW' && currentStatus !== 'SUBMITTED' ? (
                    <p className="max-w-md text-xs font-medium text-amber-700 text-right">
                      {submitBlockers.map((blocker, i) => (
                        <span key={i} className="block">
                          {blocker}
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className={`max-w-md text-xs font-medium ${canSubmitOnboarding ? 'text-green-700' : 'text-amber-700'}`}>
                      {submitStatus}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  fullWidth = false,
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

const inputClassName =
  'w-full rounded-lg border border-gray-200 bg-[#F5F8FA] px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] disabled:cursor-not-allowed disabled:bg-gray-100';

const textareaClassName =
  'w-full rounded-lg border border-gray-200 bg-[#F5F8FA] px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] disabled:cursor-not-allowed disabled:bg-gray-100';
