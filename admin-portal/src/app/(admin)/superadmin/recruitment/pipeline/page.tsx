'use client';

import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Kanban, MoreVertical, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/authStore';
import { canUseRecruitmentPermission, recruitmentPermissions } from '@/lib/recruitmentPermissions';
import {
  DEFAULT_RECRUITMENT_STAGES,
  RecruitmentStage,
  getRecruitmentStageTone,
  normalizeRecruitmentStages,
} from '@/lib/recruitmentStages';

const STAGE_COLOR_OPTIONS = [
  'blue',
  'amber',
  'purple',
  'indigo',
  'cyan',
  'teal',
  'emerald',
  'orange',
  'pink',
  'lime',
  'green',
  'violet',
  'rose',
  'red',
  'gray',
];

interface PipelineStageItem extends RecruitmentStage {
  usageCount?: number;
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

const buildStageCode = (name: string) =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

const notifyRecruitmentStageRefresh = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('recruitment_pipeline_stages_updated'));
  }
};

export default function AdminPipelinePage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const canCreate = canUseRecruitmentPermission(currentUser, recruitmentPermissions.pipelineCreate);
  const canUpdate = canUseRecruitmentPermission(currentUser, recruitmentPermissions.pipelineUpdate);
  const canDeletePipelineStage = canUseRecruitmentPermission(currentUser, recruitmentPermissions.pipelineDelete);
  const [stages, setStages] = useState<PipelineStageItem[]>(DEFAULT_RECRUITMENT_STAGES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stageName, setStageName] = useState('');
  const [stageCode, setStageCode] = useState('');
  const [stageOrder, setStageOrder] = useState('1');
  const [stageColor, setStageColor] = useState('blue');
  const [isTerminal, setIsTerminal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [error, setError] = useState('');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingStage, setDeletingStage] = useState<PipelineStageItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.stage-action-dropdown-container')) {
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

  const fetchStages = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/recruitment/admin/settings', { params: { section: 'pipeline' } });
      if (res.data?.success) {
        const stageList = normalizeRecruitmentStages(res.data.data?.stages || res.data.stages || []);
        setStages(stageList);
        return;
      }

      setStages(DEFAULT_RECRUITMENT_STAGES);
    } catch (err) {
      console.error('Failed to fetch pipeline stages:', err);
      setError(getApiErrorMessage(err, 'Failed to load pipeline stages.'));
      setStages(DEFAULT_RECRUITMENT_STAGES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchStages();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchStages]);

  const filteredStages = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return stages;

    return stages.filter((stage) =>
      stage.name.toLowerCase().includes(q) ||
      stage.code.toLowerCase().includes(q)
    );
  }, [deferredSearch, stages]);

  const openAddModal = () => {
    setEditingId(null);
    setStageName('');
    setStageCode('');
    setStageOrder(String((Math.max(...stages.map((stage) => stage.order), 0)) + 1));
    setStageColor('blue');
    setIsTerminal(false);
    setModalError('');
    setIsModalOpen(true);
  };

  const openEditModal = (stage: PipelineStageItem) => {
    setEditingId(stage.id || null);
    setStageName(stage.name);
    setStageCode(stage.code);
    setStageOrder(String(stage.order));
    setStageColor(stage.color || 'blue');
    setIsTerminal(Boolean(stage.isTerminal));
    setModalError('');
    setIsModalOpen(true);
  };

  const openDeleteModal = (stage: PipelineStageItem) => {
    if ((stage.usageCount || 0) > 0) {
      setDeleteError(`This stage is currently used by ${stage.usageCount || 0} application(s).`);
      setDeletingStage(stage);
      setIsDeleteModalOpen(true);
      return;
    }

    setDeleteError('');
    setDeletingStage(stage);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeletingStage(null);
    setIsDeleteModalOpen(false);
    setDeleteError('');
  };

  const handleDelete = async () => {
    if (!deletingStage || (deletingStage.usageCount || 0) > 0) return;

    try {
      setIsDeleting(true);
      setDeleteError('');
      await api.delete(`/recruitment/admin/settings/pipeline-stages/${deletingStage.id}`);
      toast.success('Pipeline stage deleted successfully.');
      await fetchStages();
      notifyRecruitmentStageRefresh();
      closeDeleteModal();
    } catch (err) {
      setDeleteError(getApiErrorMessage(err, 'Failed to delete pipeline stage.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stageName.trim()) {
      setModalError('Stage name is required.');
      return;
    }

    try {
      setSaving(true);
      setModalError('');

      const payload = {
        name: stageName.trim(),
        code: editingId ? stageCode : stageCode.trim() || buildStageCode(stageName),
        order: Number.parseInt(stageOrder, 10) || 1,
        color: stageColor,
        isTerminal,
      };

      if (editingId) {
        await api.put(`/recruitment/admin/settings/pipeline-stages/${editingId}`, payload);
        toast.success('Pipeline stage updated successfully.');
      } else {
        await api.post('/recruitment/admin/settings/pipeline-stages', payload);
        toast.success('Pipeline stage created successfully.');
      }

      setIsModalOpen(false);
      await fetchStages();
      notifyRecruitmentStageRefresh();
    } catch (err) {
      setModalError(getApiErrorMessage(err, 'Failed to save pipeline stage.'));
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
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              placeholder={t('recruitment.searchStage', 'Search stage name or code...')}
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
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-[#E5AD06] sm:w-auto"
            >
              <Plus size={18} />
              <span>{t('recruitment.addStage', 'Add Stage')}</span>
            </button>
          ) : null}
        </div>

        {loading ? (
          <BrandLoader variant="section" size="sm" bg="light" text={t('recruitment.analyticsLoading', 'Loading pipeline stages...')} />
        ) : filteredStages.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
              <Kanban size={32} className="text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{t('recruitment.noPipelineStagesFound', 'No Pipeline Stages Found')}</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              {search ? t('recruitment.noPipelineStagesMatch', 'No pipeline stages match your active search filter.') : t('recruitment.createCustomStages', 'Create custom pipeline stages to match your hiring flow.')}
            </p>
            {canCreate ? (
              <button
                onClick={openAddModal}
                className="mt-6 flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06]"
              >
                <Plus size={18} />
                <span>{t('recruitment.addStage', 'Add Stage')}</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid min-h-[300px] grid-cols-1 gap-5 p-4 pb-32 sm:grid-cols-2 sm:p-6 lg:grid-cols-3 xl:grid-cols-4">
            {filteredStages.map((stage, index) => {
              const isNearBottom = index >= filteredStages.length - 4;
              const isOpen = openActionDropdownId === stage.id;
              const stageTone = getRecruitmentStageTone(stage.color);
              const canDelete = (stage.usageCount || 0) === 0;

              return (
                <div
                  key={stage.id || stage.code}
                  className={`group relative flex flex-col rounded-2xl border bg-white p-5 shadow-xs transition-all duration-200 ${
                    isOpen
                      ? 'z-40 border-amber-400 ring-2 ring-amber-400/20 shadow-md'
                      : 'z-1 border-gray-100 hover:-translate-y-1 hover:border-amber-200 hover:shadow-md'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-2xs">
                        <span className={`h-3.5 w-3.5 rounded-full ${stageTone.dot}`} />
                      </div>

                      {(canUpdate || canDeletePipelineStage) ? <div className="relative inline-block text-left stage-action-dropdown-container shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenActionDropdownId(isOpen ? null : stage.id || null);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2"
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
                                openEditModal(stage);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                            >
                              <Pencil className="h-4 w-4" />
                              <span>{t('recruitment.editStage', 'Edit Stage')}</span>
                            </button> : null}

                            {canUpdate && canDeletePipelineStage ? <div className="my-1 h-px bg-gray-100" /> : null}

                              {canDeletePipelineStage ? <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenActionDropdownId(null);
                                openDeleteModal(stage);
                              }}
                              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                                canDelete
                                  ? 'text-red-600 hover:bg-red-50'
                                  : 'text-gray-400 hover:bg-gray-50 cursor-default'
                              }`}
                            >
                              <Trash2 className="h-4 w-4" />
                              <div className="flex flex-col">
                                <span>{canDelete ? t('recruitment.deleteStage', 'Delete Stage') : 'In Use'}</span>
                                {!canDelete && (
                                  <span className="text-[10px] font-normal text-gray-400">
                                    {`In use by ${stage.usageCount} app(s)`}
                                  </span>
                                )}
                              </div>
                            </button> : null}
                          </div>
                        )}
                      </div> : null}
                    </div>

                    <div className="mt-4">
                      <h4 className="text-sm font-bold tracking-wide text-gray-900 leading-snug break-words transition-colors group-hover:text-amber-800">
                        {stage.name}
                      </h4>
                      {!canDelete && (
                        <p className="mt-1 text-[10px] font-medium text-gray-400">
                          {`Used by ${stage.usageCount} application(s)`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <h3 className="text-xl font-bold text-gray-900">
                {editingId ? t('recruitment.editStage', 'Edit Stage') : t('recruitment.addStage', 'Add Stage')}
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
                <div className="rounded-md bg-red-50 p-3 text-xs font-medium text-red-700">
                  {modalError}
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('recruitment.stageName', 'Stage Name')} *</label>
                <input
                  type="text"
                  value={stageName}
                  onChange={(e) => {
                    setStageName(e.target.value);
                    if (!editingId) {
                      setStageCode(buildStageCode(e.target.value));
                    }
                  }}
                  placeholder="e.g. Background Check"
                  className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('recruitment.stageColor', 'Stage Color')} *</label>
                <select
                  value={stageColor}
                  onChange={(e) => setStageColor(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
                >
                  {STAGE_COLOR_OPTIONS.map((color) => (
                    <option key={color} value={color}>
                      {color.charAt(0).toUpperCase() + color.slice(1)}
                    </option>
                  ))}
                </select>
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
                  disabled={saving || !stageName.trim()}
                  className="rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:opacity-50"
                >
                  {saving ? t('recruitment.saving', 'Saving...') : editingId ? t('recruitment.editStage', 'Update Stage') : t('recruitment.addStage', 'Add Stage')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isDeleteModalOpen && deletingStage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="text-red-600" size={32} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900">{t('recruitment.deleteStage', 'Delete Stage')}</h3>
            <p className="mb-4 text-sm text-gray-500">
              {t('recruitment.deleteStageConfirm', 'Are you sure you want to delete "{name}"?').replace('{name}', deletingStage.name)}
            </p>
            {deleteError ? (
              <div className="mb-4 rounded-md bg-red-50 p-2.5 text-left text-xs font-medium text-red-700">
                {deleteError}
              </div>
            ) : (
              <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-800">
                {t('recruitment.deleteStageAllowed', 'Deleting a stage is allowed when it is not used by any application.')}
              </p>
            )}
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
                disabled={isDeleting || (deletingStage.usageCount || 0) > 0}
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
