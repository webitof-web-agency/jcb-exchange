'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Building2,
  FileText,
  AlertCircle,
  Map,
  Globe,
  Share2,
  ShieldCheck,
  Tag,
  Package,
  Image as ImageIcon,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ClipboardCheck,
  ChevronDown,
  Download,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { useTranslation } from '@/hooks/useTranslation';
import { useHeaderStore } from '@/store/headerStore';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { formatPortalCurrency, formatPortalDate } from '@/lib/partnerPortal';
import { resolvePartnerId } from '@/lib/routeResolvers';
import { generateAdminListingDetailPath, generateAdminPartnerDetailPath, generateAdminPartnerEditPath } from '@/lib/routePaths';
import {
  canPreviewPartnerDocument,
  formatPartnerDocumentStatus,
  getPartnerDocumentKind,
  type PartnerDocumentKind,
} from '@/lib/partnerDetailPresentation';
import { getKycVerificationFields, type KycVerificationDocumentType } from '@/lib/kycVerification';
import { createSecureDocumentPreviewUrl, downloadSecureDocument } from '@/lib/secureDownload';

interface PartnerListing {
  id: string;
  title: string;
  price: number;
  status: string;
  createdAt: string;
  imageUrl?: string | null;
  images?: Array<{
    id: string;
    url: string;
    isFeatured: boolean;
  }>;
}

const statusClassNames: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PENDING: 'bg-orange-100 text-orange-700',
  REVIEW_PENDING: 'bg-orange-100 text-orange-700',
  PROFILE_PENDING: 'bg-orange-100 text-orange-700',
  KYC_PENDING: 'bg-orange-100 text-orange-700',
  AGREEMENT_PENDING: 'bg-orange-100 text-orange-700',
  REJECTED: 'bg-red-100 text-red-700',
  SOLD: 'bg-blue-100 text-blue-700',
  EXPIRED: 'bg-gray-100 text-gray-700',
  INACTIVE: 'bg-gray-100 text-gray-700',
};

interface PartnerProfile {
  id: string;
  ownerName: string;
  alternateMobile: string;
  businessAddress: string;
  district: string;
  state: string;
  pinCode: string;
  gstNumber: string;
  businessRegistrationNumber: string;
  businessExperience: string;
  yearsInBusiness: string;
  teamSize: string;
  serviceAreas: string;
  workingHours: string;
  googleMapsLocation: string;
  socialLinks: string;
  referralCode: string;
  websiteUrl: string;
  businessDescription: string;
  expectedMonthlyListings: number | null;
  contactPreference: string;
}

interface ManagedUser {
  id: string;
  email: string;
  mobile: string;
  whatsappNumber: string;
  city: string;
  state: string;
  name: string;
  fullName: string;
  role: string;
  partnerType: string;
  status: string;
  accountStatus: string;
  kycStatus: string;
  onboardingStatus: string;
  createdAt: string;
  partnerProfile?: PartnerProfile;
}

interface VerificationDetailDocument {
  id: string;
  documentType: string;
  fileUrl: string | null;
  fileName: string | null;
  documentNumber: string | null;
  nameOnDocument: string | null;
  status: string;
  verificationStatus: string | null;
  verificationMessage: string | null;
  verificationCompletedAt: string | null;
  verificationResult: Record<string, unknown> | null;
}

interface VerificationDetail {
  documents: VerificationDetailDocument[];
  agreements: Array<{ agreementType: string; version: string; acceptedAt: string }>;
  reviewHistory: Array<{ id: string; action: string; comment: string | null; createdAt: string }>;
}

interface PartnerDetailPageProps {
  partnerId: string;
  backHref: string;
  editBaseHref: string;
  listingDetailBaseHref: string;
}

