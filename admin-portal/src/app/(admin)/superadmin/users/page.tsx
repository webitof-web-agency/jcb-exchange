'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, KeyRound, Pencil, Plus, Search, Trash2, X, MoreVertical, Check, Ban } from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/hooks/useTranslation';

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
  customRoleId: string | null;
  customRoleName: string | null;
  permissions: string[];
  createdAt: string;
}

interface EmployeeRole {
  id: string;
  name: string;
  permissions: string[];
}

const statusClassNames: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PENDING: 'bg-orange-100 text-orange-700',
  SUSPENDED: 'bg-amber-100 text-amber-700',
  BLOCKED: 'bg-red-100 text-red-700',
  INACTIVE: 'bg-gray-100 text-gray-700',
};

const initialEditForm = {
  name: '',
  email: '',
  mobile: '',
  title: '',
  customRoleId: '',
  permissions: [] as string[],
};

const initialCreateForm = {
  name: '',
  title: '',
  mobile: '',
  email: '',
  password: '',
  customRoleId: '',
  permissions: [] as string[],
};

const initialPasswordForm = {
  password: '',
  confirmPassword: '',
};

const formatLabel = (value?: string | null) =>
  value
    ? value
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : null;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

export default function SuperAdminUsersPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [employeeRoles, setEmployeeRoles] = useState<EmployeeRole[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState(initialEditForm);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deleteUserTarget, setDeleteUserTarget] = useState<ManagedUser | null>(null);
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);
  const displayLabel = (value?: string | null) => formatLabel(value) || t('userManagement.notSet');
  const permissionCountLabel = (count: number) => `${count} ${t('userManagement.permissionsCountLabel')}`;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.action-dropdown-container')) {
        setOpenActionDropdownId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [openActionDropdownId]);
  const currentUserPermissions = currentUser?.permissions || [];
  const isCurrentSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const canCreateUsers = isCurrentSuperAdmin || currentUserPermissions.includes('ALL_ACCESS') || currentUserPermissions.includes('users.create');
  const canUpdateUsers = isCurrentSuperAdmin || currentUserPermissions.includes('ALL_ACCESS') || currentUserPermissions.includes('users.update');
  const canDeleteUsers = isCurrentSuperAdmin || currentUserPermissions.includes('ALL_ACCESS') || currentUserPermissions.includes('users.delete');
  const isProtectedUser = (user: ManagedUser) => user.role === 'SUPER_ADMIN' || user.isRootAdmin;

  useEffect(() => {
    let cancelled = false;

    const fetchInitialData = async () => {
      try {
        const [usersResponse, rolesResponse] = await Promise.allSettled([
          api.get<{ users: ManagedUser[] }>('/superadmin/users'),
          api.get<{ roles?: EmployeeRole[] } | EmployeeRole[]>('/superadmin/roles'),
        ]);

        if (cancelled) {
          return;
        }

        if (usersResponse.status === 'fulfilled') {
          setUsers(usersResponse.value.data.users);
        } else {
          throw usersResponse.reason;
        }

        if (rolesResponse.status === 'fulfilled') {
          setEmployeeRoles(
            Array.isArray(rolesResponse.value.data)
              ? rolesResponse.value.data
              : rolesResponse.value.data.roles || [],
          );
        } else {
          setEmployeeRoles([]);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(err)) {
          setError(err.response?.data?.error || t('userManagement.loadFailed'));
        } else {
          setError(t('userManagement.loadFailed'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchInitialData();

    return () => {
      cancelled = true;
    };
  }, [t]);

  const refreshUsers = async () => {
    const response = await api.get<{ users: ManagedUser[] }>('/superadmin/users');
    setUsers(response.data.users);
  };

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return users;
    }

    return users.filter((user) =>
      (
        (user.fullName || user.name).toLowerCase().includes(query) ||
        (user.email || '').toLowerCase().includes(query) ||
        (user.mobile || '').toLowerCase().includes(query) ||
        (user.adminTitle || '').toLowerCase().includes(query)
      )
    );
  }, [search, users]);

  const openEditModal = (user: ManagedUser) => {
    setError('');
    setEditUser(user);
    setEditForm({
      name: user.fullName || user.name,
      email: user.email || '',
      mobile: user.mobile || '',
      title: user.adminTitle || '',
      customRoleId: user.customRoleId || '',
      permissions: user.permissions || [],
    });
  };

  const closeEditModal = () => {
    setEditUser(null);
    setEditForm(initialEditForm);
  };

  const handleAccountUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editUser) {
      return;
    }

    if (!canUpdateUsers) {
      setError(t('userManagement.updatePermissionDenied'));
      return;
    }

    try {
      setUpdatingId(editUser.id);
      const response = await api.patch<{ user: ManagedUser }>(`/superadmin/users/${editUser.id}`, {
        name: editForm.name,
        email: editForm.email,
        mobile: editForm.mobile || undefined,
        title: editForm.title || undefined,
        customRoleId: editForm.customRoleId || null,
        permissions: editForm.permissions,
      });

      setUsers((current) => current.map((user) => (user.id === editUser.id ? response.data.user : user)));
      closeEditModal();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || t('userManagement.updateFailed'));
      } else {
        setError(t('userManagement.updateFailed'));
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const openPasswordModal = (user: ManagedUser) => {
    setError('');
    setPasswordUser(user);
    setPasswordForm(initialPasswordForm);
  };

  const closePasswordModal = () => {
    setPasswordUser(null);
    setPasswordForm(initialPasswordForm);
  };

  const handlePasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordUser) {
      return;
    }

    if (!canUpdateUsers) {
      setError(t('userManagement.resetPasswordPermissionDenied'));
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setError(t('userManagement.passwordMismatch'));
      return;
    }

    try {
      setUpdatingId(passwordUser.id);
      await api.patch(`/superadmin/users/${passwordUser.id}/password`, {
        password: passwordForm.password,
      });
      closePasswordModal();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || t('userManagement.resetPasswordFailed'));
      } else {
        setError(t('userManagement.resetPasswordFailed'));
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError('');

    if (!canCreateUsers) {
      setCreateError(t('userManagement.createPermissionDenied'));
      return;
    }

    setCreating(true);

    try {
      await api.post('/superadmin/users', {
        ...createForm,
        customRoleId: createForm.customRoleId || null,
        role: 'EMPLOYEE',
      });
      await refreshUsers();
      setIsCreateModalOpen(false);
      setCreateForm(initialCreateForm);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setCreateError(err.response?.data?.error || t('userManagement.createFailed'));
      } else {
        setCreateError(t('userManagement.unexpectedError'));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BLOCKED') => {
    if (!canUpdateUsers) {
      setError(t('userManagement.statusPermissionDenied'));
      return;
    }

    try {
      setUpdatingId(id);
      const response = await api.patch<{ user: ManagedUser }>(`/superadmin/users/${id}/status`, { status });
      setUsers((current) => current.map((user) => (user.id === id ? response.data.user : user)));
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || t('userManagement.statusUpdateFailed'));
      } else {
        setError(t('userManagement.statusUpdateFailed'));
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteUserTarget) {
      return;
    }

    if (!canDeleteUsers) {
      setError(t('userManagement.deletePermissionDenied'));
      setDeleteUserTarget(null);
      return;
    }

    try {
      setUpdatingId(deleteUserTarget.id);
      await api.delete(`/superadmin/users/${deleteUserTarget.id}`);
      setUsers((current) => current.filter((item) => item.id !== deleteUserTarget.id));
      setDeleteUserTarget(null);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || t('userManagement.deleteFailed'));
      } else {
        setError(t('userManagement.deleteFailed'));
      }
      setDeleteUserTarget(null);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {editUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{t('userManagement.editUser')}</h3>
                <p className="text-sm text-gray-500">{t('userManagement.editUserDescription')}</p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAccountUpdate} className="space-y-4 sm:space-y-5 px-4 py-4 sm:px-6 sm:py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.fullName')}</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t('userManagement.fullNamePlaceholder')}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#FFC107]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.email')}</label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder={t('userManagement.emailPlaceholder')}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#FFC107]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.mobile')}</label>
                  <input
                    type="text"
                    value={editForm.mobile}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        mobile: event.target.value.replace(/[^0-9]/g, '').slice(0, 10),
                      }))
                    }
                    placeholder={t('userManagement.mobilePlaceholder')}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#FFC107]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.role')}</label>
                  <input
                    type="text"
                    value={displayLabel(editUser.role)}
                    disabled
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 outline-none"
                  />
                </div>
                {editUser.role === 'EMPLOYEE' ? (
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.permissionRole')}</label>
                    <select
                      value={editForm.customRoleId}
                      onChange={(event) => {
                        const selectedRole = employeeRoles.find((role) => role.id === event.target.value);
                        setEditForm((current) => ({
                          ...current,
                          customRoleId: event.target.value,
                          permissions: selectedRole?.permissions || [],
                        }));
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107]"
                    >
                      <option value="">{t('userManagement.noPermissionRoleAssigned')}</option>
                      {employeeRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name} ({permissionCountLabel(role.permissions.length)})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {t('userManagement.permissionRoleDescription')}
                    </p>
                  </div>
                ) : null}
              </div>


              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingId === editUser.id}
                  className="rounded-lg bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-60"
                >
                  {updatingId === editUser.id ? t('common.saving') : t('common.saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>

      ) : null}

      {passwordUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{t('userManagement.resetPassword')}</h3>
                <p className="text-sm text-gray-500">
                  {t('userManagement.resetPasswordDescription', { name: passwordUser.name })}
                </p>
              </div>
              <button
                type="button"
                onClick={closePasswordModal}
                className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePasswordReset} className="space-y-4 sm:space-y-5 px-4 py-4 sm:px-6 sm:py-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.newPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordForm.password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={t('userManagement.newPasswordPlaceholder')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#FFC107]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.confirmPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                  placeholder={t('userManagement.confirmPasswordPlaceholder')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#FFC107]"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={updatingId === passwordUser.id}
                  className="rounded-lg bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-60"
                >
                  {updatingId === passwordUser.id ? t('common.saving') : t('userManagement.resetPassword')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center justify-end">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex items-center">
            <Search className="absolute left-4 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('userManagement.searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-full border border-gray-200 bg-white py-2.5 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 sm:w-64"
            />
          </div>
          {canCreateUsers ? (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex h-10 items-center justify-center gap-2 rounded-full bg-[#FFC107] px-5 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-[#E5AD06] focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2"
            >
              <Plus size={16} />
              <span>{t('userManagement.addEmployee')}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {error ? (
          <div className="p-10 text-center text-sm font-medium text-red-700">{error}</div>
        ) : loading ? (
              <div className="p-10 text-center text-sm font-medium text-gray-500">{t('userManagement.loadingUsers')}</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center text-sm font-medium text-gray-500">{t('userManagement.noUsersFound')}</div>
        ) : (
          <div className="overflow-x-auto min-h-[300px] pb-16">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-gray-50 text-xs font-medium uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">{t('userManagement.employee')}</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">{t('userManagement.email')}</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">{t('userManagement.type')}</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">{t('userManagement.status')}</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">{t('userManagement.created')}</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">{t('userManagement.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="align-top transition-colors hover:bg-gray-50/50">
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <div className="font-medium text-gray-900">{user.fullName || user.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{user.mobile || t('userManagement.noMobile')}</div>
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <div className="text-sm text-gray-700">{user.email || t('userManagement.noEmail')}</div>
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 text-gray-700">
                      <div className="font-semibold">{displayLabel(user.role)}</div>
                      {user.role === 'EMPLOYEE' ? (
                        <div className="mt-1 text-xs text-gray-500">
                          {user.customRoleName || t('userManagement.noPermissionRole')}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          statusClassNames[user.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {displayLabel(user.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 text-gray-700">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">
                      {user.role !== 'SUPER_ADMIN' || isCurrentSuperAdmin ? (
                        <div className="relative inline-block text-left action-dropdown-container">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenActionDropdownId(openActionDropdownId === user.id ? null : user.id);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 transition-colors ml-auto"
                          >
                            <MoreVertical className="h-5 w-5 text-gray-500" />
                          </button>

                          {openActionDropdownId === user.id && (
                            <div className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-left">
                              {canUpdateUsers && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenActionDropdownId(null);
                                    openEditModal(user);
                                  }}
                                  disabled={updatingId === user.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60"
                                >
                                  <Pencil className="h-4 w-4 text-gray-400" />
                                  {t('userManagement.editEmployee')}
                                </button>
                              )}

                              {canUpdateUsers && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenActionDropdownId(null);
                                    openPasswordModal(user);
                                  }}
                                  disabled={updatingId === user.id || user.isRootAdmin}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60"
                                >
                                  <KeyRound className="h-4 w-4 text-gray-400" />
                                  {t('userManagement.resetPassword')}
                                </button>
                              )}

                              {canUpdateUsers && user.role !== 'SUPER_ADMIN' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenActionDropdownId(null);
                                    void handleStatusUpdate(user.id, user.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE');
                                  }}
                                  disabled={updatingId === user.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60"
                                >
                                  {user.status === 'ACTIVE' ? (
                                    <>
                                      <Ban className="h-4 w-4 text-red-500" />
                                      <span className="text-red-600 font-medium">{t('userManagement.deactivateUser')}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Check className="h-4 w-4 text-emerald-500" />
                                      <span className="text-emerald-600 font-medium">{t('userManagement.activateUser')}</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {canDeleteUsers && !isProtectedUser(user) && (
                                <>
                                  <div className="my-1 h-px bg-gray-100" />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setOpenActionDropdownId(null);
                                      setDeleteUserTarget(user);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                    {t('userManagement.deleteEmployee')}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-4 sm:p-6">
              <h3 className="text-lg font-bold text-gray-900">{t('userManagement.addNewEmployee')}</h3>
            </div>

            <form onSubmit={handleCreateEmployee} className="p-6">
              {createError ? (
                <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <p>{createError}</p>
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.employeeFullNameRequired')}</label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t('userManagement.fullNamePlaceholder')}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-900"
                  />
                </div>


                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.mobileNumberRequired')}</label>
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
                      placeholder={t('userManagement.mobileNumberPlaceholder')}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.emailAddressRequired')}</label>
                    <input
                      type="email"
                      required
                      value={createForm.email}
                      onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder={t('userManagement.emailAddressPlaceholder')}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.temporaryPasswordRequired')}</label>
                  <input
                    type="text"
                    required
                    minLength={8}
                    value={createForm.password}
                    onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder={t('userManagement.temporaryPasswordPlaceholder')}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-900"
                  />
                  <p className="mt-1 text-xs text-gray-500">{t('userManagement.temporaryPasswordDescription')}</p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('userManagement.permissionRole')}</label>
                  <select
                    value={createForm.customRoleId}
                    onChange={(event) => {
                      const selectedRole = employeeRoles.find((role) => role.id === event.target.value);
                      setCreateForm((current) => ({
                        ...current,
                        customRoleId: event.target.value,
                        permissions: selectedRole?.permissions || [],
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-900"
                  >
                    <option value="">{t('userManagement.noPermissionRoleAssigned')}</option>
                    {employeeRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} ({permissionCountLabel(role.permissions.length)})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {t('userManagement.createRoleHelp')}
                  </p>
                </div>

              </div>

              <div className="mt-8 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-50"
                >
                  {creating ? t('userManagement.creating') : t('userManagement.createEmployee')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteUserTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-gray-900">{t('userManagement.deleteEmployee')}</h3>
            <p className="mb-6 text-sm text-gray-600">
              {t('userManagement.deleteConfirmation', { name: deleteUserTarget.fullName || deleteUserTarget.name })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteUserTarget(null)}
                disabled={updatingId === deleteUserTarget.id}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => void confirmDeleteUser()}
                disabled={updatingId === deleteUserTarget.id}
                className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {updatingId === deleteUserTarget.id ? t('userManagement.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
