/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Crown,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Globe,
  Layers,
  LayoutGrid,
  Mail,
  MapPin,
  MessageCircle,
  MoreVertical,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table as TableIcon,
  Trash2,
  User,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { generateAdminVisitorDetailPath } from '@/lib/routePaths';
import { buildPaginationItems } from '@/lib/paginationUtils';

// Types
export type VisitorRecord = {
  id: string;
  name: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  role: string;
  status: string;
  authProvider: string;
  city: string | null;
  state: string | null;
  isPrimeCustomer?: boolean;
  customerCategory?: string | null;
  primeSubscriptionExpiresAt?: string | null;
  primeSubscriptionStatus?: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  } | null;
};

type VisitorsResponse = {
  visitors: VisitorRecord[];
};

type ViewMode = 'table' | 'cards';
type SortField = 'newest' | 'oldest' | 'name_asc' | 'city_asc';

const emptyResponse: VisitorsResponse = {
  visitors: [],
};

const initialEditForm = {
  name: '',
  email: '',
  mobile: '',
  city: '',
  state: '',
};

// Safe formatting helpers
const formatDate = (dateString?: string | null) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatTimeAgo = (dateString?: string | null) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`;
  return formatDate(dateString);
};

const formatLabel = (value?: string | null) =>
  value
    ? value
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : 'Not set';

const getInvoiceNumber = (id: string) =>
  `INV-${id.replace(/-/g, '').slice(0, 10).toUpperCase()}`;

const getVisitorName = (visitor: VisitorRecord) =>
  visitor.fullName || visitor.name || visitor.email || 'Unnamed visitor';

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'V';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getAvatarGradient = (str: string) => {
  const gradients = [
    'from-amber-400 to-amber-600 text-slate-950',
    'from-blue-500 to-indigo-600 text-white',
    'from-emerald-500 to-teal-600 text-white',
    'from-purple-500 to-indigo-600 text-white',
    'from-rose-500 to-orange-500 text-white',
    'from-cyan-500 to-blue-600 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
};

const cleanPhoneForWa = (phone?: string | null) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10 ? `91${cleaned}` : cleaned;
};

const getSourceMeta = (visitor: VisitorRecord) => {
  if (visitor.createdBy?.role === 'SUPER_ADMIN' || visitor.createdBy?.role === 'ADMIN') {
    return {
      label: `Admin Added`,
      detail: formatLabel(visitor.createdBy.role),
      badge: 'bg-purple-50 text-purple-700 border-purple-200/80',
      icon: ShieldCheck,
    };
  }
  if (visitor.authProvider === 'GOOGLE') {
    return {
      label: 'Google Sign-in',
      detail: 'OAuth 2.0',
      badge: 'bg-blue-50 text-blue-700 border-blue-200/80',
      icon: Globe,
    };
  }
  if (visitor.authProvider === 'PHONE') {
    return {
      label: 'Mobile OTP',
      detail: 'Verified SMS',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      icon: Phone,
    };
  }
  return {
    label: 'Self Registered',
    detail: 'Direct Portal',
    badge: 'bg-slate-50 text-slate-700 border-slate-200/80',
    icon: User,
  };
};

export default function VisitorDirectoryPage({
  detailBaseHref = '/superadmin/visitors',
}: {
  detailBaseHref?: string;
}) {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserPermissions = currentUser?.permissions || [];
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // Permissions
  const canViewVisitors = isSuperAdmin || hasAnyPermission(currentUserPermissions, ['visitors.read']);
  const canUpdateVisitors = isSuperAdmin || hasAnyPermission(currentUserPermissions, ['visitors.update']);
  const canChangeVisitorStatus =
    isSuperAdmin || hasAnyPermission(currentUserPermissions, ['visitors.change_status']);
  const canDeleteVisitors = isSuperAdmin || hasAnyPermission(currentUserPermissions, ['visitors.delete']);

  // Data & Loading States
  const [data, setData] = useState<VisitorsResponse>(emptyResponse);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'ALL' | 'ACTIVE' | 'PRIME' | 'INACTIVE'>('ALL');
  const [membershipFilter, setMembershipFilter] = useState<'ALL' | 'PRIME' | 'STANDARD'>('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [sortField, setSortField] = useState<SortField>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals & Action States
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editVisitor, setEditVisitor] = useState<VisitorRecord | null>(null);
  const [editForm, setEditForm] = useState(initialEditForm);
  const [deleteVisitorTarget, setDeleteVisitorTarget] = useState<VisitorRecord | null>(null);
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.action-dropdown-container')) return;
      setOpenActionDropdownId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Fetch visitors
  const loadVisitors = useCallback(
    async (isManualRefresh = false) => {
      if (!canViewVisitors) {
        setLoading(false);
        setError('You do not have permission to view visitors.');
        return;
      }

      try {
        if (isManualRefresh) setRefreshing(true);
        else setLoading(true);
        setError('');

        const response = await api.get<VisitorsResponse>('/superadmin/visitors?compact=true');
        const loaded = response.data?.visitors || [];
        setData({ visitors: loaded });
        setLastSyncedAt(new Date());

        if (isManualRefresh) {
          toast.success(`Refreshed ${loaded.length} customer records`);
        }
      } catch (loadError) {
        setError('Unable to load visitor directory. Please check your network connection.');
        console.error('Failed to load visitors:', loadError);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canViewVisitors]
  );

  useEffect(() => {
    void loadVisitors();
  }, [loadVisitors]);

  // Copy helper
  const copyText = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Navigate to visitor details dossier
  const openVisitorDetails = (visitor: VisitorRecord) => {
    router.push(
      generateAdminVisitorDetailPath(detailBaseHref, {
        id: visitor.id,
        fullName: visitor.fullName,
        name: visitor.name,
        city: visitor.city,
      })
    );
  };

  // Distinct locations for filter dropdown
  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    data.visitors.forEach((v) => {
      const loc = [v.city, v.state].filter(Boolean).join(', ').trim();
      if (loc) set.add(loc);
    });
    return Array.from(set).sort();
  }, [data.visitors]);

  // Executive Metric Ribbon Calculations
  const metrics = useMemo(() => {
    const list = data.visitors;
    const total = list.length;
    const active = list.filter((v) => v.status === 'ACTIVE').length;
    const inactive = list.filter((v) => v.status === 'INACTIVE').length;
    const prime = list.filter((v) => Boolean(v.isPrimeCustomer)).length;
    const selfRegistered = list.filter(
      (v) => v.createdBy?.role !== 'SUPER_ADMIN' && v.createdBy?.role !== 'ADMIN'
    ).length;
    const adminCreated = total - selfRegistered;
    const uniqueCities = new Set(list.map((v) => v.city?.trim()).filter(Boolean)).size;

    return {
      total,
      active,
      inactive,
      prime,
      selfRegistered,
      adminCreated,
      uniqueCities,
      activeRate: total > 0 ? Math.round((active / total) * 100) : 0,
      primeRate: total > 0 ? Math.round((prime / total) * 100) : 0,
    };
  }, [data.visitors]);

  // Filtered & Sorted Visitors
  const filteredVisitors = useMemo(() => {
    const query = search.trim().toLowerCase();

    return data.visitors
      .filter((visitor) => {
        // Status Tab Filter
        if (statusTab === 'ACTIVE' && visitor.status !== 'ACTIVE') return false;
        if (statusTab === 'INACTIVE' && visitor.status !== 'INACTIVE') return false;
        if (statusTab === 'PRIME' && !visitor.isPrimeCustomer) return false;

        // Membership Filter
        if (membershipFilter === 'PRIME' && !visitor.isPrimeCustomer) return false;
        if (membershipFilter === 'STANDARD' && visitor.isPrimeCustomer) return false;

        // Location Filter
        if (locationFilter !== 'ALL') {
          const loc = [visitor.city, visitor.state].filter(Boolean).join(', ').trim();
          if (loc !== locationFilter) return false;
        }

        // Source Filter
        if (sourceFilter !== 'ALL') {
          if (sourceFilter === 'GOOGLE' && visitor.authProvider !== 'GOOGLE') return false;
          if (sourceFilter === 'PHONE' && visitor.authProvider !== 'PHONE') return false;
          if (
            sourceFilter === 'ADMIN' &&
            visitor.createdBy?.role !== 'SUPER_ADMIN' &&
            visitor.createdBy?.role !== 'ADMIN'
          )
            return false;
          if (
            sourceFilter === 'SELF' &&
            (visitor.createdBy?.role === 'SUPER_ADMIN' || visitor.createdBy?.role === 'ADMIN')
          )
            return false;
        }

        // Full-Text Search
        if (query) {
          const invNo = getInvoiceNumber(visitor.id).toLowerCase();
          const haystack = [
            getVisitorName(visitor),
            visitor.email,
            visitor.mobile,
            visitor.city,
            visitor.state,
            invNo,
            visitor.authProvider,
            visitor.createdBy?.name,
            visitor.createdBy?.email,
            visitor.isPrimeCustomer ? 'prime customer' : '',
            formatLabel(visitor.role),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          if (!haystack.includes(query)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'newest') {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        if (sortField === 'oldest') {
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }
        if (sortField === 'name_asc') {
          return getVisitorName(a).localeCompare(getVisitorName(b));
        }
        if (sortField === 'city_asc') {
          return (a.city || '').localeCompare(b.city || '');
        }
        return 0;
      });
  }, [data.visitors, search, statusTab, membershipFilter, locationFilter, sourceFilter, sortField]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusTab, membershipFilter, locationFilter, sourceFilter, sortField]);

  // Paginated Slice
  const totalVisitors = filteredVisitors.length;
  const totalPages = pageSize === -1 ? 1 : Math.ceil(totalVisitors / pageSize) || 1;
  const currentPageForView = Math.min(currentPage, totalPages);

  const paginatedVisitors = useMemo(() => {
    if (pageSize === -1) return filteredVisitors;
    const startIndex = (currentPageForView - 1) * pageSize;
    return filteredVisitors.slice(startIndex, startIndex + pageSize);
  }, [filteredVisitors, currentPageForView, pageSize]);

  const paginationItems = useMemo(
    () => buildPaginationItems(currentPageForView, totalPages),
    [currentPageForView, totalPages]
  );

  const startItemIndex = totalVisitors === 0 ? 0 : (currentPageForView - 1) * pageSize + 1;
  const endItemIndex = pageSize === -1 ? totalVisitors : Math.min(currentPageForView * pageSize, totalVisitors);

  // Status Toggle
  const handleStatusToggle = async (visitor: VisitorRecord) => {
    if (!canChangeVisitorStatus) {
      toast.error('You do not have permission to change visitor status.');
      return;
    }

    const nextStatus = visitor.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    try {
      setUpdatingId(visitor.id);
      const response = await api.patch<{ user: VisitorRecord }>(
        `/superadmin/users/${visitor.id}/status`,
        { status: nextStatus }
      );
      setData((current) => ({
        visitors: current.visitors.map((item) =>
          item.id === visitor.id ? response.data.user : item
        ),
      }));
      toast.success(
        `${getVisitorName(visitor)} is now ${nextStatus === 'ACTIVE' ? 'Active' : 'Inactive'}`
      );
    } catch (statusError) {
      const message = axios.isAxiosError(statusError)
        ? statusError.response?.data?.error || 'Unable to update status.'
        : 'Unable to update status.';
      toast.error(message);
    } finally {
      setUpdatingId(null);
    }
  };

  // Edit Visitor Handlers
  const openEditModal = (visitor: VisitorRecord) => {
    if (!canUpdateVisitors) {
      toast.error('You do not have permission to edit visitors.');
      return;
    }
    setEditVisitor(visitor);
    setEditForm({
      name: visitor.fullName || visitor.name || '',
      email: visitor.email || '',
      mobile: visitor.mobile || '',
      city: visitor.city || '',
      state: visitor.state || '',
    });
  };

  const closeEditModal = () => {
    setEditVisitor(null);
    setEditForm(initialEditForm);
  };

  const handleEditSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editVisitor || !canUpdateVisitors) return;

    try {
      setUpdatingId(editVisitor.id);
      const response = await api.patch<{ user: VisitorRecord }>(
        `/superadmin/users/${editVisitor.id}`,
        {
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          mobile: editForm.mobile ? editForm.mobile.trim() : undefined,
          city: editForm.city ? editForm.city.trim() : undefined,
          state: editForm.state ? editForm.state.trim() : undefined,
        }
      );

      setData((current) => ({
        visitors: current.visitors.map((item) =>
          item.id === editVisitor.id ? response.data.user : item
        ),
      }));
      toast.success(`Updated details for ${editForm.name}`);
      closeEditModal();
    } catch (editError) {
      const message = axios.isAxiosError(editError)
        ? editError.response?.data?.error || 'Unable to update visitor.'
        : 'Unable to update visitor.';
      toast.error(message);
    } finally {
      setUpdatingId(null);
    }
  };

  // Delete Visitor Confirmation
  const confirmDeleteVisitor = async () => {
    if (!deleteVisitorTarget || !canDeleteVisitors) return;

    try {
      setUpdatingId(deleteVisitorTarget.id);
      await api.delete(`/superadmin/users/${deleteVisitorTarget.id}`);
      setData((current) => ({
        visitors: current.visitors.filter((item) => item.id !== deleteVisitorTarget.id),
      }));
      toast.success(`Visitor ${getVisitorName(deleteVisitorTarget)} removed successfully`);
      setDeleteVisitorTarget(null);
    } catch (deleteError) {
      const message = axios.isAxiosError(deleteError)
        ? deleteError.response?.data?.error || 'Unable to delete visitor.'
        : 'Unable to delete visitor.';
      toast.error(message);
      setDeleteVisitorTarget(null);
    } finally {
      setUpdatingId(null);
    }
  };

  // Export to CSV
  const exportVisitorsToCsv = () => {
    if (!filteredVisitors.length) {
      toast.info('No visitors to export in the current view.');
      return;
    }

    const headers = [
      'Customer ID / Invoice',
      'Full Name',
      'Mobile',
      'Email',
      'City',
      'State',
      'Status',
      'Membership',
      'Prime Expiry',
      'Source / Auth Provider',
      'Created By',
      'Registered Date',
    ];

    const rows = filteredVisitors.map((v) => [
      `"${getInvoiceNumber(v.id)}"`,
      `"${getVisitorName(v).replace(/"/g, '""')}"`,
      `"${v.mobile || ''}"`,
      `"${(v.email || '').replace(/"/g, '""')}"`,
      `"${(v.city || '').replace(/"/g, '""')}"`,
      `"${(v.state || '').replace(/"/g, '""')}"`,
      `"${v.status}"`,
      v.isPrimeCustomer ? 'Prime Customer' : 'Standard Visitor',
      `"${v.primeSubscriptionExpiresAt ? formatDate(v.primeSubscriptionExpiresAt) : ''}"`,
      `"${getSourceMeta(v).label}"`,
      `"${v.createdBy?.name || ''}"`,
      `"${v.createdAt ? new Date(v.createdAt).toISOString() : ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `jcb-visitors-directory-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredVisitors.length} visitors to CSV`);
  };

  // Check if filters are active
  const hasActiveFilters =
    search.trim() !== '' ||
    statusTab !== 'ALL' ||
    membershipFilter !== 'ALL' ||
    locationFilter !== 'ALL' ||
    sourceFilter !== 'ALL';

  const resetAllFilters = () => {
    setSearch('');
    setStatusTab('ALL');
    setMembershipFilter('ALL');
    setLocationFilter('ALL');
    setSourceFilter('ALL');
    setSortField('newest');
  };

  return (
    <div className="space-y-3.5 pb-10">
      {/* 1. EXECUTIVE HEADER */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs sm:p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900 border border-amber-300">
                <Users className="h-3 w-3 text-amber-600" />
                Customer CRM
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-semibold text-slate-500">Audience Intelligence</span>
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                Visitors & Customer Directory
              </h1>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                {data.visitors.length} Registered
              </span>
              {metrics.prime > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                  <Crown className="h-3 w-3 fill-amber-500 text-amber-600" />
                  {metrics.prime} Prime Buyers
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Centralized register of verified machinery buyers, equipment search visitors, and registered platform customers.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Dense Table View"
              >
                <TableIcon className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'cards'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Card Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Cards
              </button>
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={exportVisitorsToCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              title="Export visible customers to CSV"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Export CSV
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadVisitors(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-[#E5AD06] transition-colors shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Sync Info Strip */}
        {lastSyncedAt && (
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last updated: {formatTimeAgo(lastSyncedAt.toISOString())}
            </span>
            <span>
              {metrics.uniqueCities} Cities Represented · {metrics.activeRate}% Active Rate
            </span>
          </div>
        )}
      </div>

      {/* 2. EXECUTIVE 5-CARD KPI RIBBON */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total Registered */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total Visitors
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              <Users className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-900">{metrics.total}</span>
            <span className="text-[11px] font-semibold text-slate-500">accounts</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 truncate">
            Across {metrics.uniqueCities} Indian cities
          </p>
        </div>

        {/* Active Accounts */}
        <div
          onClick={() => setStatusTab(statusTab === 'ACTIVE' ? 'ALL' : 'ACTIVE')}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
            statusTab === 'ACTIVE'
              ? 'border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-400/20'
              : 'border-slate-200/90 bg-white hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Active Accounts
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
              <UserCheck className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-emerald-800">{metrics.active}</span>
            <span className="text-[11px] font-bold text-emerald-700">
              {metrics.activeRate}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-emerald-700 truncate">Verified active visitors</p>
        </div>

        {/* Prime Customers */}
        <div
          onClick={() => setStatusTab(statusTab === 'PRIME' ? 'ALL' : 'PRIME')}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
            statusTab === 'PRIME'
              ? 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-400/20'
              : 'border-slate-200/90 bg-white hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
              Prime Pass Buyers
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-800">
              <Crown className="h-3.5 w-3.5 fill-amber-500 text-amber-600" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-amber-900">{metrics.prime}</span>
            <span className="text-[11px] font-bold text-amber-700">
              {metrics.primeRate}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-amber-800 truncate">VIP priority buyers</p>
        </div>

        {/* Digital Self-Signups */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
              Self-Registered
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-700">
              <Globe className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-blue-700">{metrics.selfRegistered}</span>
            <span className="text-[11px] font-semibold text-blue-600">online</span>
          </div>
          <p className="mt-1 text-[11px] text-blue-600 truncate">Google & OTP registrations</p>
        </div>

        {/* Inactive / Suspended */}
        <div
          onClick={() => setStatusTab(statusTab === 'INACTIVE' ? 'ALL' : 'INACTIVE')}
          className={`col-span-2 sm:col-span-1 cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
            statusTab === 'INACTIVE'
              ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-400/20'
              : 'border-slate-200/90 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Inactive
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              <UserX className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-800">{metrics.inactive}</span>
            <span className="text-[11px] font-semibold text-slate-500">paused</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 truncate">
            {metrics.adminCreated} staff created
          </p>
        </div>
      </div>

      {/* 3. MULTI-FILTER TOOLBAR */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
        <div className="flex flex-col gap-3">
          {/* Top Row: Quick Status Tabs + Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            {/* Quick Status Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatusTab('ALL')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'ALL'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Visitors
                <span className="rounded-full bg-black/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusTab('ACTIVE')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'ACTIVE'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                Active
                <span className="rounded-full bg-emerald-950/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.active}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusTab('PRIME')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'PRIME'
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                }`}
              >
                <Crown className="h-3 w-3 fill-amber-500 text-amber-600" />
                Prime Buyers
                <span className="rounded-full bg-amber-950/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.prime}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusTab('INACTIVE')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'INACTIVE'
                    ? 'bg-slate-700 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Inactive
                <span className="rounded-full bg-slate-900/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.inactive}
                </span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, city, invoice..."
                className="h-8.5 w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-8.5 pr-8 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Bottom Row: Location + Membership + Source + Sort */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Location Filter */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Location:
                </span>
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="h-7.5 max-w-[170px] truncate rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="ALL">All Locations</option>
                  {uniqueLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Membership Filter */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Membership:
                </span>
                <select
                  value={membershipFilter}
                  onChange={(e) => setMembershipFilter(e.target.value as any)}
                  className="h-7.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="ALL">All Customer Types</option>
                  <option value="PRIME">Prime Members Only</option>
                  <option value="STANDARD">Standard Visitors</option>
                </select>
              </div>

              {/* Source Filter */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Source:
                </span>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="h-7.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="ALL">All Sign-in Sources</option>
                  <option value="GOOGLE">Google Sign-in</option>
                  <option value="PHONE">Mobile OTP</option>
                  <option value="SELF">Self Registered</option>
                  <option value="ADMIN">Staff Created</option>
                </select>
              </div>

              {/* Sort By */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Sort:
                </span>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="h-7.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="city_asc">City (A-Z)</option>
                </select>
              </div>

              {/* Reset Filters */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Reset
                </button>
              )}
            </div>

            {/* Results Count & Page Sizer */}
            <div className="flex items-center gap-2 text-slate-500 text-[11px]">
              <span>
                Showing <strong className="text-slate-900">{filteredVisitors.length}</strong> of{' '}
                {data.visitors.length} customers
              </span>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-6 rounded border border-slate-200 bg-slate-50 px-1 text-[11px] font-bold text-slate-700 outline-none"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={-1}>All</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MAIN DIRECTORY CONTENT */}
      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-slate-200/90 bg-white p-12">
          <BrandLoader size="sm" text="Loading customer directory..." />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-8 text-center shadow-2xs">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
          <h3 className="mt-2 text-sm font-bold text-rose-900">Failed to load directory</h3>
          <p className="mt-1 text-xs text-rose-700 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={() => void loadVisitors()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 shadow-2xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try Again
          </button>
        </div>
      ) : filteredVisitors.length === 0 ? (
        <div className="rounded-xl border border-slate-200/90 bg-white p-12 text-center shadow-2xs">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-800">No visitors found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Try relaxing your search terms or clearing status and location filters.'
              : 'No customer accounts registered yet.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shadow-2xs"
            >
              <RefreshCw className="h-3 w-3" />
              Reset All Filters
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* ================= HIGH-DENSITY TABLE VIEW ================= */
        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200/90 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 pl-4 pr-3">Customer & Identity</th>
                  <th className="py-2.5 px-3">Contact Information</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Customer Ref / ID</th>
                  <th className="py-2.5 px-3">Registration & Source</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Joined Date</th>
                  <th className="py-2.5 pr-4 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {paginatedVisitors.map((visitor) => {
                  const visitorName = getVisitorName(visitor);
                  const initials = getInitials(visitorName);
                  const avatarGradient = getAvatarGradient(visitor.id || visitorName);
                  const invoiceNo = getInvoiceNumber(visitor.id);
                  const isInvCopied = copiedId === `inv-${visitor.id}`;
                  const isPhoneCopied = copiedId === `phone-${visitor.id}`;
                  const sourceMeta = getSourceMeta(visitor);
                  const isActive = visitor.status === 'ACTIVE';
                  const isUpdatingThis = updatingId === visitor.id;

                  return (
                    <tr
                      key={visitor.id}
                      onClick={() => openVisitorDetails(visitor)}
                      className="group cursor-pointer transition-colors hover:bg-amber-50/30"
                    >
                      {/* 1. Customer & Identity */}
                      <td className="py-2.5 pl-4 pr-3 align-top">
                        <div className="flex items-start gap-2.5">
                          {/* Avatar with Prime Crown */}
                          <div className="relative shrink-0">
                            <div
                              className={`flex h-8.5 w-8.5 items-center justify-center rounded-xl bg-gradient-to-br font-black text-xs shadow-2xs ${avatarGradient}`}
                            >
                              {initials}
                            </div>
                            {visitor.isPrimeCustomer && (
                              <span
                                className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 border border-white text-slate-950 shadow-2xs"
                                title="Prime Customer"
                              >
                                <Crown className="h-2.5 w-2.5 fill-slate-950" />
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 group-hover:text-amber-900 transition-colors">
                                {visitorName}
                              </span>
                              {visitor.isPrimeCustomer ? (
                                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                                  <Crown className="h-2.5 w-2.5 fill-amber-500 text-amber-600" />
                                  Prime Pass
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                  {formatLabel(visitor.role)}
                                </span>
                              )}
                            </div>

                            {visitor.primeSubscriptionExpiresAt && (
                              <span className="text-[10px] text-amber-800 font-semibold flex items-center gap-1 mt-0.5">
                                <Clock className="h-2.5 w-2.5 text-amber-600" />
                                Expires: {formatDate(visitor.primeSubscriptionExpiresAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Contact Information */}
                      <td className="py-2.5 px-3 align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                          {visitor.mobile ? (
                            <div className="flex items-center gap-1.5">
                              <a
                                href={`tel:${visitor.mobile}`}
                                className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-800 hover:bg-slate-200"
                                title="Call Mobile"
                              >
                                <Phone className="h-3 w-3 text-slate-500" />
                                <span>{visitor.mobile}</span>
                              </a>

                              {/* WhatsApp Direct */}
                              <a
                                href={`https://wa.me/${cleanPhoneForWa(visitor.mobile)}?text=${encodeURIComponent(
                                  `Hello ${visitorName}, contacting you from JCB Exchange regarding your machinery requirements.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80"
                                title="Chat on WhatsApp"
                              >
                                <MessageCircle className="h-3 w-3 text-emerald-600" />
                                <span>WA</span>
                              </a>

                              {/* Copy Phone */}
                              <button
                                type="button"
                                onClick={() => copyText(visitor.mobile || '', `phone-${visitor.id}`)}
                                className="text-slate-400 hover:text-slate-700 p-0.5"
                                title="Copy mobile number"
                              >
                                {isPhoneCopied ? (
                                  <Check className="h-2.5 w-2.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-2.5 w-2.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">No mobile</span>
                          )}

                          {visitor.email ? (
                            <div className="text-[11px] text-slate-500 font-medium truncate max-w-[190px] flex items-center gap-1">
                              <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                              <span title={visitor.email}>{visitor.email}</span>
                            </div>
                          ) : null}
                        </div>
                      </td>

                      {/* 3. Location */}
                      <td className="py-2.5 px-3 align-top">
                        {visitor.city || visitor.state ? (
                          <div className="flex items-center gap-1 text-slate-700">
                            <MapPin className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span className="font-semibold truncate max-w-[140px]">
                              {[visitor.city, visitor.state].filter(Boolean).join(', ')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Location unassigned</span>
                        )}
                      </td>

                      {/* 4. Customer Ref / Invoice ID */}
                      <td className="py-2.5 px-3 align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 select-all shadow-2xs">
                          <span>{invoiceNo}</span>
                          <button
                            type="button"
                            onClick={() => copyText(invoiceNo, `inv-${visitor.id}`)}
                            className="ml-1 text-slate-400 hover:text-slate-800"
                            title="Copy Ref #"
                          >
                            {isInvCopied ? (
                              <Check className="h-2.5 w-2.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-2.5 w-2.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 5. Registration & Source */}
                      <td className="py-2.5 px-3 align-top">
                        <div>
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold border ${sourceMeta.badge}`}
                          >
                            <sourceMeta.icon className="h-2.5 w-2.5" />
                            {sourceMeta.label}
                          </span>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {sourceMeta.detail}
                          </div>
                        </div>
                      </td>

                      {/* 6. Status & Quick Toggle */}
                      <td className="py-2.5 px-3 align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {canChangeVisitorStatus ? (
                            <button
                              type="button"
                              disabled={isUpdatingThis}
                              onClick={() => void handleStatusToggle(visitor)}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold border transition-colors shadow-2xs ${
                                isActive
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                              }`}
                              title="Click to toggle status"
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                }`}
                              />
                              {isActive ? 'Active' : 'Inactive'}
                            </button>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold border ${
                                isActive
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-300'
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                }`}
                              />
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 7. Joined Date */}
                      <td className="py-2.5 px-3 align-top">
                        <div>
                          <div className="font-medium text-slate-700">
                            {formatDate(visitor.createdAt)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {formatTimeAgo(visitor.createdAt)}
                          </div>
                        </div>
                      </td>

                      {/* 8. Actions Menu */}
                      <td
                        className="py-2.5 pr-4 pl-3 align-top text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {/* Quick Edit */}
                          {canUpdateVisitors && (
                            <button
                              type="button"
                              onClick={() => openEditModal(visitor)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Edit Customer Details"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Open Dossier */}
                          <button
                            type="button"
                            onClick={() => openVisitorDetails(visitor)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="View Visitor Profile"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>

                          {/* 3-Dots Dropdown */}
                          <div className="relative action-dropdown-container">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenActionDropdownId(
                                  openActionDropdownId === visitor.id ? null : visitor.id
                                )
                              }
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="More Options"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>

                            {openActionDropdownId === visitor.id && (
                              <div className="absolute right-0 z-50 mt-1 w-44 origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionDropdownId(null);
                                    openVisitorDetails(visitor);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                  <Eye className="h-3.5 w-3.5 text-slate-400" />
                                  View Profile
                                </button>

                                {canUpdateVisitors && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionDropdownId(null);
                                      openEditModal(visitor);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-slate-400" />
                                    Edit Details
                                  </button>
                                )}

                                {canChangeVisitorStatus && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionDropdownId(null);
                                      void handleStatusToggle(visitor);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                  >
                                    {isActive ? (
                                      <UserX className="h-3.5 w-3.5 text-amber-600" />
                                    ) : (
                                      <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                                    )}
                                    {isActive ? 'Mark Inactive' : 'Mark Active'}
                                  </button>
                                )}

                                {canDeleteVisitors && (
                                  <>
                                    <div className="my-1 border-t border-slate-100" />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionDropdownId(null);
                                        setDeleteVisitorTarget(visitor);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Delete Record
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200/90 bg-slate-50/70 px-4 py-3 text-xs">
            <span className="text-slate-500">
              Showing <strong className="text-slate-900">{startItemIndex}</strong> to{' '}
              <strong className="text-slate-900">{endItemIndex}</strong> of{' '}
              <strong className="text-slate-900">{totalVisitors}</strong> matching customers
            </span>

            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPageForView <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 shadow-2xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5 inline mr-0.5" />
                  Previous
                </button>

                <div className="flex items-center gap-1 px-1">
                  {paginationItems.map((item, index) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setCurrentPage(item)}
                        className={`h-7 w-7 rounded-md text-xs font-bold transition ${
                          currentPageForView === item
                            ? 'bg-[#FFC107] text-slate-950 shadow-2xs'
                            : 'text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {item}
                      </button>
                    ) : (
                      <span key={`ellipsis-${index}`} className="px-1 text-xs font-bold text-slate-400">
                        ...
                      </span>
                    )
                  )}
                </div>

                <button
                  type="button"
                  disabled={currentPageForView >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 shadow-2xs"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 inline ml-0.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================= CARDS GRID VIEW ================= */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {paginatedVisitors.map((visitor) => {
            const visitorName = getVisitorName(visitor);
            const initials = getInitials(visitorName);
            const avatarGradient = getAvatarGradient(visitor.id || visitorName);
            const invoiceNo = getInvoiceNumber(visitor.id);
            const isActive = visitor.status === 'ACTIVE';
            const sourceMeta = getSourceMeta(visitor);

            return (
              <div
                key={visitor.id}
                onClick={() => openVisitorDetails(visitor)}
                className="group flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-shadow hover:shadow-xs cursor-pointer"
              >
                <div>
                  {/* Card Header: Avatar + Name + Prime Crown + Status */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br font-black text-sm shadow-2xs ${avatarGradient}`}
                        >
                          {initials}
                        </div>
                        {visitor.isPrimeCustomer && (
                          <span
                            className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-400 border border-white text-slate-950 shadow-2xs"
                            title="Prime Customer"
                          >
                            <Crown className="h-3 w-3 fill-slate-950" />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 group-hover:text-amber-900 transition-colors truncate max-w-[150px]">
                          {visitorName}
                        </h4>
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          {visitor.isPrimeCustomer ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-black uppercase text-amber-900 border border-amber-300">
                              Prime Pass
                            </span>
                          ) : (
                            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold text-slate-600">
                              {formatLabel(visitor.role)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-slate-100 text-slate-600 border-slate-300'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isActive ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Card Contact Quick-Actions */}
                  {visitor.mobile && (
                    <div
                      className="mt-3 flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <a
                        href={`tel:${visitor.mobile}`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <Phone className="h-3.5 w-3.5 text-slate-500" />
                        Call
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhoneForWa(visitor.mobile)}?text=${encodeURIComponent(
                          `Hello ${visitorName}, contacting you from JCB Exchange regarding your machinery requirements.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-2xs"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                    </div>
                  )}

                  {/* Info Grid */}
                  <div className="mt-3 space-y-1.5 text-xs">
                    {visitor.email && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400">Email:</span>
                        <span className="font-semibold text-slate-800 truncate max-w-[180px]">
                          {visitor.email}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Location:</span>
                      <span className="font-semibold text-slate-800 truncate max-w-[180px]">
                        {[visitor.city, visitor.state].filter(Boolean).join(', ') || 'Not specified'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Ref Code:</span>
                      <span className="font-mono text-[11px] font-bold text-slate-700">
                        {invoiceNo}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Source:</span>
                      <span className="font-semibold text-slate-800">{sourceMeta.label}</span>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-[11px] text-slate-400">
                    Joined {formatDate(visitor.createdAt)}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openVisitorDetails(visitor);
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-800 shadow-2xs transition-colors"
                  >
                    View Dossier
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. EDIT VISITOR MODAL */}
      {editVisitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Pencil className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Visitor Profile</h3>
                  <p className="text-xs text-slate-500">
                    Update customer contact coordinates and location.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 p-5">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm((c) => ({ ...c, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm((c) => ({ ...c, email: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Mobile Number (10 Digits)
                  </label>
                  <input
                    type="tel"
                    value={editForm.mobile}
                    onChange={(e) =>
                      setEditForm((c) => ({
                        ...c,
                        mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10),
                      }))
                    }
                    placeholder="9876543210"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    City
                  </label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm((c) => ({ ...c, city: e.target.value }))}
                    placeholder="e.g. Raipur"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    State
                  </label>
                  <input
                    type="text"
                    value={editForm.state}
                    onChange={(e) => setEditForm((c) => ({ ...c, state: e.target.value }))}
                    placeholder="e.g. Chhattisgarh"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingId === editVisitor.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-black text-slate-950 hover:bg-[#E5AD06] shadow-2xs disabled:opacity-50"
                >
                  {updatingId === editVisitor.id ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. DELETE CONFIRMATION MODAL */}
      {deleteVisitorTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                  <Trash2 className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Remove Customer Account</h3>
                  <p className="text-xs text-slate-500">Permanent data deletion confirmation</p>
                </div>
              </div>
            </div>

            <div className="p-5 text-xs text-slate-600 space-y-2">
              <p>
                Are you sure you want to permanently delete{' '}
                <strong className="text-slate-900 font-bold">
                  {getVisitorName(deleteVisitorTarget)}
                </strong>
                ?
              </p>
              <div className="rounded-lg bg-amber-50 p-2.5 border border-amber-200/80 text-amber-800 text-[11px]">
                <strong className="font-bold">Note:</strong> If this customer has existing enquiries,
                leads, sell deals, or active Prime subscriptions, deactivating their account is
                recommended instead of permanent deletion.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
              <button
                type="button"
                onClick={() => setDeleteVisitorTarget(null)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingId === deleteVisitorTarget.id}
                onClick={() => void confirmDeleteVisitor()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700 shadow-2xs disabled:opacity-50"
              >
                {updatingId === deleteVisitorTarget.id ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