export default function PartnerDetailPage({
  partnerId,
  backHref,
  editBaseHref,
  listingDetailBaseHref,
}: PartnerDetailPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const viewer = useAuthStore((state) => state.user);
  const canEditOnboarding = viewer?.role === 'SUPER_ADMIN' || viewer?.role === 'ADMIN' || hasAnyPermission(viewer?.permissions, ['kyc.edit.override']);
  const [partner, setPartner] = useState<ManagedUser | null>(null);
  const [listings, setListings] = useState<PartnerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingListings, setLoadingListings] = useState(true);
  const [error, setError] = useState('');
  const [resolvedPartnerId, setResolvedPartnerId] = useState<string | null>(null);
  const [verificationDetail, setVerificationDetail] = useState<VerificationDetail | null>(null);
  const [isKycExpanded, setIsKycExpanded] = useState(false);
  const [isAgreementsExpanded, setIsAgreementsExpanded] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<{
    document: VerificationDetailDocument;
    kind: PartnerDocumentKind;
    previewUrl: string | null;
    loading: boolean;
    error: string;
  } | null>(null);

  const fetchPartnerListings = useCallback(async () => {
    if (!resolvedPartnerId) {
      setListings([]);
      setLoadingListings(false);
      return;
    }

    try {
      setLoadingListings(true);
      const response = await api.get<{ listings: PartnerListing[] }>('/superadmin/listings', {
        params: { partnerId: resolvedPartnerId, compact: 'true' },
      });
      setListings(response.data.listings || []);
    } catch (err) {
      console.error('Failed to load listings', err);
    } finally {
      setLoadingListings(false);
    }
  }, [resolvedPartnerId]);

  const fetchPartnerDetails = useCallback(async () => {
    try {
      setLoading(true);
      const nextResolvedPartnerId = (await resolvePartnerId(partnerId)) || partnerId;
      setResolvedPartnerId(nextResolvedPartnerId);
      const response = await api.get<{ partners: ManagedUser[] }>('/superadmin/partners', {
        params: { id: nextResolvedPartnerId },
      });
      const foundPartner = response.data.partners?.[0];

      if (!foundPartner) {
        setError(t('partnerDetails.partnerNotFound'));
      } else {
        setPartner(foundPartner);
        try {
          const verificationResponse = await api.get<{ verification: VerificationDetail }>(
            `/superadmin/verifications/${nextResolvedPartnerId}`,
          );
          setVerificationDetail(verificationResponse.data.verification);
        } catch (verificationError) {
          // The profile remains useful even when the optional KYC review
          // endpoint is unavailable for a restricted employee role.
          console.error('Failed to load partner KYC detail', verificationError);
          setVerificationDetail(null);
        }
      }
    } catch (err: unknown) {
      const message =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'data' in err.response &&
        err.response.data &&
        typeof err.response.data === 'object' &&
        'message' in err.response.data &&
        typeof err.response.data.message === 'string'
          ? err.response.data.message
          : t('partnerDetails.fetchFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [partnerId, t]);

  const formatStatusLabel = useCallback((value?: string | null) => {
    if (!value) {
      return t('partnerDetails.notSet');
    }

    switch (value.toUpperCase()) {
      case 'APPROVED':
      case 'ACTIVE':
        return t('partnerDetails.active');
      case 'PENDING':
      case 'REVIEW_PENDING':
      case 'PROFILE_PENDING':
      case 'KYC_PENDING':
      case 'AGREEMENT_PENDING':
        return t('partnerDetails.pending');
      case 'REJECTED':
        return t('partnerDetails.rejected');
      case 'CHANGES_REQUESTED':
        return t('partnerDetails.changesRequested');
      case 'INACTIVE':
        return t('partnerDetails.inactive');
      case 'SUSPENDED':
        return t('partnerDetails.suspended');
      case 'BLOCKED':
        return t('partnerDetails.blocked');
      case 'SOLD':
        return t('partnerDetails.sold');
      case 'EXPIRED':
        return t('partnerDetails.expired');
      default:
        return value
          .toLowerCase()
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
    }
  }, [t]);

  useEffect(() => {
    const loadPartnerData = async () => {
      await Promise.all([fetchPartnerDetails(), fetchPartnerListings()]);
    };

    void loadPartnerData();
  }, [fetchPartnerDetails, fetchPartnerListings]);

  const getPartnerStatus = useCallback((currentPartner: ManagedUser) => {
    if (currentPartner.status === 'INACTIVE') return t('partnerDetails.inactive');
    if (currentPartner.status === 'SUSPENDED') return t('partnerDetails.suspended');
    if (currentPartner.status === 'BLOCKED') return t('partnerDetails.blocked');
    if (
      currentPartner.accountStatus === 'ACTIVE' &&
      currentPartner.kycStatus === 'APPROVED' &&
      currentPartner.onboardingStatus === 'APPROVED'
    ) {
      return t('partnerDetails.active');
    }
    if (currentPartner.onboardingStatus === 'REJECTED' || currentPartner.kycStatus === 'REJECTED') {
      return t('partnerDetails.rejected');
    }
    if (
      currentPartner.onboardingStatus === 'CHANGES_REQUESTED' ||
      currentPartner.kycStatus === 'CHANGES_REQUESTED'
    ) {
      return t('partnerDetails.changesRequested');
    }
    return t('partnerDetails.pending');
  }, [t]);

  const getPartnerStatusClassName = useCallback((currentPartner: ManagedUser) => {
    if (currentPartner.status === 'INACTIVE') return 'bg-gray-100 text-gray-700';
    if (currentPartner.status === 'SUSPENDED') return 'bg-orange-100 text-orange-700';
    if (currentPartner.status === 'BLOCKED') return 'bg-red-100 text-red-700';
    if (
      currentPartner.accountStatus === 'ACTIVE' &&
      currentPartner.kycStatus === 'APPROVED' &&
      currentPartner.onboardingStatus === 'APPROVED'
    ) {
      return 'bg-green-100 text-green-700';
    }
    if (currentPartner.onboardingStatus === 'REJECTED' || currentPartner.kycStatus === 'REJECTED') {
      return 'bg-red-100 text-red-700';
    }
    if (
      currentPartner.onboardingStatus === 'CHANGES_REQUESTED' ||
      currentPartner.kycStatus === 'CHANGES_REQUESTED'
    ) {
      return 'bg-yellow-100 text-yellow-800';
    }
    return 'bg-blue-100 text-blue-700';
  }, []);

  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);
  const editHref = partner
    ? generateAdminPartnerEditPath(editBaseHref, {
        id: partner.id,
        name: partner.name,
        district: partner.partnerProfile?.district || '',
      })
    : backHref;

  useEffect(() => {
    if (!partner) {
      return;
    }

    const canonicalPath = generateAdminPartnerDetailPath(backHref, {
      id: partner.id,
      name: partner.name,
      businessName: partner.name,
      district: partner.partnerProfile?.district || '',
    });

    if (pathname !== canonicalPath) {
      router.replace(canonicalPath);
    }
  }, [partner, backHref, pathname, router]);

  useEffect(() => {
    if (partner) {
      const profile = partner.partnerProfile;
      const partnerStatus = getPartnerStatus(partner);
      const statusClass = getPartnerStatusClassName(partner);

      setCustomHeader(
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={backHref}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 shadow-sm transition hover:bg-gray-100 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1
                className="truncate text-base font-bold text-gray-900 sm:text-xl"
                title={partner.name || t('partnerDetails.unnamedBusiness')}
              >
                {partner.name || t('partnerDetails.unnamedBusiness')}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-gray-500 sm:text-xs">
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.25 text-[9px] font-bold uppercase tracking-wider ${statusClass}`}>
                  {partnerStatus}
                </span>
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3 shrink-0" />
                  <span className="max-w-[80px] truncate sm:max-w-none">
                    {formatPartnerTypeLabel(partner.partnerType, t('partnerDetails.partnerTypeNotSet'))}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="max-w-[80px] truncate sm:max-w-none">
                    {profile?.district || t('partnerDetails.notSet')}
                  </span>
                </span>
              </div>
            </div>
          </div>
          {canEditOnboarding ? (
            <div className="flex shrink-0 items-center justify-end pr-2 sm:pr-4">
              <Link
                href={editHref}
                className="flex h-8 items-center justify-center rounded-full bg-[#FFC107] px-3 text-xs font-bold text-black shadow-sm transition hover:bg-[#E5AD06]"
              >
                <span className="hidden sm:inline">{t('partnerDetails.editOnboarding')}</span>
                <span className="inline sm:hidden">{t('partnerDetails.edit')}</span>
              </Link>
            </div>
          ) : null}
        </div>
      );
    }
    return () => setCustomHeader(null);
  }, [partner, backHref, editHref, canEditOnboarding, setCustomHeader, getPartnerStatus, getPartnerStatusClassName, t]);

  useEffect(() => {
    return () => {
      if (documentPreview?.previewUrl) {
        window.URL.revokeObjectURL(documentPreview.previewUrl);
      }
    };
  }, [documentPreview?.previewUrl]);

  const openDocumentPreview = useCallback(async (document: VerificationDetailDocument) => {
    if (!document.fileUrl) return;

    const kind = getPartnerDocumentKind(document.fileName, document.fileUrl);
    setDocumentPreview({ document, kind, previewUrl: null, loading: true, error: '' });

    try {
      const previewUrl = await createSecureDocumentPreviewUrl(document.fileUrl, document.fileName || 'document');
      setDocumentPreview((current) => current?.document.id === document.id
        ? { ...current, previewUrl, loading: false }
        : current);
    } catch (previewError) {
      console.error('Failed to open KYC document', previewError);
      setDocumentPreview((current) => current?.document.id === document.id
        ? { ...current, loading: false, error: 'Unable to open this document. Please download it instead.' }
        : current);
    }
  }, []);

  const downloadDocument = useCallback(async (document: VerificationDetailDocument) => {
    if (!document.fileUrl) return;

    try {
      await downloadSecureDocument(document.fileUrl, document.fileName || 'document');
    } catch (downloadError) {
      console.error('Failed to download KYC document', downloadError);
      setDocumentPreview((current) => current?.document.id === document.id
        ? { ...current, error: 'Unable to download this document. Please try again.' }
        : current);
    }
  }, []);

  const openOrDownloadDocument = useCallback(async (document: VerificationDetailDocument) => {
    if (!document.fileUrl) return;

    if (!canPreviewPartnerDocument(document.fileName, document.fileUrl)) {
      await downloadDocument(document);
      return;
    }

    await openDocumentPreview(document);
  }, [downloadDocument, openDocumentPreview]);

  if (loading) {
    return (
      <BrandLoader variant="section" size="md" bg="light" />
    );
  }

  if (error || !partner) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-2xl bg-white p-8 text-center shadow-sm">
        <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
        <h3 className="mb-2 text-xl font-bold text-gray-900">{t('partnerDetails.loadFailed')}</h3>
        <p className="mb-6 text-gray-500">{error || t('partnerDetails.partnerNotFound')}</p>
        <Link
          href={backHref}
          className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
        >
          {t('partnerDetails.goBack')}
        </Link>
      </div>
    );
  }

  const profile = partner.partnerProfile;

  return (
    <div className="pb-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                <Building2 className="h-5 w-5 text-gray-500" />
                <h3 className="text-base font-bold text-gray-900">{t('partnerDetails.businessProfile')}</h3>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.businessName')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{partner.name || t('partnerDetails.notProvided')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Expected monthly listings</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.expectedMonthlyListings || t('partnerDetails.notProvided')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Contact preference</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.contactPreference || t('partnerDetails.notProvided')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.ownerName')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">
                    {profile?.ownerName || partner.fullName || t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.partnerType')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">
                    {formatPartnerTypeLabel(partner.partnerType, t('partnerDetails.notProvided'))}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.experience')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.businessExperience || t('partnerDetails.notProvided')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.yearsInBusiness')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.yearsInBusiness || t('partnerDetails.notProvided')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.teamSize')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.teamSize || t('partnerDetails.notProvided')}</p>
                </div>
              </div>

              {profile?.businessDescription ? (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.businessDescription')}</p>
                  <div className="mt-2 min-h-[4rem] whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    {profile.businessDescription}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                <MapPin className="h-5 w-5 text-gray-500" />
                <h3 className="text-base font-bold text-gray-900">{t('partnerDetails.contactLocation')}</h3>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.emailAddress')}</p>
                  <p className="mt-1 flex items-center gap-2 text-base font-medium text-gray-900">
                    <Mail className="h-4 w-4 text-gray-400" />
                    {partner.email || t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.mobileNumber')}</p>
                  <p className="mt-1 flex items-center gap-2 text-base font-medium text-gray-900">
                    <Phone className="h-4 w-4 text-gray-400" />
                    {partner.mobile || t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.alternateMobile')}</p>
                  <p className="mt-1 flex items-center gap-2 text-base font-medium text-gray-900">
                    <Phone className="h-4 w-4 text-gray-400" />
                    {profile?.alternateMobile || t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.businessAddress')}</p>
                  <p className="mt-1 flex items-start gap-2 text-base font-medium text-gray-900">
                    <Map className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    {[profile?.businessAddress, profile?.district, profile?.pinCode, profile?.state].filter(Boolean).join(', ') ||
                      t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">City</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{partner.city || t('partnerDetails.notProvided')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">WhatsApp number</p>
                  <p className="mt-1 flex items-center gap-2 text-base font-medium text-gray-900">
                    <Phone className="h-4 w-4 text-gray-400" />
                    {partner.whatsappNumber || t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">State</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{partner.state || t('partnerDetails.notProvided')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">PIN code</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.pinCode || t('partnerDetails.notProvided')}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.serviceAreas')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.serviceAreas || t('partnerDetails.notProvided')}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex h-full flex-col gap-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 border-b border-gray-100 pb-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.accountSummary')}</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">{t('partnerDetails.kycStatus')}</span>
                  <span className="text-sm font-bold text-gray-900">{formatStatusLabel(partner.kycStatus)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">{t('partnerDetails.appliedOn')}</span>
                  <span className="text-sm font-bold text-gray-900">
                    {partner.createdAt ? formatPortalDate(partner.createdAt) : t('partnerDetails.na')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">{t('partnerDetails.workingHours')}</span>
                  <span className="text-sm font-bold text-gray-900">{profile?.workingHours || t('partnerDetails.na')}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                <ShieldCheck className="h-5 w-5 text-gray-500" />
                <h3 className="text-base font-bold text-gray-900">{t('partnerDetails.registrationDetails')}</h3>
              </div>

              <div
                className="h-[320px] space-y-3 overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <FileText className="h-4 w-4 text-gray-400" /> {t('partnerDetails.gstNumber')}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{profile?.gstNumber || t('partnerDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <FileText className="h-4 w-4 text-gray-400" /> {t('partnerDetails.registrationNumber')}
                  </span>
                  <span
                    className="max-w-[120px] truncate text-right text-sm font-semibold text-gray-900"
                    title={profile?.businessRegistrationNumber}
                  >
                    {profile?.businessRegistrationNumber || t('partnerDetails.na')}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <Share2 className="h-4 w-4 text-gray-400" /> {t('partnerDetails.referralCode')}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{profile?.referralCode || t('partnerDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <Globe className="h-4 w-4 text-gray-400" /> {t('partnerDetails.websiteUrl')}
                  </span>
                  <span className="max-w-[120px] truncate text-right text-sm font-semibold text-blue-600">
                    {profile?.websiteUrl ? (
                      <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {t('partnerDetails.view')}
                      </a>
                    ) : t('partnerDetails.na')}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <Map className="h-4 w-4 text-gray-400" /> {t('partnerDetails.googleMaps')}
                  </span>
                  <span className="max-w-[120px] truncate text-right text-sm font-semibold text-blue-600">
                    {profile?.googleMapsLocation ? (
                      <a href={profile.googleMapsLocation} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {t('partnerDetails.viewOnMap')}
                      </a>
                    ) : t('partnerDetails.na')}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <Share2 className="h-4 w-4 text-gray-400" /> {t('partnerDetails.socialLinks')}
                  </span>
                  <span className="max-w-[120px] truncate text-right text-sm font-semibold text-gray-900" title={profile?.socialLinks}>
                    {profile?.socialLinks || t('partnerDetails.na')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {verificationDetail ? (
          <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            {/* KYC Documents & Verification Card */}
            <div
              className={`flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 ${
                isKycExpanded ? 'h-auto' : 'h-[470px]'
              }`}
            >
              <div
                onClick={() => setIsKycExpanded((prev) => !prev)}
                className="group mb-4 flex shrink-0 cursor-pointer select-none items-center justify-between border-b border-gray-100 pb-4 transition-colors"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsKycExpanded((prev) => !prev);
                  }
                }}
                aria-expanded={isKycExpanded}
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-5 w-5 text-gray-500 transition-colors group-hover:text-amber-600" />
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-amber-900">
                    KYC documents & verification
                  </h3>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                    {verificationDetail.documents.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 transition-colors group-hover:text-gray-800">
                    {isKycExpanded ? 'Collapse' : 'Expand'}
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-50 text-gray-500 transition-all group-hover:bg-gray-100 group-hover:text-gray-900">
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${
                        isKycExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>

              <div
                className={`space-y-4 pr-1.5 ${
                  isKycExpanded
                    ? 'overflow-visible'
                    : 'flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#E5E7EB_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 hover:[&::-webkit-scrollbar-thumb]:bg-gray-300'
                }`}
              >
                {verificationDetail.documents.length === 0 ? (
                  <p className="text-sm text-gray-500">No KYC documents submitted.</p>
                ) : (
                  verificationDetail.documents.map((document) => {
                    const documentType = document.documentType as KycVerificationDocumentType;
                    const safeFields =
                      document.verificationResult &&
                      ['PAN_CARD', 'GST_CERTIFICATE'].includes(document.documentType)
                        ? getKycVerificationFields(documentType, document.verificationResult)
                        : [];
                    const detailFields = safeFields.map((field) => {
                      if (field.label === 'Masked PAN' && document.documentNumber) {
                        return { ...field, label: 'PAN number', value: document.documentNumber };
                      }
                      if (field.label === 'Masked GSTIN' && document.documentNumber) {
                        return { ...field, label: 'GSTIN', value: document.documentNumber };
                      }
                      return field;
                    });
                    const status = formatPartnerDocumentStatus(document.verificationStatus);
                    return (
                      <div key={document.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-gray-900">{document.documentType.replaceAll('_', ' ')}</p>
                            <p className="mt-1 text-xs text-gray-500">{document.fileName || 'No document file uploaded'}</p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              status === 'VERIFIED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : status === 'FAILED'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {status === 'VERIFIED' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                            {status.replaceAll('_', ' ')}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <span className="text-gray-500">Document number</span>
                            <p className="font-semibold text-gray-900">{document.documentNumber || 'Not provided'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Name on document</span>
                            <p className="font-semibold text-gray-900">{document.nameOnDocument || 'Not provided'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Verified on</span>
                            <p className="font-semibold text-gray-900">
                              {document.verificationCompletedAt
                                ? formatPortalDate(document.verificationCompletedAt)
                                : 'Not verified'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">File</span>
                            {document.fileUrl ? (
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm font-semibold text-[#9a6b00]">
                                <button
                                  type="button"
                                  onClick={() => void openOrDownloadDocument(document)}
                                  className="inline-flex items-center gap-1 hover:underline"
                                >
                                  {canPreviewPartnerDocument(document.fileName, document.fileUrl) ? (
                                    <>
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      Open document
                                    </>
                                  ) : (
                                    <>
                                      <Download className="h-3.5 w-3.5" />
                                      Download document
                                    </>
                                  )}
                                </button>
                                {canPreviewPartnerDocument(document.fileName, document.fileUrl) ? (
                                  <button
                                    type="button"
                                    onClick={() => void downloadDocument(document)}
                                    className="inline-flex items-center gap-1 hover:underline"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    Download
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <p className="font-semibold text-gray-900">Not uploaded</p>
                            )}
                          </div>
                        </div>
                        {detailFields.length > 0 ? (
                          <div className="mt-4 grid grid-cols-1 gap-2 border-t border-gray-200 pt-3 sm:grid-cols-2">
                            {detailFields.map((field) => (
                              <div key={field.label}>
                                <span className="text-xs text-gray-500">{field.label}</span>
                                <p className="text-sm font-semibold text-gray-900">{field.value}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {document.verificationMessage ? (
                          <p className="mt-3 text-xs text-red-600">{document.verificationMessage}</p>
                        ) : null}
                      </div>
                    );
                  })
                )}
                {!isKycExpanded && verificationDetail.documents.length > 1 && (
                  <div className="sticky bottom-0 -mx-1.5 -mb-1 bg-gradient-to-t from-white via-white/95 to-transparent pt-3 pb-1 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsKycExpanded(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline"
                    >
                      <span>View all {verificationDetail.documents.length} documents</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Agreements & Review History Card */}
            <div
              className={`flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 ${
                isAgreementsExpanded ? 'h-auto' : 'h-[470px]'
              }`}
            >
              <div
                onClick={() => setIsAgreementsExpanded((prev) => !prev)}
                className="group mb-4 flex shrink-0 cursor-pointer select-none items-center justify-between border-b border-gray-100 pb-4 transition-colors"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsAgreementsExpanded((prev) => !prev);
                  }
                }}
                aria-expanded={isAgreementsExpanded}
              >
                <div className="flex items-center gap-2.5">
                  <ClipboardCheck className="h-5 w-5 text-gray-500 transition-colors group-hover:text-amber-600" />
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-amber-900">
                    Agreements & review history
                  </h3>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                    {verificationDetail.agreements.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 transition-colors group-hover:text-gray-800">
                    {isAgreementsExpanded ? 'Collapse' : 'Expand'}
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-50 text-gray-500 transition-all group-hover:bg-gray-100 group-hover:text-gray-900">
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${
                        isAgreementsExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>

              <div
                className={`space-y-3 pr-1.5 ${
                  isAgreementsExpanded
                    ? 'overflow-visible'
                    : 'flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#E5E7EB_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 hover:[&::-webkit-scrollbar-thumb]:bg-gray-300'
                }`}
              >
                {verificationDetail.agreements.length === 0 ? (
                  <p className="text-sm text-gray-500">No agreements accepted.</p>
                ) : (
                  verificationDetail.agreements.map((agreement) => (
                    <div
                      key={`${agreement.agreementType}-${agreement.version}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3"
                    >
                      <div>
                        <p className="text-sm font-bold text-gray-900">{agreement.agreementType.replaceAll('_', ' ')}</p>
                        <p className="text-xs text-gray-500">Version {agreement.version}</p>
                      </div>
                      <p className="text-right text-xs font-semibold text-emerald-700">
                        Accepted<br />
                        {formatPortalDate(agreement.acceptedAt)}
                      </p>
                    </div>
                  ))
                )}

                {verificationDetail.reviewHistory.length > 0 ? (
                  <div className="border-t border-gray-100 pt-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                      Recent review activity
                    </p>
                    {verificationDetail.reviewHistory.map((review) => (
                      <div key={review.id} className="mb-2 rounded-lg border border-gray-100 p-3">
                        <div className="flex justify-between gap-3 text-sm font-semibold text-gray-900">
                          <span>{review.action.replaceAll('_', ' ')}</span>
                          <span className="text-xs text-gray-500">{formatPortalDate(review.createdAt)}</span>
                        </div>
                        {review.comment ? <p className="mt-1 text-xs text-gray-600">{review.comment}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {!isAgreementsExpanded && (verificationDetail.agreements.length > 4 || verificationDetail.reviewHistory.length > 0) && (
                  <div className="sticky bottom-0 -mx-1.5 -mb-1 bg-gradient-to-t from-white via-white/95 to-transparent pt-3 pb-1 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAgreementsExpanded(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline"
                    >
                      <span>View all agreements & review history</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-gray-500" />
              <h3 className="text-lg font-bold text-gray-900">{t('partnerDetails.vehicleListings')}</h3>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {t('partnerDetails.totalCount', { count: listings.length })}
            </span>
          </div>

          {loadingListings ? (
            <BrandLoader variant="section" size="sm" bg="light" />
          ) : listings.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
              <Package className="mb-2 h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-500">{t('partnerDetails.noListings')}</p>
            </div>
          ) : (
            <div
              className="max-h-[600px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {listings.map((listing) => (
                  <div
                    key={listing.id}
                    onClick={() => router.push(generateAdminListingDetailPath(listingDetailBaseHref, listing))}
                    className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-gray-100">
                      {listing.imageUrl ? (
                        <Image
                          src={getAbsoluteFileUrl(listing.imageUrl)}
                          alt={listing.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : listing.images && listing.images.length > 0 ? (
                        <Image
                          src={getAbsoluteFileUrl(listing.images.find((image) => image.isFeatured)?.url || listing.images[0].url)}
                          alt={listing.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
                          <ImageIcon className="mb-2 h-8 w-8 opacity-50" />
                          <span className="text-xs font-medium uppercase tracking-wider">{t('partnerDetails.noImage')}</span>
                        </div>
                      )}
                      <div className="absolute right-2 top-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-bold shadow-sm ${statusClassNames[listing.status] || 'bg-gray-100 text-gray-700'}`}>
                          {formatStatusLabel(listing.status)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-grow flex-col justify-between p-4">
                      <h4 className="mb-2 line-clamp-2 text-sm font-bold leading-tight text-gray-900" title={listing.title}>
                        {listing.title}
                      </h4>
                      <div className="mt-auto flex items-end justify-between">
                        <p className="text-lg font-black text-[#FFC107]">{formatPortalCurrency(listing.price)}</p>
                        <p className="text-xs font-medium text-gray-400">{formatPortalDate(listing.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {documentPreview ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Document preview"
          onClick={() => setDocumentPreview(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Document preview</p>
                <h2 className="truncate text-base font-bold text-gray-900">
                  {documentPreview.document.fileName || 'KYC document'}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {documentPreview.document.fileUrl ? (
                  <button
                    type="button"
                    onClick={() => void downloadDocument(documentPreview.document)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDocumentPreview(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
                  aria-label="Close document preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-[320px] overflow-auto bg-gray-100 p-4">
              {documentPreview.loading ? (
                <div className="flex min-h-[280px] items-center justify-center text-sm text-gray-500">
                  Loading document preview…
                </div>
              ) : documentPreview.error ? (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
                  <AlertCircle className="h-8 w-8 text-red-500" />
                  <p className="text-sm text-red-600">{documentPreview.error}</p>
                </div>
              ) : documentPreview.previewUrl && documentPreview.kind === 'image' ? (
                <div className="flex min-h-[280px] items-center justify-center">
                  {/* Blob URLs are authenticated, in-memory previews and cannot use next/image optimization. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={documentPreview.previewUrl}
                    alt={documentPreview.document.fileName || 'KYC document'}
                    className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-sm"
                  />
                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center text-sm text-gray-500">
                  <FileText className="h-10 w-10 text-gray-400" />
                  <p>Preview is available only for image documents. Download this file to view it.</p>
                  <button
                    type="button"
                    onClick={() => void downloadDocument(documentPreview.document)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 font-semibold text-gray-900 transition hover:bg-[#E5AD06]"
                  >
                    <Download className="h-4 w-4" />
                    Download document
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
