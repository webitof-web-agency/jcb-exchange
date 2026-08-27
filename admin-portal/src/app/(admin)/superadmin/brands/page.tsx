'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Pencil, Plus, Search, Tag, Trash2, X, MoreVertical } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';

interface Brand {
  id: string;
  name: string;
}

const getApiErrorMessage = (err: unknown, fallback: string) => {
  if (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
  ) {
    return (err as { response?: { data?: { error?: string } } }).response?.data?.error || fallback;
  }

  return fallback;
};

export default function SuperAdminBrandsPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserPermissions = currentUser?.permissions || [];
  const canViewBrands = hasAnyPermission(currentUserPermissions, ['brands.read']);
  const canCreateBrands = hasAnyPermission(currentUserPermissions, ['brands.create']);
  const canUpdateBrands = hasAnyPermission(currentUserPermissions, ['brands.update']);
  const canDeleteBrands = hasAnyPermission(currentUserPermissions, ['brands.delete']);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [brandName, setBrandName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingBrand, setDeletingBrand] = useState<Brand | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);

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

  const fetchBrands = useCallback(async () => {
    if (!canViewBrands) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get('/master/brands');
      setBrands(response.data.data || []);
    } catch (err) {
      setError(getApiErrorMessage(err, t('brandManagement.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [canViewBrands, t]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void fetchBrands();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [fetchBrands]);

  const filteredBrands = brands.filter((brand) => brand.name.toLowerCase().includes(search.toLowerCase()));

  const openAddModal = () => {
    if (!canCreateBrands) {
      setError(t('brandManagement.addPermissionDenied'));
      return;
    }

    setEditingId(null);
    setBrandName('');
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (brand: Brand) => {
    if (!canUpdateBrands) {
      setError(t('brandManagement.editPermissionDenied'));
      return;
    }

    setEditingId(brand.id);
    setBrandName(brand.name);
    setError('');
    setIsModalOpen(true);
  };

  const openDeleteModal = (brand: Brand) => {
    if (!canDeleteBrands) {
      setError(t('brandManagement.deletePermissionDenied'));
      return;
    }

    setDeletingBrand(brand);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeletingBrand(null);
    setIsDeleteModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deletingBrand) {
      return;
    }

    if (!canDeleteBrands) {
      setError(t('brandManagement.deletePermissionDenied'));
      return;
    }

    try {
      setIsDeleting(true);
      await api.delete(`/master/brands/${deletingBrand.id}`);
      await fetchBrands();
      closeDeleteModal();
    } catch (err) {
      setError(getApiErrorMessage(err, t('brandManagement.deleteFailed')));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!brandName.trim()) {
      setError(t('brandManagement.nameRequired'));
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (editingId && !canUpdateBrands) {
        setError(t('brandManagement.editPermissionDenied'));
        return;
      }

      if (!editingId && !canCreateBrands) {
        setError(t('brandManagement.addPermissionDenied'));
        return;
      }

      if (editingId) {
        await api.put(`/master/brands/${editingId}`, {
          name: brandName.trim(),
        });
      } else {
        await api.post('/master/brands', {
          name: brandName.trim(),
        });
      }

      setIsModalOpen(false);
      await fetchBrands();
    } catch (err) {
      setError(getApiErrorMessage(err, t('brandManagement.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              placeholder={t('brandManagement.searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 pl-10 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            />
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {canCreateBrands ? (
            <button
              onClick={openAddModal}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06] shadow-sm"
            >
              <Plus size={18} />
              {t('brandManagement.addBrand')}
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500">{t('brandManagement.loadingBrands')}</div>
        ) : filteredBrands.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
              <Tag size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{t('brandManagement.noBrands')}</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              {t('brandManagement.emptyDescription')}
            </p>
            {canCreateBrands ? (
              <button
                onClick={openAddModal}
                className="mt-6 flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06]"
              >
                <Plus size={18} />
                {t('brandManagement.addBrand')}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[300px] pb-16">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="w-16 p-4 text-center font-semibold">{t('brandManagement.type')}</th>
                  <th className="p-4 font-semibold">{t('brandManagement.brandName')}</th>
                  <th className="p-4 text-right font-semibold">{t('brandManagement.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredBrands.map((brand) => (
                  <tr key={brand.id} className="transition-colors hover:bg-gray-50">
                    <td className="p-4 text-center">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                        <Tag size={18} />
                      </div>
                    </td>
                    <td className="p-4 font-medium text-gray-900">{brand.name}</td>
                    <td className="p-4 text-right">
                      <div className="relative inline-block text-left action-dropdown-container">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenActionDropdownId(openActionDropdownId === brand.id ? null : brand.id);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 transition-colors"
                        >
                          <MoreVertical className="h-5 w-5 text-gray-500" />
                        </button>
                        
                        {openActionDropdownId === brand.id && (
                          <div className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            {canUpdateBrands && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenActionDropdownId(null);
                                  openEditModal(brand);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                              >
                                <Pencil className="h-4 w-4" />
                                {t('brandManagement.editBrand')}
                              </button>
                            )}
                            
                            {canDeleteBrands && (
                              <>
                                <div className="my-1 h-px bg-gray-100" />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenActionDropdownId(null);
                                    openDeleteModal(brand);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {t('brandManagement.deleteBrand')}
                                </button>
                              </>
                            )}
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

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <h3 className="text-xl font-bold text-gray-900">{editingId ? t('brandManagement.editBrand') : t('brandManagement.addBrand')}</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('brandManagement.brandName')}</label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(event) => setBrandName(event.target.value)}
                  placeholder={t('brandManagement.brandNamePlaceholder')}
                  className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  {t('brandManagement.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || !brandName.trim()}
                  className="rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-50"
                >
                  {saving ? t('brandManagement.saving') : editingId ? t('brandManagement.update') : t('brandManagement.addBrand')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isDeleteModalOpen && deletingBrand ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="text-red-600" size={32} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900">{t('brandManagement.deleteBrandConfirmTitle')}</h3>
            <p className="mb-6 text-sm text-gray-500">
              {t('brandManagement.deleteBrandConfirmDescription', { name: deletingBrand.name })}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="w-full rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 sm:w-auto"
              >
                {t('brandManagement.cancel')}
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                className="w-full rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 sm:w-auto"
              >
                {isDeleting ? t('brandManagement.deleting') : t('brandManagement.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
