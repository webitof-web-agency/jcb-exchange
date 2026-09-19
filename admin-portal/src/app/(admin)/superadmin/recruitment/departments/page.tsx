'use client';

import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Pencil, Plus, Search, Trash2, X, MoreVertical, Briefcase } from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/authStore';
import { canUseRecruitmentPermission, recruitmentPermissions } from '@/lib/recruitmentPermissions';

interface Department {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  createdAt?: string;
  _count?: {
    jobs: number;
  };
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

export default function AdminDepartmentsPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const canCreate = canUseRecruitmentPermission(currentUser, recruitmentPermissions.departmentsCreate);
  const canUpdate = canUseRecruitmentPermission(currentUser, recruitmentPermissions.departmentsUpdate);
  const canDelete = canUseRecruitmentPermission(currentUser, recruitmentPermissions.departmentsDelete);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptDescription, setDeptDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  
  // Delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Dropdown menu state
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

  const fetchDepartments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/recruitment/admin/departments');
      if (res.data?.success) {
        setDepartments(res.data.departments || []);
      }
    } catch (err) {
      console.error('Failed to fetch departments:', err);
      setError(getApiErrorMessage(err, 'Failed to load recruitment departments.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchDepartments();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchDepartments]);

  const filteredDepartments = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return departments;

    return departments.filter((dept) =>
      dept.name.toLowerCase().includes(q) ||
      dept.code.toLowerCase().includes(q) ||
      (dept.description && dept.description.toLowerCase().includes(q))
    );
  }, [departments, deferredSearch]);

  const openAddModal = () => {
    setEditingId(null);
    setDeptName('');
    setDeptCode('');
    setDeptDescription('');
    setModalError('');
    setIsModalOpen(true);
  };

  const openEditModal = (dept: Department) => {
    setEditingId(dept.id);
    setDeptName(dept.name);
    setDeptCode(dept.code);
    setDeptDescription(dept.description || '');
    setModalError('');
    setIsModalOpen(true);
  };

  const openDeleteModal = (dept: Department) => {
    setDeleteError('');
    setDeletingDept(dept);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeletingDept(null);
    setIsDeleteModalOpen(false);
    setDeleteError('');
  };

  const handleDelete = async () => {
    if (!deletingDept) return;

    try {
      setIsDeleting(true);
      setDeleteError('');
      const res = await api.delete(`/recruitment/admin/departments/${deletingDept.id}`);
      if (res.data?.success) {
        await fetchDepartments();
        closeDeleteModal();
      }
    } catch (err) {
      setDeleteError(getApiErrorMessage(err, 'Failed to delete department.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!deptName.trim()) {
      setModalError('Department name is required.');
      return;
    }

    try {
      setSaving(true);
      setModalError('');

      const payload = {
        name: deptName.trim(),
        code: deptCode.trim() || undefined,
        description: deptDescription.trim() || undefined,
      };

      if (editingId) {
        await api.put(`/recruitment/admin/departments/${editingId}`, payload);
      } else {
        await api.post('/recruitment/admin/departments', payload);
      }

      setIsModalOpen(false);
      await fetchDepartments();
    } catch (err) {
      setModalError(getApiErrorMessage(err, 'Failed to save department.'));
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

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* Search & Actions Header */}
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              placeholder={t('recruitment.searchDepartment', 'Search department name, code, description...')}
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
          
          {canCreate ? (
            <button
              onClick={openAddModal}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06] shadow-sm shrink-0"
            >
              <Plus size={18} />
              <span>{t('recruitment.addDepartment', 'Add Department')}</span>
            </button>
          ) : null}
        </div>

        {/* Content Body */}
        {loading ? (
          <BrandLoader variant="section" size="sm" bg="light" text={t('recruitment.analyticsLoading', 'Loading departments...')} />
        ) : filteredDepartments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
              <Building2 size={32} className="text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{t('recruitment.noDepartmentsFound', 'No Departments Found')}</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              {search ? t('recruitment.noDepartmentsMatch', 'No departments match your active search filter.') : t('recruitment.createFirstDepartment', 'Get started by creating your first hiring department.')}
            </p>
            {canCreate ? (
              <button
                onClick={openAddModal}
                className="mt-6 flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06]"
              >
                <Plus size={18} />
                <span>{t('recruitment.addDepartment', 'Add Department')}</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 p-4 sm:p-6 pb-32 min-h-[300px]">
            {filteredDepartments.map((dept, index) => {
              const isNearBottom = index >= filteredDepartments.length - 4;
              const isOpen = openActionDropdownId === dept.id;

              return (
                <div
                  key={dept.id}
                  className={`group relative flex flex-col justify-between rounded-2xl border bg-white p-5 sm:p-6 min-h-[160px] shadow-xs transition-all duration-200 ${
                    isOpen
                      ? 'z-40 border-amber-400 ring-2 ring-amber-400/20 shadow-md'
                      : 'z-1 border-gray-100 hover:border-amber-200 hover:shadow-md hover:-translate-y-1'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 w-full">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 p-2.5 text-amber-700 transition-colors group-hover:bg-amber-100/80 shadow-2xs">
                        <Building2 size={22} />
                      </div>

                      {(canUpdate || canDelete) ? <div className="relative inline-block text-left action-dropdown-container shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenActionDropdownId(isOpen ? null : dept.id);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 transition-colors"
                        >
                          <MoreVertical className="h-5 w-5" />
                        </button>

                        {isOpen && (
                          <div
                            className={`absolute right-0 z-50 w-48 rounded-xl border border-gray-100 bg-white p-1 shadow-xl ring-1 ring-black/5 focus:outline-none ${
                              isNearBottom
                                ? 'bottom-full mb-2 origin-bottom-right'
                                : 'top-full mt-2 origin-top-right'
                            }`}
                          >
                            {canUpdate ? <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenActionDropdownId(null);
                                openEditModal(dept);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                            >
                              <Pencil className="h-4 w-4" />
                              <span>{t('recruitment.editDepartment', 'Edit Department')}</span>
                            </button> : null}

                            {canUpdate && canDelete ? <div className="my-1 h-px bg-gray-100" /> : null}
                            
                            {canDelete ? <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenActionDropdownId(null);
                                openDeleteModal(dept);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>{t('recruitment.deleteDepartment', 'Delete Department')}</span>
                            </button> : null}
                          </div>
                        )}
                      </div> : null}
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold tracking-wide text-gray-900 leading-snug break-words transition-colors group-hover:text-amber-800">
                          {dept.name}
                        </h4>
                        <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800 uppercase">
                          {dept.code}
                        </span>
                      </div>
                      
                      {dept.description ? (
                        <p className="mt-1.5 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                          {dept.description}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-gray-400 italic">{t('recruitment.noDescription', 'No description provided')}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700">
                      <Briefcase size={14} className="text-amber-500" />
                      {t('recruitment.activeJobsCount', '{count} active jobs').replace('{count}', String(dept._count?.jobs || 0))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Department Modal */}
      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <h3 className="text-xl font-bold text-gray-900">
                {editingId ? t('recruitment.editDepartment', 'Edit Department') : t('recruitment.addDepartment', 'Add Department')}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 p-6">
              {modalError ? (
                <div className="rounded-md bg-red-50 p-3 text-xs text-red-700 font-medium">
                  {modalError}
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('recruitment.departmentName', 'Department Name')} *</label>
                <input
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Engineering & Technology"
                  className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('recruitment.departmentCodeOptional', 'Department Code (Optional)')}</label>
                <input
                  type="text"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder={t('recruitment.departmentCodePlaceholder', 'e.g. ENG (Auto-generated if blank)')}
                  className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm font-mono text-gray-900 uppercase focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('recruitment.description', 'Description')}</label>
                <textarea
                  rows={3}
                  value={deptDescription}
                  onChange={(e) => setDeptDescription(e.target.value)}
                  placeholder={t('recruitment.deptDescriptionPlaceholder', 'Short summary of roles and responsibilities in this department...')}
                  className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  {t('roleManagement.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || !deptName.trim()}
                  className="rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-50"
                >
                  {saving ? t('recruitment.saving', 'Saving...') : editingId ? t('recruitment.editDepartment', 'Update Department') : t('recruitment.addDepartment', 'Add Department')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && deletingDept ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="text-red-600" size={32} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900">{t('recruitment.deleteDepartment', 'Delete Department')}</h3>
            <p className="mb-4 text-sm text-gray-500">
              {t('recruitment.deleteDeptConfirm', 'Are you sure you want to delete "{name}"?').replace('{name}', deletingDept.name)}
            </p>
            {deleteError ? (
              <div className="mb-4 rounded-md bg-red-50 p-2.5 text-xs text-red-700 font-medium text-left">
                {deleteError}
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="w-full rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 sm:w-auto"
              >
                {t('roleManagement.cancel', 'Cancel')}
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                className="w-full rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 sm:w-auto"
              >
                {isDeleting ? t('recruitment.deleting', 'Deleting...') : t('recruitment.confirmDelete', 'Confirm Delete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
