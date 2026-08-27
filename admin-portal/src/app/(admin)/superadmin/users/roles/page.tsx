'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, ArrowLeft, Trash2, Loader2, MoreVertical, Pencil } from 'lucide-react';
import axios from 'axios';
import api from '../../../../../lib/api';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useTranslation } from '@/hooks/useTranslation';

interface EmployeeRole {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];
  usersCount?: number;
}

const PERMISSION_DATA: Record<string, Array<{ groupName: string; permissions: Array<{ id: string; label: string }> }>> = {
  'Users & Roles': [
    {
      groupName: 'Users',
      permissions: [
        { id: 'users.create', label: 'Create Users' },
        { id: 'users.read', label: 'View Users' },
        { id: 'users.update', label: 'Edit Users' },
        { id: 'users.delete', label: 'Delete Users' },
      ],
    },
    {
      groupName: 'Roles',
      permissions: [
        { id: 'roles.create', label: 'Create Roles' },
        { id: 'roles.read', label: 'View Roles' },
        { id: 'roles.update', label: 'Edit Roles' },
        { id: 'roles.delete', label: 'Delete Roles' },
      ],
    },
  ],
  'Enquiries': [
    {
      groupName: 'Enquiries',
      permissions: [
        { id: 'enquiries.manage', label: 'Manage Enquiries' },
      ],
    },
  ],
  'Listings': [
    {
      groupName: 'Listings',
      permissions: [
        { id: 'listings.read', label: 'View All Listings' },
        { id: 'listings.update', label: 'Edit Listing' },
        { id: 'listings.approve', label: 'Approve Listing' },
        { id: 'listings.delete', label: 'Delete Listing' },
      ],
    },
  ],
  'Partners': [
    {
      groupName: 'Partners',
      permissions: [
        { id: 'partners.read', label: 'View Partners' },
        { id: 'partners.create', label: 'Add Partner' },
        { id: 'partners.update', label: 'Edit Partner' },
        { id: 'partners.reset_password', label: 'Reset Password' },
        { id: 'partners.change_status', label: 'Change Status' },
        { id: 'partners.delete', label: 'Delete Partner' },
      ],
    },
  ],
  'Visitors': [
    {
      groupName: 'Visitors',
      permissions: [
        { id: 'visitors.read', label: 'View Visitors' },
        { id: 'visitors.update', label: 'Edit Visitor' },
        { id: 'visitors.change_status', label: 'Change Status' },
        { id: 'visitors.delete', label: 'Delete Visitor' },
      ],
    },
  ],
  'Categories': [
    {
      groupName: 'Categories',
      permissions: [
        { id: 'categories.read', label: 'View Categories' },
        { id: 'categories.create', label: 'Create Category' },
        { id: 'categories.update', label: 'Edit Category' },
        { id: 'categories.delete', label: 'Delete Category' },
      ],
    },
  ],
  'Brands': [
    {
      groupName: 'Brands',
      permissions: [
        { id: 'brands.read', label: 'View Brands' },
        { id: 'brands.create', label: 'Create Brand' },
        { id: 'brands.update', label: 'Edit Brand' },
        { id: 'brands.delete', label: 'Delete Brand' },
      ],
    },
  ],
  'Verifications': [
    {
      groupName: 'Verifications',
      permissions: [
        { id: 'kyc.manage', label: 'Manage Verifications' },
      ],
    },
  ],
  'Recurrence': [
    {
      groupName: 'Recurrence',
      permissions: [
        { id: 'recurrence.manage', label: 'Manage Recurrence' },
      ],
    },
  ],
  'Settings': [
    {
      groupName: 'Settings',
      permissions: [
        { id: 'settings.manage', label: 'Manage Settings' },
      ],
    },
  ],
  'Translations': [
    {
      groupName: 'Translations',
      permissions: [
        { id: 'translations.manage', label: 'Manage Translations' },
      ],
    },
  ],
  'Dashboard': [
    {
      groupName: 'Dashboard',
      permissions: [
        { id: 'dashboard.view', label: 'View Dashboard Metrics' },
      ],
    }
  ],
};

