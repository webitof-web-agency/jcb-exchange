/* eslint-disable react-hooks/set-state-in-effect */
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
  ShieldAlert,
  Lock,
  Plus,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'react-toastify';
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
import { createSecureDocumentPreviewUrl, downloadSecureDocument } from '@/lib/secureDownload';
import PartnerKycTemplateModal, { type PartnerTemplateResponse } from '@/components/kyc/PartnerKycTemplateModal';

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
  ACTIVE: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  AVAILABLE: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  PENDING: 'bg-amber-50 text-amber-900 border-amber-300',
  REVIEW_PENDING: 'bg-amber-50 text-amber-900 border-amber-300',
  PROFILE_PENDING: 'bg-amber-50 text-amber-900 border-amber-300',
  KYC_PENDING: 'bg-amber-50 text-amber-900 border-amber-300',
  AGREEMENT_PENDING: 'bg-amber-50 text-amber-900 border-amber-300',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-300',
  CHANGES_REQUESTED: 'bg-amber-50 text-amber-950 border-amber-300',
  SOLD: 'bg-blue-50 text-blue-800 border-blue-300',
  EXPIRED: 'bg-slate-100 text-slate-700 border-slate-300',
  INACTIVE: 'bg-slate-100 text-slate-700 border-slate-300',
  SUSPENDED: 'bg-orange-50 text-orange-800 border-orange-300',
  BLOCKED: 'bg-rose-50 text-rose-800 border-rose-300',
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
  verificationRecordId: string | null;
  verificationMessage: string | null;
  verificationCompletedAt: string | null;
  verificationResult: Record<string, unknown> | null;
  verificationTemplate: {
    id: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    sha256: string;
    createdAt: string;
  } | null;
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

