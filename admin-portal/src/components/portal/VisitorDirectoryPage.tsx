'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Pencil, Search, Trash2, X, Phone, MoreVertical } from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { generateAdminVisitorDetailPath } from '@/lib/routePaths';

type VisitorRecord = {
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

const STATUS_OPTIONS = ['ALL', 'ACTIVE', 'INACTIVE'] as const;

const emptyResponse: VisitorsResponse = {
  visitors: [],
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
};

const initialEditForm = {
  name: '',
  email: '',
  mobile: '',
  city: '',
  state: '',
};

const formatLabel = (value?: string | null) =>
  value
    ? value
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : 'Not set';

const getVisitorName = (visitor: VisitorRecord) =>
  visitor.fullName || visitor.name || visitor.email || 'Unnamed visitor';

const getSourceLabel = (visitor: VisitorRecord) => {
  if (visitor.createdBy?.role === 'SUPER_ADMIN' || visitor.createdBy?.role === 'ADMIN') {
    return `Created by ${formatLabel(visitor.createdBy.role)}`;
  }

  if (visitor.authProvider === 'GOOGLE') {
    return 'Google sign-in';
  }

  return 'Self registered';
};

export default function VisitorDirectoryPage({ detailBaseHref = '/superadmin/visitors' }: { detailBaseHref?: string }) {
  const currentUser = useAuthStore((state) => state.user);
  const currentUserPermissions = currentUser?.permissions || [];
  const canViewVisitors = hasAnyPermission(currentUserPermissions, ['visitors.read']);
  const canUpdateVisitors = hasAnyPermission(currentUserPermissions, ['visitors.update']);
  const canChangeVisitorStatus = hasAnyPermission(currentUserPermissions, ['visitors.change_status']);
  const canDeleteVisitors = hasAnyPermission(currentUserPermissions, ['visitors.delete']);

  const [data, setData] = useState<VisitorsResponse>(emptyResponse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<(typeof STATUS_OPTIONS)[number]>('ALL');
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('ALL');
  
  const router = useRouter();

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editVisitor, setEditVisitor] = useState<VisitorRecord | null>(null);
  const [editForm, setEditForm] = useState(initialEditForm);
  const [deleteVisitorTarget, setDeleteVisitorTarget] = useState<VisitorRecord | null>(null);

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

  const loadVisitors = useCallback(async () => {
    if (!canViewVisitors) {
      setLoading(false);
      setError('You do not have permission to view visitors.');
      return;
    }

    try {
      const response = await api.get<VisitorsResponse>('/superadmin/visitors');
      setData(response.data);
      setError('');
    } catch (loadError) {
      setError('Unable to load visitors.');
      console.error('Failed to load visitors:', loadError);
    } finally {
      setLoading(false);
    }
  }, [canViewVisitors]);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadVisitors();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadVisitors]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    data.visitors.forEach((visitor) => {
      types.add(formatLabel(visitor.role));
      if (visitor.isPrimeCustomer) {
        types.add('Prime Customer');
      }
    });
    return Array.from(types).sort();
  }, [data.visitors]);

  const filteredVisitors = useMemo(() => {
    const query = search.trim().toLowerCase();

    return data.visitors.filter((visitor) => {
      const matchesStatus = activeFilter === 'ALL' || visitor.status === activeFilter;
      
      let matchesType = true;
      if (activeTypeFilter !== 'ALL') {
        if (activeTypeFilter === 'Prime Customer') {
          matchesType = Boolean(visitor.isPrimeCustomer);
        } else {
          matchesType = formatLabel(visitor.role) === activeTypeFilter;
        }
      }

      const typeStrings = [formatLabel(visitor.role), visitor.isPrimeCustomer ? 'Prime Customer' : ''];

      const matchesSearch =
        query.length === 0 ||
        getVisitorName(visitor).toLowerCase().includes(query) ||
        (visitor.email || '').toLowerCase().includes(query) ||
        (visitor.mobile || '').toLowerCase().includes(query) ||
        (visitor.city || '').toLowerCase().includes(query) ||
        (visitor.state || '').toLowerCase().includes(query) ||
        (visitor.createdBy?.name || '').toLowerCase().includes(query) ||
        (visitor.createdBy?.email || '').toLowerCase().includes(query) ||
        visitor.authProvider.toLowerCase().includes(query) ||
        typeStrings.some((t) => t.toLowerCase().includes(query));

      return matchesStatus && matchesType && matchesSearch;
    });
  }, [activeFilter, activeTypeFilter, data.visitors, search]);

  const openEditModal = (visitor: VisitorRecord) => {
    if (!canUpdateVisitors) {
      setError('You do not have permission to edit visitors.');
      return;
    }

    setError('');
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

  const handleStatusToggle = async (visitor: VisitorRecord) => {
    if (!canChangeVisitorStatus) {
      setError('You do not have permission to change visitor status.');
      return;
    }

    const nextStatus = visitor.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    try {
      setUpdatingId(visitor.id);
      const response = await api.patch<{ user: VisitorRecord }>(`/superadmin/users/${visitor.id}/status`, {
        status: nextStatus,
      });
      setData((current) => ({
        visitors: current.visitors.map((item) => (item.id === visitor.id ? response.data.user : item)),
      }));
    } catch (statusError) {
      if (axios.isAxiosError(statusError)) {
        setError(statusError.response?.data?.error || 'Unable to update visitor status.');
      } else {
        setError('Unable to update visitor status.');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleEditSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!editVisitor) {
      return;
    }

    if (!canUpdateVisitors) {
      setError('You do not have permission to edit visitors.');
      return;
    }

    try {
      setUpdatingId(editVisitor.id);
      const response = await api.patch<{ user: VisitorRecord }>(`/superadmin/users/${editVisitor.id}`, {
        name: editForm.name,
        email: editForm.email,
        mobile: editForm.mobile || undefined,
        city: editForm.city || undefined,
        state: editForm.state || undefined,
      });

      setData((current) => ({
        visitors: current.visitors.map((item) => (item.id === editVisitor.id ? response.data.user : item)),
      }));
      closeEditModal();
    } catch (editError) {
      if (axios.isAxiosError(editError)) {
        setError(editError.response?.data?.error || 'Unable to update visitor.');
      } else {
        setError('Unable to update visitor.');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmDeleteVisitor = async () => {
    if (!deleteVisitorTarget) {
      return;
    }

    if (!canDeleteVisitors) {
      setError('You do not have permission to delete visitors.');
      return;
    }

    try {
      setUpdatingId(deleteVisitorTarget.id);
      await api.delete(`/superadmin/users/${deleteVisitorTarget.id}`);
      setData((current) => ({
        visitors: current.visitors.filter((item) => item.id !== deleteVisitorTarget.id),
      }));
      setDeleteVisitorTarget(null);
    } catch (deleteError) {
      if (axios.isAxiosError(deleteError)) {
        setError(deleteError.response?.data?.error || 'Unable to delete visitor.');
      } else {
        setError('Unable to delete visitor.');
      }
      setDeleteVisitorTarget(null);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {editVisitor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Edit Visitor</h3>
                <p className="text-sm text-gray-500">Update customer details without affecting lead history.</p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-5 px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FFC107]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FFC107]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Mobile</label>
                  <input
                    type="text"
                    value={editForm.mobile}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        mobile: event.target.value.replace(/[^0-9]/g, '').slice(0, 10),
                      }))
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FFC107]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                  <input
                    type="text"
                    value={formatLabel(editVisitor.role)}
                    disabled
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(event) => setEditForm((current) => ({ ...current, city: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FFC107]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">State</label>
                  <input
                    type="text"
                    value={editForm.state}
                    onChange={(event) => setEditForm((current) => ({ ...current, state: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FFC107]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                {canUpdateVisitors ? (
                  <button
                    type="submit"
                    disabled={updatingId === editVisitor.id}
                    className="rounded-lg bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-60"
                  >
                    {updatingId === editVisitor.id ? 'Saving...' : 'Save Changes'}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteVisitorTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Remove Visitor</h3>
              <p className="mt-1 text-sm text-gray-500">
                This will archive the visitor and hide it from the list while keeping related leads safe.
              </p>
            </div>

            <div className="px-6 py-5 text-sm text-gray-700">
              Are you sure you want to remove <span className="font-semibold">{getVisitorName(deleteVisitorTarget)}</span>?
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteVisitorTarget(null)}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              {canDeleteVisitors ? (
                <button
                  type="button"
                  disabled={updatingId === deleteVisitorTarget.id}
                  onClick={() => void confirmDeleteVisitor()}
                  className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {updatingId === deleteVisitorTarget.id ? 'Removing...' : 'Remove'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 filter-dropdown-container">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenFilterDropdown(prev => prev === 'type' ? null : 'type');
                  setOpenActionDropdownId(null);
                }}
                className="flex w-full min-w-[130px] items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] hover:bg-gray-50"
              >
                <span>{activeTypeFilter === 'ALL' ? 'All Types' : activeTypeFilter}</span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
              
              {openFilterDropdown === 'type' && (
                <div className="absolute left-0 z-50 mt-1 w-full min-w-[130px] origin-top-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg outline-none">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTypeFilter('ALL'); setOpenFilterDropdown(null); }}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${activeTypeFilter === 'ALL' ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}
                  >
                    All Types
                  </button>
                  {availableTypes.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTypeFilter(type); setOpenFilterDropdown(null); }}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${activeTypeFilter === type ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="relative flex-1 filter-dropdown-container">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenFilterDropdown(prev => prev === 'status' ? null : 'status');
                  setOpenActionDropdownId(null);
                }}
                className="flex w-full min-w-[130px] items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] hover:bg-gray-50"
              >
                <span>{activeFilter === 'ALL' ? 'All Statuses' : formatLabel(activeFilter)}</span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
              
              {openFilterDropdown === 'status' && (
                <div className="absolute left-0 z-50 mt-1 w-full min-w-[130px] origin-top-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg outline-none">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveFilter('ALL'); setOpenFilterDropdown(null); }}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${activeFilter === 'ALL' ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}
                  >
                    All Statuses
                  </button>
                  {STATUS_OPTIONS.filter((option) => option !== 'ALL').map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveFilter(option); setOpenFilterDropdown(null); }}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${activeFilter === option ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}
                    >
                      {formatLabel(option)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:max-w-xs">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search visitors..."
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 pl-10 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
              />
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-gray-500">Loading visitor directory...</div>
        ) : error ? (
          <div className="p-8">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">{error}</div>
          </div>
        ) : filteredVisitors.length === 0 ? (
          <div className="p-8">
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
              <h3 className="text-lg font-semibold text-gray-900">No visitors found</h3>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[300px] pb-16">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <th className="p-4 font-semibold">Visitor</th>
                  <th className="p-4 font-semibold">Email</th>
                  <th className="p-4 font-semibold">Type</th>
                  <th className="p-4 font-semibold">Source</th>
                  <th className="p-4 font-semibold">Applied On</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredVisitors.map((visitor) => {
                  const isActive = visitor.status === 'ACTIVE';

                  return (
                    <tr 
                      key={visitor.id} 
                      onClick={() => openVisitorDetails(visitor)}
                      className="align-top transition-colors hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="p-4">
                        <div className="font-medium text-gray-900">{getVisitorName(visitor)}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {visitor.mobile ? (
                            <a href={`tel:${visitor.mobile}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-1 text-green-700 transition-colors hover:bg-green-100 hover:text-green-800">
                              <Phone className="h-3 w-3" />
                              <span className="font-semibold">{visitor.mobile}</span>
                            </a>
                          ) : (
                            'No mobile'
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-700">{visitor.email || 'No email'}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            {formatLabel(visitor.role)}
                          </span>
                          {visitor.isPrimeCustomer ? (
                            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              Prime Customer
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-gray-700">{getSourceLabel(visitor)}</div>
                        <div className="mt-1 text-xs text-gray-500">{formatLabel(visitor.authProvider)}</div>
                      </td>
                      <td className="p-4 text-sm text-gray-700">{formatDate(visitor.createdAt)}</td>
                      <td className="p-4 text-right">
                        <div className="relative inline-block text-left action-dropdown-container">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenActionDropdownId(openActionDropdownId === visitor.id ? null : visitor.id);
                              setOpenFilterDropdown(null);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 transition-colors"
                          >
                            <MoreVertical className="h-5 w-5 text-gray-500" />
                          </button>
                          
                          {openActionDropdownId === visitor.id && (
                            <div className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                              {canUpdateVisitors && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenActionDropdownId(null);
                                    openEditModal(visitor);
                                  }}
                                  disabled={updatingId === visitor.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit Visitor
                                </button>
                              )}
                              
                              {canChangeVisitorStatus && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenActionDropdownId(null);
                                    void handleStatusToggle(visitor);
                                  }}
                                  disabled={updatingId === visitor.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                                >
                                  {isActive ? <X className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-green-500 transform rotate-180" />}
                                  {isActive ? 'Mark Inactive' : 'Mark Active'}
                                </button>
                              )}
                              
                              {canDeleteVisitors && (
                                <>
                                  <div className="my-1 h-px bg-gray-100" />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setOpenActionDropdownId(null);
                                      setDeleteVisitorTarget(visitor);
                                    }}
                                    disabled={updatingId === visitor.id}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete Visitor
                                  </button>
                                </>
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
        )}
      </div>
    </div>
  );
}
