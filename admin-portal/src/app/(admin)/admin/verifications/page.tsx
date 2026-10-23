'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
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
  ExternalLink,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe,
  History,
  Layers,
  LayoutGrid,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  MoreVertical,
  Pencil,
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
  Table as TableIcon,
  Trash2,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { useTranslation } from '@/hooks/useTranslation';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';
import PortalActionDropdown from '@/components/ui/PortalActionDropdown';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { getKycVerificationFields, type KycVerificationDocumentType } from '@/lib/kycVerification';

export interface VerificationItem {
  id: string;
  name: string;
  email: string | null;
  mobile?: string | null;
  ownerName?: string | null;
  city?: string | null;
  state?: string | null;
  partnerType: string;
  appliedOn: string;
  status: string;
}

export interface VerificationDetail {
  id: string;
  ownerName: string | null;
  email: string | null;
  mobile: string | null;
  whatsappNumber: string | null;
  city: string | null;
  state: string | null;
  profile: {
    ownerName: string | null;
    businessName: string | null;
    partnerType: string | null;
    businessAddress: string | null;
    district: string | null;
    pinCode: string | null;
    businessExperience: string | null;
    expectedMonthlyListings: number | null;
    businessDescription: string | null;
    serviceAreas: string | null;
    workingHours: string | null;
    gstNumber: string | null;
    businessRegistrationNumber: string | null;
    websiteUrl: string | null;
    socialLinks: string | null;
    yearsInBusiness: number | null;
    teamSize: number | null;
    contactPreference: string | null;
    googleMapsLocation: string | null;
    onboardingStatus: string;
    kycStatus: string;
    accountStatus: string;
    approvedAt: string | null;
  };
  documents: Array<{
    id: string;
    documentType: string;
    fileUrl: string | null;
    fileName: string | null;
    documentNumber: string | null;
    nameOnDocument: string | null;
    issueDate: string | null;
    expiryDate: string | null;
    submittedNote: string | null;
    status: string;
    reviewComment: string | null;
    verificationStatus: string | null;
    verificationRecordId: string | null;
    verificationCacheHit: boolean;
    verificationMessage: string | null;
    verificationRequestedAt: string | null;
    verificationCompletedAt: string | null;
    verificationResult: Record<string, unknown> | null;
  }>;
  agreements: Array<{
    agreementType: string;
    version: string;
    acceptedAt: string;
  }>;
  reviewHistory: Array<{
    id: string;
    action: string;
    comment: string | null;
    createdAt: string;
  }>;
}

type ViewMode = 'table' | 'cards';
type SortField = 'applied_desc' | 'applied_asc' | 'name_asc';

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatStatus = (value?: string | null) => (value ? value.replaceAll('_', ' ') : '-');

const getReviewActionLabel = (action: string, partnerType?: string | null, partnerName?: string | null) => {
  const resolvedPartnerType = formatPartnerTypeLabel(partnerType);
  const resolvedPartnerName = partnerName?.trim() || 'Unknown';
  const labels: Record<string, string> = {
    PARTNER_SAVED_ONBOARDING_DRAFT: `${resolvedPartnerType} ${resolvedPartnerName} saved onboarding draft`,
    PARTNER_SUBMITTED_FULL_ONBOARDING: `${resolvedPartnerType} ${resolvedPartnerName} submitted full onboarding`,
    SUPER_ADMIN_APPROVED: `SuperAdmin approved KYC & activated partner`,
    SUPER_ADMIN_CHANGES_REQUESTED: `SuperAdmin requested updates/changes`,
    SUPER_ADMIN_REJECTED: `SuperAdmin rejected application`,
  };

  return labels[action] || formatStatus(action);
};

const statusLabel: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  CHANGES_REQUESTED: 'Changes Requested',
  REJECTED: 'Rejected',
  APPROVED: 'Approved',
};

const documentDisplayTitles: Record<string, string> = {
  PAN_CARD: 'Company PAN / PAN Card',
  GST_CERTIFICATE: 'GST Certificate',
  AADHAAR_CARD: 'Aadhaar / Accepted ID',
  PASSPORT_PHOTO: 'Passport-size Photo',
  CANCELLED_CHEQUE: 'Cancelled Cheque',
  AUTHORIZED_PERSON_ID: 'Authorized Place ID',
};

