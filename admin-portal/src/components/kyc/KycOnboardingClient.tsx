'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import api from '@/lib/api';
import { resolvePartnerId } from '@/lib/routeResolvers';
import { generateAdminPartnerEditPath } from '@/lib/routePaths';
import { FileUploadField } from '@/components/upload/FileUploadField';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { useAuthStore } from '@/store/authStore';

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
  'CANCELLED_CHEQUE',
  'PASSPORT_PHOTO',
];

const businessKycDocumentTypes = [
  'PAN_CARD',
  'GST_CERTIFICATE',
  'AUTHORIZED_PERSON_ID',
  'CANCELLED_CHEQUE',
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
};

type AgreementForm = {
  agreementType: string;
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

const formatStatusText = (value?: string | null) => (value ? value.replaceAll('_', ' ') : 'Not available');

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
      addressLabel: 'Authorized place address',
      addressPlaceholder: 'Complete authorized place / yard address',
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
    addressLabel: 'Office / working address',
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentStep, setCurrentStep] = useState(0);

  const currentStatus = currentUser?.kycStatus || 'NOT_STARTED';
  const isApproved = currentUser?.accountStatus === 'ACTIVE' && currentUser?.onboardingStatus === 'APPROVED' && currentUser?.kycStatus === 'APPROVED';
  const canEdit = isAdminMode ? true : !isApproved && currentStatus !== 'UNDER_REVIEW' && currentStatus !== 'SUBMITTED';

  useEffect(() => {
    if (!isAdminMode || !resolvedPartnerId || !currentUser || !pathname.endsWith('/edit')) {
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
  }, [isAdminMode, resolvedPartnerId, currentUser, pathname, partnerPortalBasePath, profile.businessName, profile.district, router]);

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
    profile.district?.trim() &&
    profile.city?.trim() &&
    profile.pinCode?.trim() &&
    profile.businessAddress?.trim() &&
    profile.businessExperience?.trim() &&
    (profile.partnerType === 'SHOWROOM' || String(profile.expectedMonthlyListings || '').trim()) &&
    (profile.partnerType === 'SHOWROOM' || profile.contactPreference?.trim())
  );
  const areAgreementsComplete = agreements.length > 0 && agreements.every((agreement) => agreement.checked);

  const reviewChecklist = useMemo(
    () => [
      { label: 'Account details complete', done: isAccountComplete },
      { label: 'Business information complete', done: isBusinessComplete },
      { label: 'Required KYC documents added', done: progress.documentsComplete },
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

  const refreshWithResponse = (data: { user: Parameters<typeof updateUser>[0]; onboarding?: OnboardingResponse }) => {
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
      return `${submissionPrefix} Location: ${[profile.city, profile.district, profile.state].filter(Boolean).join(', ') || 'N/A'}, address: ${profile.businessAddress || 'N/A'}.`;
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

  const buildPayload = () => ({
    profile: {
      ...profile,
      primaryContact: profile.primaryContact.replace(/[^0-9]/g, '').slice(0, 10),
      alternateMobile: profile.alternateMobile.replace(/[^0-9]/g, '').slice(0, 10),
      whatsappNumber: profile.whatsappNumber.replace(/[^0-9]/g, '').slice(0, 10),
      pinCode: profile.pinCode.replace(/[^0-9]/g, '').slice(0, 6),
      partnerType: profile.partnerType || '',
    },
    kycDocuments: documentsByType,
    agreements: checkedAgreementTypes,
  });

  const handleSaveDraft = async () => {
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
      refreshWithResponse(response.data);
      if (isAdminMode) {
        router.push(partnerPortalBasePath);
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
        router.push(partnerPortalBasePath);
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
            {profile.partnerType !== 'BROKER' && (
              <Field label="Referral code">
                <input
                  value={profile.referralCode}
                  onChange={(event) => setProfile((current) => ({ ...current, referralCode: toUpperCase(event.target.value) }))}
                  disabled={!canEdit}
                  className={inputClassName}
                  placeholder="Optional referral code"
                />
              </Field>
            )}
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
              <input
                value={profile.state}
                onChange={(event) => setProfile((current) => ({ ...current, state: toTitleCase(event.target.value) }))}
                disabled={!canEdit}
                className={inputClassName}
              />
            </Field>
            <Field label="District">
              <input
                value={profile.district}
                onChange={(event) => setProfile((current) => ({ ...current, district: toTitleCase(event.target.value) }))}
                disabled={!canEdit}
                className={inputClassName}
              />
            </Field>
            <Field label="City">
              <input
                value={profile.city}
                onChange={(event) => setProfile((current) => ({ ...current, city: toTitleCase(event.target.value) }))}
                disabled={!canEdit}
                className={inputClassName}
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
                <Field label="GST number">
                  <input
                    value={profile.gstNumber}
                    onChange={(event) => setProfile((current) => ({ ...current, gstNumber: toUpperCase(event.target.value) }))}
                    disabled={!canEdit}
                    className={inputClassName}
                    placeholder="GST number if applicable"
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
                <Field label="Business proof note, if any">
                  <input
                    value={profile.gstNumber}
                    onChange={(event) => setProfile((current) => ({ ...current, gstNumber: toSentenceCase(event.target.value) }))}
                    disabled={!canEdit}
                    className={inputClassName}
                    placeholder="Optional GST, MSME, or local proof reference"
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
      return (
        <div className="space-y-5">
          {!profile.partnerType ? (
            <div className="rounded-2xl border border-[#FFD45A] bg-[#FFF8DC] px-5 py-5">
              <h3 className="text-lg font-bold text-[#7A5900]">Select partner type to unlock KYC fields</h3>
              <div className="mt-4 max-w-sm">
                <label className="mb-1.5 block text-sm font-medium text-[#7A5900]">Partner type</label>
                <select
                  value={profile.partnerType}
                  onChange={(event) => setProfile((current) => ({ ...current, partnerType: event.target.value }))}
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
              </div>
            </div>
          ) : (
            <>
              {documentsByType.map((document) => (
                <div key={document.documentType} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">{getDocumentLabel(document.documentType, profile.partnerType)}</h3>
                      <p className="text-xs text-gray-500">Status: {formatStatusText(document.status)}</p>
                    </div>
                    {document.reviewComment ? (
                      <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                        {document.reviewComment}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="File name">
                      <input
                        value={document.fileName}
                        onChange={(event) => updateDocument(document.documentType, { fileName: event.target.value })}
                        disabled={!canEdit}
                        className={inputClassName}
                        placeholder="pan-card.pdf"
                      />
                    </Field>
                    <Field label="Upload file">
                      <FileUploadField
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        disabled={!canEdit}
                        helperText="Images up to 5MB are compressed to WEBP in the browser. PDFs must be 3MB or smaller."
                        onUploaded={(uploadedFile) =>
                          updateDocument(document.documentType, {
                            fileName: uploadedFile.originalName,
                            fileUrl: uploadedFile.fileUrl,
                          })
                        }
                        uploadedFileName={document.fileName}
                        uploadedFileUrl={document.fileUrl}
                        visibility="secure"
                      />
                    </Field>
                    <Field label="Document number">
                      <input
                        value={document.documentNumber}
                        onChange={(event) => updateDocument(document.documentType, { documentNumber: toUpperCase(event.target.value) })}
                        disabled={!canEdit}
                        className={inputClassName}
                      />
                    </Field>
                    <Field label="Name on document">
                      <input
                        value={document.nameOnDocument}
                        onChange={(event) => updateDocument(document.documentType, { nameOnDocument: toTitleCase(event.target.value) })}
                        disabled={!canEdit}
                        className={inputClassName}
                      />
                    </Field>
                    {!['CANCELLED_CHEQUE', 'PASSPORT_PHOTO'].includes(document.documentType) && (
                      <>
                        <Field label="Issue date">
                          <input
                            type="date"
                            value={document.issueDate}
                            onChange={(event) => updateDocument(document.documentType, { issueDate: event.target.value })}
                            disabled={!canEdit}
                            className={inputClassName}
                          />
                        </Field>
                        <Field label="Expiry date">
                          <input
                            type="date"
                            value={document.expiryDate}
                            onChange={(event) => updateDocument(document.documentType, { expiryDate: event.target.value })}
                            disabled={!canEdit}
                            className={inputClassName}
                          />
                        </Field>
                      </>
                    )}
                    <Field label="Submission note" fullWidth>
                      <textarea
                        value={document.submittedNote}
                        onChange={(event) => updateDocument(document.documentType, { submittedNote: toSentenceCase(event.target.value) })}
                        disabled={!canEdit}
                        rows={3}
                        className={textareaClassName}
                        placeholder="Any context for reviewer"
                      />
                    </Field>
                  </div>
                </div>
              ))}
              {optionalDocumentsByType.length > 0 ? (
                <div className="space-y-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Optional supporting documents</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Agar aapke paas extra business proof ya supplementary identity support hai, to yahan add kar sakte hain.
                    </p>
                  </div>
                  {optionalDocumentsByType.map((document) => (
                    <div key={document.documentType} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="mb-4">
                        <h3 className="text-base font-bold text-gray-900">{getDocumentLabel(document.documentType, profile.partnerType)}</h3>
                        <p className="text-xs text-gray-500">Optional document</p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="File name">
                          <input
                            value={document.fileName}
                            onChange={(event) => updateDocument(document.documentType, { fileName: event.target.value })}
                            disabled={!canEdit}
                            className={inputClassName}
                            placeholder="supporting-proof.pdf"
                          />
                        </Field>
                        <Field label="Upload file">
                          <FileUploadField
                            accept=".pdf,.png,.jpg,.jpeg,.webp"
                            disabled={!canEdit}
                            helperText="Stored in secure private document storage."
                            onUploaded={(uploadedFile) =>
                              updateDocument(document.documentType, {
                                fileName: uploadedFile.originalName,
                                fileUrl: uploadedFile.fileUrl,
                              })
                            }
                            uploadedFileName={document.fileName}
                            uploadedFileUrl={document.fileUrl}
                            visibility="secure"
                          />
                        </Field>
                        <Field label="Document number">
                          <input
                            value={document.documentNumber}
                            onChange={(event) => updateDocument(document.documentType, { documentNumber: toUpperCase(event.target.value) })}
                            disabled={!canEdit}
                            className={inputClassName}
                          />
                        </Field>
                        <Field label="Name on document">
                          <input
                            value={document.nameOnDocument}
                            onChange={(event) => updateDocument(document.documentType, { nameOnDocument: toTitleCase(event.target.value) })}
                            disabled={!canEdit}
                            className={inputClassName}
                          />
                        </Field>
                        {!['CANCELLED_CHEQUE', 'PASSPORT_PHOTO'].includes(document.documentType) && (
                          <>
                            <Field label="Issue date">
                              <input
                                type="date"
                                value={document.issueDate}
                                onChange={(event) => updateDocument(document.documentType, { issueDate: event.target.value })}
                                disabled={!canEdit}
                                className={inputClassName}
                              />
                            </Field>
                            <Field label="Expiry date">
                              <input
                                type="date"
                                value={document.expiryDate}
                                onChange={(event) => updateDocument(document.documentType, { expiryDate: event.target.value })}
                                disabled={!canEdit}
                                className={inputClassName}
                              />
                            </Field>
                          </>
                        )}
                        <Field label="Submission note" fullWidth>
                          <textarea
                            value={document.submittedNote}
                            onChange={(event) => updateDocument(document.documentType, { submittedNote: toSentenceCase(event.target.value) })}
                            disabled={!canEdit}
                            rows={3}
                            className={textareaClassName}
                            placeholder="Why this optional document helps your review"
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
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
              <label
                key={agreement.agreementType}
                className={`flex h-full items-start gap-3 rounded-xl border px-4 py-4 ${agreement.checked ? 'border-[#FFC107] bg-[#FFF8DC]' : 'border-gray-200 bg-white'}`}
              >
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
                  className="mt-1 h-4 w-4"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {agreementLabels[agreement.agreementType] || agreement.agreementType.replaceAll('_', ' ')}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    {agreementDescriptions[agreement.agreementType] || 'Required before approval.'}
                  </p>
                </div>
              </label>
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
                    <p className="mt-1 text-xs text-gray-500">{new Date(item.createdAt).toLocaleString('en-IN')}</p>
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">
          Loading onboarding workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">
          {isAdminMode ? 'Edit Partner Profile' : 'Partner Onboarding Progress'}
        </h2>

        {isAdminMode ? (
          <div className="flex w-full items-center gap-2 overflow-x-auto border-b border-gray-100 pb-4 whitespace-nowrap [&::-webkit-scrollbar]:hidden">
            {steps.map((step, index) => {
              const isActive = currentStep === index;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setCurrentStep(index)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isActive ? 'bg-[#FFC107] text-black shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {step.title}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-between relative">
            {steps.map((step, index) => {
              const isActive = currentStep === index;

              let isCompleted = false;
              switch (step.id) {
                case 'profile':
                case 'business':
                  isCompleted = currentStep > index && progress.profileComplete;
                  break;
                case 'kyc':
                  isCompleted = currentStep > index && progress.documentsComplete;
                  break;
                case 'agreements':
                  isCompleted = currentStep > index && progress.agreementsComplete;
                  break;
                case 'review':
                  isCompleted = currentStep > index && progress.readyForSubmission && currentUser?.onboardingStatus === 'SUBMITTED';
                  break;
              }

              return (
                <div key={step.id} className="relative flex flex-col items-center flex-1">
                  {/* Connecting Line */}
                  {index !== steps.length - 1 && (
                    <div className={`absolute top-4 left-[50%] w-full h-[2px] ${isCompleted ? 'bg-[#FFC107]' : 'bg-gray-200'}`} />
                  )}

                  {/* Step Marker */}
                  <button
                    type="button"
                    onClick={() => setCurrentStep(index)}
                    className={`relative z-10 flex items-center justify-center transition-all ${isActive
                      ? 'h-8 px-4 rounded-full bg-[#FFC107] text-black shadow-md'
                      : isCompleted
                        ? 'h-8 w-8 rounded-full bg-[#FFC107] text-black'
                        : 'h-8 w-8 rounded-full border-2 border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                      }`}
                  >
                    {isCompleted ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    ) : isActive ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-black/20 flex items-center justify-center text-[10px] font-bold">{index + 1}</div>
                        <span className="text-sm font-bold whitespace-nowrap">{step.title}</span>
                      </div>
                    ) : (
                      <span className="text-xs font-bold">{index + 1}</span>
                    )}
                  </button>

                  {/* Text for inactive/completed steps */}
                  {!isActive && (
                    <span className={`mt-2 text-xs font-medium absolute top-8 whitespace-nowrap ${isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                      {step.title}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
                onClick={() => setCurrentStep((c) => Math.min(steps.length - 1, c + 1))}
                disabled={currentStep === steps.length - 1}
                className="w-full rounded-lg bg-gray-900 px-5 py-3 text-center font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 md:w-auto"
              >
                Next
              </button>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              {isAdminMode ? (
                <div className="grid grid-cols-2 gap-3 md:flex md:w-auto">
                  <button
                    type="button"
                    onClick={() => router.push(partnerPortalBasePath)}
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