type ActiveTab = 'inventory' | 'profile' | 'kyc' | 'agreements';

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

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('inventory');

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
  const [templatePreview, setTemplatePreview] = useState<{
    documentType: 'PAN_CARD' | 'GST_CERTIFICATE' | 'AADHAAR_CARD';
    documentNumber: string;
    response: PartnerTemplateResponse;
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

  // Expandable description
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Copy helper
  const handleCopy = useCallback((text?: string | null, fieldName?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (fieldName) {
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, []);

  // Fetch partner listings
  const fetchPartnerListings = useCallback(async (partnerDbId: string) => {
    if (!partnerDbId) return;
    try {
      setLoadingListings(true);
      const response = await api.get<{ listings: PartnerListing[] }>('/superadmin/listings', {
        params: { partnerId: partnerDbId, compact: 'true' },
      });
      setListings(response.data.listings || []);
    } catch (err) {
      console.error('Failed to load listings', err);
    } finally {
      setLoadingListings(false);
    }
  }, []);

  // Fetch partner details & KYC
  const fetchPartnerDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
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
        void fetchPartnerListings(nextResolvedPartnerId);

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
  }, [partnerId, t, fetchPartnerListings]);

  useEffect(() => {
    void fetchPartnerDetails();
  }, [fetchPartnerDetails]);

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

  // Status & Color Helpers
  const formatStatusLabel = useCallback(
    (status?: string | null) => {
      if (!status) return t('partnerDetails.statusUnknown', 'Unknown');
      return status
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    },
    [t],
  );

  const getPartnerStatus = useCallback(
    (target: ManagedUser | null) => {
      if (!target) return t('partnerDetails.statusUnknown', 'Unknown');
      if (target.status === 'INACTIVE') return t('partnerDetails.statusInactive', 'Inactive');
      if (target.accountStatus === 'REJECTED' || target.kycStatus === 'REJECTED') {
        return t('partnerDetails.statusRejected', 'Rejected');
      }
      if (target.accountStatus === 'CHANGES_REQUESTED') {
        return t('partnerDetails.statusChangesRequested', 'Changes Requested');
      }
      if (target.accountStatus === 'ACTIVE' || target.status === 'ACTIVE') {
        return t('partnerDetails.statusActive', 'Active');
      }
      return target.onboardingStatus ? formatStatusLabel(target.onboardingStatus) : target.status;
    },
    [formatStatusLabel, t],
  );

  const getPartnerStatusClassName = useCallback((target: ManagedUser | null) => {
    if (!target) return 'bg-slate-100 text-slate-700 border-slate-300';
    if (target.status === 'INACTIVE') return 'bg-slate-100 text-slate-700 border-slate-300';
    if (target.accountStatus === 'REJECTED' || target.kycStatus === 'REJECTED') {
      return 'bg-rose-50 text-rose-800 border-rose-300 font-bold';
    }
    if (target.accountStatus === 'CHANGES_REQUESTED') {
      return 'bg-amber-50 text-amber-950 border-amber-300 font-bold';
    }
    if (target.accountStatus === 'ACTIVE' || target.status === 'ACTIVE') {
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
    }
    return statusClassNames[target.status] || 'bg-amber-50 text-amber-900 border-amber-300';
  }, []);

  const editHref = useMemo(() => {
    if (!partner) return backHref;
    return generateAdminPartnerEditPath(editBaseHref, {
      id: partner.id,
      name: partner.name,
      businessName: partner.name,
      district: partner.partnerProfile?.district || '',
    });
  }, [partner, editBaseHref, backHref]);

  // Clean document preview blob URL
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
      toast.error('Unable to download this document.');
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

  const openTemplatePreview = useCallback((document: VerificationDetailDocument) => {
    const template = document.verificationTemplate;
    const recordId = document.verificationRecordId;
    if (!template || !recordId) {
      toast.error('Saved template is not available for this document.');
      return;
    }

    if (document.documentType === 'PAN_CARD') {
      setTemplatePreview({
        documentType: 'PAN_CARD',
        documentNumber: document.documentNumber || '',
        response: {
          success: true,
          record: {
            id: recordId,
            operation: 'PAN_COMPREHENSIVE_V2',
            status: 'SUCCESS',
            maskedPan: document.documentNumber || 'SAVED',
            provider: 'saved-template',
            providerClientId: null,
            messageCode: null,
            safeMessage: null,
            createdAt: template.createdAt,
            completedAt: template.createdAt,
            rawDataExpiresAt: null,
            template,
          },
          result: null,
          template,
        } as PartnerTemplateResponse,
      });
      return;
    }

    if (document.documentType === 'GST_CERTIFICATE') {
      setTemplatePreview({
        documentType: 'GST_CERTIFICATE',
        documentNumber: document.documentNumber || '',
        response: {
          success: true,
          record: {
            id: recordId,
            status: 'SUCCESS',
            maskedGstin: document.documentNumber || 'SAVED',
            gstinStatus: 'ACTIVE',
            businessName: document.nameOnDocument || null,
            legalName: document.nameOnDocument || null,
            provider: 'saved-template',
            providerClientId: null,
            messageCode: null,
            safeMessage: null,
            createdAt: template.createdAt,
            completedAt: template.createdAt,
            rawDataExpiresAt: null,
            template,
          },
          result: null,
          template,
        } as PartnerTemplateResponse,
      });
      return;
    }

    setTemplatePreview({
      documentType: 'AADHAAR_CARD',
      documentNumber: document.documentNumber || '',
      response: {
        success: true,
        record: {
          id: recordId,
          status: 'SUCCESS',
          maskedAadhaar: document.documentNumber || 'SAVED',
          providerClientId: null,
          rawDataExpiresAt: null,
          template,
        },
        result: null,
        template,
      },
    });
  }, []);

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
      toast.success(`Partner status updated to ${statusActionType === 'ACTIVE' ? 'Active' : 'Inactive'}`);
    } catch (err) {
      console.error('Failed to update status', err);
      toast.error('Failed to update partner status. Please try again.');
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
      toast.success(`KYC status updated to ${kycDecision}`);
      await fetchPartnerDetails();
    } catch (err) {
      console.error('Failed to update KYC status', err);
      toast.error('Failed to update verification status. Please try again.');
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
      toast.success('Partner login password reset successfully');
      setTimeout(() => {
        setShowPasswordModal(false);
        setNewPassword('');
        setPasswordSuccessMsg('');
      }, 1200);
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
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-slate-200/90 bg-white p-12">
        <BrandLoader variant="section" size="md" bg="light" text="Loading partner dossier..." />
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-xs">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h3 className="mt-4 text-base font-bold text-slate-900">
            {t('partnerDetails.loadFailed', 'Partner Profile Unavailable')}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {error || t('partnerDetails.partnerNotFound', 'Partner could not be located.')}
          </p>
          <div className="mt-6">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-slate-800"
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
  const partnerInitials =
    partner.name
      ?.split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'P';

  return (
    <div className="space-y-3.5 pb-12">
      {/* 1. COMPACT EXECUTIVE HERO HEADER */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs sm:p-4">
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Identity & Badges */}
          <div className="flex items-start gap-3 sm:gap-3.5 min-w-0">
            {/* Avatar / Logo */}
            <div className="relative flex h-13 w-13 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-gradient-to-br from-amber-100 to-amber-200 font-black text-amber-950 shadow-2xs text-base sm:text-lg">
              {profile?.businessLogoUrl ? (
                <Image
                  src={getAbsoluteFileUrl(profile.businessLogoUrl)}
                  alt={partner.name}
                  fill
                  className="rounded-xl object-cover"
                />
              ) : (
                <span>{partnerInitials}</span>
              )}
              {partner.kycStatus === 'APPROVED' && (
                <div
                  className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xs border border-white"
                  title="KYC Verified Partner"
                >
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
              )}
            </div>

            {/* Business Info */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate max-w-[280px] sm:max-w-md">
                  {partner.name || 'Unnamed Business'}
                </h1>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {partnerStatus}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  <Tag className="h-2.5 w-2.5 text-amber-700" />
                  {formatPartnerTypeLabel(partner.partnerType, 'Partner')}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {profile?.ownerName && (
                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                    <User className="h-3 w-3 text-slate-400" />
                    {profile.ownerName}
                  </span>
                )}
                {(partner.city || profile?.district || partner.state) && (
                  <span className="flex items-center gap-1 text-slate-600">
                    <MapPin className="h-3 w-3 text-amber-600" />
                    {[partner.city, profile?.district, partner.state].filter(Boolean).join(', ')}
                  </span>
                )}
                <span className="flex items-center gap-1 text-slate-400">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  Member since {formatPortalDate(partner.createdAt)}
                </span>
                <div
                  onClick={() => handleCopy(partner.id, 'partnerId')}
                  className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-slate-800 cursor-pointer select-all"
                  title="Copy Partner UUID"
                >
                  <span>ID: {partner.id.slice(0, 8)}</span>
                  {copiedField === 'partnerId' ? (
                    <Check className="h-2.5 w-2.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-2.5 w-2.5" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
            {/* Call */}
            {cleanPhone && (
              <a
                href={`tel:${cleanPhone}`}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition-colors"
                title={`Call ${cleanPhone}`}
              >
                <Phone className="h-3.5 w-3.5 text-emerald-600" />
                <span>Call</span>
              </a>
            )}

            {/* WhatsApp */}
            {cleanWhatsapp && (
              <a
                href={`https://wa.me/91${cleanWhatsapp}?text=${encodeURIComponent(
                  `Hello ${partner.name || 'Partner'}, contacting from JCBExchange SuperAdmin regarding your account.`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 text-xs font-bold text-emerald-700 shadow-2xs hover:bg-emerald-50 transition-colors"
                title="Open WhatsApp Chat"
              >
                <Send className="h-3.5 w-3.5 text-emerald-600" />
                <span>WhatsApp</span>
              </a>
            )}

            {/* Email */}
            {partner.email && (
              <a
                href={`mailto:${partner.email}`}
                className="hidden sm:inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
                title={`Email ${partner.email}`}
              >
                <Mail className="h-3.5 w-3.5 text-slate-500" />
                <span>Email</span>
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
                className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold transition-colors ${
                  partner.status === 'ACTIVE'
                    ? 'border-slate-200 bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                    : 'border-emerald-400 bg-emerald-700 text-white hover:bg-emerald-800 shadow-2xs'
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
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-bold text-amber-900 shadow-2xs hover:bg-amber-100 transition-colors"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
                <span>KYC Decision</span>
              </button>
            )}

            {/* Reset Password */}
            {canResetPassword && (
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
                title="Reset Password"
              >
                <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden xl:inline">Password</span>
              </button>
            )}

            {/* Edit Profile Button */}
            {canEditOnboarding && (
              <Link
                href={editHref}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#FFC107] px-3 text-xs font-black text-slate-950 shadow-2xs hover:bg-[#E5AD06] transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>{t('partnerDetails.editOnboarding', 'Edit Profile')}</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 2. EXECUTIVE 5-CARD KPI METRIC RIBBON */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {/* Metric 1: Listed Machinery */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Listed Machinery
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-700">
              <Package className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900">{listings.length}</span>
            <span className="text-[11px] font-semibold text-slate-500">units</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>{activeListingsCount} Active</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">{soldListingsCount} Sold</span>
          </div>
        </div>

        {/* Metric 2: Inventory Valuation */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Catalog Value
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
              <TrendingUp className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1">
            <span className="text-base sm:text-lg font-black text-slate-900 truncate block">
              {formatPortalCurrency(totalInventoryValue)}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500 truncate">Combined asking value</p>
        </div>

        {/* Metric 3: Listing Capacity */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Listing Quota
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-700">
              <Layers className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between text-xs font-bold text-slate-800">
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

        {/* Metric 4: KYC Compliance */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              KYC Compliance
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1">
            {partner.kycStatus === 'APPROVED' ? (
              <span className="flex items-center gap-1 text-xs font-black text-emerald-800">
                <CheckCircle className="h-4 w-4 text-emerald-600" /> Verified Partner
              </span>
            ) : partner.kycStatus === 'REJECTED' ? (
              <span className="flex items-center gap-1 text-xs font-black text-rose-700">
                <XCircle className="h-4 w-4" /> KYC Rejected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-black text-amber-800">
                <Clock3 className="h-4 w-4 text-amber-600" /> Under Review
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            {verificationDetail?.documents.length || 0} statutory documents
          </p>
        </div>

        {/* Metric 5: Territory */}
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Operating Territory
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              <MapPin className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1">
            <span className="text-sm font-bold text-slate-900 truncate block">
              {profile?.district || partner.city || 'Location unset'}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500 truncate">
            {partner.state ? `${partner.state} - ${profile?.pinCode || ''}` : 'State unassigned'}
          </p>
        </div>
      </div>

      {/* 3. BALANCED BENTO GRID ARCHITECTURE (8 / 4 SPLIT) */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
        {/* LEFT PRIMARY PANEL (8 of 12 columns) */}
        <div className="space-y-3.5 lg:col-span-7 xl:col-span-8">
          {/* TAB NAVIGATION STRIP */}
          <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shrink-0 ${
                activeTab === 'inventory'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              Machinery Inventory
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[10px]">
                {listings.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shrink-0 ${
                activeTab === 'profile'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              Commercial Profile
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('kyc')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shrink-0 ${
                activeTab === 'kyc'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              KYC & Statutory Vault
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[10px]">
                {verificationDetail?.documents.length || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('agreements')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shrink-0 ${
                activeTab === 'agreements'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Agreements & Audit
            </button>
          </div>

          {/* TAB 1: MACHINERY INVENTORY */}
          {activeTab === 'inventory' && (
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-amber-600" />
                    Registered Machinery Inventory
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Live machinery listings published and managed by this partner on the exchange.
                  </p>
                </div>

                {/* Status Chips Filter */}
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {(['ALL', 'ACTIVE', 'PENDING', 'SOLD'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setListingStatusFilter(st)}
                      className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
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
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search machinery by name, brand, model..."
                    value={listingSearch}
                    onChange={(e) => setListingSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-1.5 pl-8 pr-8 text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
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
                    onChange={(e) => setListingSort(e.target.value as 'newest' | 'price_desc' | 'price_asc')}
                    className="rounded-lg border border-slate-200 bg-white py-1 px-2 text-xs font-semibold text-slate-700 outline-none"
                  >
                    <option value="newest">Recently Listed</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="price_asc">Price: Low to High</option>
                  </select>
                </div>
              </div>

              {/* Machinery Grid */}
              <div className="mt-4">
                {loadingListings ? (
                  <div className="py-12">
                    <BrandLoader variant="section" size="sm" bg="light" text="Loading inventory catalog..." />
                  </div>
                ) : filteredListings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-12 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                      <Package className="h-5 w-5" />
                    </div>
                    <p className="mt-2.5 text-xs font-bold text-slate-800">
                      {listings.length === 0
                        ? 'No machinery listings registered yet'
                        : 'No machinery matches your filter criteria'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 max-w-sm">
                      {listings.length === 0
                        ? 'When this partner lists excavators, backhoe loaders, or road equipment, their catalog units will appear here in real time.'
                        : 'Try relaxing your search terms or clearing status filters.'}
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
                          className="group flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-xs cursor-pointer"
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
                                <ImageIcon className="h-6 w-6 opacity-40" />
                                <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  No Photo
                                </span>
                              </div>
                            )}

                            {/* Status Badge */}
                            <div className="absolute right-2 top-2">
                              <span
                                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold shadow-2xs backdrop-blur-xs border ${statusBadgeClass}`}
                              >
                                {formatStatusLabel(listing.status)}
                              </span>
                            </div>
                          </div>

                          {/* Machine Meta */}
                          <div className="flex flex-1 flex-col justify-between p-3">
                            <div>
                              <h3
                                className="line-clamp-2 text-xs font-bold text-slate-900 group-hover:text-amber-900 transition-colors"
                                title={listing.title}
                              >
                                {listing.title}
                              </h3>
                              <p className="mt-0.5 text-[10px] text-slate-400">
                                Listed {formatPortalDate(listing.createdAt)}
                              </p>
                            </div>

                            <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
                              <div>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  Asking Price
                                </span>
                                <p className="text-xs font-black text-amber-900">
                                  {formatPortalCurrency(listing.price)}
                                </p>
                              </div>
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-amber-800">
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
          )}

          {/* TAB 2: COMMERCIAL PROFILE & OPERATIONS */}
          {activeTab === 'profile' && (
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-amber-600" />
                  Commercial & Dealership Profile
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Business structure, operational parameters, and dealership terms.
                </p>
              </div>

              {/* 9 Data Points Grid */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 text-xs">
                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Legal Entity Name</p>
                  <p className="mt-0.5 font-bold text-slate-900 truncate" title={partner.name}>
                    {partner.name || '—'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Proprietor / Signatory</p>
                  <p className="mt-0.5 font-bold text-slate-900 truncate" title={profile?.ownerName || partner.fullName}>
                    {profile?.ownerName || partner.fullName || '—'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Partner Tier / Role</p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {formatPartnerTypeLabel(partner.partnerType, 'Standard Partner')}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Industry Experience</p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {profile?.businessExperience ? `${profile.businessExperience} Years` : '—'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Team Size</p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {profile?.teamSize ? `${profile.teamSize} Members` : '—'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Monthly Flow</p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {profile?.expectedMonthlyListings ? `${profile.expectedMonthlyListings} units/mo` : '—'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact Preference</p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {profile?.contactPreference || 'Phone & WhatsApp'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Operating Hours</p>
                  <p className="mt-0.5 font-bold text-slate-900 truncate" title={profile?.workingHours || 'Standard'}>
                    {profile?.workingHours || '09:00 AM - 07:00 PM'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deposit Status</p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {profile?.depositStatus ? formatStatusLabel(profile.depositStatus) : 'Not Submitted'}
                  </p>
                </div>
              </div>

              {/* Business Description */}
              {profile?.businessDescription ? (
                <div className="rounded-lg bg-slate-50/70 p-3 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      About Business & Dealership
                    </p>
                    {profile.businessDescription.length > 200 && (
                      <button
                        type="button"
                        onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                        className="text-[11px] font-bold text-amber-700 hover:text-amber-800"
                      >
                        {isDescriptionExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>
                  <div
                    className={`mt-1.5 text-xs leading-relaxed text-slate-700 ${
                      !isDescriptionExpanded && profile.businessDescription.length > 200 ? 'line-clamp-3' : ''
                    }`}
                  >
                    {profile.businessDescription}
                  </div>
                </div>
              ) : null}

              {/* Service Areas */}
              <div className="rounded-lg bg-slate-50/70 p-3 border border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Territory & Service Areas Covered
                </p>
                <p className="mt-1 font-semibold text-slate-800 text-xs">
                  {profile?.serviceAreas || 'Standard Regional Territory'}
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: KYC & STATUTORY VAULT */}
          {activeTab === 'kyc' && (
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-amber-600" />
                    KYC Documents & Statutory Verification
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Statutory tax identifiers and uploaded official identity records.
                  </p>
                </div>
                {canManageKyc && (
                  <button
                    type="button"
                    onClick={() => {
                      setKycDecision(partner.kycStatus === 'APPROVED' ? 'APPROVED' : 'APPROVED');
                      setShowKycModal(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-amber-400 shadow-2xs"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Update KYC
                  </button>
                )}
              </div>

              {/* Statutory Identification Details */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 text-xs">
                {/* GSTIN */}
                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    GST Number
                  </span>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 truncate">
                      {profile?.gstNumber || 'Not provided'}
                    </span>
                    {profile?.gstNumber && (
                      <button
                        type="button"
                        onClick={() => handleCopy(profile.gstNumber, 'tab-gst')}
                        className="text-slate-400 hover:text-slate-700"
                        title="Copy GST"
                      >
                        {copiedField === 'tab-gst' ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* CIN / Reg No */}
                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Registration / CIN
                  </span>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 truncate" title={profile?.businessRegistrationNumber}>
                      {profile?.businessRegistrationNumber || 'Not provided'}
                    </span>
                    {profile?.businessRegistrationNumber && (
                      <button
                        type="button"
                        onClick={() => handleCopy(profile.businessRegistrationNumber, 'tab-reg')}
                        className="text-slate-400 hover:text-slate-700"
                        title="Copy Reg #"
                      >
                        {copiedField === 'tab-reg' ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Referral Code */}
                <div className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Referral Code
                  </span>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 truncate">
                      {profile?.referralCode || 'None'}
                    </span>
                    {profile?.referralCode && (
                      <button
                        type="button"
                        onClick={() => handleCopy(profile.referralCode, 'tab-ref')}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        {copiedField === 'tab-ref' ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Uploaded Documents List */}
              <div className="space-y-2.5">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Submitted KYC Credentials ({verificationDetail?.documents.length || 0})
                </h3>

                {!verificationDetail || verificationDetail.documents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                    <ShieldCheck className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-xs font-bold text-slate-700">No KYC documents on file</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      The partner has not completed statutory document upload yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {verificationDetail.documents.map((document) => {
                      const status = formatPartnerDocumentStatus(document.verificationStatus);

                      return (
                        <div
                          key={document.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs hover:border-amber-300 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-extrabold text-slate-900 tracking-tight">
                                {document.documentType.replaceAll('_', ' ')}
                              </p>
                              <p className="mt-0.5 truncate text-[10px] text-slate-500 font-medium">
                                {document.verificationTemplate
                                  ? `Saved template · ${document.verificationTemplate.fileName}`
                                  : document.fileName || 'No file attached'}
                              </p>
                            </div>
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                                status === 'VERIFIED'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : status === 'FAILED'
                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                  : 'bg-amber-50 text-amber-900 border-amber-300'
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

                          {/* Document Number & Name */}
                          <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] bg-white p-2 rounded-lg border border-slate-100">
                            <div>
                              <span className="text-[9px] uppercase font-bold text-slate-400 block">Doc No.</span>
                              <span className="font-mono font-bold text-slate-800 truncate block">
                                {document.documentNumber || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase font-bold text-slate-400 block">Name on Doc</span>
                              <span className="font-bold text-slate-800 truncate block">
                                {document.nameOnDocument || '—'}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/80 pt-2 text-[11px]">
                            <span className="text-[10px] text-slate-400">
                              {document.verificationCompletedAt
                                ? `Verified ${formatPortalDate(document.verificationCompletedAt)}`
                                : 'Pending verification'}
                            </span>

                            {document.verificationTemplate ? (
                              <button
                                type="button"
                                onClick={() => openTemplatePreview(document)}
                                className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:text-indigo-900"
                              >
                                <Eye className="h-3 w-3" />
                                <span>View template</span>
                              </button>
                            ) : document.fileUrl ? (
                              <button
                                type="button"
                                onClick={() => void openOrDownloadDocument(document)}
                                className="inline-flex items-center gap-1 font-bold text-amber-800 hover:text-amber-900"
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
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">No saved template</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: LEGAL AGREEMENTS & AUDIT */}
          {activeTab === 'agreements' && (
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <ClipboardCheck className="h-4 w-4 text-amber-600" />
                  Legal Agreements & Review Activity
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Accepted dealership terms, platform agreements, and administrative audit logs.
                </p>
              </div>

              {/* Agreements */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Accepted Agreements ({verificationDetail?.agreements.length || 0})
                </h3>
                {!verificationDetail?.agreements || verificationDetail.agreements.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No legal agreements recorded yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {verificationDetail.agreements.map((agreement) => (
                      <div
                        key={`${agreement.agreementType}-${agreement.version}`}
                        className="flex items-center justify-between rounded-lg bg-slate-50/70 p-2.5 border border-slate-100 text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-900">
                            {agreement.agreementType.replaceAll('_', ' ')}
                          </p>
                          <p className="text-[10px] text-slate-400">Version {agreement.version}</p>
                        </div>
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                          Accepted on {formatPortalDate(agreement.acceptedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Review History */}
              {verificationDetail?.reviewHistory && verificationDetail.reviewHistory.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Review Activity History
                  </h3>
                  <div className="space-y-2">
                    {verificationDetail.reviewHistory.map((review) => (
                      <div
                        key={review.id}
                        className="rounded-lg bg-slate-50/60 p-2.5 border border-slate-100 text-xs"
                      >
                        <div className="flex items-center justify-between font-bold text-slate-800">
                          <span>{review.action.replaceAll('_', ' ')}</span>
                          <span className="text-[10px] font-semibold text-slate-400">
                            {formatPortalDate(review.createdAt)}
                          </span>
                        </div>
                        {review.comment && (
                          <p className="mt-1 text-[11px] text-slate-600 italic">
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

        {/* RIGHT SECONDARY PANEL (4 of 12 columns) */}
        <div className="space-y-3.5 lg:col-span-5 xl:col-span-4">
          {/* Card A: Direct Contact Dossier */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Contact Coordinates
                </h2>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              {/* Primary Mobile */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50/80 p-2 border border-slate-100">
                <div className="min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                    Primary Mobile
                  </span>
                  <span className="font-bold text-slate-900 truncate block">
                    {partner.mobile || 'Not provided'}
                  </span>
                </div>
                {partner.mobile && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(partner.mobile, 'mobile')}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Copy Mobile"
                    >
                      {copiedField === 'mobile' ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    <a
                      href={`tel:${cleanPhone}`}
                      className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                      title="Call"
                    >
                      <Phone className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Alternate Mobile */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50/80 p-2 border border-slate-100">
                <div className="min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                    Alternate Phone
                  </span>
                  <span className="font-bold text-slate-900 truncate block">
                    {profile?.alternateMobile || 'Not provided'}
                  </span>
                </div>
                {profile?.alternateMobile && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(profile.alternateMobile, 'altMobile')}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Copy Alternate Mobile"
                    >
                      {copiedField === 'altMobile' ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    <a
                      href={`tel:${profile.alternateMobile.replace(/\D/g, '')}`}
                      className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                      title="Call"
                    >
                      <Phone className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* WhatsApp Hotline */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50/80 p-2 border border-slate-100">
                <div className="min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                    WhatsApp Hotline
                  </span>
                  <span className="font-bold text-slate-900 truncate block">
                    {partner.whatsappNumber || partner.mobile || 'Not provided'}
                  </span>
                </div>
                {cleanWhatsapp && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(partner.whatsappNumber || partner.mobile, 'whatsapp')}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Copy WhatsApp"
                    >
                      {copiedField === 'whatsapp' ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    <a
                      href={`https://wa.me/91${cleanWhatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                      title="Open WhatsApp"
                    >
                      <Send className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50/80 p-2 border border-slate-100">
                <div className="min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                    Email Address
                  </span>
                  <span className="font-bold text-slate-900 truncate block" title={partner.email}>
                    {partner.email || 'Not provided'}
                  </span>
                </div>
                {partner.email && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(partner.email, 'email')}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Copy Email"
                    >
                      {copiedField === 'email' ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    <a
                      href={`mailto:${partner.email}`}
                      className="rounded p-1 text-slate-600 hover:bg-slate-100"
                      title="Send Email"
                    >
                      <Mail className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Physical Address */}
              <div className="rounded-lg bg-slate-50/80 p-2.5 border border-slate-100">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                  Operating Address
                </span>
                <p className="mt-0.5 font-semibold text-slate-800 leading-snug">
                  {[profile?.businessAddress, profile?.district, profile?.pinCode, profile?.state].filter(Boolean).join(', ') ||
                    'Not specified'}
                </p>
              </div>
            </div>
          </div>

          {/* Card B: Quick Governance & Security Hub */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Account Governance
                </h2>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              {/* Account Status Row */}
              <div className="flex items-center justify-between border-b border-slate-50 py-1.5">
                <span className="text-slate-500 font-medium">Account Status</span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold border ${statusClass}`}>
                  {partnerStatus}
                </span>
              </div>

              {/* KYC Status Row */}
              <div className="flex items-center justify-between border-b border-slate-50 py-1.5">
                <span className="text-slate-500 font-medium">KYC Decision</span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
                    partner.kycStatus === 'APPROVED'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : partner.kycStatus === 'REJECTED'
                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                      : 'bg-amber-50 text-amber-900 border-amber-300'
                  }`}
                >
                  {partner.kycStatus || 'PENDING'}
                </span>
              </div>

              {/* Onboarding Status Row */}
              <div className="flex items-center justify-between border-b border-slate-50 py-1.5">
                <span className="text-slate-500 font-medium">Onboarding Status</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  {partner.onboardingStatus || 'PENDING'}
                </span>
              </div>

              {/* Password Reset Action */}
              {canResetPassword && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                    Reset Partner Password
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. MODALS */}

      {templatePreview ? (
        <PartnerKycTemplateModal
          documentType={templatePreview.documentType}
          documentNumber={templatePreview.documentNumber}
          response={templatePreview.response}
          isPartnerMode={false}
          templateEndpointBaseOverride={`/superadmin/verifications/${resolvedPartnerId || partnerId}/${templatePreview.documentType}/${templatePreview.response.record.id}`}
          onClose={() => setTemplatePreview(null)}
          onSaved={() => undefined}
        />
      ) : null}

      {/* Document Preview Modal */}
      {documentPreview ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          onClick={() => setDocumentPreview(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {documentPreview.document.fileName || documentPreview.document.documentType}
                </p>
                <p className="text-[11px] text-slate-500">
                  {documentPreview.document.documentType.replaceAll('_', ' ')} • Secure viewer
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadDocument(documentPreview.document)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDocumentPreview(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-900/90 p-4 min-h-[380px]">
              {documentPreview.loading ? (
                <BrandLoader size="sm" text="Decrypting document..." />
              ) : documentPreview.error ? (
                <div className="rounded-xl border border-rose-200 bg-white p-6 text-center text-xs text-rose-700 max-w-md">
                  <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
                  <p className="mt-2 font-bold">{documentPreview.error}</p>
                </div>
              ) : documentPreview.kind === 'pdf' && documentPreview.previewUrl ? (
                <iframe
                  src={documentPreview.previewUrl}
                  title={documentPreview.document.fileName || 'Document PDF Preview'}
                  className="h-[75vh] w-full rounded-lg bg-white"
                />
              ) : documentPreview.previewUrl ? (
                <div className="relative max-h-[75vh] max-w-full">
                  <img
                    src={documentPreview.previewUrl}
                    alt={documentPreview.document.fileName || 'KYC Document'}
                    className="max-h-[75vh] max-w-full rounded-lg object-contain shadow-md"
                  />
                </div>
              ) : (
                <p className="text-xs text-white">Preview unavailable.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Account Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
                <AlertCircle className="h-4.5 w-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {statusActionType === 'ACTIVE' ? 'Activate Partner Account' : 'Deactivate Partner Account'}
                </h3>
                <p className="text-[11px] text-slate-500">Confirm account status modification</p>
              </div>
            </div>

            <p className="mt-3.5 text-xs text-slate-600">
              Are you sure you want to change <strong className="font-bold text-slate-900">{partner.name}</strong> to{' '}
              <strong className="font-bold text-slate-900">{statusActionType === 'ACTIVE' ? 'Active' : 'Inactive'}</strong>?
              {statusActionType === 'INACTIVE' && ' This will temporarily suspend their listing and portal privileges.'}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowStatusModal(false)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusSubmitting}
                onClick={() => void handleToggleStatus()}
                className={`rounded-lg px-4 py-1.5 text-xs font-bold text-white shadow-2xs disabled:opacity-50 ${
                  statusActionType === 'ACTIVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {statusSubmitting ? 'Saving...' : 'Confirm Status Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KYC Decision Modal */}
      {showKycModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
                <ShieldCheck className="h-4.5 w-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Update KYC Decision</h3>
                <p className="text-[11px] text-slate-500">Record verification outcome and compliance notes</p>
              </div>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Verification Decision
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'] as const).map((dec) => (
                    <button
                      key={dec}
                      type="button"
                      onClick={() => setKycDecision(dec)}
                      className={`rounded-lg border p-2 text-center text-xs font-bold transition-all ${
                        kycDecision === dec
                          ? dec === 'APPROVED'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-400/20'
                            : dec === 'CHANGES_REQUESTED'
                            ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-400/20'
                            : 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-400/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {dec === 'APPROVED' ? 'Approve' : dec === 'CHANGES_REQUESTED' ? 'Req. Changes' : 'Reject'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Compliance Notes / Reason
                </label>
                <textarea
                  rows={3}
                  value={kycNotes}
                  onChange={(e) => setKycNotes(e.target.value)}
                  placeholder="e.g. GST and PAN verified successfully against MCA registry."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowKycModal(false)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={kycSubmitting}
                onClick={() => void handleUpdateKycStatus()}
                className="rounded-lg bg-[#FFC107] px-4 py-1.5 text-xs font-black text-slate-950 hover:bg-[#E5AD06] shadow-2xs disabled:opacity-50"
              >
                {kycSubmitting ? 'Saving...' : 'Apply Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
                <KeyRound className="h-4.5 w-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Reset Partner Password</h3>
                <p className="text-[11px] text-slate-500">Provide new credentials for {partner.name}</p>
              </div>
            </div>

            <form onSubmit={handleResetPassword} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  New Password (min 6 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                />
              </div>

              {passwordSuccessMsg && (
                <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-800 border border-emerald-200">
                  {passwordSuccessMsg}
                </div>
              )}
              {passwordErrorMsg && (
                <div className="rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-800 border border-rose-200">
                  {passwordErrorMsg}
                </div>
              )}

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordSubmitting}
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shadow-2xs disabled:opacity-50"
                >
                  {passwordSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
