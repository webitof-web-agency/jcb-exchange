'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  LayoutGrid,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Table as TableIcon,
  X,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { useTranslation } from '@/hooks/useTranslation';
import PortalActionDropdown from '@/components/ui/PortalActionDropdown';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import VerificationDecisionModal from '@/components/verifications/VerificationDecisionModal';
import {
  formatDate,
  partnerEditBasePathFor,
  statusLabel,
  verificationsBasePath,
  type VerificationDecisionStatus,
  type VerificationItem,
} from '@/lib/verificationReview';

type ViewMode = 'table' | 'cards';
type SortField = 'applied_desc' | 'applied_asc' | 'name_asc';

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

  const partnerEditBasePath = partnerEditBasePathFor(pathname);
  const reviewBasePath = verificationsBasePath(pathname);

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

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState<{
    id: string;
    partnerName: string;
    targetStatus: VerificationDecisionStatus;
  } | null>(null);

  // Resolves to an error message instead of throwing so callers only set state from the settled promise.
  const fetchQueue = useCallback(
    () =>
      api
        .get<{ verifications: VerificationItem[] }>('/superadmin/verifications')
        .then((response) => ({ verifications: response.data.verifications || [], error: '' }))
        .catch((err) => ({
          verifications: null,
          error: (axios.isAxiosError(err) && err.response?.data?.error)
            || t('verifications.loadQueueFailed', 'Unable to load verification queue.'),
        })),
    [t],
  );

  const applyQueue = useCallback((result: { verifications: VerificationItem[] | null; error: string }) => {
    if (result.verifications) setVerifications(result.verifications);
    setError(result.error);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const loadVerifications = (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    void fetchQueue().then(applyQueue);
  };

  useEffect(() => {
    let active = true;
    void fetchQueue().then((result) => {
      if (active) applyQueue(result);
    });
    return () => {
      active = false;
    };
  }, [fetchQueue, applyQueue]);

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

  const openReview = (id: string) => {
    router.push(`${reviewBasePath}/${id}`);
  };

  const handleDecided = (id: string, targetStatus: VerificationDecisionStatus) => {
    setVerifications((current) => current.filter((partner) => partner.id !== id));
    setDecisionModal(null);
    setSuccess(`Partner verification moved to ${targetStatus.replaceAll('_', ' ').toLowerCase()} successfully.`);
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
                              onClick={() => openReview(partner.id)}
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
                            onClick={() => openReview(partner.id)}
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
                                  openReview(partner.id);
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
                          onClick={() => openReview(partner.id)}
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
                    onClick={() => openReview(partner.id)}
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

      {decisionModal && (
        <VerificationDecisionModal
          partnerId={decisionModal.id}
          partnerName={decisionModal.partnerName}
          targetStatus={decisionModal.targetStatus}
          onClose={() => setDecisionModal(null)}
          onDecided={(targetStatus) => handleDecided(decisionModal.id, targetStatus)}
        />
      )}
    </div>
  );
}
