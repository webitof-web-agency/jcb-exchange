'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback, useMemo } from 'react';
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
  ChevronUp,
  Download,
  X,
  Copy,
  Check,
  Search,
  KeyRound,
  User,
  Calendar,
  Briefcase,
  Layers,
  Award,
  Sparkles,
  TrendingUp,
  Wallet,
  CheckCircle,
  XCircle,
  HelpCircle,
  Send,
  Eye,
  Edit3,
} from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { useTranslation } from '@/hooks/useTranslation';
import { useHeaderStore } from '@/store/headerStore';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { formatPortalCurrency, formatPortalDate, formatPortalDateTime } from '@/lib/partnerPortal';
import { resolvePartnerId } from '@/lib/routeResolvers';
import {
  generateAdminListingDetailPath,
  generateAdminPartnerDetailPath,
  generateAdminPartnerEditPath,
} from '@/lib/routePaths';
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
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200/80',
  REVIEW_PENDING: 'bg-amber-50 text-amber-700 border-amber-200/80',
  PROFILE_PENDING: 'bg-amber-50 text-amber-700 border-amber-200/80',
  KYC_PENDING: 'bg-amber-50 text-amber-700 border-amber-200/80',
  AGREEMENT_PENDING: 'bg-amber-50 text-amber-700 border-amber-200/80',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200/80',
  CHANGES_REQUESTED: 'bg-amber-50 text-amber-800 border-amber-200/80',
  SOLD: 'bg-blue-50 text-blue-700 border-blue-200/80',
  EXPIRED: 'bg-slate-100 text-slate-600 border-slate-200/80',
  INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200/80',
  SUSPENDED: 'bg-orange-50 text-orange-700 border-orange-200/80',
  BLOCKED: 'bg-rose-50 text-rose-700 border-rose-200/80',
};

interface PartnerProfile {
  id: string;
  ownerName: string;
  businessName?: string;
  alternateMobile: string;
  businessAddress: string;
  district: string;
  state: string;
  pinCode: string;
  gstNumber: string;
  businessRegistrationNumber: string;
  businessExperience: string;
  yearsInBusiness: string | number;
  teamSize: string | number;
  serviceAreas: string;
  workingHours: string;
  googleMapsLocation: string;
  socialLinks: string;
  referralCode: string;
  websiteUrl: string;
  businessDescription: string;
  expectedMonthlyListings: number | null;
  listingLimit?: number;
  contactPreference: string;
  depositStatus?: string;
  businessLogoUrl?: string | null;
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

  // Permissions
  const canEditOnboarding =
    viewer?.role === 'SUPER_ADMIN' ||
    viewer?.role === 'ADMIN' ||
    hasAnyPermission(viewer?.permissions, ['kyc.edit.override']);
  const canChangeStatus =
    viewer?.role === 'SUPER_ADMIN' ||
    viewer?.role === 'ADMIN' ||
    hasAnyPermission(viewer?.permissions, ['partners.change_status', 'users.update']);
  const canManageKyc =
    viewer?.role === 'SUPER_ADMIN' ||
    viewer?.role === 'ADMIN' ||
    hasAnyPermission(viewer?.permissions, ['kyc.manage', 'kyc.edit.override']);
  const canResetPassword =
    viewer?.role === 'SUPER_ADMIN' ||
    viewer?.role === 'ADMIN' ||
    hasAnyPermission(viewer?.permissions, ['partners.reset_password', 'users.update']);

