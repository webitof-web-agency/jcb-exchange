'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Pencil, Plus, Search, Tags, Trash2, X, MoreVertical } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';

interface IconData {
  id: string;
  name: string;
  svgData: string;
}

interface Category {
  id: string;
  name: string;
  iconId?: string;
  icon?: IconData;
}

const getAvailableIcons = (
  icons: IconData[],
  categories: Category[],
  editingId: string | null,
  selectedIconId: string
) => {
  const usedIconIds = new Set(
    categories
      .filter((category) => category.iconId && category.id !== editingId)
      .map((category) => category.iconId as string)
  );

  return icons.filter((icon) => !usedIconIds.has(icon.id) || icon.id === selectedIconId);
};

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

export default function SuperAdminCategoriesPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserPermissions = currentUser?.permissions || [];
  const canViewCategories = hasAnyPermission(currentUserPermissions, ['categories.read']);
  const canCreateCategories = hasAnyPermission(currentUserPermissions, ['categories.create']);
  const canUpdateCategories = hasAnyPermission(currentUserPermissions, ['categories.update']);
  const canDeleteCategories = hasAnyPermission(currentUserPermissions, ['categories.delete']);

  const [categories, setCategories] = useState<Category[]>([]);
  const [icons, setIcons] = useState<IconData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [selectedIconId, setSelectedIconId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [iconLoadError, setIconLoadError] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
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

  const fetchCategories = useCallback(async () => {
    if (!canViewCategories) {
      setLoading(false);
      setIconLoadError('');
      return;
    }

    try {
      const [resCats, resIcons] = await Promise.all([
        api.get('/master/categories'),
        api.get('/master/icons'),
      ]);

      setCategories(resCats.data.data || []);
      setIcons(resIcons.data.data || []);
      setIconLoadError('');
    } catch (err) {
      setIconLoadError(getApiErrorMessage(err, t('categoryManagement.loadIconsFailed')));
    } finally {
      setLoading(false);
    }
  }, [canViewCategories, t]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void fetchCategories();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [fetchCategories]);

  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(search.toLowerCase())
  );
  const availableIcons = getAvailableIcons(icons, categories, editingId, selectedIconId);

  const openAddModal = () => {
    if (!canCreateCategories) {
      setError(t('categoryManagement.addPermissionDenied'));
      return;
    }

    setEditingId(null);
    setCategoryName('');
    setSelectedIconId('');
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (category: Category) => {
    if (!canUpdateCategories) {
      setError(t('categoryManagement.editPermissionDenied'));
      return;
    }

    setEditingId(category.id);
    setCategoryName(category.name);
    setSelectedIconId(category.iconId || '');
    setError('');
    setIsModalOpen(true);
  };

  const openDeleteModal = (category: Category) => {
    if (!canDeleteCategories) {
      setError(t('categoryManagement.deletePermissionDenied'));
      return;
    }

    setDeletingCategory(category);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeletingCategory(null);
    setIsDeleteModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deletingCategory) {
      return;
    }

    if (!canDeleteCategories) {
      setError(t('categoryManagement.deletePermissionDenied'));
      return;
    }

    try {
      setIsDeleting(true);
      await api.delete(`/master/categories/${deletingCategory.id}`);
      await fetchCategories();
      closeDeleteModal();
    } catch (err) {
      setError(getApiErrorMessage(err, t('categoryManagement.deleteFailed')));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!categoryName.trim()) {
      setError(t('categoryManagement.nameRequired'));
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (editingId && !canUpdateCategories) {
        setError(t('categoryManagement.editPermissionDenied'));
        return;
      }

      if (!editingId && !canCreateCategories) {
        setError(t('categoryManagement.addPermissionDenied'));
        return;
      }

      if (editingId) {
        await api.put(`/master/categories/${editingId}`, {
          name: categoryName.trim(),
          iconId: selectedIconId || null,
        });
      } else {
        await api.post('/master/categories', {
          name: categoryName.trim(),
          iconId: selectedIconId || null,
        });
      }

      setIsModalOpen(false);
      await fetchCategories();
    } catch (err) {
      setError(getApiErrorMessage(err, t('categoryManagement.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              placeholder={t('categoryManagement.searchPlaceholder')}
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
          {canCreateCategories ? (
            <button
              onClick={openAddModal}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06] shadow-sm"
            >
              <Plus size={18} />
              {t('categoryManagement.addCategory')}
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500">{t('categoryManagement.loadingCategories')}</div>
        ) : filteredCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
              <Tags size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{t('categoryManagement.noCategories')}</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              {t('categoryManagement.emptyDescription')}
            </p>
            {canCreateCategories ? (
              <button
                onClick={openAddModal}
                className="mt-6 flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06]"
              >
                <Plus size={18} />
                {t('categoryManagement.addCategory')}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[300px] pb-16">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="w-16 p-4 text-center font-semibold">{t('categoryManagement.icon')}</th>
                  <th className="p-4 font-semibold">{t('categoryManagement.categoryName')}</th>
                  <th className="p-4 text-right font-semibold">{t('categoryManagement.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCategories.map((category) => (
                  <tr key={category.id} className="transition-colors hover:bg-gray-50">
                    <td className="p-4 text-center">
                      {category.icon?.svgData ? (
                        <div
                          className="inline-flex h-10 w-10 items-center justify-center text-gray-700"
                          dangerouslySetInnerHTML={{ __html: category.icon.svgData }}
                        />
                      ) : (
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                          <Tags size={20} />
                        </div>
                      )}
                    </td>
                    <td className="p-4 font-medium text-gray-900">{category.name}</td>
                    <td className="p-4 text-right">
                      <div className="relative inline-block text-left action-dropdown-container">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenActionDropdownId(openActionDropdownId === category.id ? null : category.id);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 transition-colors"
                        >
                          <MoreVertical className="h-5 w-5 text-gray-500" />
                        </button>
                        
                        {openActionDropdownId === category.id && (
                          <div className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            {canUpdateCategories && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenActionDropdownId(null);
                                  openEditModal(category);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                              >
                                <Pencil className="h-4 w-4" />
                                {t('categoryManagement.editCategory')}
                              </button>
                            )}
                            
                            {canDeleteCategories && (
                              <>
                                <div className="my-1 h-px bg-gray-100" />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenActionDropdownId(null);
                                    openDeleteModal(category);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {t('categoryManagement.deleteCategory')}
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
              <h3 className="text-xl font-bold text-gray-900">{editingId ? t('categoryManagement.editCategory') : t('categoryManagement.addCategory')}</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 p-6">
              {error ? (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('categoryManagement.categoryName')}</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder={t('categoryManagement.categoryNamePlaceholder')}
                  className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('categoryManagement.categoryIconOptional')}</label>
                {iconLoadError ? (
                  <div className="mb-2 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                    {iconLoadError}
                  </div>
                ) : null}
                {icons.length > 0 ? (
                  <div className="mt-2 grid max-h-48 grid-cols-4 gap-3 overflow-y-auto p-1 sm:grid-cols-5">
                    <div
                      onClick={() => setSelectedIconId('')}
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-2 transition-all ${!selectedIconId ? 'border-[#FFC107] bg-[#FFC107]/5' : 'border-gray-100 bg-gray-50 hover:border-gray-300'}`}
                    >
                      <Tags className="h-8 w-8 text-gray-400" />
                    </div>
                    {availableIcons.map((icon) => (
                      <div
                        key={icon.id}
                        onClick={() => setSelectedIconId(icon.id)}
                        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-2 transition-all ${selectedIconId === icon.id ? 'border-[#FFC107] bg-[#FFC107]/5 text-gray-900' : 'border-gray-100 bg-white text-gray-600 hover:border-gray-300'}`}
                        title={icon.name}
                      >
                        <div
                          className="flex h-8 w-8 items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: icon.svgData }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500">
                    {t('categoryManagement.noIcons')}
                  </div>
                )}
                {icons.length > 0 && availableIcons.length === 0 ? (
                  <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700">
                    {t('categoryManagement.allIconsAssigned')}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  {t('categoryManagement.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || !categoryName.trim()}
                  className="rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-50"
                >
                  {saving ? t('categoryManagement.saving') : editingId ? t('categoryManagement.update') : t('categoryManagement.addCategory')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isDeleteModalOpen && deletingCategory ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="text-red-600" size={32} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900">{t('categoryManagement.deleteCategoryConfirmTitle')}</h3>
            <p className="mb-4 text-sm text-gray-500">
              {t('categoryManagement.deleteCategoryConfirmDescription', { name: deletingCategory.name })}
            </p>
            {error ? (
              <div className="mb-4 rounded-md bg-red-50 p-2.5 text-xs text-red-700 font-medium">
                {error}
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="w-full rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 sm:w-auto"
              >
                {t('categoryManagement.cancel')}
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                className="w-full rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 sm:w-auto"
              >
                {isDeleting ? t('categoryManagement.deleting') : t('categoryManagement.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