export default function SuperAdminVerificationsPage() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const viewer = useAuthStore((state) => state.user);

  const canEditKyc =
    viewer?.role === 'SUPER_ADMIN' ||
    viewer?.role === 'ADMIN' ||
    hasAnyPermission(viewer?.permissions, ['kyc.edit.override']);
  const canManageKyc =
    viewer?.role === 'SUPER_ADMIN' ||
    viewer?.role === 'ADMIN' ||
    hasAnyPermission(viewer?.permissions, ['kyc.manage']);

  const partnerEditBasePath = pathname.startsWith('/employee') ? '/employee/partners' : '/admin/partners';

  // Data State
  const [verifications, setVerifications] = useState<VerificationItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortField>('applied_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Drawer & Detail State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<VerificationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'documents' | 'profile' | 'agreements' | 'history'>('documents');

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState<{
    id: string;
    partnerName: string;
    targetStatus: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  } | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Lightbox Preview
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewAsset, setPreviewAsset] = useState<{
    url: string;
    name: string;
    mimeType: string;
  } | null>(null);

  const loadVerifications = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const response = await api.get<{ verifications: VerificationItem[] }>('/superadmin/verifications');
      setVerifications(response.data.verifications || []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || t('verifications.loadQueueFailed', 'Unable to load verification queue.'));
      } else {
        setError(t('verifications.loadQueueFailed', 'Unable to load verification queue.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadVerifications();
  }, []);

  // Metrics computation
  const metrics = useMemo(() => {
    const total = verifications.length;
    const submitted = verifications.filter((v) => v.status === 'SUBMITTED').length;
    const underReview = verifications.filter((v) => v.status === 'UNDER_REVIEW').length;
    const changesRequested = verifications.filter((v) => v.status === 'CHANGES_REQUESTED').length;
    const showrooms = verifications.filter((v) => v.partnerType === 'SHOWROOM').length;
    const brokers = total - showrooms;

    return {
      total,
      submitted,
      underReview,
      changesRequested,
      showrooms,
      brokers,
    };
  }, [verifications]);

  // Unique partner types for filter
  const availablePartnerTypes = useMemo(() => {
    const types = new Set(verifications.map((v) => v.partnerType).filter(Boolean));
    return Array.from(types);
  }, [verifications]);

  // Filtered & Sorted Verifications
  const filteredVerifications = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = verifications.filter((item) => {
      // Status filter
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }

      // Partner Type filter
      if (typeFilter !== 'ALL' && item.partnerType !== typeFilter) {
        return false;
      }

      // Search query
      if (query) {
        const nameMatch = item.name.toLowerCase().includes(query);
        const emailMatch = (item.email || '').toLowerCase().includes(query);
        const mobileMatch = (item.mobile || '').toLowerCase().includes(query);
        const ownerMatch = (item.ownerName || '').toLowerCase().includes(query);
        const cityMatch = (item.city || '').toLowerCase().includes(query);
        const stateMatch = (item.state || '').toLowerCase().includes(query);
        const typeMatch = item.partnerType.toLowerCase().includes(query);

        if (!nameMatch && !emailMatch && !mobileMatch && !ownerMatch && !cityMatch && !stateMatch && !typeMatch) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    return filtered.sort((a, b) => {
      if (sortBy === 'applied_asc') {
        return new Date(a.appliedOn).getTime() - new Date(b.appliedOn).getTime();
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      // default: applied_desc
      return new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime();
    });
  }, [search, statusFilter, typeFilter, sortBy, verifications]);

  // Open detail drawer
  const openDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      setSelectedId(id);
      setDrawerTab('documents');
      const response = await api.get<{ verification: VerificationDetail }>(`/superadmin/verifications/${id}`);
      setSelectedDetail(response.data.verification);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || t('verifications.loadDetailFailed', 'Unable to load verification detail.'));
      } else {
        setError(t('verifications.loadDetailFailed', 'Unable to load verification detail.'));
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setSelectedDetail(null);
  };

  const closePreview = () => {
    if (previewAsset?.url) {
      window.URL.revokeObjectURL(previewAsset.url);
    }
    setPreviewAsset(null);
    setPreviewError('');
  };

  const openSecurePreview = async (fileUrl: string, fileName?: string | null) => {
    try {
      setPreviewLoading(true);
      setPreviewError('');
      if (previewAsset?.url) {
        window.URL.revokeObjectURL(previewAsset.url);
        setPreviewAsset(null);
      }

      const path = normalizeSecureDocumentPath(fileUrl);
      const response = await api.get(path, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(response.data);
      setPreviewAsset({
        url: blobUrl,
        name: fileName || t('verifications.securePreviewName', 'Secure Document Preview'),
        mimeType: response.headers['content-type'] || response.data.type || 'application/octet-stream',
      });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setPreviewError(err.response?.data?.error || t('verifications.openDocumentFailed', 'Unable to retrieve secure file.'));
      } else {
        setPreviewError(t('verifications.openDocumentFailed', 'Unable to retrieve secure file.'));
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  // Submit status decision
  const executeStatusDecision = async () => {
    if (!decisionModal) return;
    const { id, targetStatus } = decisionModal;

    try {
      setUpdatingId(id);
      setError('');
      setSuccess('');

      await api.patch(`/superadmin/verifications/${id}/status`, {
        status: targetStatus,
        comment: decisionComment.trim() || undefined,
      });

      setVerifications((current) => current.filter((partner) => partner.id !== id));
      if (selectedId === id) {
        closeDetail();
      }

      const statusFriendly = targetStatus.replaceAll('_', ' ').toLowerCase();
      setSuccess(`Partner verification moved to ${statusFriendly} successfully.`);
      setDecisionModal(null);
      setDecisionComment('');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || t('verifications.updateStatusFailed', 'Status update failed.'));
      } else {
        setError(t('verifications.updateStatusFailed', 'Status update failed.'));
      }
    } finally {
      setUpdatingId(null);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (filteredVerifications.length === 0) return;

    const headers = ['Business Name', 'Owner Name', 'Partner Type', 'Email', 'Mobile', 'Location', 'Applied On', 'Status'];
    const rows = filteredVerifications.map((item) => [
      `"${item.name.replace(/"/g, '""')}"`,
      `"${(item.ownerName || '').replace(/"/g, '""')}"`,
      `"${item.partnerType}"`,
      `"${item.email || ''}"`,
      `"${item.mobile || ''}"`,
      `"${[item.city, item.state].filter(Boolean).join(', ')}"`,
      `"${formatDate(item.appliedOn)}"`,
      `"${item.status}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `kyc_verifications_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    return () => {
      if (previewAsset?.url) {
        window.URL.revokeObjectURL(previewAsset.url);
      }
    };
  }, [previewAsset]);

  return (
    <div className="space-y-3.5 pb-16">
      {/* ── 1. EXECUTIVE KPI METRIC RIBBON ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total In Queue */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total In Queue</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400/10 text-amber-700">
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1 text-xl font-black text-slate-900">{metrics.total}</p>
          <p className="mt-0.5 text-[10px] text-slate-500 font-semibold">Active dossiers requiring review</p>
        </div>

        {/* Initial Review Pending */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Initial Submissions</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Clock className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1 text-xl font-black text-blue-700">{metrics.submitted}</p>
          <p className="mt-0.5 text-[10px] text-slate-500 font-semibold">Awaiting first audit touch</p>
        </div>

        {/* Under Active Review */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Under Review</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              <Eye className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1 text-xl font-black text-amber-700">{metrics.underReview}</p>
          <p className="mt-0.5 text-[10px] text-slate-500 font-semibold">Document checking in progress</p>
        </div>

        {/* Changes Requested */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Changes Requested</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <AlertCircle className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1 text-xl font-black text-rose-700">{metrics.changesRequested}</p>
          <p className="mt-0.5 text-[10px] text-slate-500 font-semibold">Awaiting partner corrections</p>
        </div>

        {/* Category Breakdown */}
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Network Mix</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Building2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-900">{metrics.showrooms}</span>
            <span className="text-xs font-bold text-slate-500">Showrooms · {metrics.brokers} Brokers</span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500 font-semibold">Commercial partner split</p>
        </div>
      </div>

      {/* ── 2. SYSTEM ALERTS (Error / Success) ── */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 shadow-2xs flex items-center justify-between gap-2 text-xs text-rose-800 animate-in fade-in">
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 shadow-2xs flex items-center justify-between gap-2 text-xs text-emerald-800 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess('')} className="text-emerald-500 hover:text-emerald-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── 3. ADVANCED MULTI-FILTER & SEARCH TOOLBAR ── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs space-y-3">
        {/* Top Control Strip */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 [&::-webkit-scrollbar]:hidden">
            {(
              [
                { id: 'ALL', label: 'All In Queue', count: metrics.total },
                { id: 'SUBMITTED', label: 'Submitted', count: metrics.submitted },
                { id: 'UNDER_REVIEW', label: 'Under Review', count: metrics.underReview },
                { id: 'CHANGES_REQUESTED', label: 'Changes Req.', count: metrics.changesRequested },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shadow-2xs ${
                    active
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Toolbar Actions */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* View Switcher */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`rounded-md p-1.5 transition-colors ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="High-Density Table View"
              >
                <TableIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`rounded-md p-1.5 transition-colors ${
                  viewMode === 'cards' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Bento Cards View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* CSV Export */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredVerifications.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs disabled:opacity-40"
              title="Export filtered records to CSV"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => void loadVerifications(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs disabled:opacity-50"
              title="Refresh queue"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-amber-500' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Bottom Search & Secondary Filters */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 pt-1 border-t border-slate-100">
          {/* Live Search Input */}
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by business, signatory, email, phone, city..."
              className="w-full h-8.5 rounded-lg border border-slate-200/90 bg-white pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] shadow-2xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Partner Type Filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full h-8.5 rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none transition focus:border-[#FFC107] shadow-2xs"
            >
              <option value="ALL">All Categories</option>
              {availablePartnerTypes.map((type) => (
                <option key={type} value={type}>
                  {formatPartnerTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="w-full h-8.5 rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none transition focus:border-[#FFC107] shadow-2xs"
            >
              <option value="applied_desc">Newest First</option>
              <option value="applied_asc">Oldest First (FIFO)</option>
              <option value="name_asc">Business Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 4. MAIN DATA VIEW (Table vs Bento Grid) ── */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-12 text-center shadow-2xs space-y-3">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
          <p className="text-xs font-bold text-slate-700">Loading pending verification dossiers...</p>
        </div>
      ) : filteredVerifications.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-12 text-center shadow-2xs space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <FileCheck2 className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No verification dossiers found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {search || statusFilter !== 'ALL' || typeFilter !== 'ALL'
              ? 'No dossiers match your current filter and search criteria. Try resetting filters.'
              : 'The verification queue is clean! No partner onboarding submissions are currently waiting for review.'}
          </p>
          {(search || statusFilter !== 'ALL' || typeFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
                setTypeFilter('ALL');
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* ── HIGH-DENSITY TABLE VIEW ── */
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/90 bg-slate-50/90">
                  <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Dealership / Signatory
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">Category</th>
                  <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Direct Contact
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Applied & Ageing
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">KYC Status</th>
                  <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Audit Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVerifications.map((partner) => {
                  const locationString = [partner.city, partner.state].filter(Boolean).join(', ');

                  return (
                    <tr
                      key={partner.id}
                      className="group transition-colors hover:bg-amber-50/20"
                    >
                      {/* Dealership / Signatory */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-700 font-black text-xs border border-amber-200/60 shadow-2xs">
                            {partner.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => void openDetail(partner.id)}
                              className="text-left font-bold text-slate-900 hover:text-amber-600 transition-colors truncate block max-w-xs"
                            >
                              {partner.name}
                            </button>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-semibold truncate">
                              {partner.ownerName && <span>{partner.ownerName}</span>}
                              {locationString && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span className="flex items-center gap-0.5">
                                    <MapPin className="h-3 w-3 text-slate-400" />
                                    {locationString}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-3 py-2.5">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
                          {formatPartnerTypeLabel(partner.partnerType)}
                        </span>
                      </td>

                      {/* Direct Contact */}
                      <td className="px-3 py-2.5">
                        <div className="space-y-0.5">
                          {partner.mobile ? (
                            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-800">
                              <span>{partner.mobile}</span>
                              <a
                                href={`tel:${partner.mobile}`}
                                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Call"
                              >
                                <Phone className="h-3 w-3" />
                              </a>
                              <a
                                href={`https://wa.me/91${partner.mobile.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50"
                                title="WhatsApp"
                              >
                                <MessageCircle className="h-3 w-3" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono">—</span>
                          )}
                          {partner.email && (
                            <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{partner.email}</p>
                          )}
                        </div>
                      </td>

                      {/* Applied & Ageing */}
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-slate-800">{formatDate(partner.appliedOn)}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {(() => {
                            const diffDays = Math.floor(
                              (new Date().getTime() - new Date(partner.appliedOn).getTime()) / (1000 * 60 * 60 * 24)
                            );
                            if (diffDays <= 0) return 'Applied today';
                            if (diffDays === 1) return '1 day ago';
                            return `${diffDays} days ago`;
                          })()}
                        </p>
                      </td>

                      {/* KYC Status */}
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            partner.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                              : partner.status === 'CHANGES_REQUESTED'
                              ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                              : partner.status === 'UNDER_REVIEW'
                              ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                              : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              partner.status === 'APPROVED'
                                ? 'bg-emerald-500'
                                : partner.status === 'CHANGES_REQUESTED'
                                ? 'bg-rose-500'
                                : partner.status === 'UNDER_REVIEW'
                                ? 'bg-amber-500'
                                : 'bg-blue-500 animate-pulse'
                            }`}
                          />
                          {statusLabel[partner.status] || partner.status}
                        </span>
                      </td>

                      {/* Audit Actions */}
                      <td className="px-3.5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void openDetail(partner.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#FFC107] px-2.5 py-1 text-xs font-black text-slate-950 hover:bg-[#E5AD06] shadow-2xs transition-colors"
                          >
                            <Eye className="h-3 w-3" />
                            <span>Review</span>
                          </button>

                          <PortalActionDropdown
                            items={[
                              {
                                label: 'Open Dossier',
                                icon: <Eye className="h-4 w-4" />,
                                onClick: () => {
                                  void openDetail(partner.id);
                                },
                              },
                              ...(canEditKyc
                                ? [
                                    {
                                      label: 'Edit KYC',
                                      icon: <Pencil className="h-4 w-4" />,
                                      onClick: () => {
                                        router.push(`${partnerEditBasePath}/${partner.id}/edit`);
                                      },
                                    },
                                  ]
                                : []),
                              ...(canManageKyc
                                ? [
                                    {
                                      label: 'Request Changes',
                                      icon: <AlertCircle className="h-4 w-4" />,
                                      variant: 'warning' as const,
                                      disabled: updatingId === partner.id,
                                      onClick: () => {
                                        setDecisionModal({
                                          id: partner.id,
                                          partnerName: partner.name,
                                          targetStatus: 'CHANGES_REQUESTED',
                                        });
                                      },
                                    },
                                    {
                                      label: 'Approve & Activate',
                                      icon: <CheckCircle2 className="h-4 w-4" />,
                                      variant: 'success' as const,
                                      disabled: updatingId === partner.id,
                                      onClick: () => {
                                        setDecisionModal({
                                          id: partner.id,
                                          partnerName: partner.name,
                                          targetStatus: 'APPROVED',
                                        });
                                      },
                                    },
                                    {
                                      label: 'Reject Dossier',
                                      icon: <XCircle className="h-4 w-4" />,
                                      variant: 'danger' as const,
                                      disabled: updatingId === partner.id,
                                      onClick: () => {
                                        setDecisionModal({
                                          id: partner.id,
                                          partnerName: partner.name,
                                          targetStatus: 'REJECTED',
                                        });
                                      },
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── BENTO CARDS VIEW ── */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredVerifications.map((partner) => {
            const locationString = [partner.city, partner.state].filter(Boolean).join(', ');

            return (
              <div
                key={partner.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition-all"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-700 font-black text-xs border border-amber-200/60 shadow-2xs">
                        {partner.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => void openDetail(partner.id)}
                          className="text-left font-bold text-slate-900 hover:text-amber-600 transition-colors truncate block"
                        >
                          {partner.name}
                        </button>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {formatPartnerTypeLabel(partner.partnerType)}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        partner.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : partner.status === 'CHANGES_REQUESTED'
                          ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                          : partner.status === 'UNDER_REVIEW'
                          ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                          : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                      }`}
                    >
                      {statusLabel[partner.status] || partner.status}
                    </span>
                  </div>

                  {/* Body Meta */}
                  <div className="mt-3 space-y-1.5 text-xs">
                    {partner.ownerName && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400 text-[11px]">Signatory:</span>
                        <span className="font-semibold text-slate-900">{partner.ownerName}</span>
                      </div>
                    )}
                    {locationString && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400 text-[11px]">Location:</span>
                        <span className="font-semibold text-slate-800 flex items-center gap-1 truncate max-w-[160px]">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          {locationString}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400 text-[11px]">Applied On:</span>
                      <span className="font-mono text-slate-800">{formatDate(partner.appliedOn)}</span>
                    </div>

                    {partner.mobile && (
                      <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                        <span className="font-mono text-xs font-bold text-slate-900">{partner.mobile}</span>
                        <div className="flex items-center gap-1">
                          <a
                            href={`tel:${partner.mobile}`}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100"
                            title="Call"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                          <a
                            href={`https://wa.me/91${partner.mobile.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                            title="WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void openDetail(partner.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] py-1.5 text-xs font-black text-slate-950 hover:bg-[#E5AD06] shadow-2xs"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Review Dossier</span>
                  </button>

                  {canEditKyc && (
                    <button
                      type="button"
                      onClick={() => router.push(`${partnerEditBasePath}/${partner.id}/edit`)}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50"
                      title="Edit KYC"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 5. REDESIGNED EXECUTIVE REVIEW DRAWER ── */}
      {selectedId ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/60 backdrop-blur-xs">
          <button type="button" className="absolute inset-0" onClick={closeDetail} aria-label="Close detail panel" />
          <div className="relative z-50 flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Sticky Drawer Header */}
            <div className="border-b border-slate-200/90 bg-white px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Partner KYC Dossier Audit
                    </span>
                    {selectedDetail && (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          selectedDetail.profile.kycStatus === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : selectedDetail.profile.kycStatus === 'CHANGES_REQUESTED'
                            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                            : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                        }`}
                      >
                        {statusLabel[selectedDetail.profile.kycStatus] || selectedDetail.profile.kycStatus}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-0.5 text-lg font-black text-slate-900 leading-tight truncate">
                    {selectedDetail?.profile.businessName || 'Loading Dossier...'}
                  </h2>
                  {selectedDetail && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span>Owner: <strong className="font-bold text-slate-900">{selectedDetail.profile.ownerName || selectedDetail.ownerName}</strong></span>
                      {selectedDetail.mobile && (
                        <span>Phone: <strong className="font-mono font-bold text-slate-900">{selectedDetail.mobile}</strong></span>
                      )}
                      <span>Type: <strong className="font-bold text-amber-800">{formatPartnerTypeLabel(selectedDetail.profile.partnerType)}</strong></span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 shadow-2xs"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Drawer Tabs */}
              <div className="mt-3.5 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                {[
                  { id: 'documents', label: 'KYC Documents Vault', count: selectedDetail?.documents.length },
                  { id: 'profile', label: 'Operating Profile' },
                  { id: 'agreements', label: 'Signed Agreements', count: selectedDetail?.agreements.length },
                  { id: 'history', label: 'Audit Trail', count: selectedDetail?.reviewHistory.length },
                ].map((tab) => {
                  const active = drawerTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDrawerTab(tab.id as typeof drawerTab)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        active
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.count !== undefined && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                            active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {detailLoading || !selectedDetail ? (
                <div className="py-20 text-center space-y-2">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
                  <p className="text-xs font-bold text-slate-700">Loading full partner verification package...</p>
                </div>
              ) : (
                <>
                  {/* ── TAB 1: KYC DOCUMENTS VAULT ── */}
                  {drawerTab === 'documents' && (
                    <div className="space-y-3">
                      {previewError && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                          {previewError}
                        </div>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        {selectedDetail.documents.map((doc) => {
                          const verificationFields =
                            doc.verificationResult && ['PAN_CARD', 'GST_CERTIFICATE'].includes(doc.documentType)
                              ? getKycVerificationFields(
                                  doc.documentType as KycVerificationDocumentType,
                                  doc.verificationResult
                                )
                              : [];

                          const docTitle = documentDisplayTitles[doc.documentType] || formatStatus(doc.documentType);

                          return (
                            <div
                              key={doc.id}
                              className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs space-y-3 flex flex-col justify-between"
                            >
                              <div>
                                {/* Header */}
                                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-900 leading-snug">{docTitle}</h4>
                                    <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                                      {doc.documentNumber || 'No number entered'}
                                    </p>
                                  </div>

                                  <div className="flex flex-col items-end gap-1">
                                    {doc.verificationStatus && (
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                          doc.verificationStatus === 'VERIFIED'
                                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                            : doc.verificationStatus === 'FAILED'
                                            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                            : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                                        }`}
                                      >
                                        KYC {doc.verificationStatus}
                                      </span>
                                    )}
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                        doc.fileUrl ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                                      }`}
                                    >
                                      {doc.fileUrl ? 'UPLOADED' : 'NOT UPLOADED'}
                                    </span>
                                  </div>
                                </div>

                                {/* Body Fields */}
                                <div className="mt-2 space-y-1 text-xs">
                                  {doc.nameOnDocument && (
                                    <div className="flex justify-between text-slate-600">
                                      <span className="text-slate-400 text-[11px]">Name on ID:</span>
                                      <span className="font-semibold text-slate-900">{doc.nameOnDocument}</span>
                                    </div>
                                  )}
                                  {doc.issueDate && (
                                    <div className="flex justify-between text-slate-600">
                                      <span className="text-slate-400 text-[11px]">Issue Date:</span>
                                      <span className="font-mono">{formatDate(doc.issueDate)}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Government Verified Result */}
                                {verificationFields.length > 0 && (
                                  <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs">
                                    <div className="flex items-center justify-between text-[10px] font-bold text-emerald-900 mb-1.5">
                                      <span>✓ Official Registry Verification</span>
                                      <span className="font-normal text-emerald-700">
                                        {doc.verificationCacheHit ? 'Cached Result' : 'Live API'}
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      {verificationFields.map((f) => (
                                        <div key={f.label} className="flex justify-between gap-2 text-[11px]">
                                          <span className="text-emerald-800 font-medium">{f.label}:</span>
                                          <span className="font-bold text-emerald-950 truncate max-w-[170px]">{f.value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {doc.verificationMessage && (
                                  <p className="mt-2 text-[11px] text-rose-600 font-medium bg-rose-50 p-2 rounded">
                                    {doc.verificationMessage}
                                  </p>
                                )}
                              </div>

                              {/* Document File Link */}
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[10px] font-mono text-slate-500 truncate max-w-[150px]">
                                  {doc.fileName || 'document_file'}
                                </span>
                                {doc.fileUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => void openSecurePreview(doc.fileUrl || '', doc.fileName)}
                                    disabled={previewLoading}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-2xs"
                                  >
                                    <Eye className="h-3 w-3 text-amber-500" />
                                    <span>Open Preview</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-400">No file</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── TAB 2: OPERATING PROFILE & COMMERCIALS ── */}
                  {drawerTab === 'profile' && (
                    <div className="space-y-3.5">
                      <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2 mb-3">
                          Entity Profile & Sourcing Details
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-2 text-xs">
                          <div>
                            <span className="text-slate-400 text-[11px]">Authorized Place:</span>
                            <p className="font-bold text-slate-900">{selectedDetail.profile.businessName || '-'}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[11px]">Industry Experience:</span>
                            <p className="font-bold text-slate-900">{selectedDetail.profile.businessExperience || '-'}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[11px]">Years in Business:</span>
                            <p className="font-bold text-slate-900">{selectedDetail.profile.yearsInBusiness || '-'}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[11px]">Team Size:</span>
                            <p className="font-bold text-slate-900">{selectedDetail.profile.teamSize || '-'}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[11px]">Expected Monthly Listings:</span>
                            <p className="font-bold text-slate-900">{selectedDetail.profile.expectedMonthlyListings || '-'}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[11px]">Preferred Contact:</span>
                            <p className="font-bold text-slate-900">{formatStatus(selectedDetail.profile.contactPreference)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2 mb-3">
                          Location & Digital Presence
                        </h4>
                        <div className="space-y-2.5 text-xs">
                          <div>
                            <span className="text-slate-400 text-[11px]">Physical Street Address:</span>
                            <p className="font-medium text-slate-800 mt-0.5 bg-slate-50 p-2 rounded border border-slate-100">
                              {selectedDetail.profile.businessAddress || '-'}
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <span className="text-slate-400 text-[11px]">State / City:</span>
                              <p className="font-bold text-slate-900">
                                {selectedDetail.state || '-'} / {selectedDetail.city || '-'}
                              </p>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[11px]">District / PIN:</span>
                              <p className="font-bold text-slate-900">
                                {selectedDetail.profile.district || '-'} / {selectedDetail.profile.pinCode || '-'}
                              </p>
                            </div>
                          </div>
                          {selectedDetail.profile.googleMapsLocation && (
                            <div>
                              <span className="text-slate-400 text-[11px]">Google Maps Link:</span>
                              <div className="mt-0.5 flex items-center gap-2">
                                <span className="font-mono text-slate-800 text-[11px] truncate flex-1">
                                  {selectedDetail.profile.googleMapsLocation}
                                </span>
                                <a
                                  href={selectedDetail.profile.googleMapsLocation}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  <span>Open Map</span>
                                </a>
                              </div>
                            </div>
                          )}
                          {selectedDetail.profile.websiteUrl && (
                            <div>
                              <span className="text-slate-400 text-[11px]">Official Website:</span>
                              <a
                                href={
                                  selectedDetail.profile.websiteUrl.startsWith('http')
                                    ? selectedDetail.profile.websiteUrl
                                    : `https://${selectedDetail.profile.websiteUrl}`
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-amber-700 hover:underline block mt-0.5"
                              >
                                {selectedDetail.profile.websiteUrl}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── TAB 3: SIGNED COMPLIANCE AGREEMENTS ── */}
                  {drawerTab === 'agreements' && (
                    <div className="space-y-3">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {selectedDetail.agreements.map((agreement) => (
                          <div
                            key={agreement.agreementType}
                            className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs"
                          >
                            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1.5">
                              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold font-mono text-amber-800">
                                {agreement.version || 'v1.0'}
                              </span>
                              <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                                <Check className="h-3 w-3 stroke-[3]" /> Accepted
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-slate-900 leading-snug">
                              {formatStatus(agreement.agreementType)}
                            </h4>
                            <p className="mt-1 text-[10px] text-slate-500 font-mono">
                              Signed on {formatDate(agreement.acceptedAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── TAB 4: AUDIT TRAIL & REVIEW HISTORY ── */}
                  {drawerTab === 'history' && (
                    <div className="space-y-2.5">
                      {selectedDetail.reviewHistory.length === 0 ? (
                        <p className="py-10 text-center text-xs text-slate-500">No review events logged yet.</p>
                      ) : (
                        selectedDetail.reviewHistory.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 leading-tight">
                                {getReviewActionLabel(
                                  item.action,
                                  selectedDetail.profile.partnerType,
                                  selectedDetail.profile.businessName || selectedDetail.profile.ownerName
                                )}
                              </span>
                              <span className="font-mono text-[10px] text-slate-500">
                                {formatDateTime(item.createdAt)}
                              </span>
                            </div>
                            {item.comment && (
                              <p className="text-[11px] font-mono text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 mt-1">
                                {item.comment}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Sticky Drawer Footer Action Controls */}
            {selectedDetail && (
              <div className="border-t border-slate-200/90 bg-white px-5 py-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>

                <div className="flex items-center gap-2">
                  {canEditKyc && (
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`${partnerEditBasePath}/${selectedDetail.id}/edit`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-2xs"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit KYC</span>
                    </button>
                  )}

                  {canManageKyc && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setDecisionModal({
                            id: selectedDetail.id,
                            partnerName: selectedDetail.profile.businessName || selectedDetail.ownerName || 'Partner',
                            targetStatus: 'CHANGES_REQUESTED',
                          });
                        }}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                      >
                        Request Changes
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDecisionModal({
                            id: selectedDetail.id,
                            partnerName: selectedDetail.profile.businessName || selectedDetail.ownerName || 'Partner',
                            targetStatus: 'REJECTED',
                          });
                        }}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                      >
                        Reject
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDecisionModal({
                            id: selectedDetail.id,
                            partnerName: selectedDetail.profile.businessName || selectedDetail.ownerName || 'Partner',
                            targetStatus: 'APPROVED',
                          });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-1.5 text-xs font-black text-slate-950 hover:bg-[#E5AD06] shadow-2xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Approve & Activate</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── 6. DECISION CONFIRMATION & REMARKS MODAL ── */}
      {decisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  decisionModal.targetStatus === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-700'
                    : decisionModal.targetStatus === 'CHANGES_REQUESTED'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {decisionModal.targetStatus === 'APPROVED' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : decisionModal.targetStatus === 'CHANGES_REQUESTED' ? (
                  <AlertCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {decisionModal.targetStatus === 'APPROVED'
                    ? 'Approve Partner & Activate Account'
                    : decisionModal.targetStatus === 'CHANGES_REQUESTED'
                    ? 'Request Corrections from Partner'
                    : 'Reject KYC Application'}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium truncate max-w-xs">{decisionModal.partnerName}</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                {decisionModal.targetStatus === 'APPROVED'
                  ? 'This will formally approve the partner dossier, grant access to post inventory, and activate partner privileges.'
                  : decisionModal.targetStatus === 'CHANGES_REQUESTED'
                  ? 'Enter specific notes for the partner explaining which documents or details require revision before approval.'
                  : 'Are you sure you want to reject this onboarding dossier? This will set account status to REJECTED.'}
              </p>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Compliance / Audit Remark (Optional)
                </label>
                <textarea
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder={
                    decisionModal.targetStatus === 'CHANGES_REQUESTED'
                      ? 'e.g. Please re-upload a clear copy of Company PAN and GST certificate.'
                      : 'Audit or sign-off comment for the review log...'
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setDecisionModal(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeStatusDecision()}
                disabled={updatingId !== null}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-black shadow-2xs transition-all disabled:opacity-50 ${
                  decisionModal.targetStatus === 'APPROVED'
                    ? 'bg-[#FFC107] text-slate-950 hover:bg-[#E5AD06]'
                    : decisionModal.targetStatus === 'CHANGES_REQUESTED'
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-rose-600 text-white hover:bg-rose-700'
                }`}
              >
                {updatingId ? 'Processing...' : 'Confirm Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. DOCUMENT LIGHTBOX MODAL ── */}
      {previewAsset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Secure Document Viewer
                </p>
                <h4 className="mt-0.5 text-sm font-bold text-slate-900 truncate max-w-md">{previewAsset.name}</h4>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewAsset.url}
                  download={previewAsset.name}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3 w-3" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="bg-slate-900 p-4 flex items-center justify-center min-h-[400px] max-h-[75vh] overflow-auto">
              {previewAsset.mimeType.startsWith('image/') ? (
                <Image
                  src={previewAsset.url}
                  alt={previewAsset.name}
                  width={1600}
                  height={1200}
                  unoptimized
                  className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
                />
              ) : previewAsset.mimeType === 'application/pdf' ? (
                <iframe src={previewAsset.url} title={previewAsset.name} className="h-[70vh] w-full rounded-lg bg-white" />
              ) : (
                <div className="p-8 text-center text-white space-y-3">
                  <FileText className="mx-auto h-12 w-12 text-slate-400" />
                  <p className="text-xs font-bold">Preview format not supported inline.</p>
                  <a
                    href={previewAsset.url}
                    download={previewAsset.name}
                    className="inline-flex rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#E5AD06]"
                  >
                    Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
