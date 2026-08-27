'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, KeyRound, Pencil, Search, Trash2, X, ChevronDown, Plus, MoreVertical } from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { usePathname, useRouter } from 'next/navigation';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { generateAdminPartnerDetailPath, generateAdminPartnerEditPath } from '@/lib/routePaths';

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
  listingLimit: number;
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
  ACTIVE: 'bg-green-100 text-green-700',
  PENDING: 'bg-orange-100 text-orange-700',
  REVIEW_PENDING: 'bg-orange-100 text-orange-700',
  PROFILE_PENDING: 'bg-orange-100 text-orange-700',
  KYC_PENDING: 'bg-orange-100 text-orange-700',
  AGREEMENT_PENDING: 'bg-orange-100 text-orange-700',
  CHANGES_REQUESTED: 'bg-amber-100 text-amber-700',
  SUSPENDED: 'bg-amber-100 text-amber-700',
  BLOCKED: 'bg-red-100 text-red-700',
  INACTIVE: 'bg-gray-100 text-gray-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const formatDate = (value: string) => {
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

export default function SuperAdminListingsPage() {
  const currentUser = useAuthStore((state) => state.user);
  const currentUserPermissions = currentUser?.permissions || [];
  const canViewPartners = hasAnyPermission(currentUserPermissions, ['partners.read']);
  const canCreatePartners = hasAnyPermission(currentUserPermissions, ['partners.create']);
  const canUpdatePartners = hasAnyPermission(currentUserPermissions, ['partners.update']);
  const canResetPartnerPassword = hasAnyPermission(currentUserPermissions, ['partners.reset_password']);
  const canChangePartnerStatus = hasAnyPermission(currentUserPermissions, ['partners.change_status']);
  const canDeletePartners = hasAnyPermission(currentUserPermissions, ['partners.delete']);

  const router = useRouter();
  const pathname = usePathname();
  const routeBase = pathname.startsWith('/employee') ? '/employee/partners' : '/superadmin/partners';
  const [partners, setPartners] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
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
  const [openFilterDropdown, setOpenFilterDropdown] = useState<'status' | 'type' | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.action-dropdown-container') || target?.closest?.('.filter-dropdown-container')) {
        return;
      }
      setOpenActionDropdownId(null);
      setOpenFilterDropdown(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchPartners = async () => {
      if (!canViewPartners) {
        if (!cancelled) {
          setError('You do not have permission to view partners.');
          setLoading(false);
        }
        return;
      }

      try {
        const response = await api.get<{ partners: ManagedUser[] }>('/superadmin/partners');
        if (!cancelled) {
          setPartners(response.data.partners.filter(isPartnerRecord));
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(err)) {
          setError(err.response?.data?.error || 'Unable to load partners.');
        } else {
          setError('Unable to load partners.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchPartners();

    return () => {
      cancelled = true;
    };
  }, [canViewPartners]);

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
        (partner.email || '').toLowerCase().includes(query) ||
        (partner.mobile || '').toLowerCase().includes(query) ||
        (partner.partnerType || '').toLowerCase().includes(query) ||
        (partner.status || '').toLowerCase().includes(query)
      );
    }

    return result;
  }, [partners, search, statusFilter, typeFilter]);

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
      const response = await api.get<{ partners: ManagedUser[] }>('/superadmin/partners');
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
      setAlertMessage('Partner must complete KYC and be approved before their account can be activated.');
      return;
    }

    if (partnerStatus === 'Rejected' || partnerStatus === 'Changes Requested') {
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
    <div className="space-y-4">


      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900">Add Partner</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePartner} className="p-6">
              {createError ? (
                <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0" />
                  <p>{createError}</p>
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Partner Name *</label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none transition focus:border-gray-900"
                    placeholder="Enter partner name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Mobile Number *</label>
                    <input
                      type="text"
                      required
                      value={createForm.mobile}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          mobile: event.target.value.replace(/\D/g, '').slice(0, 10),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none transition focus:border-gray-900"
                      placeholder="Enter mobile number"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={createForm.email}
                      onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none transition focus:border-gray-900"
                      placeholder="Enter email address"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Temporary Password *</label>
                  <input
                    type="text"
                    required
                    minLength={8}
                    value={createForm.password}
                    onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none transition focus:border-gray-900"
                    placeholder="Enter temporary password"
                  />
                  <p className="mt-1 text-xs text-gray-500">Share this password with the partner so they can login.</p>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Partner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="relative w-full sm:w-auto flex-1 sm:flex-none filter-dropdown-container">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenFilterDropdown(prev => prev === 'status' ? null : 'status');
                  setOpenActionDropdownId(null);
                }}
                className="flex w-full min-w-[140px] items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] hover:bg-gray-50"
              >
                <span>{statusFilter || 'All Statuses'}</span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
              
              {openFilterDropdown === 'status' && (
                <div className="absolute left-0 z-50 mt-1 w-full min-w-[140px] origin-top-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg outline-none">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setStatusFilter(''); setOpenFilterDropdown(null); }}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${statusFilter === '' ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}
                  >
                    All Statuses
                  </button>
                  {availableStatuses.map(status => (
                    <button
                      key={status}
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setStatusFilter(status); setOpenFilterDropdown(null); }}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${statusFilter === status ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative w-full sm:w-auto flex-1 sm:flex-none filter-dropdown-container">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenFilterDropdown(prev => prev === 'type' ? null : 'type');
                  setOpenActionDropdownId(null);
                }}
                className="flex w-full min-w-[140px] items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] hover:bg-gray-50"
              >
                <span>{typeFilter ? formatPartnerTypeLabel(typeFilter) : 'All Types'}</span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
              
              {openFilterDropdown === 'type' && (
                <div className="absolute left-0 z-50 mt-1 w-full min-w-[140px] origin-top-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg outline-none">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTypeFilter(''); setOpenFilterDropdown(null); }}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${typeFilter === '' ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}
                  >
                    All Types
                  </button>
                  {availableTypes.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTypeFilter(type); setOpenFilterDropdown(null); }}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${typeFilter === type ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}
                    >
                      {formatPartnerTypeLabel(type)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:max-w-[240px]">
              <input
                type="text"
                placeholder="Search partners..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 pl-10 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
              />
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
            {canCreatePartners ? (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex w-full sm:w-auto items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#FFC107] px-5 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-[#E5AD06] focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2"
              >
                <Plus size={16} />
                <span>Add Partner</span>
              </button>
            ) : null}
          </div>
        </div>
        {error ? (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="p-5 text-sm text-gray-500">Loading partners...</div>
        ) : filteredPartners.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">No partners found.</div>
        ) : (
          <div className="overflow-x-auto min-h-[300px] pb-16">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <th className="p-4 font-semibold">Business</th>
                  <th className="p-4 font-semibold">Type</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">KYC</th>
                  <th className="p-4 font-semibold">Applied On</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPartners.map((partner) => (
                  <tr 
                    key={partner.id} 
                    className="align-top transition-colors hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      router.push(
                        generateAdminPartnerDetailPath(routeBase, {
                          id: partner.id,
                          name: partner.name,
                          district: partner.partnerProfile?.district,
                        })
                      );
                    }}
                  >
                    <td className="p-4">
                      <div className="font-medium text-gray-900">{partner.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{partner.email || 'No email'}</div>
                    </td>
                    <td className="p-4 text-sm text-gray-700">{formatPartnerTypeLabel(partner.partnerType, 'Not set')}</td>
                    <td className="p-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getPartnerStatusClassName(partner)}`}>
                        {getPartnerStatus(partner)}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-700">{formatLabel(partner.kycStatus)}</td>
                    <td className="p-4 text-sm text-gray-700">{formatDate(partner.createdAt)}</td>
                    <td className="p-4 text-right">
                      <div className="relative inline-block text-left action-dropdown-container">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setOpenActionDropdownId((prev) => prev === partner.id ? null : partner.id);
                          }}
                          className="inline-flex items-center justify-center p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                        >
                          <MoreVertical size={18} />
                        </button>

                        {openActionDropdownId === partner.id && (
                          <div className="absolute right-0 z-[100] mt-1 w-48 origin-top-right rounded-xl bg-white p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] ring-1 ring-black/5 focus:outline-none">
                            {canUpdatePartners ? (
                              <button
                                type="button"
                                title="Open full onboarding editor"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
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
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
                              >
                                <Pencil className="h-4 w-4" />
                                Edit Onboarding
                              </button>
                            ) : null}
                            {canResetPartnerPassword ? (
                              <button
                                type="button"
                                title="Reset password"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openPasswordModal(partner);
                                  setOpenActionDropdownId(null);
                                }}
                                disabled={updatingId === partner.id}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
                              >
                                <KeyRound className="h-4 w-4" />
                                Reset Password
                              </button>
                            ) : null}
                            {canChangePartnerStatus ? (
                              <button
                                type="button"
                                title={partner.status === 'INACTIVE' ? 'Activate account' : 'Mark inactive'}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleStatusToggle(partner);
                                  setOpenActionDropdownId(null);
                                }}
                                disabled={updatingId === partner.id}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
                              >
                                <div className={`h-2 w-2 shrink-0 rounded-full ${partner.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'}`} />
                                {partner.status === 'ACTIVE' ? 'Deactivate Account' : 'Activate Account'}
                              </button>
                            ) : null}
                            {canDeletePartners ? (
                              <button
                                type="button"
                                title="Delete partner"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setPartnerToDelete(partner);
                                  setOpenActionDropdownId(null);
                                }}
                                disabled={updatingId === partner.id}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {passwordPartner ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Reset Password</h3>
                <p className="text-sm text-gray-500">Set a new temporary password for {passwordPartner.name}.</p>
              </div>
              <button
                type="button"
                onClick={closePasswordModal}
                className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePasswordReset} className="space-y-5 px-6 py-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordForm.password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FFC107]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Confirm Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FFC107]"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingId === passwordPartner.id}
                  className="rounded-lg bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-60"
                >
                  {updatingId === passwordPartner.id ? 'Saving...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}


      {selectedPartner && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
              <AlertCircle className="h-6 w-6 text-orange-600" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-gray-900">Action Required</h3>
            <p className="mb-6 text-sm text-gray-600">{alertMessage}</p>
            <button
              onClick={() => setAlertMessage(null)}
              className="w-full rounded-lg bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06]"
            >
              Okay, Got it
            </button>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {partnerToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setPartnerToDelete(null)}>
          <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 p-6">
              <h3 className="text-xl font-bold text-red-600 flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Delete Partner
              </h3>
              <button
                onClick={() => setPartnerToDelete(null)}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-gray-600">
                Are you sure you want to delete <span className="font-semibold text-gray-900">{partnerToDelete.name}</span>?
              </p>
              <p className="mt-2 text-sm text-gray-500">
                This action will permanently remove the account. It will only succeed if no linked listings, leads, or team records exist. This action cannot be undone.
              </p>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 p-6">
              <button
                onClick={() => setPartnerToDelete(null)}
                disabled={updatingId === partnerToDelete.id}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              {canDeletePartners ? (
                <button
                  onClick={() => void handlePartnerDelete(partnerToDelete)}
                  disabled={updatingId === partnerToDelete.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {updatingId === partnerToDelete.id ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Partner'
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