export default function RolesPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserPermissions = currentUser?.permissions || [];
  const isCurrentSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const canCreateRoles = isCurrentSuperAdmin || currentUserPermissions.includes('ALL_ACCESS') || currentUserPermissions.includes('roles.create');
  const canUpdateRoles = isCurrentSuperAdmin || currentUserPermissions.includes('ALL_ACCESS') || currentUserPermissions.includes('roles.update');
  const canDeleteRoles = isCurrentSuperAdmin || currentUserPermissions.includes('ALL_ACCESS') || currentUserPermissions.includes('roles.delete');

  const [view, setView] = useState<'list' | 'create'>('list');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<EmployeeRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleName, setRoleName] = useState('');
  const [description, setDescription] = useState('');
  const [editingRole, setEditingRole] = useState<EmployeeRole | null>(null);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);
  const [permissionSearch, setPermissionSearch] = useState('');

  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);

  useEffect(() => {
    if (view === 'create') {
      setCustomHeader(
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('list')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 shadow-sm transition hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
              {editingRole ? t('roleManagement.editRole') : t('roleManagement.addNewRole')}
            </h1>
            <p className="text-[10px] sm:text-xs text-gray-500 leading-none mt-0.5">
              {t('roleManagement.headerDescription')}
            </p>
          </div>
        </div>
      );
    } else {
      setCustomHeader(null);
    }
    return () => setCustomHeader(null);
  }, [view, editingRole, setCustomHeader, t]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.action-dropdown-container')) {
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

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ roles?: EmployeeRole[] } | EmployeeRole[]>('/superadmin/roles');
      setRoles(Array.isArray(response.data) ? response.data : response.data.roles || []);
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchRoles();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const handleSaveRole = async () => {
    if (!roleName.trim()) {
      alert(t('roleManagement.roleNameRequired'));
      return;
    }
    if (editingRole ? !canUpdateRoles : !canCreateRoles) {
      alert(t('roleManagement.managePermissionDenied'));
      return;
    }
    try {
      setIsSaving(true);
      const payload = {
        name: roleName,
        description,
        permissions: Array.from(selectedPerms),
      };
      if (editingRole) {
        await api.patch(`/superadmin/roles/${editingRole.id}`, payload);
      } else {
        await api.post('/superadmin/roles', payload);
      }
      setRoleName('');
      setDescription('');
      setSelectedPerms(new Set());
      setEditingRole(null);
      setView('list');
      fetchRoles();
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        alert(error.response?.data?.error || t('roleManagement.saveFailed'));
      } else {
        alert(t('roleManagement.saveFailed'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const startCreate = () => {
    if (!canCreateRoles) {
      alert(t('roleManagement.createPermissionDenied'));
      return;
    }

    setRoleName('');
    setDescription('');
    setSelectedPerms(new Set());
    setEditingRole(null);
    setView('create');
  };

  const startEdit = (role: EmployeeRole) => {
    if (!canUpdateRoles) {
      alert(t('roleManagement.editPermissionDenied'));
      return;
    }

    setRoleName(role.name);
    setDescription(role.description || '');
    setSelectedPerms(new Set(role.permissions || []));
    setEditingRole(role);
    setView('create');
  };

  const handleDeleteRole = async (id: string) => {
    if (!canDeleteRoles) {
      alert(t('roleManagement.deletePermissionDenied'));
      return;
    }

    if (!confirm(t('roleManagement.deleteRoleConfirm'))) return;
    try {
      await api.delete(`/superadmin/roles/${id}`);
      fetchRoles();
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        alert(error.response?.data?.error || t('roleManagement.deleteFailed'));
      } else {
        alert(t('roleManagement.deleteFailed'));
      }
    }
  };

  // Handle individual checkbox
  const togglePermission = (id: string) => {
    const newSet = new Set(selectedPerms);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedPerms(newSet);
  };

  // Handle group select all
  const toggleGroup = (groupPerms: { id: string }[]) => {
    const allSelected = groupPerms.every(p => selectedPerms.has(p.id));
    const newSet = new Set(selectedPerms);
    
    if (allSelected) {
      groupPerms.forEach(p => newSet.delete(p.id));
    } else {
      groupPerms.forEach(p => newSet.add(p.id));
    }
    setSelectedPerms(newSet);
  };

  if (view === 'create') {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-20">
        {/* Role Details Card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-gray-900">{t('roleManagement.roleDetails')}</h3>
          <div className="grid max-w-xl gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('roleManagement.roleNameRequiredLabel')}</label>
              <input
                type="text"
                placeholder={t('roleManagement.roleNamePlaceholder')}
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:bg-white"
              />
            </div>

          </div>
        </div>

        {/* Permissions Card */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 p-4 sm:p-6">
            <h3 className="text-lg font-bold text-gray-900">{t('roleManagement.permissions')}</h3>
            <p className="text-sm text-gray-500 mt-1">{t('roleManagement.permissionsDescription')}</p>
          </div>
          
          {/* No tabs, all modules rendered below */}

          <div className="p-4 sm:p-6 bg-gray-50/30">
            {/* Search features */}
            <div className="mb-6 max-w-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('roleManagement.searchFeatures')}
                  value={permissionSearch}
                  onChange={(e) => setPermissionSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#FFC107]"
                />
              </div>
            </div>

            {/* Permission Groups */}
            <div className="space-y-6">
              {Object.entries(PERMISSION_DATA).map(([category, groups]) => {
                const filteredGroups = groups.map(group => {
                  const filteredPerms = group.permissions.filter(p => 
                    p.label.toLowerCase().includes(permissionSearch.toLowerCase()) || 
                    p.id.toLowerCase().includes(permissionSearch.toLowerCase())
                  );
                  return { ...group, permissions: filteredPerms };
                }).filter(group => group.permissions.length > 0);

                if (filteredGroups.length === 0) return null;

                return (
                  <div key={category} className="space-y-6">
                    {filteredGroups.map((group) => {
                    const total = group.permissions.length;
                    const selected = group.permissions.filter(p => selectedPerms.has(p.id)).length;
                    const allSelected = selected === total && total > 0;

                    return (
                      <div key={group.groupName} className="rounded-xl border border-gray-200 bg-white">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 bg-gray-50/50 rounded-t-xl">
                          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                            <h4 className="font-bold text-gray-900 text-sm sm:text-base truncate">
                              {category === group.groupName ? category : `${category} - ${group.groupName}`}
                            </h4>
                            <span className="shrink-0 whitespace-nowrap rounded-md bg-white border border-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
                              {selected} / {total}
                            </span>
                          </div>
                          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                            <input 
                              type="checkbox" 
                              checked={allSelected}
                              onChange={() => toggleGroup(group.permissions)}
                              className="h-4 w-4 rounded border-gray-300 text-[#FFC107] focus:ring-[#FFC107]"
                            />
                            {t('roleManagement.markAll')}
                          </label>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                          {group.permissions.map((perm) => (
                            <label 
                              key={perm.id} 
                              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                                selectedPerms.has(perm.id) 
                                  ? 'border-[#FFC107] bg-[#FFC107]/5' 
                                  : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                <input 
                                  type="checkbox" 
                                  checked={selectedPerms.has(perm.id)}
                                  onChange={() => togglePermission(perm.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-[#FFC107] focus:ring-[#FFC107]"
                                />
                              </div>
                              <div>
                                <div className={`text-sm font-medium ${selectedPerms.has(perm.id) ? 'text-gray-900' : 'text-gray-700'}`}>
                                  {perm.label}
                                </div>
                                <div className="mt-1 text-xs text-gray-400 font-mono">
                                  {perm.id}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                );
              })}
              
              {Object.keys(PERMISSION_DATA).length === 0 && (
                <div className="py-12 text-center text-gray-500">
                  {t('roleManagement.noPermissionsDefined')}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 p-4 sm:p-6 bg-white">
            <button
              onClick={() => setView('list')}
              className="rounded-lg border border-gray-200 px-4 sm:px-6 py-2 sm:py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              {t('roleManagement.cancel')}
            </button>
            <button
              onClick={handleSaveRole}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-lg bg-[#FFC107] px-4 sm:px-6 py-2 sm:py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-50"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingRole ? t('roleManagement.updateRole') : t('roleManagement.saveRole')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              placeholder={t('roleManagement.searchRoles')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 pl-10 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            />
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="hidden sm:inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              {t('roleManagement.totalRoles', { count: roles.length })}
            </span>
            {canCreateRoles ? (
              <button 
                onClick={startCreate}
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06] shadow-sm"
              >
                <Plus size={18} />
                <span>{t('roleManagement.addRole')}</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px] pb-16">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 sm:px-6 sm:py-4">Name</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4">Code</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4">{t('roleManagement.permissions')}</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4">Users</th>
                <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6 sm:p-8 text-center text-gray-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
                    {t('roleManagement.loadingRoles')}
                  </td>
                </tr>
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 sm:p-8 text-center text-gray-500">
                    {t('roleManagement.noRoles')}
                  </td>
                </tr>
              ) : (
                roles
                  .filter((role) => role.name.toLowerCase().includes(search.trim().toLowerCase()))
                  .map((role) => (
                  <tr key={role.id} className="transition-colors hover:bg-gray-50/50">
                    <td className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-gray-900">{role.name}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {role.name.toUpperCase().replace(/\s+/g, '_')}
                      </span>
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <div className="font-bold text-gray-900">{role.permissions.length}</div>
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 font-semibold text-gray-700">{role.usersCount || 0}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">
                      <div className="relative inline-block text-left action-dropdown-container">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenActionDropdownId(openActionDropdownId === role.id ? null : role.id);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 transition-colors"
                        >
                          <MoreVertical className="h-5 w-5 text-gray-500" />
                        </button>
                        
                        {openActionDropdownId === role.id && (
                          <div className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-left">
                            {canUpdateRoles && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenActionDropdownId(null);
                                  startEdit(role);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                              >
                                <Pencil className="h-4 w-4" />
                                {t('roleManagement.editRole')}
                              </button>
                            )}
                            
                            {canDeleteRoles && (
                              <>
                                <div className="my-1 h-px bg-gray-100" />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenActionDropdownId(null);
                                    handleDeleteRole(role.id);
                                  }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                                  {t('roleManagement.deleteRole')}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