  // Core Data State
  const [partner, setPartner] = useState<ManagedUser | null>(null);
  const [listings, setListings] = useState<PartnerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingListings, setLoadingListings] = useState(true);
  const [error, setError] = useState('');
  const [resolvedPartnerId, setResolvedPartnerId] = useState<string | null>(null);
  const [verificationDetail, setVerificationDetail] = useState<VerificationDetail | null>(null);

  // Filter & Search State for Listings
  const [listingSearch, setListingSearch] = useState('');
  const [listingStatusFilter, setListingStatusFilter] = useState<string>('ALL');
  const [listingSort, setListingSort] = useState<'newest' | 'price_desc' | 'price_asc'>('newest');

  // Interactive UI State
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{
    document: VerificationDetailDocument;
    kind: PartnerDocumentKind;
    previewUrl: string | null;
    loading: boolean;
    error: string;
  } | null>(null);

  // Modals
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusActionType, setStatusActionType] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const [showKycModal, setShowKycModal] = useState(false);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycDecision, setKycDecision] = useState<'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'>('APPROVED');
  const [kycNotes, setKycNotes] = useState('');

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

  // Expandable sections
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isKycVaultExpanded, setIsKycVaultExpanded] = useState(true);
  const [isAgreementsExpanded, setIsAgreementsExpanded] = useState(true);

  // Copy helper
  const handleCopy = useCallback((text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  // Fetch listings
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

  // Fetch partner details & KYC
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
        setError(t('partnerDetails.partnerNotFound', 'Partner not found'));
      } else {
        setPartner(foundPartner);
        try {
          const verificationResponse = await api.get<{ verification: VerificationDetail }>(
            `/superadmin/verifications/${nextResolvedPartnerId}`,
          );
          setVerificationDetail(verificationResponse.data.verification);
        } catch (verificationError) {
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
          : t('partnerDetails.fetchFailed', 'Failed to load partner details');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [partnerId, t]);

  useEffect(() => {
    const loadPartnerData = async () => {
      await Promise.all([fetchPartnerDetails(), fetchPartnerListings()]);
    };
    void loadPartnerData();
  }, [fetchPartnerDetails, fetchPartnerListings]);

  // Canonical path redirect
  useEffect(() => {
    if (!partner) return;

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

  // Format Status Label
  const formatStatusLabel = useCallback(
    (value?: string | null) => {
      if (!value) return t('partnerDetails.notSet', 'Not Set');

      switch (value.toUpperCase()) {
        case 'APPROVED':
        case 'ACTIVE':
          return t('partnerDetails.active', 'Active');
        case 'PENDING':
        case 'REVIEW_PENDING':
        case 'PROFILE_PENDING':
        case 'KYC_PENDING':
        case 'AGREEMENT_PENDING':
          return t('partnerDetails.pending', 'Pending');
        case 'REJECTED':
          return t('partnerDetails.rejected', 'Rejected');
        case 'CHANGES_REQUESTED':
          return t('partnerDetails.changesRequested', 'Changes Requested');
        case 'INACTIVE':
          return t('partnerDetails.inactive', 'Inactive');
        case 'SUSPENDED':
          return t('partnerDetails.suspended', 'Suspended');
        case 'BLOCKED':
          return t('partnerDetails.blocked', 'Blocked');
        case 'SOLD':
          return t('partnerDetails.sold', 'Sold');
        case 'EXPIRED':
          return t('partnerDetails.expired', 'Expired');
        default:
          return value
            .toLowerCase()
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
      }
    },
    [t],
  );

  // Partner overall health status
  const getPartnerStatus = useCallback(
    (currentPartner: ManagedUser) => {
      if (currentPartner.status === 'INACTIVE') return t('partnerDetails.inactive', 'Inactive');
      if (currentPartner.status === 'SUSPENDED') return t('partnerDetails.suspended', 'Suspended');
      if (currentPartner.status === 'BLOCKED') return t('partnerDetails.blocked', 'Blocked');
      if (
        currentPartner.accountStatus === 'ACTIVE' &&
        currentPartner.kycStatus === 'APPROVED' &&
        currentPartner.onboardingStatus === 'APPROVED'
      ) {
        return t('partnerDetails.active', 'Active');
      }
      if (currentPartner.onboardingStatus === 'REJECTED' || currentPartner.kycStatus === 'REJECTED') {
        return t('partnerDetails.rejected', 'Rejected');
      }
      if (
        currentPartner.onboardingStatus === 'CHANGES_REQUESTED' ||
        currentPartner.kycStatus === 'CHANGES_REQUESTED'
      ) {
        return t('partnerDetails.changesRequested', 'Changes Requested');
      }
      return t('partnerDetails.pending', 'Pending');
    },
    [t],
  );

  const getPartnerStatusClassName = useCallback((currentPartner: ManagedUser) => {
    if (currentPartner.status === 'INACTIVE') return 'bg-slate-100 text-slate-700 border-slate-200';
    if (currentPartner.status === 'SUSPENDED') return 'bg-orange-50 text-orange-700 border-orange-200';
    if (currentPartner.status === 'BLOCKED') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (
      currentPartner.accountStatus === 'ACTIVE' &&
      currentPartner.kycStatus === 'APPROVED' &&
      currentPartner.onboardingStatus === 'APPROVED'
    ) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (currentPartner.onboardingStatus === 'REJECTED' || currentPartner.kycStatus === 'REJECTED') {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (
      currentPartner.onboardingStatus === 'CHANGES_REQUESTED' ||
      currentPartner.kycStatus === 'CHANGES_REQUESTED'
    ) {
      return 'bg-amber-50 text-amber-800 border-amber-200';
    }
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }, []);

  const editHref = partner
    ? generateAdminPartnerEditPath(editBaseHref, {
        id: partner.id,
        name: partner.name,
        district: partner.partnerProfile?.district || '',
      })
    : backHref;

  // Custom Navbar Header Injection
  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);

  useEffect(() => {
    if (partner) {
      const partnerStatus = getPartnerStatus(partner);
      const statusClass = getPartnerStatusClassName(partner);

      setCustomHeader(
        <div className="flex w-full items-center justify-between gap-3 overflow-hidden">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href={backHref}
              className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 shadow-2xs transition hover:bg-slate-100 hover:text-slate-900"
              title={t('partnerDetails.goBack', 'Back to directory')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1
                  className="truncate text-sm sm:text-base font-extrabold text-slate-900"
                  title={partner.name || t('partnerDetails.unnamedBusiness', 'Partner Account')}
                >
                  {partner.name || t('partnerDetails.unnamedBusiness', 'Partner Account')}
                </h1>
                <span
                  className={`hidden sm:inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass}`}
                >
                  {partnerStatus}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700">
                  {formatPartnerTypeLabel(partner.partnerType, 'Partner')}
                </span>
                {partner.partnerProfile?.district && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="truncate">{partner.partnerProfile.district}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {partner.mobile && (
              <a
                href={`tel:${partner.mobile}`}
                className="hidden md:inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
                title="Call Partner"
              >
                <Phone className="h-3.5 w-3.5 text-emerald-600" />
                <span>Call</span>
              </a>
            )}
            {canEditOnboarding && (
              <Link
                href={editHref}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#FFC107] px-3 text-xs font-bold text-slate-900 shadow-2xs transition hover:bg-[#E5AD06]"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('partnerDetails.editOnboarding', 'Edit Profile')}</span>
                <span className="inline sm:hidden">Edit</span>
              </Link>
            )}
          </div>
        </div>,
      );
    }
    return () => setCustomHeader(null);
  }, [partner, backHref, editHref, canEditOnboarding, setCustomHeader, getPartnerStatus, getPartnerStatusClassName, t]);

  // Clean document preview
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
      setDocumentPreview((current) =>
        current?.document.id === document.id ? { ...current, previewUrl, loading: false } : current,
      );
    } catch (previewError) {
      console.error('Failed to open KYC document', previewError);
      setDocumentPreview((current) =>
        current?.document.id === document.id
          ? { ...current, loading: false, error: 'Unable to open this document. Please download it instead.' }
          : current,
      );
    }
  }, []);

  const downloadDocument = useCallback(async (document: VerificationDetailDocument) => {
    if (!document.fileUrl) return;

    try {
      await downloadSecureDocument(document.fileUrl, document.fileName || 'document');
    } catch (downloadError) {
      console.error('Failed to download KYC document', downloadError);
      setDocumentPreview((current) =>
        current?.document.id === document.id
          ? { ...current, error: 'Unable to download this document. Please try again.' }
          : current,
      );
    }
  }, []);

  const openOrDownloadDocument = useCallback(
    async (document: VerificationDetailDocument) => {
      if (!document.fileUrl) return;

      if (!canPreviewPartnerDocument(document.fileName, document.fileUrl)) {
        await downloadDocument(document);
        return;
      }

      await openDocumentPreview(document);
    },
    [downloadDocument, openDocumentPreview],
  );

  // Status Modal Action
  const handleToggleStatus = async () => {
    if (!partner) return;
    try {
      setStatusSubmitting(true);
      await api.patch(`/superadmin/users/${partner.id}/status`, {
        status: statusActionType,
      });
      setPartner((prev) => (prev ? { ...prev, status: statusActionType } : null));
      setShowStatusModal(false);
    } catch (err) {
      console.error('Failed to update status', err);
      alert('Failed to update partner status. Please try again.');
    } finally {
      setStatusSubmitting(false);
    }
  };

  // KYC Modal Action
  const handleUpdateKycStatus = async () => {
    if (!partner) return;
    try {
      setKycSubmitting(true);
      await api.patch(`/superadmin/verifications/${partner.id}/status`, {
        kycStatus: kycDecision,
        notes: kycNotes,
      });
      setPartner((prev) => (prev ? { ...prev, kycStatus: kycDecision } : null));
      setShowKycModal(false);
      setKycNotes('');
      await fetchPartnerDetails();
    } catch (err) {
      console.error('Failed to update KYC status', err);
      alert('Failed to update verification status. Please try again.');
    } finally {
      setKycSubmitting(false);
    }
  };

  // Reset Password Action
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partner || !newPassword.trim()) return;
    try {
      setPasswordSubmitting(true);
      setPasswordErrorMsg('');
      setPasswordSuccessMsg('');
      await api.patch(`/superadmin/users/${partner.id}/password`, {
        password: newPassword.trim(),
      });
      setPasswordSuccessMsg('Password updated successfully!');
      setTimeout(() => {
        setShowPasswordModal(false);
        setNewPassword('');
        setPasswordSuccessMsg('');
      }, 1500);
    } catch (err: unknown) {
      console.error('Failed to reset password', err);
      const msg =
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
          : 'Failed to reset password.';
      setPasswordErrorMsg(msg);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  // Machinery Portfolio Calculations
  const totalInventoryValue = useMemo(() => {
    return listings.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  }, [listings]);

  const activeListingsCount = useMemo(() => {
    return listings.filter((l) => l.status === 'ACTIVE' || l.status === 'AVAILABLE').length;
  }, [listings]);

  const soldListingsCount = useMemo(() => {
    return listings.filter((l) => l.status === 'SOLD').length;
  }, [listings]);

  const profile = partner?.partnerProfile;
  const listingLimit = profile?.listingLimit || 5;
  const quotaPercentage = Math.min(100, Math.round((activeListingsCount / listingLimit) * 100));

  // Filtered & Sorted Listings
  const filteredListings = useMemo(() => {
    let result = [...listings];

    if (listingSearch.trim()) {
      const q = listingSearch.toLowerCase().trim();
      result = result.filter((item) => item.title.toLowerCase().includes(q));
    }

    if (listingStatusFilter !== 'ALL') {
      result = result.filter((item) => item.status === listingStatusFilter);
    }

    if (listingSort === 'price_desc') {
      result.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (listingSort === 'price_asc') {
      result.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [listings, listingSearch, listingStatusFilter, listingSort]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl py-12">
        <BrandLoader variant="section" size="md" bg="light" text="Loading partner dossier..." />
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h3 className="mt-4 text-base font-bold text-slate-900">{t('partnerDetails.loadFailed', 'Partner Profile Unavailable')}</h3>
          <p className="mt-1 text-xs text-slate-500">{error || t('partnerDetails.partnerNotFound', 'Partner could not be located.')}</p>
          <div className="mt-6">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('partnerDetails.goBack', 'Return to Partners')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const partnerStatus = getPartnerStatus(partner);
  const statusClass = getPartnerStatusClassName(partner);
  const cleanPhone = (partner.mobile || '').replace(/\D/g, '');
  const cleanWhatsapp = (partner.whatsappNumber || partner.mobile || '').replace(/\D/g, '');

  return (
    <div className="space-y-4 pb-14">
      {/* 1. EXECUTIVE HERO BANNER & QUICK ACTIONS */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Identity & Badges */}
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="relative flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 text-lg sm:text-xl font-black text-amber-900 shadow-2xs">
              {profile?.businessLogoUrl ? (
                <Image
                  src={getAbsoluteFileUrl(profile.businessLogoUrl)}
                  alt={partner.name}
                  fill
                  className="rounded-2xl object-cover"
                />
              ) : (
                <span>
                  {partner.name
                    ?.split(' ')
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase() || 'P'}
                </span>
              )}
              {partner.kycStatus === 'APPROVED' && (
                <div
                  className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xs"
                  title="KYC Verified"
                >
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-xl font-black text-slate-900 tracking-tight">
                  {partner.name || 'Unnamed Business'}
                </h1>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {partnerStatus}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                  <Tag className="h-3 w-3 text-amber-700" />
                  {formatPartnerTypeLabel(partner.partnerType, 'Partner')}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {profile?.ownerName && (
                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    {profile.ownerName}
                  </span>
                )}
                {partner.city && (
                  <span className="flex items-center gap-1 text-slate-600">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {[partner.city, profile?.district, partner.state].filter(Boolean).join(', ')}
                  </span>
                )}
                <span className="flex items-center gap-1 text-slate-400">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Member since {formatPortalDate(partner.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
            {/* Call Action */}
            {cleanPhone && (
              <a
                href={`tel:${cleanPhone}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100"
                title={`Call ${cleanPhone}`}
              >
                <Phone className="h-3.5 w-3.5 text-emerald-600" />
                <span>Call</span>
              </a>
            )}

            {/* WhatsApp Action */}
            {cleanWhatsapp && (
              <a
                href={`https://wa.me/91${cleanWhatsapp}?text=${encodeURIComponent(
                  `Hello ${partner.name || 'Partner'}, contacting from JCBExchange SuperAdmin regarding your account.`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-700 shadow-2xs transition hover:bg-emerald-50"
                title="Open WhatsApp Chat"
              >
                <Send className="h-3.5 w-3.5 text-emerald-600" />
                <span>WhatsApp</span>
              </a>
            )}

            {/* Email Action */}
            {partner.email && (
              <a
                href={`mailto:${partner.email}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                title={`Email ${partner.email}`}
              >
                <Mail className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden sm:inline">Email</span>
              </a>
            )}

            {/* Google Maps link */}
            {profile?.googleMapsLocation && (
              <a
                href={profile.googleMapsLocation}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-blue-700 shadow-2xs transition hover:bg-blue-50"
                title="View on Google Maps"
              >
                <Map className="h-3.5 w-3.5 text-blue-600" />
                <span className="hidden sm:inline">Map</span>
              </a>
            )}

            {/* Status Change Action */}
            {canChangeStatus && (
              <button
                type="button"
                onClick={() => {
                  setStatusActionType(partner.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
                  setShowStatusModal(true);
                }}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition ${
                  partner.status === 'ACTIVE'
                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                    : 'border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {partner.status === 'ACTIVE' ? 'Deactivate' : 'Activate Account'}
              </button>
            )}

            {/* KYC Decision Action */}
            {canManageKyc && (
              <button
                type="button"
                onClick={() => {
                  setKycDecision(partner.kycStatus === 'APPROVED' ? 'APPROVED' : 'APPROVED');
                  setShowKycModal(true);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900 shadow-2xs transition hover:bg-amber-100"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
                <span>KYC Decision</span>
              </button>
            )}

            {/* Reset Password Action */}
            {canResetPassword && (
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                title="Reset Password"
              >
                <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden xl:inline">Password</span>
              </button>
            )}

            {/* Edit Onboarding / Profile Primary Button */}
            {canEditOnboarding && (
              <Link
                href={editHref}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#FFC107] px-3.5 text-xs font-black text-slate-900 shadow-2xs transition hover:bg-[#E5AD06]"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>{t('partnerDetails.editOnboarding', 'Edit Profile')}</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 2. EXECUTIVE KPI METRIC RIBBON */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {/* Metric 1: Total Machinery */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Listed Machinery</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-slate-900">{listings.length}</span>
              <span className="text-[11px] font-semibold text-slate-500">units</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span>{activeListingsCount} Active</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">{soldListingsCount} Sold</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Portfolio Inventory Value */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Portfolio Value</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-lg font-black text-slate-900 truncate" title={formatPortalCurrency(totalInventoryValue)}>
              {formatPortalCurrency(totalInventoryValue)}
            </div>
            <div className="mt-1 text-[10px] font-medium text-slate-500">
              Combined catalog value
            </div>
          </div>
        </div>

        {/* Metric 3: Listing Capacity & Limit */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Listing Quota</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline justify-between text-xs font-bold text-slate-800">
              <span>{activeListingsCount} of {listingLimit} slots</span>
              <span className="text-[10px] text-slate-500">{quotaPercentage}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  quotaPercentage >= 100
                    ? 'bg-rose-500'
                    : quotaPercentage >= 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${quotaPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Metric 4: KYC & Compliance Health */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">KYC Compliance</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
              {partner.kycStatus === 'APPROVED' ? (
                <span className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle className="h-4 w-4" /> Verified
                </span>
              ) : partner.kycStatus === 'REJECTED' ? (
                <span className="flex items-center gap-1 text-rose-700">
                  <XCircle className="h-4 w-4" /> Rejected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-700">
                  <Clock3 className="h-4 w-4" /> Under Review
                </span>
              )}
            </div>
            <div className="mt-1 text-[10px] font-medium text-slate-500">
              {verificationDetail?.documents.length || 0} documents on file
            </div>
          </div>
        </div>

        {/* Metric 5: Territory & Location */}
        <div className="col-span-2 sm:col-span-1 flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Operating Territory</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <MapPin className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-sm font-bold text-slate-900 truncate" title={profile?.district || partner.city || 'Not set'}>
              {profile?.district || partner.city || 'Not set'}
            </div>
            <div className="mt-1 text-[10px] font-medium text-slate-500 truncate">
              {partner.state ? `${partner.state} - ${profile?.pinCode || ''}` : 'State unassigned'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. BENTO GRID ARCHITECTURE (7 / 5 BALANCED SPLIT) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* LEFT PRIMARY PANEL (8 of 12 columns) */}
        <div className="space-y-4 lg:col-span-7 xl:col-span-8">
          {/* Card A: Business & Commercial Profile */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {t('partnerDetails.businessProfile', 'Commercial & Business Profile')}
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Partner ID: <code className="text-slate-800 font-mono text-[10px]">{partner.id.slice(0, 8)}...</code>
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 text-xs">
              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {t('partnerDetails.businessName', 'Business Legal Name')}
                </p>
                <p className="mt-0.5 font-bold text-slate-900 truncate" title={partner.name}>
                  {partner.name || '-'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {t('partnerDetails.ownerName', 'Owner / Signatory')}
                </p>
                <p className="mt-0.5 font-bold text-slate-900 truncate" title={profile?.ownerName || partner.fullName}>
                  {profile?.ownerName || partner.fullName || '-'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {t('partnerDetails.partnerType', 'Category')}
                </p>
                <p className="mt-0.5 font-bold text-slate-900">
                  {formatPartnerTypeLabel(partner.partnerType, 'Standard Partner')}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {t('partnerDetails.experience', 'Industry Experience')}
                </p>
                <p className="mt-0.5 font-bold text-slate-900">
                  {profile?.businessExperience ? `${profile.businessExperience} Years` : '-'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {t('partnerDetails.teamSize', 'Team Size')}
                </p>
                <p className="mt-0.5 font-bold text-slate-900">
                  {profile?.teamSize ? `${profile.teamSize} Members` : '-'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Expected Monthly Flow
                </p>
                <p className="mt-0.5 font-bold text-slate-900">
                  {profile?.expectedMonthlyListings ? `${profile.expectedMonthlyListings} machines/mo` : '-'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Contact Preference
                </p>
                <p className="mt-0.5 font-bold text-slate-900">
                  {profile?.contactPreference || 'Phone & WhatsApp'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Working Hours
                </p>
                <p className="mt-0.5 font-bold text-slate-900 truncate" title={profile?.workingHours || 'Standard'}>
                  {profile?.workingHours || '09:00 AM - 07:00 PM'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Deposit Status
                </p>
                <p className="mt-0.5 font-bold text-slate-900">
                  {profile?.depositStatus ? formatStatusLabel(profile.depositStatus) : 'Not Submitted'}
                </p>
              </div>
            </div>

            {/* Business Description */}
            {profile?.businessDescription ? (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {t('partnerDetails.businessDescription', 'About Business & Dealership')}
                  </p>
                  {profile.businessDescription.length > 200 && (
                    <button
                      type="button"
                      onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                      className="text-[11px] font-bold text-amber-600 hover:text-amber-700"
                    >
                      {isDescriptionExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>
                <div
                  className={`mt-1.5 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-700 transition-all ${
                    !isDescriptionExpanded && profile.businessDescription.length > 200 ? 'line-clamp-3' : ''
                  }`}
                >
                  {profile.businessDescription}
                </div>
              </div>
            ) : null}
          </div>

          {/* Card B: Machinery Inventory Showcase */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {t('partnerDetails.vehicleListings', 'Machinery Inventory')}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">
                  {filteredListings.length} of {listings.length}
                </span>
              </div>

              {/* Status Chips Filter */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(['ALL', 'ACTIVE', 'PENDING', 'SOLD'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setListingStatusFilter(st)}
                    className={`rounded-md px-2 py-0.75 text-[10px] font-bold transition ${
                      listingStatusFilter === st
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st === 'ACTIVE' ? 'Active' : st === 'PENDING' ? 'Pending' : 'Sold'}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search machinery by name, model..."
                  value={listingSearch}
                  onChange={(e) => setListingSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-1.5 pl-8 pr-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                />
                {listingSearch && (
                  <button
                    type="button"
                    onClick={() => setListingSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sort:</span>
                <select
                  value={listingSort}
                  onChange={(e) => setListingSort(e.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white py-1 px-2 text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value="newest">Recently Listed</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="price_asc">Price: Low to High</option>
                </select>
              </div>
            </div>

            {/* Listings Grid */}
            <div className="mt-4">
              {loadingListings ? (
                <div className="py-10">
                  <BrandLoader variant="section" size="sm" bg="light" text="Refreshing machinery portfolio..." />
                </div>
              ) : filteredListings.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <Package className="h-5 w-5" />
                  </div>
                  <p className="mt-2 text-xs font-bold text-slate-700">
                    {listings.length === 0
                      ? t('partnerDetails.noListings', 'No machinery listings registered yet.')
                      : 'No machinery matches your filter criteria.'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {listings.length === 0
                      ? 'Machines added by this partner will appear here in real-time.'
                      : 'Try clearing the search query or changing status filters.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredListings.map((listing) => {
                    const statusBadgeClass =
                      statusClassNames[listing.status] || 'bg-slate-100 text-slate-700 border-slate-200';
                    const targetUrl = generateAdminListingDetailPath(listingDetailBaseHref, listing);

                    return (
                      <div
                        key={listing.id}
                        onClick={() => router.push(targetUrl)}
                        className="group flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md cursor-pointer"
                      >
                        {/* Machine Image */}
                        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                          {listing.imageUrl ? (
                            <Image
                              src={getAbsoluteFileUrl(listing.imageUrl)}
                              alt={listing.title}
                              fill
                              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                              className="object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : listing.images && listing.images.length > 0 ? (
                            <Image
                              src={getAbsoluteFileUrl(
                                listing.images.find((image) => image.isFeatured)?.url || listing.images[0].url,
                              )}
                              alt={listing.title}
                              fill
                              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                              className="object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
                              <ImageIcon className="h-7 w-7 opacity-40" />
                              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                No Photo
                              </span>
                            </div>
                          )}

                          {/* Status Badge */}
                          <div className="absolute right-2 top-2">
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold shadow-2xs backdrop-blur-xs ${statusBadgeClass}`}
                            >
                              {formatStatusLabel(listing.status)}
                            </span>
                          </div>
                        </div>

                        {/* Card Meta */}
                        <div className="flex flex-1 flex-col justify-between p-3">
                          <div>
                            <h3
                              className="line-clamp-2 text-xs font-bold text-slate-900 group-hover:text-amber-800"
                              title={listing.title}
                            >
                              {listing.title}
                            </h3>
                            <p className="mt-1 text-[10px] text-slate-400">
                              Listed on {formatPortalDate(listing.createdAt)}
                            </p>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Asking Price
                              </span>
                              <p className="text-sm font-black text-amber-800">
                                {formatPortalCurrency(listing.price)}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-amber-700">
                              <span>Inspect</span>
                              <ExternalLink className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT SECONDARY PANEL (4 of 12 columns) */}
        <div className="space-y-4 lg:col-span-5 xl:col-span-4">
          {/* Card C: Direct Contact & Territory */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {t('partnerDetails.contactLocation', 'Contact & Operations')}
                </h2>
              </div>
            </div>

            <div className="mt-3.5 space-y-2.5 text-xs">
              {/* Primary Mobile */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50/70 p-2 border border-slate-100">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {t('partnerDetails.mobileNumber', 'Primary Mobile')}
                  </span>
                  <p className="font-bold text-slate-900 truncate">{partner.mobile || 'Not provided'}</p>
                </div>
                {partner.mobile && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(partner.mobile, 'mobile')}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Copy Mobile"
                    >
                      {copiedField === 'mobile' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a
                      href={`tel:${cleanPhone}`}
                      className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                      title="Call"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* Alternate Mobile */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50/70 p-2 border border-slate-100">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {t('partnerDetails.alternateMobile', 'Alternate Phone')}
                  </span>
                  <p className="font-bold text-slate-900 truncate">{profile?.alternateMobile || 'Not provided'}</p>
                </div>
                {profile?.alternateMobile && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(profile.alternateMobile, 'altMobile')}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Copy Alternate Phone"
                    >
                      {copiedField === 'altMobile' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a
                      href={`tel:${profile.alternateMobile.replace(/\D/g, '')}`}
                      className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                      title="Call Alternate"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* WhatsApp */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50/70 p-2 border border-slate-100">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    WhatsApp Hotline
                  </span>
                  <p className="font-bold text-slate-900 truncate">
                    {partner.whatsappNumber || partner.mobile || 'Not provided'}
                  </p>
                </div>
                {cleanWhatsapp && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(partner.whatsappNumber || partner.mobile, 'whatsapp')}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Copy WhatsApp"
                    >
                      {copiedField === 'whatsapp' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a
                      href={`https://wa.me/91${cleanWhatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                      title="WhatsApp Chat"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50/70 p-2 border border-slate-100">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {t('partnerDetails.emailAddress', 'Email Address')}
                  </span>
                  <p className="font-bold text-slate-900 truncate">{partner.email || 'Not provided'}</p>
                </div>
                {partner.email && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(partner.email, 'email')}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Copy Email"
                    >
                      {copiedField === 'email' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a
                      href={`mailto:${partner.email}`}
                      className="rounded p-1 text-slate-600 hover:bg-slate-100"
                      title="Send Email"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* Physical Operating Address */}
              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('partnerDetails.businessAddress', 'Physical Address')}
                </span>
                <p className="mt-0.5 font-semibold text-slate-800 leading-snug">
                  {[profile?.businessAddress, profile?.district, profile?.pinCode, profile?.state].filter(Boolean).join(', ') ||
                    'Not provided'}
                </p>
              </div>

              {/* Service Areas */}
              <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('partnerDetails.serviceAreas', 'Service Areas Covered')}
                </span>
                <p className="mt-0.5 font-semibold text-slate-800">
                  {profile?.serviceAreas || 'Standard District Coverage'}
                </p>
              </div>
            </div>
          </div>

          {/* Card D: Statutory & Tax Identification */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {t('partnerDetails.registrationDetails', 'Statutory & Tax Identity')}
                </h2>
              </div>
            </div>

            <div className="mt-3.5 space-y-2 text-xs">
              {/* GSTIN */}
              <div className="flex items-center justify-between border-b border-slate-50 py-1.5">
                <span className="text-[11px] font-medium text-slate-500">GST Number</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-900">
                    {profile?.gstNumber || 'Not provided'}
                  </span>
                  {profile?.gstNumber && (
                    <button
                      type="button"
                      onClick={() => handleCopy(profile.gstNumber, 'gst')}
                      className="text-slate-400 hover:text-slate-700"
                      title="Copy GSTIN"
                    >
                      {copiedField === 'gst' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Trade License / Registration */}
              <div className="flex items-center justify-between border-b border-slate-50 py-1.5">
                <span className="text-[11px] font-medium text-slate-500">Registration / CIN</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="max-w-[140px] truncate font-mono font-bold text-slate-900"
                    title={profile?.businessRegistrationNumber}
                  >
                    {profile?.businessRegistrationNumber || 'Not provided'}
                  </span>
                  {profile?.businessRegistrationNumber && (
                    <button
                      type="button"
                      onClick={() => handleCopy(profile.businessRegistrationNumber, 'regNo')}
                      className="text-slate-400 hover:text-slate-700"
                      title="Copy Registration Number"
                    >
                      {copiedField === 'regNo' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Referral Code */}
              <div className="flex items-center justify-between border-b border-slate-50 py-1.5">
                <span className="text-[11px] font-medium text-slate-500">Referral Code</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-900">
                    {profile?.referralCode || 'None'}
                  </span>
                  {profile?.referralCode && (
                    <button
                      type="button"
                      onClick={() => handleCopy(profile.referralCode, 'refCode')}
                      className="text-slate-400 hover:text-slate-700"
                      title="Copy Referral Code"
                    >
                      {copiedField === 'refCode' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Website */}
              <div className="flex items-center justify-between border-b border-slate-50 py-1.5">
                <span className="text-[11px] font-medium text-slate-500">Official Website</span>
                {profile?.websiteUrl ? (
                  <a
                    href={profile.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-blue-600 hover:underline"
                  >
                    <span>Visit link</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-slate-400">Not provided</span>
                )}
              </div>

              {/* Social Links */}
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[11px] font-medium text-slate-500">Social Channels</span>
                <span className="max-w-[140px] truncate text-slate-700 font-semibold" title={profile?.socialLinks}>
                  {profile?.socialLinks || 'None listed'}
                </span>
              </div>
            </div>
          </div>

          {/* Card E: KYC Verification & Document Vault */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
            <div
              onClick={() => setIsKycVaultExpanded(!isKycVaultExpanded)}
              className="flex cursor-pointer items-center justify-between border-b border-slate-100 pb-3"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  KYC Document Vault
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">
                  {verificationDetail?.documents.length || 0}
                </span>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-700">
                {isKycVaultExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            {isKycVaultExpanded && (
              <div className="mt-3.5 space-y-3">
                {!verificationDetail || verificationDetail.documents.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
                    <ShieldCheck className="mx-auto h-6 w-6 text-slate-300" />
                    <p className="mt-1 text-xs font-bold text-slate-600">No documents submitted yet</p>
                    <p className="text-[10px] text-slate-400">Partner has not completed statutory document upload.</p>
                  </div>
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
                        return { ...field, label: 'PAN Number', value: document.documentNumber };
                      }
                      if (field.label === 'Masked GSTIN' && document.documentNumber) {
                        return { ...field, label: 'GSTIN', value: document.documentNumber };
                      }
                      return field;
                    });
                    const status = formatPartnerDocumentStatus(document.verificationStatus);

                    return (
                      <div
                        key={document.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs transition hover:border-slate-300"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-extrabold text-slate-900 tracking-tight">
                              {document.documentType.replaceAll('_', ' ')}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-slate-500 font-medium">
                              {document.fileName || 'No file attached'}
                            </p>
                          </div>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              status === 'VERIFIED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : status === 'FAILED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {status === 'VERIFIED' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <Clock3 className="h-3 w-3" />
                            )}
                            {status.replaceAll('_', ' ')}
                          </span>
                        </div>

                        {/* Document Number & Signatory Name */}
                        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Doc No.</span>
                            <p className="font-mono font-bold text-slate-800 truncate">
                              {document.documentNumber || '-'}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Name on Doc</span>
                            <p className="font-bold text-slate-800 truncate">
                              {document.nameOnDocument || '-'}
                            </p>
                          </div>
                        </div>

                        {/* Verified Date & Document Actions */}
                        <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/80 pt-2 text-[11px]">
                          <span className="text-[10px] text-slate-400">
                            {document.verificationCompletedAt
                              ? `Verified ${formatPortalDate(document.verificationCompletedAt)}`
                              : 'Pending check'}
                          </span>

                          {document.fileUrl ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void openOrDownloadDocument(document)}
                                className="inline-flex items-center gap-1 font-bold text-amber-700 hover:text-amber-800"
                              >
                                {canPreviewPartnerDocument(document.fileName, document.fileUrl) ? (
                                  <>
                                    <Eye className="h-3 w-3" />
                                    <span>Preview</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-3 w-3" />
                                    <span>Download</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">No file</span>
                          )}
                        </div>

                        {/* Detailed Verified Meta (if available) */}
                        {detailFields.length > 0 && (
                          <div className="mt-2 space-y-1 rounded bg-white p-2 border border-slate-100 text-[10px]">
                            {detailFields.slice(0, 3).map((f) => (
                              <div key={f.label} className="flex justify-between">
                                <span className="text-slate-400 font-semibold">{f.label}:</span>
                                <span className="font-bold text-slate-800 text-right truncate max-w-[150px]">
                                  {f.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {document.verificationMessage && (
                          <p className="mt-1.5 text-[10px] font-semibold text-rose-600">
                            {document.verificationMessage}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Card F: Legal Agreements & Audit Trail */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
            <div
              onClick={() => setIsAgreementsExpanded(!isAgreementsExpanded)}
              className="flex cursor-pointer items-center justify-between border-b border-slate-100 pb-3"
            >
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Agreements & Audit History
                </h2>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-700">
                {isAgreementsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            {isAgreementsExpanded && (
              <div className="mt-3.5 space-y-3 text-xs">
                {/* Legal Agreements */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Accepted Agreements
                  </p>
                  {!verificationDetail?.agreements || verificationDetail.agreements.length === 0 ? (
                    <p className="text-[11px] text-slate-400">No agreements recorded yet.</p>
                  ) : (
                    verificationDetail.agreements.map((agreement) => (
                      <div
                        key={`${agreement.agreementType}-${agreement.version}`}
                        className="mb-1.5 flex items-center justify-between rounded-lg bg-slate-50/70 p-2 border border-slate-100"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">
                            {agreement.agreementType.replaceAll('_', ' ')}
                          </p>
                          <p className="text-[10px] text-slate-400">Version {agreement.version}</p>
                        </div>
                        <span className="text-right text-[10px] font-bold text-emerald-700 shrink-0">
                          Accepted<br />
                          {formatPortalDate(agreement.acceptedAt)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Audit & Review History */}
                {verificationDetail?.reviewHistory && verificationDetail.reviewHistory.length > 0 && (
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Review Activity
                    </p>
                    <div className="space-y-2">
                      {verificationDetail.reviewHistory.slice(0, 4).map((review) => (
                        <div key={review.id} className="rounded-lg bg-slate-50/60 p-2 border border-slate-100 text-[11px]">
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <span>{review.action.replaceAll('_', ' ')}</span>
                            <span className="text-[10px] font-semibold text-slate-400">
                              {formatPortalDate(review.createdAt)}
                            </span>
                          </div>
                          {review.comment && (
                            <p className="mt-1 text-[10px] text-slate-600 italic">
                              &ldquo;{review.comment}&rdquo;
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. INTERACTIVE MODALS */}

      {/* Document Preview Modal */}
      {documentPreview ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          onClick={() => setDocumentPreview(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/90">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {documentPreview.document.documentType.replaceAll('_', ' ')}
                </span>
                <h3 className="truncate text-sm font-bold text-slate-900">
                  {documentPreview.document.fileName || 'KYC Document Preview'}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {documentPreview.document.fileUrl && (
                  <button
                    type="button"
                    onClick={() => void downloadDocument(documentPreview.document)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDocumentPreview(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex min-h-[350px] max-h-[75vh] items-center justify-center overflow-auto bg-slate-950 p-4">
              {documentPreview.loading ? (
                <div className="text-center text-sm font-semibold text-slate-400">
                  Decrypting & loading secure document preview...
                </div>
              ) : documentPreview.error ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <AlertCircle className="h-8 w-8 text-rose-500" />
                  <p className="text-xs font-semibold text-rose-400">{documentPreview.error}</p>
                </div>
              ) : documentPreview.previewUrl && documentPreview.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={documentPreview.previewUrl}
                  alt={documentPreview.document.fileName || 'KYC Document'}
                  className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-2xl"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-center text-slate-300">
                  <FileText className="h-12 w-12 text-slate-400" />
                  <p className="text-sm font-semibold">Direct in-browser preview is available for images.</p>
                  <button
                    type="button"
                    onClick={() => void downloadDocument(documentPreview.document)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-bold text-slate-900 transition hover:bg-[#E5AD06]"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download File to Inspect</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Account Status Modal */}
      {showStatusModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowStatusModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-extrabold text-slate-900">
              {statusActionType === 'ACTIVE' ? 'Activate Partner Account?' : 'Deactivate Partner Account?'}
            </h3>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              {statusActionType === 'ACTIVE'
                ? `Activating ${partner.name} will restore partner portal login access and make their live machine listings visible to buyers.`
                : `Deactivating ${partner.name} will suspend partner portal access and hide their active machine listings.`}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowStatusModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusSubmitting}
                onClick={handleToggleStatus}
                className={`rounded-lg px-4 py-2 text-xs font-bold text-white shadow-2xs transition ${
                  statusActionType === 'ACTIVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                } disabled:opacity-50`}
              >
                {statusSubmitting ? 'Updating...' : statusActionType === 'ACTIVE' ? 'Confirm Activation' : 'Confirm Deactivation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KYC Decision Modal */}
      {showKycModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowKycModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Update KYC Verification Status</h3>
                <p className="text-xs text-slate-500 font-medium">Partner: {partner.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowKycModal(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Decision</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'] as const).map((dec) => (
                    <button
                      key={dec}
                      type="button"
                      onClick={() => setKycDecision(dec)}
                      className={`rounded-xl border p-2.5 text-center text-xs font-bold transition ${
                        kycDecision === dec
                          ? dec === 'APPROVED'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                            : dec === 'CHANGES_REQUESTED'
                              ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20'
                              : 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {dec === 'APPROVED' ? 'Approve' : dec === 'CHANGES_REQUESTED' ? 'Request Changes' : 'Reject'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Internal Verification Notes / Reason
                </label>
                <textarea
                  rows={3}
                  value={kycNotes}
                  onChange={(e) => setKycNotes(e.target.value)}
                  placeholder="E.g., PAN and GSTIN verified successfully with authorized signatory match."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowKycModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={kycSubmitting}
                onClick={handleUpdateKycStatus}
                className="rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-black text-slate-900 shadow-2xs hover:bg-[#E5AD06] disabled:opacity-50"
              >
                {kycSubmitting ? 'Saving Decision...' : 'Save Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowPasswordModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Reset Partner Password</h3>
                <p className="text-xs text-slate-500 font-medium">Partner: {partner.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">New Password</label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter strong new password"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-mono text-xs text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                />
              </div>

              {passwordErrorMsg && (
                <p className="text-xs font-semibold text-rose-600">{passwordErrorMsg}</p>
              )}
              {passwordSuccessMsg && (
                <p className="text-xs font-semibold text-emerald-600">{passwordSuccessMsg}</p>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordSubmitting || !newPassword.trim()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 disabled:opacity-50"
                >
                  {passwordSubmitting ? 'Resetting...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
