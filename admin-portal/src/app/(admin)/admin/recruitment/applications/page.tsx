'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { formatDate } from '@/lib/i18n/formatters';
import { useAuthStore } from '@/store/authStore';
import { canUseRecruitmentPermission, recruitmentPermissions } from '@/lib/recruitmentPermissions';
import BrandLoader from '@/components/ui/BrandLoader';
import { useTranslation } from '@/hooks/useTranslation';
import { downloadSecureDocument } from '@/lib/secureDownload';
import {
  DEFAULT_RECRUITMENT_STAGES,
  RecruitmentStage,
  formatRecruitmentStageLabel,
  getRecruitmentStageByCode,
  getRecruitmentStageTone,
  normalizeRecruitmentStages,
} from '@/lib/recruitmentStages';
import {
  Search,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  ChevronDown,
  Kanban,
  Table2,
  Star,
  Calendar,
  MoreVertical,
  Eye,
  Download,
  Trash2,
  AlertTriangle,
  Mail,
  Phone,
} from 'lucide-react';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { isInterviewNotificationActive } from '@/lib/interviewNotification';
import {
  generateRecruitmentApplicationDetailPath,
  getRecruitmentPortalBasePath,
} from '@/lib/routePaths';

interface ApplicationListItem {
  id: string;
  applicationRef: string;
  currentStage: string;
  terminalStatus?: string | null;
  overallRating?: number | null;
  appliedAt: string;
  candidate: {
    id: string;
    fullName: string;
    email: string;
    mobile: string;
    currentCompany?: string | null;
    totalExperience?: number | null;
  };
  job: {
    id: string;
    title: string;
    jobCode: string;
    locationCity: string;
    department?: { name: string };
  };
  documents?: Array<{
    id: string;
    category: string;
    fileName: string;
    fileUrl: string;
    uploadedAt: string;
  }>;
  assignedRecruiter?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface JobOption {
  id: string;
  title: string;
}

interface ScheduledInterviewNotification {
  applicationId: string;
  scheduledAt: string;
  durationMinutes: number;
}

interface StageSelectDropdownProps {
  currentStage: string;
  onStageChange: (newStage: string) => void;
  dropUp?: boolean;
  stages: RecruitmentStage[];
}

function StageSelectDropdown({ currentStage, onStageChange, stages }: StageSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; isUp: boolean }>({ top: 0, left: 0, isUp: false });
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const updateCoords = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const isUp = spaceBelow < 260 && rect.top > 260;
    setCoords({
      top: isUp ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(10, Math.min(rect.left, window.innerWidth - 210)),
      isUp,
    });
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updateCoords();
    }
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updateCoords();
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const activeStage =
    getRecruitmentStageByCode(stages, currentStage) || {
      code: currentStage,
      name: formatRecruitmentStageLabel(currentStage),
      order: 0,
      color: 'gray',
    };
  const activeStageTone = getRecruitmentStageTone(activeStage.color);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold shadow-2xs transition-all hover:opacity-90 active:scale-95 cursor-pointer ${activeStageTone.pill}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${activeStageTone.dot}`} />
        <span>{activeStage.name}</span>
        <ChevronDown className={`h-3 w-3 text-current transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: `${coords.left}px`,
            ...(coords.isUp
              ? { bottom: `${window.innerHeight - coords.top}px` }
              : { top: `${coords.top}px` }),
          }}
          className="z-[99999] w-52 overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-1.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-h-64 overflow-y-auto space-y-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {stages.map((stage) => {
              const isSelected = stage.code === currentStage;
              const stageTone = getRecruitmentStageTone(stage.color);
              return (
                <button
                  key={stage.code}
                  type="button"
                  onClick={() => {
                    onStageChange(stage.code);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors duration-150 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-50/80 font-bold text-gray-950 shadow-2xs'
                      : 'text-gray-700 font-medium hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stageTone.dot}`} />
                    <span className="leading-tight text-[13px] text-gray-900 font-semibold">{stage.name}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#E5A700] stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

interface CustomFilterSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  onOpen?: () => void;
}

function CustomFilterSelect({ value, onChange, options, placeholder, onOpen }: CustomFilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const filterRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="relative inline-block text-left" ref={filterRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            if (next) onOpen?.();
            return next;
          });
        }}
        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-white hover:border-gray-300 focus:outline-none transition-all cursor-pointer"
      >
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[200px] origin-top-left rounded-2xl border border-black bg-white p-1.5 shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-60 overflow-y-auto space-y-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors ${!value ? 'bg-gray-100 text-gray-900 font-bold' : 'text-gray-700 hover:bg-gray-50'
                }`}
            >
              <span>{placeholder}</span>
              {!value && <CheckCircle2 className="h-3.5 w-3.5 text-gray-900" />}
            </button>
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors ${isSelected ? 'bg-gray-100 text-gray-900 font-bold' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-gray-900" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RatingBadge({ rating }: { rating?: number | null }) {
  if (typeof rating !== 'number' || Number.isNaN(rating)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-extrabold text-gray-400">
        <Star size={11} className="text-gray-300" />
        <span>Not rated</span>
      </span>
    );
  }

  const tone =
    rating >= 4.5
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : rating >= 3.5
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-rose-200 bg-rose-50 text-rose-800';

  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-extrabold ${tone}`}>
      <Star size={11} className="fill-current" />
      <span>{rating.toFixed(1)} / 5</span>
    </span>
  );
}

