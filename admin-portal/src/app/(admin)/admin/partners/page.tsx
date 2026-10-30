'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AlertCircle, KeyRound, Pencil, Search, Trash2, X, ChevronDown, Plus,
  MoreVertical, Building2, Phone, Mail, MapPin, CheckCircle2, Clock,
  ShieldCheck, ShieldAlert, Award, MessageSquare, Copy, Check, Users,
  Package, RefreshCw, Printer, ExternalLink, ArrowUpDown, LayoutGrid,
  Table as TableIcon, Filter, AlertTriangle, UserCheck
} from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { usePathname, useRouter } from 'next/navigation';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { generateAdminPartnerDetailPath, generateAdminPartnerEditPath } from '@/lib/routePaths';
import { getPartnerInventoryDisplay } from '@/lib/partnerInventoryDisplay.mjs';

interface ManagedUser {
  id: string;
  name: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  role: string;
  status: string;
  adminTitle: string | null;
  isRootAdmin: boolean;
  permissions: string[];
  partnerType: string | null;
  kycStatus: string | null;
  onboardingStatus: string | null;
  accountStatus: string | null;
  listingLimit: number | null;
  listingCount: number;
  createdAt: string;
  partnerProfile?: {
    ownerName?: string | null;
    alternateMobile?: string | null;
    businessAddress?: string | null;
    district?: string | null;
    pinCode?: string | null;
    gstNumber?: string | null;
    businessRegistrationNumber?: string | null;
    businessExperience?: string | null;
    yearsInBusiness?: number | null;
    teamSize?: number | null;
    serviceAreas?: string | null;
    workingHours?: string | null;
    googleMapsLocation?: string | null;
    socialLinks?: string | null;
    referralCode?: string | null;
    websiteUrl?: string | null;
    businessDescription?: string | null;
  };
}

const statusClassNames: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  PENDING: 'bg-amber-50 text-amber-800 border-amber-300',
  REVIEW_PENDING: 'bg-amber-50 text-amber-800 border-amber-300',
  PROFILE_PENDING: 'bg-amber-50 text-amber-800 border-amber-300',
  KYC_PENDING: 'bg-amber-50 text-amber-800 border-amber-300',
  AGREEMENT_PENDING: 'bg-amber-50 text-amber-800 border-amber-300',
  CHANGES_REQUESTED: 'bg-orange-50 text-orange-800 border-orange-300',
  SUSPENDED: 'bg-amber-50 text-amber-800 border-amber-300',
  BLOCKED: 'bg-rose-50 text-rose-800 border-rose-300',
  INACTIVE: 'bg-slate-100 text-slate-700 border-slate-300',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-300',
};

const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatLabel = (value?: string | null) =>
  value
    ? value
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    : 'Not set';

const getPartnerStatus = (partner: ManagedUser) => {
  if (partner.status === 'INACTIVE') {
    return 'Inactive';
  }

  if (partner.status === 'SUSPENDED' || partner.status === 'BLOCKED') {
    return formatLabel(partner.status);
  }

  if (partner.accountStatus === 'ACTIVE' && partner.kycStatus === 'APPROVED' && partner.onboardingStatus === 'APPROVED') {
    return 'Active';
  }

  if (
    partner.onboardingStatus === 'REJECTED' ||
    partner.kycStatus === 'REJECTED'
  ) {
    return 'Rejected';
  }

  if (partner.onboardingStatus === 'CHANGES_REQUESTED' || partner.kycStatus === 'CHANGES_REQUESTED') {
    return 'Changes Requested';
  }

  return 'Pending';
};

const getPartnerStatusClassName = (partner: ManagedUser) => {
  if (partner.status === 'INACTIVE') {
    return statusClassNames.INACTIVE;
  }

  if (partner.status === 'SUSPENDED') {
    return statusClassNames.SUSPENDED;
  }

  if (partner.status === 'BLOCKED') {
    return statusClassNames.BLOCKED;
  }

  if (partner.accountStatus === 'ACTIVE' && partner.kycStatus === 'APPROVED' && partner.onboardingStatus === 'APPROVED') {
    return statusClassNames.ACTIVE;
  }

  if (
    partner.onboardingStatus === 'REJECTED' ||
    partner.kycStatus === 'REJECTED'
  ) {
    return statusClassNames.REJECTED;
  }

  if (partner.onboardingStatus === 'CHANGES_REQUESTED' || partner.kycStatus === 'CHANGES_REQUESTED') {
    return statusClassNames.CHANGES_REQUESTED;
  }

  return statusClassNames.PENDING;
};