export default function AdminApplicationsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const recruitmentBasePath = getRecruitmentPortalBasePath(pathname);
  const currentUser = useAuthStore((state) => state.user);
  const canUpdateStage = canUseRecruitmentPermission(currentUser, recruitmentPermissions.applicationsUpdateStage);
  const canDeleteApplication = canUseRecruitmentPermission(currentUser, recruitmentPermissions.applicationsDelete);
  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [stageFilter, setStageFilter] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const jobSlugFilter = searchParams.get('jobSlug')?.trim() || '';
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openPageSizeDropdown, setOpenPageSizeDropdown] = useState(false);
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApplicationListItem | null>(null);
  const [deletingApplicationId, setDeletingApplicationId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadingResumeId, setDownloadingResumeId] = useState<string | null>(null);
  const [draggedApplicationId, setDraggedApplicationId] = useState<string | null>(null);
  const [dropTargetStage, setDropTargetStage] = useState<string | null>(null);
  const [movingApplicationId, setMovingApplicationId] = useState<string | null>(null);
  const isDraggingRef = React.useRef(false);
  const [scheduledInterviews, setScheduledInterviews] = useState<ScheduledInterviewNotification[]>([]);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement;
      if (!target?.closest?.('.rows-per-page-dropdown-container')) {
        setOpenPageSizeDropdown(false);
      }
      if (!target?.closest?.('.application-action-dropdown-container')) {
        setOpenActionDropdownId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const [jobsList, setJobsList] = useState<Array<{ id: string; title: string }>>([]);
  const [hasLoadedJobOptions, setHasLoadedJobOptions] = useState(false);
  const [stages, setStages] = useState<RecruitmentStage[]>(DEFAULT_RECRUITMENT_STAGES);

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, string> = { includeMeta: 'true', limit: '100' };
      if (searchTerm.trim()) params.q = searchTerm.trim();
      if (stageFilter) params.stage = stageFilter;
      if (jobFilter) params.jobId = jobFilter;
      else if (jobSlugFilter) params.jobSlug = jobSlugFilter;

      const appRes = await api.get('/recruitment/admin/applications', { params });

      let rawApps: ApplicationListItem[] = [];
      if (appRes.data?.success) rawApps = appRes.data.applications || [];
      setApplications(rawApps);
    } catch (err: unknown) {
      console.error('Failed to load applications:', err);
      setError('Unable to load job applications.');
    } finally {
      setLoading(false);
    }
  }, [jobFilter, jobSlugFilter, searchTerm, stageFilter]);

  const fetchJobOptions = useCallback(async () => {
    if (hasLoadedJobOptions) return;

    try {
      const res = await api.get('/recruitment/admin/jobs?limit=100&compact=true');
      if (res.data?.success && res.data.jobs) {
        setJobsList(res.data.jobs.map((j: JobOption) => ({ id: j.id, title: j.title })));
        setHasLoadedJobOptions(true);
      }
    } catch (err) {
      console.warn('Failed to load recruitment job options:', err);
    }
  }, [hasLoadedJobOptions]);

  const fetchPipelineStages = useCallback(async () => {
    try {
      const res = await api.get('/recruitment/admin/settings', { params: { section: 'pipeline' } });
      if (res.data?.success) {
        const nextStages = normalizeRecruitmentStages(res.data.data?.stages || res.data.stages || []);
        setStages(nextStages);
        return;
      }
    } catch (error) {
      console.warn('Failed to load recruitment stages, using defaults:', error);
    }

    setStages(DEFAULT_RECRUITMENT_STAGES);
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const fetchScheduledInterviews = useCallback(async () => {
    try {
      const res = await api.get('/recruitment/admin/interviews', {
        params: { status: 'SCHEDULED', limit: '100' },
      });
      const list = res.data?.interviews || res.data?.data;
      if (!Array.isArray(list)) return;

      const notifications = list
        .map((interview: { application?: { id?: string }; scheduledAt?: string; durationMinutes?: number }) => {
          const applicationId = interview.application?.id;
          const scheduledAt = interview.scheduledAt;
          if (typeof applicationId !== 'string' || typeof scheduledAt !== 'string') return null;
          return { applicationId, scheduledAt, durationMinutes: interview.durationMinutes ?? 60 };
        })
        .filter((interview): interview is ScheduledInterviewNotification => interview !== null);
      setScheduledInterviews(notifications);
    } catch (err) {
      console.warn('Failed to load interview notifications:', err);
    }
  }, []);

  useEffect(() => {
    void fetchScheduledInterviews();
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
      void fetchScheduledInterviews();
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [fetchScheduledInterviews]);

  const activeInterviewApplicationIds = useMemo(() => {
    return new Set(
      scheduledInterviews
        .filter((interview) => isInterviewNotificationActive(interview.scheduledAt, interview.durationMinutes, currentTime))
        .map((interview) => interview.applicationId),
    );
  }, [currentTime, scheduledInterviews]);

  useEffect(() => {
    void fetchPipelineStages();
  }, [fetchPipelineStages]);

  useEffect(() => {
    const handleGlobalRefresh = () => {
      void fetchApplications();
    };

    window.addEventListener('recruitment_applications_updated', handleGlobalRefresh);
    window.addEventListener('recruitment_offers_updated', handleGlobalRefresh);
    window.addEventListener('recruitment_interviews_updated', handleGlobalRefresh);
    window.addEventListener('recruitment_pipeline_stages_updated', handleGlobalRefresh);
    return () => {
      window.removeEventListener('recruitment_applications_updated', handleGlobalRefresh);
      window.removeEventListener('recruitment_offers_updated', handleGlobalRefresh);
      window.removeEventListener('recruitment_interviews_updated', handleGlobalRefresh);
      window.removeEventListener('recruitment_pipeline_stages_updated', handleGlobalRefresh);
    };
  }, [fetchApplications]);

  const handleQuickStageChange = async (applicationId: string, toStage: string, notify = false) => {
    if (!canUpdateStage) return;
    const targetApplication = applications.find((a) => a.id === applicationId);
    const previousStage = targetApplication?.currentStage;
    if (previousStage === toStage) return;

    // Instant Optimistic Update!
    setApplications((prev) =>
      prev.map((a) => (a.id === applicationId ? { ...a, currentStage: toStage } : a))
    );

    try {
      setMovingApplicationId(applicationId);
      const res = await api.patch(`/recruitment/admin/applications/${applicationId}/stage`, { toStage });
      if (!res.data?.success) {
        setApplications((prev) =>
          prev.map((a) => (a.id === applicationId ? { ...a, currentStage: previousStage || toStage } : a))
        );
        toast.error('Unable to update application stage.');
      } else if (notify) {
        const stageLabel = getRecruitmentStageByCode(stages, toStage)?.name || formatRecruitmentStageLabel(toStage);
        toast.success(`${targetApplication?.candidate.fullName || 'Candidate'} moved to ${stageLabel}.`);
      }
    } catch {
      setApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, currentStage: previousStage || toStage } : a))
      );
      toast.error('Failed to update application stage.');
    } finally {
      setMovingApplicationId(null);
      setDropTargetStage(null);
    }
  };

  const handleKanbanDrop = (toStage: string) => {
    if (!draggedApplicationId) return;
    const applicationId = draggedApplicationId;
    setDraggedApplicationId(null);
    void handleQuickStageChange(applicationId, toStage, true);
  };

  const openDeleteModal = (application: ApplicationListItem) => {
    setDeleteTarget(application);
    setDeleteError(null);
    setOpenActionDropdownId(null);
  };

  const closeDeleteModal = () => {
    if (deletingApplicationId) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleDeleteApplication = async () => {
    if (!canDeleteApplication) return;
    if (!deleteTarget) return;

    try {
      setDeletingApplicationId(deleteTarget.id);
      setDeleteError(null);
      const res = await api.delete(`/recruitment/admin/applications/${deleteTarget.id}`);
      if (res.data?.success) {
        setApplications((prev) => prev.filter((app) => app.id !== deleteTarget.id));
        toast.success(`Application for "${deleteTarget.candidate.fullName}" deleted successfully.`);
        setDeleteTarget(null);
        setCurrentPage(1);
      } else {
        const errMsg = res.data?.error || 'Unable to delete application.';
        setDeleteError(errMsg);
        toast.error(errMsg);
      }
    } catch (err: unknown) {
      console.error('Failed to delete application:', err);
      const errMsg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Unable to delete application. Please try again.'
          : 'Unable to delete application. Please try again.';
      setDeleteError(errMsg);
      toast.error(errMsg);
    } finally {
      setDeletingApplicationId(null);
    }
  };

  const handleResumeDownload = async (application: ApplicationListItem) => {
    const resumeDocument = application.documents?.find((doc) => doc.category === 'RESUME') || application.documents?.[0];
    if (!resumeDocument) return;

    try {
      setDownloadingResumeId(application.id);
      await downloadSecureDocument(resumeDocument.fileUrl, resumeDocument.fileName);
    } catch (err) {
      console.error('Failed to download resume:', err);
      alert('Unable to download resume right now.');
    } finally {
      setDownloadingResumeId(null);
    }
  };

  const filteredApps = useMemo(() => {
    const q = deferredSearchTerm.trim().toLowerCase();
    if (!q) return applications;

    return applications.filter((app) => (
      app.candidate.fullName.toLowerCase().includes(q) ||
      app.candidate.email.toLowerCase().includes(q) ||
      app.candidate.mobile.includes(q) ||
      app.applicationRef.toLowerCase().includes(q) ||
      app.job.title.toLowerCase().includes(q)
    ));
  }, [applications, deferredSearchTerm]);

  const totalPages = Math.ceil(filteredApps.length / pageSize) || 1;
  const paginatedApps = useMemo(
    () => filteredApps.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredApps, pageSize]
  );
  const startItemIndex = filteredApps.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItemIndex = Math.min(currentPage * pageSize, filteredApps.length);
  const stagedApps = useMemo(() => {
    const grouped = stages.reduce<Record<string, ApplicationListItem[]>>((acc, stage) => {
      acc[stage.code] = [];
      return acc;
    }, {});

    filteredApps.forEach((app) => {
      if (!grouped[app.currentStage]) grouped[app.currentStage] = [];
      grouped[app.currentStage].push(app);
    });

    return grouped;
  }, [filteredApps, stages]);

  const stageFilterOptions = useMemo(
    () => stages.map((stage) => ({ value: stage.code, label: stage.name })),
    [stages]
  );

  const visibleStageSummary = useMemo(
    () => stages.slice(0, 5).map((stage) => ({ ...stage, tone: getRecruitmentStageTone(stage.color) })),
    [stages]
  );

  const ratingStats = useMemo(() => {
    const ratedApps = filteredApps.filter((app) => typeof app.overallRating === 'number' && !Number.isNaN(app.overallRating));
    const averageRating = ratedApps.length
      ? ratedApps.reduce((sum, app) => sum + (app.overallRating as number), 0) / ratedApps.length
      : null;

    return {
      ratedCount: ratedApps.length,
      unratedCount: filteredApps.length - ratedApps.length,
      averageRating,
    };
  }, [filteredApps]);

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <main className="max-w-7xl mx-auto px-0 pt-0 pb-6 w-full space-y-4 flex-grow">
        {/* Filter Bar */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 shadow-sm flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex items-center w-full sm:w-72 md:w-80">
              <Search size={16} className="absolute left-3 text-gray-400" />
              <input
                type="text"
                placeholder={t('recruitment.searchApplications', 'Search candidate name, email, mobile, ref...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <CustomFilterSelect
                value={stageFilter}
                onChange={(val) => setStageFilter(val)}
                placeholder={t('recruitment.allHiringStages', 'All Hiring Stages')}
                options={stageFilterOptions}
              />

              <CustomFilterSelect
                value={jobFilter}
                onChange={(val) => setJobFilter(val)}
                placeholder={t('recruitment.allPositions', 'All Positions')}
                onOpen={() => void fetchJobOptions()}
                options={jobsList.map((j) => ({ value: j.id, label: j.title }))}
              />

              <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-2 rounded-xl border border-gray-200 shrink-0">
                {t('recruitment.total', 'Total')}: {filteredApps.length}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title={t('recruitment.listView', 'List View')}
                className={`inline-flex items-center justify-center rounded-lg p-1.5 text-xs font-extrabold transition ${viewMode === 'list' ? 'bg-white text-gray-950 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
              >
                <Table2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                title={t('recruitment.kanbanView', 'Kanban View')}
                className={`inline-flex items-center justify-center rounded-lg p-1.5 text-xs font-extrabold transition ${viewMode === 'kanban' ? 'bg-[#FFC107] text-black shadow-2xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
              >
                <Kanban size={16} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {visibleStageSummary.map((stage) => (
                <span key={stage.code} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${stage.tone.pill}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${stage.tone.dot}`} />
                  {stage.name}: {stagedApps[stage.code]?.length || 0}
                </span>
              ))}
              {ratingStats.averageRating !== null ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900">
                  <Star size={11} className="fill-amber-500 text-amber-500" />
                  Avg Rating: {ratingStats.averageRating.toFixed(1)} / 5
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-bold text-gray-600">
                <Star size={11} className="text-gray-300" />
                Rated: {ratingStats.ratedCount}
              </span>
            </div>
          </div>
        </div>

        {/* Applications Table Container */}
        {loading ? (
          <BrandLoader variant="section" size="md" bg="light" text={t('recruitment.loadingApplications', 'Loading Job Applications...')} className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm" />
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm flex flex-col">
            <div className="overflow-x-auto min-h-[400px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <table className="w-full text-left border-collapse" style={{minWidth: '700px'}}>
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-100 text-[10px] uppercase font-bold text-gray-400">
                    <th className="py-3 px-4 whitespace-nowrap">{t('recruitment.refCandidate', 'Ref & Candidate')}</th>
                    <th className="py-3 px-4 whitespace-nowrap">{t('recruitment.appliedJob', 'Applied Job')}</th>
                    <th className="py-3 px-4 whitespace-nowrap">{t('recruitment.experience', 'Experience')}</th>
                    <th className="py-3 px-4 whitespace-nowrap">{t('recruitment.applied', 'Applied Date')}</th>
                    <th className="py-3 px-4 whitespace-nowrap">{t('recruitment.stageStatus', 'Stage Status')}</th>
                    <th className="py-3 px-4 whitespace-nowrap">{t('recruitment.resume', 'Resume')}</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">{t('recruitment.actions', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">

                  {!loading && error && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-xs font-semibold text-red-500">
                        {error}
                      </td>
                    </tr>
                  )}

                  {!loading && !error && paginatedApps.map((app, index) => {
                    const isNearBottom = index >= 3 && index >= paginatedApps.length - 2;
                    const isDeleting = deletingApplicationId === app.id;

                    return (
                      <tr
                        key={app.id}
                        onClick={() => router.push(generateRecruitmentApplicationDetailPath(recruitmentBasePath, app))}
                        className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-[10px] text-amber-600 font-bold block">{app.applicationRef}</span>
                          <span className="font-bold text-gray-900 block text-xs">
                            <span className="inline-flex items-center gap-2">
                              {app.candidate.fullName}
                              {activeInterviewApplicationIds.has(app.id) && (
                                <span
                                  className="relative inline-flex h-2.5 w-2.5"
                                  title="Interview notification active"
                                  aria-label="Interview notification active"
                                  role="status"
                                >
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
                                </span>
                              )}
                            </span>
                          </span>
                          <div className="mt-1 flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                              <Mail size={10} className="shrink-0 text-gray-400" />
                              <span className="truncate max-w-[160px]" title={app.candidate.email}>{app.candidate.email}</span>
                            </div>
                            {app.candidate.mobile && (
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                <Phone size={10} className="shrink-0 text-gray-400" />
                                <span className="truncate max-w-[160px]">{app.candidate.mobile}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-2">
                            <RatingBadge rating={app.overallRating} />
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-gray-800">
                          {app.job.title}
                          <span className="block text-[10px] text-gray-400 font-normal">{app.job.department?.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-gray-600 font-medium">
                          {app.candidate.totalExperience ? `${app.candidate.totalExperience} Yrs` : 'N/A'}
                        </td>
                        <td className="py-3.5 px-4 text-gray-500 text-[11px]">
                          {formatDate(app.appliedAt)}
                        </td>
                        <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                          {canUpdateStage ? <StageSelectDropdown
                              currentStage={app.currentStage}
                              onStageChange={(newStage) => handleQuickStageChange(app.id, newStage)}
                              dropUp={isNearBottom}
                              stages={stages}
                            /> : <span className="text-xs font-bold text-gray-700">{formatRecruitmentStageLabel(app.currentStage)}</span>}
                        </td>
                        <td className="py-3.5 px-4">
                          {app.documents?.find((doc) => doc.category === 'RESUME') || app.documents?.[0] ? (
                            <button
                              type="button"
                              disabled={downloadingResumeId === app.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleResumeDownload(app);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Download size={12} />
                              <span>{downloadingResumeId === app.id ? 'Downloading...' : 'Download'}</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-300">No resume</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="relative inline-block text-left application-action-dropdown-container">
                            <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => setOpenActionDropdownId((prev) => (prev === app.id ? null : app.id))}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Open actions for ${app.candidate.fullName}`}
                              >
                                <MoreVertical size={16} />
                              </button>

                            {openActionDropdownId === app.id && (
                              <div className={`absolute right-0 z-[100] w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 ${isNearBottom ? 'bottom-full mb-1 origin-bottom-right' : 'top-full mt-1 origin-top-right'
                                }`}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionDropdownId(null);
                                    router.push(generateRecruitmentApplicationDetailPath(recruitmentBasePath, app));
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                >
                                  <Eye size={14} className="text-gray-400" />
                                  <span>View Details</span>
                                </button>

                                {canDeleteApplication ? <div className="my-1 border-t border-gray-100" /> : null}

                                {canDeleteApplication ? <button
                                  type="button"
                                  onClick={() => openDeleteModal(app)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={14} className="text-red-500" />
                                  <span>Delete</span>
                                </button> : null}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && !error && filteredApps.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-gray-400">
                        No applications found matching search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer - Matches Jobs/Listings module */}
            {filteredApps.length > 0 && (
              <div className="flex flex-col gap-4 border-t border-gray-100 bg-white px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-gray-500 sm:justify-start">
                  <div>
                    Showing <span className="font-bold text-gray-900">{startItemIndex}</span> to{' '}
                    <span className="font-bold text-gray-900">{endItemIndex}</span> of{' '}
                    <span className="font-bold text-gray-900">{filteredApps.length}</span> entries
                  </div>

                  <div className="flex items-center gap-2">
                    <span>Rows per page:</span>
                    <div className="relative rows-per-page-dropdown-container">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenPageSizeDropdown((prev) => !prev);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-800 shadow-2xs transition hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      >
                        <span>{pageSize}</span>
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                      </button>

                      {openPageSizeDropdown && (
                        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-20 origin-bottom-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
                          {[5, 10, 25, 50].map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPageSize(size);
                                setCurrentPage(1);
                                setOpenPageSizeDropdown(false);
                              }}
                              className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-100 ${pageSize === size ? 'bg-[#FFC107]/20 font-extrabold text-gray-900' : 'font-medium text-gray-700'
                                }`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-1 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {buildPaginationItems(currentPage, totalPages).map((item, idx) =>
                      typeof item === 'number' ? (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setCurrentPage(item)}
                          className={`h-8 w-8 rounded-lg text-xs font-bold transition ${currentPage === item ? 'bg-[#FFC107] text-black shadow-2xs' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                          {item}
                        </button>
                      ) : (
                        <span key={`ellipsis-${idx}`} className="px-1 text-xs font-bold text-gray-400">
                          ...
                        </span>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
            {loading ? (
              <div className="p-10 text-center text-xs font-semibold text-gray-400">
                Loading kanban board...
              </div>
            ) : error ? (
              <div className="p-10 text-center text-xs font-semibold text-red-500">
                {error}
              </div>
            ) : (
              <div className="relative group">
                {/* Left Arrow */}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('kanban-scroll-container');
                    if (el) el.scrollBy({ left: -300, behavior: 'smooth' });
                  }}
                  className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 group-hover:flex"
                >
                  <ChevronLeft size={18} />
                </button>

                {/* Right Arrow */}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('kanban-scroll-container');
                    if (el) el.scrollBy({ left: 300, behavior: 'smooth' });
                  }}
                  className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 group-hover:flex"
                >
                  <ChevronRight size={18} />
                </button>

                <div
                  id="kanban-scroll-container"
                  onDragOver={(e) => {
                    const container = e.currentTarget;
                    const rect = container.getBoundingClientRect();
                    const edgeThreshold = 100;
                    if (e.clientX - rect.left < edgeThreshold) {
                      container.scrollBy({ left: -10, behavior: 'auto' });
                    } else if (rect.right - e.clientX < edgeThreshold) {
                      container.scrollBy({ left: 10, behavior: 'auto' });
                    }
                  }}
                  className="flex gap-4 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
                >
                  {stages.map((stage) => {
                    const stageApps = stagedApps[stage.code] || [];
                    const isDropTarget = dropTargetStage === stage.code;
                    const stageTone = getRecruitmentStageTone(stage.color);

                    return (
                      <section
                        key={stage.code}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDropTargetStage(stage.code);
                        }}
                        onDragLeave={() => setDropTargetStage(null)}
                        onDrop={() => handleKanbanDrop(stage.code)}
                        className={`flex min-h-[520px] w-[290px] shrink-0 flex-col rounded-2xl border border-gray-200 bg-gray-50/50 transition-all ${isDropTarget ? 'ring-2 ring-[#FFC107] ring-offset-2' : ''
                          }`}
                      >
                        <div className={`rounded-t-2xl border-b border-gray-100 bg-white px-4 py-3 ${stageTone.soft}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${stageTone.dot}`} />
                              <h3 className="text-xs font-extrabold uppercase text-gray-900">{stage.name}</h3>
                            </div>
                            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-extrabold text-gray-800">
                              {stageApps.length}
                            </span>
                          </div>
                        </div>

                        <div className="flex-1 space-y-3 p-3">
                          {stageApps.map((app) => (
                            <article
                              key={app.id}
                              draggable={canUpdateStage}
                              onDragStart={() => {
                                isDraggingRef.current = true;
                                setDraggedApplicationId(app.id);
                              }}
                              onDragEnd={() => {
                                setTimeout(() => { isDraggingRef.current = false; }, 100);
                                setDraggedApplicationId(null);
                                setDropTargetStage(null);
                              }}
                              onClick={() => {
                                if (!isDraggingRef.current) {
                                  router.push(generateRecruitmentApplicationDetailPath(recruitmentBasePath, app));
                                }
                              }}
                              className={`rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-amber-300 hover:shadow-md cursor-pointer ${movingApplicationId === app.id ? 'opacity-60' : ''
                                }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-mono text-[10px] font-bold text-amber-600">{app.applicationRef}</p>
                                  <p className="mt-1 block max-w-full truncate text-left text-sm font-extrabold text-gray-900">
                                    <span className="inline-flex max-w-full items-center gap-2">
                                      <span className="truncate">{app.candidate.fullName}</span>
                                      {activeInterviewApplicationIds.has(app.id) && (
                                        <span
                                          className="relative inline-flex h-2.5 w-2.5 shrink-0"
                                          title="Interview notification active"
                                          aria-label="Interview notification active"
                                          role="status"
                                        >
                                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
                                        </span>
                                      )}
                                    </span>
                                  </p>
                                  <p className="truncate text-[11px] font-medium text-gray-500">{app.job.title}</p>
                                </div>
                                <RatingBadge rating={app.overallRating} />
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 text-[10px] text-gray-500">
                                <span className="inline-flex items-center gap-1">
                                  <Calendar size={11} />
                                  {formatDate(app.appliedAt)}
                                </span>
                                <span className="truncate text-right">{app.candidate.totalExperience ? `${app.candidate.totalExperience} Yrs` : 'N/A'}</span>
                              </div>

                              <div className="mt-3 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                                  Details
                                  <ChevronRight size={13} />
                                </span>
                                {canUpdateStage ? <StageSelectDropdown
                                    currentStage={app.currentStage}
                                    onStageChange={(newStage) => handleQuickStageChange(app.id, newStage, true)}
                                    dropUp
                                    stages={stages}
                                  /> : <span className="text-[11px] font-bold text-gray-700">{formatRecruitmentStageLabel(app.currentStage)}</span>}
                              </div>
                            </article>
                          ))}

                          {stageApps.length === 0 ? (
                            <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white/70 px-4 text-center text-[11px] font-medium text-gray-400">
                              Drop candidates here
                            </div>
                          ) : null}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="text-red-600" size={32} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900">Delete Application</h3>
            <p className="mb-4 text-sm text-gray-500">
              Are you sure you want to delete{' '}
              <span className="font-bold text-gray-900">&quot;{deleteTarget.candidate.fullName}&quot;</span>
              {' '}application for{' '}
              <span className="font-bold text-gray-900">&quot;{deleteTarget.job.title}&quot;</span>?
            </p>
            <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-left text-xs font-medium text-red-700">
              This removes the application workspace, stage history, notes, ratings, interviews, and offers. Candidate profile and uploaded documents stay safe.
            </p>
            {deleteError ? (
              <div className="mb-4 rounded-md bg-red-50 p-2.5 text-left text-xs font-medium text-red-700">
                {deleteError}
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={Boolean(deletingApplicationId)}
                className="w-full rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteApplication()}
                disabled={Boolean(deletingApplicationId)}
                className="w-full rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 sm:w-auto"
              >
                {deletingApplicationId ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