const isPartnerRecord = (user: ManagedUser) => !!user.partnerProfile;

const getWhatsAppUrl = (phone?: string | null) => {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 10 ? `https://wa.me/91${digits.slice(-10)}` : null;
};

export default function SuperAdminPartnersPage() {
  const currentUser = useAuthStore((state) => state.user);
  const currentUserPermissions = currentUser?.permissions || [];
  const canViewPartners = hasAnyPermission(currentUserPermissions, ['partners.read']);
  const canCreatePartners = hasAnyPermission(currentUserPermissions, ['partners.create']);
  const canKycEditOverride = hasAnyPermission(currentUserPermissions, ['kyc.edit.override']);
  const canEditOnboarding =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'ADMIN' ||
    canKycEditOverride;
  const canResetPartnerPassword = hasAnyPermission(currentUserPermissions, ['partners.reset_password']);
  const canChangePartnerStatus = hasAnyPermission(currentUserPermissions, ['partners.change_status']);
  const canDeletePartners = hasAnyPermission(currentUserPermissions, ['partners.delete']);

  const router = useRouter();
  const pathname = usePathname();
  const routeBase = pathname.startsWith('/employee') ? '/employee/partners' : '/admin/partners';
  const listingsRouteBase = pathname.startsWith('/employee') ? '/employee/listings' : '/admin/listings';

  const [partners, setPartners] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'listings' | 'name'>('newest');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    businessName: '',
    mobile: '',
    email: '',
    password: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<ManagedUser | null>(null);
  const [partnerToDelete, setPartnerToDelete] = useState<ManagedUser | null>(null);
  const [passwordPartner, setPasswordPartner] = useState<ManagedUser | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    password: '',
    confirmPassword: '',
  });
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = useCallback((text: string, key: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.action-dropdown-container') || target?.closest?.('.filter-dropdown-container')) {
        return;
      }
      setOpenActionDropdownId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const fetchPartners = useCallback(async (isRefresh = false) => {
    if (!canViewPartners) {
      setError('You do not have permission to view partners.');
      setLoading(false);
      return;
    }

    try {
      if (isRefresh) setRefreshing(true);
      const response = await api.get<{ partners: ManagedUser[] }>('/superadmin/partners?compact=true');
      setPartners(response.data.partners.filter(isPartnerRecord));
      setError('');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Unable to load partners.');
      } else {
        setError('Unable to load partners.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canViewPartners]);

  useEffect(() => {
    // The fetch callback owns loading/error state for this client-side directory.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPartners();
  }, [fetchPartners]);

  // Executive KPI summary calculations
  const kpiMetrics = useMemo(() => {
    const total = partners.length;
    let active = 0;
    let pending = 0;
    let totalListings = 0;
    const districts = new Set<string>();

    for (const p of partners) {
      const st = getPartnerStatus(p);
      if (st === 'Active') active++;
      else if (st === 'Pending' || st === 'Changes Requested') pending++;
      totalListings += p.listingCount || 0;
      if (p.partnerProfile?.district) districts.add(p.partnerProfile.district);
    }

    return {
      total,
      active,
      pending,
      totalListings,
      districtsCount: districts.size,
    };
  }, [partners]);

  // Filtered & Sorted Partners list
  const filteredPartners = useMemo(() => {
    let result = partners;

    if (statusFilter) {
      result = result.filter((partner) => getPartnerStatus(partner) === statusFilter);
    }

    if (typeFilter) {
      result = result.filter((partner) => partner.partnerType === typeFilter);
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((partner) =>
        partner.name.toLowerCase().includes(query) ||
        (partner.partnerProfile?.ownerName || '').toLowerCase().includes(query) ||
        (partner.email || '').toLowerCase().includes(query) ||
        (partner.mobile || '').toLowerCase().includes(query) ||
        (partner.partnerProfile?.district || '').toLowerCase().includes(query) ||
        (partner.partnerProfile?.gstNumber || '').toLowerCase().includes(query) ||
        (partner.partnerType || '').toLowerCase().includes(query) ||
        (partner.status || '').toLowerCase().includes(query)
      );
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === 'listings') return (b.listingCount || 0) - (a.listingCount || 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });
  }, [partners, search, statusFilter, typeFilter, sortBy]);

  // Pagination slice
  const paginatedPartners = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPartners.slice(start, start + pageSize);
  }, [filteredPartners, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredPartners.length / pageSize) || 1;

  useEffect(() => {
    // Reset pagination when filters change so the next result set starts on page one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [search, statusFilter, typeFilter, sortBy]);

  const availableStatuses = useMemo(() => {
    return Array.from(new Set(partners.map((p) => getPartnerStatus(p)))).sort();
  }, [partners]);

  const availableTypes = useMemo(() => {
    return Array.from(new Set(partners.map((p) => p.partnerType).filter(Boolean))).sort() as string[];
  }, [partners]);

  const syncPartnerState = (updatedPartner: ManagedUser) => {
    setPartners((current) => current.map((item) => (item.id === updatedPartner.id ? updatedPartner : item)));
    setSelectedPartner((current) => (current?.id === updatedPartner.id ? updatedPartner : current));
  };

  const handleCreatePartner = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreatePartners) {
      setCreateError('You do not have permission to add partners.');
      return;
    }
    setCreateError('');
    setCreating(true);

    try {
      await api.post('/superadmin/partners', {
        ...createForm,
      });
      const response = await api.get<{ partners: ManagedUser[] }>('/superadmin/partners?compact=true');
      setPartners(response.data.partners.filter(isPartnerRecord));
      setIsCreateModalOpen(false);
      setCreateForm({
        name: '',
        businessName: '',
        mobile: '',
        email: '',
        password: '',
      });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setCreateError(err.response?.data?.error || 'Failed to create partner.');
      } else {
        setCreateError('An unexpected error occurred.');
      }
    } finally {
      setCreating(false);
    }
  };

  const openPasswordModal = (partner: ManagedUser) => {
    if (!canResetPartnerPassword) {
      setError('You do not have permission to reset passwords.');
      return;
    }

    setError('');
    setPasswordPartner(partner);
    setPasswordForm({
      password: '',
      confirmPassword: '',
    });
  };

  const closePasswordModal = () => {
    setPasswordPartner(null);
    setPasswordForm({
      password: '',
      confirmPassword: '',
    });
  };

  const handlePasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordPartner) {
      return;
    }

    if (!canResetPartnerPassword) {
      setError('You do not have permission to reset passwords.');
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setError('Password and confirm password must match.');
      return;
    }

    try {
      setUpdatingId(passwordPartner.id);
      await api.patch(`/superadmin/users/${passwordPartner.id}/password`, {
        password: passwordForm.password,
      });
      closePasswordModal();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Unable to reset password.');
      } else {
        setError('Unable to reset password.');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusUpdate = async (partner: ManagedUser, status: 'ACTIVE' | 'INACTIVE') => {
    if (!canChangePartnerStatus) {
      setError('You do not have permission to change partner status.');
      return;
    }

    try {
      setUpdatingId(partner.id);
      const response = await api.patch<{ user: ManagedUser }>(`/superadmin/users/${partner.id}/status`, { status });
      syncPartnerState(response.data.user);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Unable to update partner status.');
      } else {
        setError('Unable to update partner status.');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusToggle = (partner: ManagedUser) => {
    const partnerStatus = getPartnerStatus(partner);

    if (partnerStatus === 'Pending') {
      setSelectedPartner(partner);
      setAlertMessage('Partner must complete KYC and be approved before their account can be activated.');
      return;
    }

    if (partnerStatus === 'Rejected' || partnerStatus === 'Changes Requested') {
      setSelectedPartner(partner);
      setAlertMessage('Resolve onboarding review status first, then activate the partner account.');
      return;
    }

    void handleStatusUpdate(partner, partner.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE');
  };

  const handlePartnerDelete = async (partner: ManagedUser) => {
    if (!canDeletePartners) {
      setError('You do not have permission to delete partners.');
      return;
    }

    try {
      setUpdatingId(partner.id);
      await api.delete(`/superadmin/partners/${partner.id}`);
      setPartners((current) => current.filter((item) => item.id !== partner.id));
      setPartnerToDelete(null);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Unable to delete partner.');
      } else {
        setError('Unable to delete partner.');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4 pb-16 profile-print-target">
      {/* Top Header Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-2xs profile-no-print">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900 shadow-2xs">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Partner &amp; Dealership Directory
              </h1>
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900 border border-amber-300">
                {kpiMetrics.total} PARTNERS
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Manage Authorized Places, equipment dealers, KYC verification, and inventory limits.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchPartners(true)}
            disabled={refreshing}
            className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 cursor-pointer disabled:opacity-60"
            title="Refresh directory"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 cursor-pointer"
            title="Print directory"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Print</span>
          </button>

          {canCreatePartners && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] px-3.5 text-xs font-bold text-slate-950 shadow-2xs transition hover:bg-[#E5AD06] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add Partner</span>
            </button>
          )}
        </div>
      </div>

      {/* Executive KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {/* Stat 1: Total Partners */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Partners</span>
            <Users className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-slate-900 tracking-tight">
            {kpiMetrics.total}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">
            Registered Dealers
          </div>
        </div>

        {/* Stat 2: Active Accounts */}
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Active Accounts</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-emerald-700 tracking-tight">
            {kpiMetrics.active}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
            {kpiMetrics.total > 0 ? Math.round((kpiMetrics.active / kpiMetrics.total) * 100) : 0}% Verified &amp; Active
          </div>
        </div>

        {/* Stat 3: Pending KYC */}
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Pending Review</span>
            <Clock className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-amber-700 tracking-tight">
            {kpiMetrics.pending}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
            KYC Action Required
          </div>
        </div>

        {/* Stat 4: Machine Inventory */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Live Inventory</span>
            <Package className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-slate-900 tracking-tight">
            {kpiMetrics.totalListings}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">
            Published Machines
          </div>
        </div>

        {/* Stat 5: Districts Coverage */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Districts</span>
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1 text-base sm:text-lg font-black text-slate-900 tracking-tight">
            {kpiMetrics.districtsCount}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">
            Territory Coverage
          </div>
        </div>
      </div>

      {/* Multi-Filter & Search Toolbar */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs space-y-2.5 profile-no-print">
        {/* Row 1: Search & Dropdowns */}
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by business, owner, phone, email, district, GST..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-9 pr-8 text-xs sm:text-sm text-slate-900 outline-none transition focus:border-[#FFC107] focus:bg-white focus:ring-2 focus:ring-[#FFC107]/20 placeholder:text-slate-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Secondary Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Type Filter */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none transition focus:border-[#FFC107] cursor-pointer"
              >
                <option value="">All Partner Types</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatPartnerTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="relative flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none transition focus:border-[#FFC107] cursor-pointer"
              >
                <option value="newest">Newest Registered</option>
                <option value="oldest">Oldest First</option>
                <option value="listings">Most Machines</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition ${viewMode === 'table' ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                title="Table View"
              >
                <TableIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                title="Grid Cards View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Status Quick Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Status:
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
              statusFilter === ''
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({kpiMetrics.total})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('Active')}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'Active'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            Active ({kpiMetrics.active})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('Pending')}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'Pending'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            Pending KYC ({kpiMetrics.pending})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('Inactive')}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'Inactive'
                ? 'bg-slate-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
            }`}
          >
            Inactive ({partners.filter((p) => getPartnerStatus(p) === 'Inactive').length})
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="text-rose-700 hover:text-rose-950">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Main Content Area: Table View vs Grid Cards View */}
      {loading ? (
        <BrandLoader variant="section" size="sm" bg="light" text="Loading partner network..." />
      ) : filteredPartners.length === 0 ? (
        <div className="rounded-xl border border-slate-200/90 bg-white p-12 text-center shadow-2xs">
          <Building2 className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-900">No Partners Found</h3>
          <p className="mt-1 text-xs text-slate-500">
            {search || statusFilter || typeFilter
              ? 'Try modifying your search or clearing your active filters.'
              : 'No partner dealerships are currently registered.'}
          </p>
          {(search || statusFilter || typeFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setTypeFilter('');
              }}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW (Compact, High Density) */
        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3.5">Business &amp; Owner</th>
                  <th className="py-2.5 px-3.5">Contact Details</th>
                  <th className="py-2.5 px-3.5">Type &amp; Territory</th>
                  <th className="py-2.5 px-3.5">KYC Status</th>
                  <th className="py-2.5 px-3.5">Account</th>
                  <th className="py-2.5 px-3.5">Inventory</th>
                  <th className="py-2.5 px-3.5">Joined Date</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedPartners.map((partner) => {
                  const partnerStatus = getPartnerStatus(partner);
                  const inventory = getPartnerInventoryDisplay(partner);
                  const whatsappUrl = getWhatsAppUrl(partner.mobile);
                  const detailPath = generateAdminPartnerDetailPath(routeBase, {
                    id: partner.id,
                    name: partner.name,
                    district: partner.partnerProfile?.district,
                  });

                  return (
                    <tr
                      key={partner.id}
                      className="transition-colors hover:bg-slate-50/80 cursor-pointer group"
                      onClick={() => router.push(detailPath)}
                    >
                      {/* Business & Owner */}
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-[#E5AD06] text-slate-950 font-black text-xs shadow-2xs">
                            {partner.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 group-hover:text-amber-600 transition block truncate max-w-[180px] sm:max-w-xs" title={partner.name}>
                              {partner.name}
                            </span>
                            {partner.partnerProfile?.ownerName && (
                              <span className="text-[11px] text-slate-500 block truncate">
                                Owner: <strong className="text-slate-700">{partner.partnerProfile.ownerName}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact Details */}
                      <td className="py-2.5 px-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-0.5">
                          {partner.mobile ? (
                            <div className="flex items-center gap-1.5 font-medium text-slate-700">
                              <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>{partner.mobile}</span>
                              <div className="flex items-center gap-1 ml-1">
                                <a
                                  href={`tel:${partner.mobile}`}
                                  className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
                                  title="Call partner"
                                >
                                  <Phone className="h-3 w-3" />
                                </a>
                                {whatsappUrl && (
                                  <a
                                    href={whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 transition"
                                    title="WhatsApp chat"
                                  >
                                    <MessageSquare className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No mobile</span>
                          )}

                          {partner.email ? (
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate max-w-[160px]" title={partner.email}>
                              <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                              <span className="truncate">{partner.email}</span>
                            </div>
                          ) : null}
                        </div>
                      </td>

                      {/* Type & Territory */}
                      <td className="py-2.5 px-3.5">
                        <div>
                          <span className="font-semibold text-slate-800 block">
                            {formatPartnerTypeLabel(partner.partnerType, 'Not set')}
                          </span>
                          {partner.partnerProfile?.district && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500 font-medium">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              <span>{partner.partnerProfile.district}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* KYC Status */}
                      <td className="py-2.5 px-3.5">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          partner.kycStatus === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : partner.kycStatus === 'CHANGES_REQUESTED'
                              ? 'bg-orange-50 text-orange-800 border-orange-300'
                              : partner.kycStatus === 'REJECTED'
                                ? 'bg-rose-50 text-rose-800 border-rose-300'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                        }`}>
                          {formatLabel(partner.kycStatus || 'PENDING')}
                        </span>
                      </td>

                      {/* Account Status */}
                      <td className="py-2.5 px-3.5">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getPartnerStatusClassName(partner)}`}>
                          {partnerStatus}
                        </span>
                      </td>

                      {/* Inventory Count */}
                      <td className="py-2.5 px-3.5">
                        <div
                          className="w-24"
                          title={`${inventory.listingCount} published machine${inventory.listingCount === 1 ? '' : 's'} · unlimited inventory`}
                        >
                          <div className="mb-0.5 flex items-center justify-between text-[11px] font-bold text-slate-800">
                            <span>{inventory.listingCount}</span>
                            <span className="font-normal text-slate-400">/ ∞</span>
                          </div>
                          <div
                            className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                            aria-hidden="true"
                          />
                        </div>
                      </td>

                      {/* Joined Date */}
                      <td className="py-2.5 px-3.5 text-slate-600 font-medium whitespace-nowrap">
                        {formatDate(partner.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block text-left action-dropdown-container">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setOpenActionDropdownId((prev) => (prev === partner.id ? null : partner.id));
                            }}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Partner options"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {openActionDropdownId === partner.id && (
                            <div className="absolute right-0 z-[100] mt-1 w-48 origin-top-right rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-black/5 focus:outline-none">
                              {/* View Profile */}
                              <button
                                type="button"
                                onClick={() => {
                                  router.push(detailPath);
                                  setOpenActionDropdownId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                                <span>View Dossier</span>
                              </button>

                              {/* Edit Onboarding */}
                              {canEditOnboarding && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    router.push(
                                      generateAdminPartnerEditPath(routeBase, {
                                        id: partner.id,
                                        name: partner.name,
                                        district: partner.partnerProfile?.district,
                                      })
                                    );
                                    setOpenActionDropdownId(null);
                                  }}
                                  disabled={updatingId === partner.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-slate-400" />
                                  <span>Edit Onboarding</span>
                                </button>
                              )}

                              {/* View Machines */}
                              <button
                                type="button"
                                onClick={() => {
                                  router.push(`${listingsRouteBase}?search=${encodeURIComponent(partner.name)}`);
                                  setOpenActionDropdownId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              >
                                <Package className="h-3.5 w-3.5 text-slate-400" />
                                <span>View Listings</span>
                              </button>

                              {/* Reset Password */}
                              {canResetPartnerPassword && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    openPasswordModal(partner);
                                    setOpenActionDropdownId(null);
                                  }}
                                  disabled={updatingId === partner.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60"
                                >
                                  <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                                  <span>Reset Password</span>
                                </button>
                              )}

                              {/* Toggle Status */}
                              {canChangePartnerStatus && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleStatusToggle(partner);
                                    setOpenActionDropdownId(null);
                                  }}
                                  disabled={updatingId === partner.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60"
                                >
                                  <div className={`h-2 w-2 rounded-full ${partner.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  <span>{partner.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</span>
                                </button>
                              )}

                              {/* Delete Partner */}
                              {canDeletePartners && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPartnerToDelete(partner);
                                    setOpenActionDropdownId(null);
                                  }}
                                  disabled={updatingId === partner.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 border-t border-slate-100 mt-1"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                  <span>Delete Partner</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600">
            <div>
              Showing <strong className="text-slate-900">{(currentPage - 1) * pageSize + 1}</strong> to{' '}
              <strong className="text-slate-900">{Math.min(currentPage * pageSize, filteredPartners.length)}</strong> of{' '}
              <strong className="text-slate-900">{filteredPartners.length}</strong> partners
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Previous
              </button>
              <span className="px-2 font-bold text-slate-800">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* GRID CARDS VIEW (Visual Overview) */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {paginatedPartners.map((partner) => {
              const partnerStatus = getPartnerStatus(partner);
              const inventory = getPartnerInventoryDisplay(partner);
              const whatsappUrl = getWhatsAppUrl(partner.mobile);
              const detailPath = generateAdminPartnerDetailPath(routeBase, {
                id: partner.id,
                name: partner.name,
                district: partner.partnerProfile?.district,
              });

              return (
                <div
                  key={partner.id}
                  onClick={() => router.push(detailPath)}
                  className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs hover:border-amber-300 hover:shadow-xs transition cursor-pointer flex flex-col justify-between group"
                >
                  <div>
                    {/* Top row: Avatar & Badges */}
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-[#E5AD06] text-slate-950 font-black text-sm shadow-2xs">
                          {partner.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-amber-600 transition truncate" title={partner.name}>
                            {partner.name}
                          </h4>
                          <span className="text-[10px] font-semibold text-slate-500 block truncate">
                            {formatPartnerTypeLabel(partner.partnerType, 'Authorized')}
                          </span>
                        </div>
                      </div>
                      <span className={`inline-flex rounded border px-1.5 py-0.25 text-[9px] font-black uppercase tracking-wider shrink-0 ${getPartnerStatusClassName(partner)}`}>
                        {partnerStatus}
                      </span>
                    </div>

                    {/* Owner & Location */}
                    <div className="space-y-1 text-xs text-slate-600 border-t border-slate-100 pt-2 mb-3">
                      {partner.partnerProfile?.ownerName && (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <UserCheck className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{partner.partnerProfile.ownerName}</span>
                        </div>
                      )}
                      {partner.partnerProfile?.district && (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{partner.partnerProfile.district}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Row: Contact Actions & Inventory */}
                  <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {partner.mobile && (
                        <>
                          <a
                            href={`tel:${partner.mobile}`}
                            className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition"
                            title="Call"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                          {whatsappUrl && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                              title="WhatsApp"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-medium block">Inventory</span>
                      <span className="text-xs font-bold text-slate-900">
                        {inventory.listingCount} / ∞
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination for Grid View */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-xs text-slate-600 shadow-2xs">
            <div>
              Page <strong className="text-slate-900">{currentPage}</strong> of <strong className="text-slate-900">{totalPages}</strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE PARTNER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-amber-700" />
                <h3 className="text-base font-bold text-slate-900">Register New Partner</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePartner} className="p-6 space-y-4">
              {createError && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <p>{createError}</p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Business / Dealership Name *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm((c) => ({ ...c, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs sm:text-sm text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                  placeholder="e.g. Royal Earthmovers"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Mobile Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.mobile}
                    onChange={(e) =>
                      setCreateForm((c) => ({
                        ...c,
                        mobile: e.target.value.replace(/\D/g, '').slice(0, 10),
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs sm:text-sm text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                    placeholder="10 digit number"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm((c) => ({ ...c, email: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs sm:text-sm text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                    placeholder="partner@domain.com"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Initial Password *
                </label>
                <input
                  type="text"
                  required
                  minLength={8}
                  value={createForm.password}
                  onChange={(e) => setCreateForm((c) => ({ ...c, password: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs sm:text-sm text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 font-mono"
                  placeholder="Minimum 8 characters"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Share these login credentials with the partner so they can complete KYC onboarding.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#E5AD06] transition disabled:opacity-50 cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Register Partner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {passwordPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Reset Partner Password</h3>
                <p className="text-xs text-slate-500 font-medium">Set a new temporary password for {passwordPartner.name}.</p>
              </div>
              <button
                type="button"
                onClick={closePasswordModal}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePasswordReset} className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-600">New Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordForm.password}
                  onChange={(e) => setPasswordForm((c) => ({ ...c, password: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs sm:text-sm text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-600">Confirm Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((c) => ({ ...c, confirmPassword: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs sm:text-sm text-slate-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingId === passwordPartner.id}
                  className="rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#E5AD06] transition disabled:opacity-60 cursor-pointer"
                >
                  {updatingId === passwordPartner.id ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ALERT DIALOG (For status restrictions) */}
      {selectedPartner && alertMessage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl border border-slate-200">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="mb-1 text-base font-bold text-slate-900">Action Required</h3>
            <p className="mb-5 text-xs leading-relaxed text-slate-600">{alertMessage}</p>
            <button
              type="button"
              onClick={() => {
                setSelectedPartner(null);
                setAlertMessage(null);
              }}
              className="w-full rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#E5AD06] transition cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {partnerToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" onClick={() => setPartnerToDelete(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-600 mb-3">
              <Trash2 className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Delete Partner &ldquo;{partnerToDelete.name}&rdquo;?
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              This action will permanently delete this partner account and revoke all dashboard access. Deletion is only allowed if no active listings, leads, or financial ledger accounts are attached.
            </p>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPartnerToDelete(null)}
                disabled={updatingId === partnerToDelete.id}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handlePartnerDelete(partnerToDelete)}
                disabled={updatingId === partnerToDelete.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
              >
                {updatingId === partnerToDelete.id ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
