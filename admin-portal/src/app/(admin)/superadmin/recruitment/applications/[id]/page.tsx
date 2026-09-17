'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatDate as formatDisplayDate, formatDateTime as formatDisplayDateTime } from '@/lib/i18n/formatters';
import BrandLoader from '@/components/ui/BrandLoader';
import { downloadSecureDocument } from '@/lib/secureDownload';
import { useAuthStore } from '@/store/authStore';
import { canUseRecruitmentPermission, recruitmentPermissions } from '@/lib/recruitmentPermissions';
import RatingDropdown from '@/components/recruitment/RatingDropdown';
import { toast } from 'react-toastify';
import { isUuid } from '@/lib/routeSlug';
import {
  generateRecruitmentApplicationDetailPath,
  getRecruitmentPortalBasePath,
} from '@/lib/routePaths';
import {
  DEFAULT_RECRUITMENT_STAGES,
  RecruitmentStage,
  formatRecruitmentStageLabel,
  getRecruitmentStageByCode,
  getRecruitmentStageTone,
  normalizeRecruitmentStages,
} from '@/lib/recruitmentStages';
import {
  Mail,
  Phone,
  MapPin,
  Building2,
  Briefcase,
  Calendar,
  Clock,
  Star,
  FileQuestion,
  GraduationCap,
  IndianRupee,
  ListChecks,
  ChevronLeft,
  Download,
  PlusCircle,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  CheckCircle2,
  Edit3,
  Trash2,
  Loader2,
} from 'lucide-react';

interface StageSelectDropdownProps {
  currentStage: string;
  onStageChange: (newStage: string) => void;
  stages: RecruitmentStage[];
}

function StageSelectDropdown({ currentStage, onStageChange, stages }: StageSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  const activeStage =
    getRecruitmentStageByCode(stages, currentStage) || {
      code: currentStage,
      name: formatRecruitmentStageLabel(currentStage),
      order: 0,
      color: 'gray',
    };
  const activeStageTone = getRecruitmentStageTone(activeStage.color);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition-all hover:opacity-90 active:scale-95 cursor-pointer ${activeStageTone.pill}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${activeStageTone.dot}`} />
        <span>{activeStage.name}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-current transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-[100] mt-2 w-52 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-100 origin-top-right">
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
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors duration-150 ${
                    isSelected
                      ? 'bg-amber-50/80 font-bold text-gray-950'
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
        </div>
      )}
    </div>
  );

}

function InterviewTypeDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const options = [
    { value: 'VIDEO', label: 'Video Call' },
    { value: 'PHONE', label: 'Phone Call' },
    { value: 'IN_PERSON', label: 'In Person' },
  ];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
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

  const selectedOption = options.find((o) => o.value === value) || options[0];

  return (
    <div className="relative inline-block w-full text-left" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-900 hover:border-gray-300 focus:outline-none transition-all cursor-pointer shadow-sm"
      >
        <span className="text-gray-900 font-semibold">{selectedOption.label}</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-[100] mt-1.5 w-full min-w-[140px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-64 overflow-y-auto space-y-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors duration-150 ${
                    isSelected
                      ? 'bg-amber-50/80 font-bold text-gray-950'
                      : 'text-gray-700 font-medium hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <span className="leading-tight text-[13px]">{opt.label}</span>
                  {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#E5A700] stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


interface ApplicationWorkspaceData {
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
    currentCity?: string | null;
    state?: string | null;
    address?: string | null;
    currentCompany?: string | null;
    currentDesignation?: string | null;
    totalExperience?: number | null;
    relevantExperience?: number | null;
    currentCtc?: number | string | null;
    expectedCtc?: number | string | null;
    noticePeriod?: string | null;
    employmentStatus?: string | null;
    linkedInUrl?: string | null;
    portfolioUrl?: string | null;
    coverLetter?: string | null;
    inTalentPool?: boolean;
    talentPoolCategory?: string | null;
  };
  job: {
    id: string;
    title: string;
    jobCode: string;
    vacancies?: number | null;
    employmentType?: string | null;
    workMode?: string | null;
    locationCity: string;
    locationState: string;
    locationAddress?: string | null;
    minExperience?: number | null;
    maxExperience?: number | null;
    minSalary?: number | string | null;
    maxSalary?: number | string | null;
    currency?: string | null;
    salaryVisibility?: boolean;
    educationRequirement?: string | null;
    summary?: string | null;
    description?: string | null;
    responsibilities?: string[];
    requirements?: string[];
    preferredSkills?: string[];
    benefits?: string[];
    workingHours?: string | null;
    aboutCompany?: string | null;
    startDate?: string | null;
    deadline?: string | null;
    resumeRequired?: boolean;
    coverLetterRequired?: boolean;
    seoTitle?: string | null;
    metaDescription?: string | null;
    department?: { name: string };
    customQuestions?: Array<{
      id: string;
      question: string;
      type: string;
      options: string[];
      isRequired: boolean;
      order: number;
    }>;
  };
  assignedRecruiter?: { id: string; name: string; email: string } | null;
  answers: Array<{
    id: string;
    answerText?: string | null;
    question: { id: string; question: string; type: string };
  }>;
  documents: Array<{
    id: string;
    category: string;
    fileName: string;
    fileUrl: string;
    uploadedAt: string;
  }>;
  stageHistory: Array<{
    id: string;
    toStage: string;
    toTerminalStatus?: string | null;
    notes?: string | null;
    createdAt: string;
    changedBy?: { name: string } | null;
  }>;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: { name: string; email: string };
  }>;
  ratings: Array<{
    id: string;
    overallRating: number;
    communicationRating?: number | null;
    technicalRating?: number | null;
    experienceRating?: number | null;
    cultureFitRating?: number | null;
    feedback?: string | null;
    createdAt: string;
    evaluator: { name: string; email?: string | null };
  }>;
  interviews: Array<{
    id: string;
    scheduledAt: string;
    durationMinutes: number;
    type: string;
    status: string;
    meetingUrl?: string | null;
    notes?: string | null;
    interviewer?: { name: string } | null;
    feedback: Array<{
      overallRating: number;
      recommendation: string;
      notes?: string | null;
      interviewer: { name: string };
    }>;
  }>;
  offers: Array<{
    id: string;
    designation: string;
    department: string;
    joiningLocation: string;
    ctc: number;
    joiningDate?: string | null;
    status: string;
    createdAt: string;
  }>;
  activityLogs: Array<{
    id: string;
    action: string;
    title: string;
    details?: string | null;
    createdAt: string;
    actor?: { name: string } | null;
  }>;
}

type WorkspaceTab = 'overview' | 'notes' | 'ratings' | 'interviews' | 'offer' | 'timeline';

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A';
  return formatDisplayDate(value);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'N/A';
  return formatDisplayDateTime(value);
};

const formatLpa = (value?: number | string | null) => (value ? `Rs. ${value} LPA` : 'N/A');

const formatLabel = (value?: string | null) => {
  if (!value) return 'N/A';
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const formatExperienceRange = (min?: number | null, max?: number | null) => {
  const minValue = min ?? 0;
  if (minValue === 0 && !max) return 'Freshers / Experienced';
  if (max) return `${minValue} - ${max} Yrs`;
  return `${minValue}+ Yrs`;
};

const formatSalaryRange = (job: ApplicationWorkspaceData['job']) => {
  if (job.salaryVisibility === false) return 'Not disclosed';
  if (!job.minSalary && !job.maxSalary) return 'Not disclosed';
  if (job.minSalary && job.maxSalary) return `Rs. ${job.minSalary} - Rs. ${job.maxSalary}`;
  if (job.minSalary) return `From Rs. ${job.minSalary}`;
  return `Up to Rs. ${job.maxSalary}`;
};

const DetailField = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="space-y-1 min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    <div className="font-medium text-[11px] text-gray-800 break-all">{value || <span className="text-gray-400">N/A</span>}</div>
  </div>
);

const TextBlock = ({ title, value }: { title: string; value?: string | null }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
    <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-gray-900">{title}</h4>
    <p className="whitespace-pre-line text-xs leading-relaxed text-gray-700">{value?.trim() || 'N/A'}</p>
  </div>
);

const BulletList = ({ title, items }: { title: string; items?: string[] }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
    <h4 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-gray-900">{title}</h4>
    {items && items.length > 0 ? (
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-2 text-xs leading-relaxed text-gray-700">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-xs italic text-gray-400">Not provided.</p>
    )}
  </div>
);

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const recruitmentBasePath = getRecruitmentPortalBasePath(pathname);
  const currentUser = useAuthStore((state) => state.user);
  const canUpdateStage = canUseRecruitmentPermission(currentUser, recruitmentPermissions.applicationsUpdateStage);
  const canCreateNote = canUseRecruitmentPermission(currentUser, recruitmentPermissions.notesCreate);
  const canUpdateNote = canUseRecruitmentPermission(currentUser, recruitmentPermissions.notesUpdate);
  const canDeleteNote = canUseRecruitmentPermission(currentUser, recruitmentPermissions.notesDelete);
  const canCreateRating = canUseRecruitmentPermission(currentUser, recruitmentPermissions.ratingsCreate);
  const canUpdateRating = canUseRecruitmentPermission(currentUser, recruitmentPermissions.ratingsUpdate);
  const canDeleteRating = canUseRecruitmentPermission(currentUser, recruitmentPermissions.ratingsDelete);
  const canCreateInterview = canUseRecruitmentPermission(currentUser, recruitmentPermissions.interviewsCreate);
  const canUpdateInterview = canUseRecruitmentPermission(currentUser, recruitmentPermissions.interviewsUpdate);
  const canDeleteInterview = canUseRecruitmentPermission(currentUser, recruitmentPermissions.interviewsDelete);
  const canCreateOffer = canUseRecruitmentPermission(currentUser, recruitmentPermissions.offersCreate);
  const canUpdateOffer = canUseRecruitmentPermission(currentUser, recruitmentPermissions.offersUpdate);
  const canDeleteOffer = canUseRecruitmentPermission(currentUser, recruitmentPermissions.offersDelete);

  const [data, setData] = useState<ApplicationWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<RecruitmentStage[]>(DEFAULT_RECRUITMENT_STAGES);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(true);
  const [isTimelineOpen, setIsTimelineOpen] = useState(true);

  // New Note State
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [savingNoteEdit, setSavingNoteEdit] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  // New Rating State
  const [newRating, setNewRating] = useState('4');
  const [newCommRating, setNewCommRating] = useState('4');
  const [newTechRating, setNewTechRating] = useState('4');
  const [newExpRating, setNewExpRating] = useState('4');
  const [newCultureRating, setNewCultureRating] = useState('4');
  const [newFeedback, setNewFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [editingRatingId, setEditingRatingId] = useState<string | null>(null);
  const [editingRatingForm, setEditingRatingForm] = useState({
    overallRating: '4',
    communicationRating: '4',
    technicalRating: '4',
    experienceRating: '4',
    cultureFitRating: '4',
    feedback: '',
  });
  const [savingRatingEdit, setSavingRatingEdit] = useState(false);
  const [deletingRatingId, setDeletingRatingId] = useState<string | null>(null);

  // Schedule Interview State
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [ivDate, setIvDate] = useState('');
  const [ivType, setIvType] = useState('VIDEO');
  const [ivMeetingUrl, setIvMeetingUrl] = useState('');
  const [ivNotes, setIvNotes] = useState('');
  const [schedulingIv, setSchedulingIv] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);

  // Create Offer State
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerDesignation, setOfferDesignation] = useState('');
  const [offerCtc, setOfferCtc] = useState('');
  const [offerJoiningDate, setOfferJoiningDate] = useState('');
  const [creatingOffer, setCreatingOffer] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [downloadingResume, setDownloadingResume] = useState(false);
  const applicationId = data?.id || id;

  const fetchApplicationDetails = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      setError(null);
      const res = await api.get(`/recruitment/admin/applications/${id}`);
      if (res.data?.success && res.data.application) {
        const application = res.data.application as ApplicationWorkspaceData;
        setData(application);
        if (isUuid(id) && application.applicationRef) {
          router.replace(generateRecruitmentApplicationDetailPath(recruitmentBasePath, application));
        }
      }
    } catch (err) {
      console.error('Failed to load application details:', err);
      if (!isBackground) setError('Unable to load application workspace.');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [id, recruitmentBasePath, router]);

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
    fetchApplicationDetails(false);
  }, [fetchApplicationDetails]);

  useEffect(() => {
    void fetchPipelineStages();
  }, [fetchPipelineStages]);

  useEffect(() => {
    const handleStageRefresh = () => {
      void fetchPipelineStages();
    };

    window.addEventListener('recruitment_pipeline_stages_updated', handleStageRefresh);
    return () => window.removeEventListener('recruitment_pipeline_stages_updated', handleStageRefresh);
  }, [fetchPipelineStages]);

  useEffect(() => {
    const handleInterviewRefresh = () => {
      void fetchApplicationDetails(true);
    };

    window.addEventListener('recruitment_interviews_updated', handleInterviewRefresh);
    return () => window.removeEventListener('recruitment_interviews_updated', handleInterviewRefresh);
  }, [fetchApplicationDetails]);

  const handleStageChange = async (toStage: string) => {
    if (!canUpdateStage) return;
    if (!data || data.currentStage === toStage) return;
    const previousStage = data.currentStage;

    // 1. Instant Optimistic Update!
    setData((prev) => (prev ? { ...prev, currentStage: toStage } : prev));

    try {
      const res = await api.patch(`/recruitment/admin/applications/${applicationId}/stage`, { toStage });
      if (res.data?.success) {
        toast.success(`Stage updated to ${getRecruitmentStageByCode(stages, toStage)?.name || formatRecruitmentStageLabel(toStage)}.`);
        void fetchApplicationDetails(true);
      } else {
        setData((prev) => (prev ? { ...prev, currentStage: previousStage } : prev));
        toast.error(res.data?.error || 'Failed to update stage.');
      }
    } catch {
      setData((prev) => (prev ? { ...prev, currentStage: previousStage } : prev));
      toast.error('Failed to update stage.');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateNote) return;
    if (!newNote.trim()) return;

    try {
      setAddingNote(true);
      await api.post(`/recruitment/admin/applications/${applicationId}/notes`, { content: newNote.trim() });
      setNewNote('');
      void fetchApplicationDetails(true);
      toast.success('Note added successfully.');
    } catch {
      toast.error('Failed to add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const handleAddRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateRating) return;
    try {
      setSubmittingRating(true);
      await api.post(`/recruitment/admin/applications/${applicationId}/ratings`, {
        overallRating: newRating,
        communicationRating: newCommRating,
        technicalRating: newTechRating,
        experienceRating: newExpRating,
        cultureFitRating: newCultureRating,
        feedback: newFeedback.trim(),
      });
      setNewRating('4');
      setNewCommRating('4');
      setNewTechRating('4');
      setNewExpRating('4');
      setNewCultureRating('4');
      setNewFeedback('');
      void fetchApplicationDetails(true);
      toast.success('Rating submitted successfully.');
    } catch {
      toast.error('Failed to submit rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  const startEditingNote = (noteId: string, content: string) => {
    setEditingNoteId(noteId);
    setEditingNoteContent(content);
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditingNoteContent('');
  };

  const handleSaveNoteEdit = async (noteId: string) => {
    if (!canUpdateNote) return;
    if (!editingNoteContent.trim()) {
      toast.error('Note content is required.');
      return;
    }

    try {
      setSavingNoteEdit(true);
      await api.patch(`/recruitment/admin/applications/${applicationId}/notes/${noteId}`, {
        content: editingNoteContent.trim(),
      });
      toast.success('Note updated successfully.');
      cancelEditingNote();
      void fetchApplicationDetails(true);
    } catch {
      toast.error('Failed to update note.');
    } finally {
      setSavingNoteEdit(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!canDeleteNote) return;
    if (!window.confirm('Delete this note?')) return;

    try {
      setDeletingNoteId(noteId);
      await api.delete(`/recruitment/admin/applications/${applicationId}/notes/${noteId}`);
      toast.success('Note deleted successfully.');
      void fetchApplicationDetails(true);
    } catch {
      toast.error('Failed to delete note.');
    } finally {
      setDeletingNoteId(null);
    }
  };

  const startEditingRating = (rating: ApplicationWorkspaceData['ratings'][number]) => {
    setEditingRatingId(rating.id);
    setEditingRatingForm({
      overallRating: String(rating.overallRating),
      communicationRating: String(rating.communicationRating ?? 4),
      technicalRating: String(rating.technicalRating ?? 4),
      experienceRating: String(rating.experienceRating ?? 4),
      cultureFitRating: String(rating.cultureFitRating ?? 4),
      feedback: rating.feedback || '',
    });
  };

  const cancelEditingRating = () => {
    setEditingRatingId(null);
    setEditingRatingForm({
      overallRating: '4',
      communicationRating: '4',
      technicalRating: '4',
      experienceRating: '4',
      cultureFitRating: '4',
      feedback: '',
    });
  };

  const handleSaveRatingEdit = async (ratingId: string) => {
    if (!canUpdateRating) return;
    if (!editingRatingForm.overallRating) {
      toast.error('Overall rating is required.');
      return;
    }

    try {
      setSavingRatingEdit(true);
      await api.patch(`/recruitment/admin/applications/${applicationId}/ratings/${ratingId}`, {
        ...editingRatingForm,
      });
      toast.success('Rating updated successfully.');
      cancelEditingRating();
      void fetchApplicationDetails(true);
    } catch {
      toast.error('Failed to update rating.');
    } finally {
      setSavingRatingEdit(false);
    }
  };

  const handleDeleteRating = async (ratingId: string) => {
    if (!canDeleteRating) return;
    if (!window.confirm('Delete this rating?')) return;

    try {
      setDeletingRatingId(ratingId);
      await api.delete(`/recruitment/admin/applications/${applicationId}/ratings/${ratingId}`);
      toast.success('Rating deleted successfully.');
      void fetchApplicationDetails(true);
    } catch {
      toast.error('Failed to delete rating.');
    } finally {
      setDeletingRatingId(null);
    }
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingInterviewId ? !canUpdateInterview : !canCreateInterview) return;
    if (!ivDate) {
      alert('Interview date and time are required.');
      return;
    }

    try {
      setSchedulingIv(true);
      const payload = {
        applicationId,
        scheduledAt: ivDate,
        type: ivType,
        meetingUrl: ivMeetingUrl.trim(),
        notes: ivNotes.trim(),
      };
      if (editingInterviewId) {
        await api.patch(`/recruitment/admin/interviews/${editingInterviewId}`, payload);
      } else {
        await api.post('/recruitment/admin/interviews', payload);
      }
      setShowScheduleModal(false);
      setIvDate('');
      setIvType('VIDEO');
      setIvMeetingUrl('');
      setIvNotes('');
      setEditingInterviewId(null);
      void fetchApplicationDetails(true);
      window.dispatchEvent(new Event('recruitment_interviews_updated'));
    } catch {
      alert('Failed to schedule interview.');
    } finally {
      setSchedulingIv(false);
    }
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOfferId ? !canUpdateOffer : !canCreateOffer) return;
    if (!offerDesignation.trim() || !offerCtc) {
      alert('Designation and CTC are required.');
      return;
    }
    const wasEditingOffer = Boolean(editingOfferId);

    try {
      setCreatingOffer(true);
      const payload = {
        applicationId,
        designation: offerDesignation.trim(),
        ctc: parseFloat(offerCtc) * 100000,
        joiningDate: offerJoiningDate || undefined,
      };
      if (editingOfferId) {
        await api.patch(`/recruitment/admin/offers/${editingOfferId}`, payload);
      } else {
        await api.post('/recruitment/admin/offers', payload);
      }
      setShowOfferModal(false);
      setOfferDesignation('');
      setOfferCtc('');
      setOfferJoiningDate('');
      setEditingOfferId(null);
      void fetchApplicationDetails(true);
      window.dispatchEvent(new Event('recruitment_offers_updated'));
      toast.success(wasEditingOffer ? 'Offer updated successfully.' : 'Offer sent successfully.');
    } catch {
      alert('Failed to create offer.');
    } finally {
      setCreatingOffer(false);
    }
  };

  const openInterviewEditor = (iv: ApplicationWorkspaceData['interviews'][number]) => {
    if (!canUpdateInterview) return;
    setEditingInterviewId(iv.id);
    setIvDate(new Date(iv.scheduledAt).toISOString().slice(0, 16));
    setIvType(iv.type);
    setIvMeetingUrl(iv.meetingUrl || '');
    setIvNotes(iv.notes || '');
    setShowScheduleModal(true);
  };

  const handleDeleteInterview = async (interviewId: string) => {
    if (!canDeleteInterview) return;
    if (!window.confirm('Delete this scheduled interview?')) return;
    try {
      await api.delete(`/recruitment/admin/interviews/${interviewId}`);
      toast.success('Interview deleted successfully.');
      void fetchApplicationDetails(true);
      window.dispatchEvent(new Event('recruitment_interviews_updated'));
    } catch {
      toast.error('Failed to delete interview.');
    }
  };

  const openOfferEditor = (offer: ApplicationWorkspaceData['offers'][number]) => {
    if (!canUpdateOffer) return;
    setEditingOfferId(offer.id);
    setOfferDesignation(offer.designation || data?.job.title || '');
    setOfferCtc(offer.ctc ? String(offer.ctc / 100000) : '');
    setOfferJoiningDate(offer.joiningDate ? new Date(offer.joiningDate).toISOString().slice(0, 10) : '');
    setShowOfferModal(true);
  };

  const handleDeleteOffer = async (offerId: string) => {
    if (!canDeleteOffer) return;
    if (!window.confirm('Delete this employment offer?')) return;
    try {
      await api.delete(`/recruitment/admin/offers/${offerId}`);
      toast.success('Offer deleted successfully.');
      void fetchApplicationDetails(true);
      window.dispatchEvent(new Event('recruitment_offers_updated'));
    } catch {
      toast.error('Failed to delete offer.');
    }
  };

  const handleResumeDownload = async () => {
    if (!resumeDoc) return;

    try {
      setDownloadingResume(true);
      await downloadSecureDocument(resumeDoc.fileUrl, resumeDoc.fileName);
    } catch (err) {
      console.error('Failed to download resume:', err);
      alert('Unable to download resume right now.');
    } finally {
      setDownloadingResume(false);
    }
  };

  if (loading) {
    return (
      <BrandLoader variant="fullscreen" size="md" bg="light" text="Loading Application Workspace..." />
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm text-center max-w-md space-y-4">
          <AlertCircle size={36} className="text-red-500 mx-auto" />
          <h3 className="text-base font-bold text-gray-900">Application Workspace Not Found</h3>
          <p className="text-xs text-gray-500">{error || 'Requested application record does not exist.'}</p>
          <Link
            href={`${recruitmentBasePath}/applications`}
            className="inline-block px-4 py-2 bg-amber-500 text-gray-950 font-bold text-xs rounded-xl"
          >
            Back to Applications
          </Link>
        </div>
      </div>
    );
  }

  const candidate = data.candidate;
  const job = data.job;
  const resumeDoc = data.documents.find((d) => d.category === 'RESUME') || data.documents[0];
  const answerByQuestionId = new Map(data.answers.map((answer) => [answer.question.id, answer.answerText || 'No answer provided']));
  const customQuestions = [...(job.customQuestions || [])].sort((a, b) => a.order - b.order);
  const customQuestionIds = new Set(customQuestions.map((question) => question.id));
  const additionalAnswers = data.answers.filter((answer) => !customQuestionIds.has(answer.question.id));
  const candidateFormFields = [
    { label: 'Full Name', value: candidate.fullName },
    { label: 'Email', value: candidate.email },
    { label: 'Mobile', value: candidate.mobile },
    { label: 'Current City', value: candidate.currentCity },
    { label: 'State', value: candidate.state },
    { label: 'Address', value: candidate.address },
    { label: 'Current Company', value: candidate.currentCompany },
    { label: 'Designation', value: candidate.currentDesignation },
    { label: 'Total Experience', value: candidate.totalExperience ? `${candidate.totalExperience} Yrs` : null },
    { label: 'Relevant Experience', value: candidate.relevantExperience ? `${candidate.relevantExperience} Yrs` : null },
    { label: 'Current CTC', value: formatLpa(candidate.currentCtc) },
    { label: 'Expected CTC', value: formatLpa(candidate.expectedCtc) },
    { label: 'Notice Period', value: candidate.noticePeriod },
    { label: 'Employment Status', value: formatLabel(candidate.employmentStatus) },
    {
      label: 'LinkedIn URL',
      value: candidate.linkedInUrl ? (
        <a href={candidate.linkedInUrl} target="_blank" rel="noreferrer" className="text-amber-600 hover:text-amber-700 hover:underline inline-flex items-center gap-1 break-all">
          <ExternalLink size={11} className="shrink-0" />
          {candidate.linkedInUrl}
        </a>
      ) : null,
    },
    {
      label: 'Portfolio URL',
      value: candidate.portfolioUrl ? (
        <a href={candidate.portfolioUrl} target="_blank" rel="noreferrer" className="text-amber-600 hover:text-amber-700 hover:underline inline-flex items-center gap-1 break-all">
          <ExternalLink size={11} className="shrink-0" />
          {candidate.portfolioUrl}
        </a>
      ) : null,
    },
  ];
  const jobPostingFields = [
    { label: 'Job Code', value: job.jobCode },
    { label: 'Department', value: job.department?.name },
    { label: 'Vacancies', value: job.vacancies ? String(job.vacancies) : null },
    { label: 'Employment Type', value: formatLabel(job.employmentType) },
    { label: 'Work Mode', value: formatLabel(job.workMode) },
    { label: 'Location', value: [job.locationAddress, job.locationCity, job.locationState].filter(Boolean).join(', ') },
    { label: 'Experience Range', value: formatExperienceRange(job.minExperience, job.maxExperience) },
    { label: 'Salary Range', value: formatSalaryRange(job) },
    { label: 'Education', value: job.educationRequirement },
    { label: 'Working Hours', value: job.workingHours },
    { label: 'Start Date', value: formatDate(job.startDate) },
    { label: 'Deadline', value: formatDate(job.deadline) },
    { label: 'Resume Required', value: job.resumeRequired ? 'Yes' : 'No' },
    { label: 'Cover Letter Required', value: job.coverLetterRequired ? 'Yes' : 'No' },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <main className="max-w-7xl mx-auto px-0 pt-0 pb-6 w-full space-y-4 flex-grow">
        {/* Top Breadcrumb & Quick Actions Header */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 md:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`${recruitmentBasePath}/applications`}
                  className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 font-semibold transition-colors"
                >
                  <ChevronLeft size={14} />
                  Applications
                </Link>
                <span className="text-gray-300">•</span>
                <span className="font-mono text-xs font-bold text-amber-600">{data.applicationRef}</span>
              </div>

              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900">{candidate.fullName}</h1>
              <p className="text-xs text-gray-500 font-medium">
                Applying for <strong className="text-gray-900">{job.title}</strong> ({job.department?.name})
              </p>
            </div>

            {/* Quick Stage Action Selector */}
            <div className="flex items-center gap-3 bg-gray-50 p-2 sm:p-2.5 rounded-2xl border border-gray-200 self-start">
              <span className="text-xs font-bold text-gray-700">Stage:</span>
              {canUpdateStage ? (
                <StageSelectDropdown
                  currentStage={data.currentStage}
                  onStageChange={(newStage) => handleStageChange(newStage)}
                  stages={stages}
                />
              ) : (
                <span className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700">
                  {formatRecruitmentStageLabel(data.currentStage)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3 Summary Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Calendar size={18} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Applied On</p>
            <p className="mt-1 text-sm font-extrabold text-gray-900">{formatDate(data.appliedAt)}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Briefcase size={18} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Experience</p>
            <p className="mt-1 text-sm font-extrabold text-gray-900">
              {candidate.totalExperience ? `${candidate.totalExperience} Yrs` : 'N/A'}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Clock size={18} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Notice Period</p>
            <p className="mt-1 text-sm font-extrabold text-gray-900">{candidate.noticePeriod || 'N/A'}</p>
          </div>
        </div>

        {/* Main 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Candidate & Application Details */}
          <div className="space-y-6">
            {/* Candidate Card */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-sm">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-3 flex items-center justify-between">
                <span>Candidate Profile</span>
                <span className="text-[10px] text-amber-600 font-mono">ID: {candidate.id.slice(0, 8)}</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2.5 text-gray-700">
                  <Mail size={15} className="text-gray-400 shrink-0" />
                  <a href={`mailto:${candidate.email}`} className="hover:underline font-medium">
                    {candidate.email}
                  </a>
                </div>

                <div className="flex items-center gap-2.5 text-gray-700">
                  <Phone size={15} className="text-gray-400 shrink-0" />
                  <a href={`tel:${candidate.mobile}`} className="hover:underline font-medium">
                    {candidate.mobile}
                  </a>
                </div>

                {candidate.currentCity && (
                  <div className="flex items-center gap-2.5 text-gray-700">
                    <MapPin size={15} className="text-gray-400 shrink-0" />
                    <span>
                      {candidate.currentCity}, {candidate.state}
                    </span>
                  </div>
                )}

                {candidate.linkedInUrl && (
                  <div className="flex items-center gap-2.5 text-amber-600">
                    <ExternalLink size={15} className="shrink-0" />
                    <a href={candidate.linkedInUrl} target="_blank" rel="noreferrer" className="hover:underline font-medium">
                      LinkedIn Profile
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Professional Details */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-sm">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-3">
                Professional Overview
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Current Company</span>
                  <span className="font-semibold text-gray-900">{candidate.currentCompany || 'N/A'}</span>
                </div>

                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Designation</span>
                  <span className="font-semibold text-gray-900">{candidate.currentDesignation || 'N/A'}</span>
                </div>

                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Total Experience</span>
                  <span className="font-semibold text-gray-900">
                    {candidate.totalExperience ? `${candidate.totalExperience} Yrs` : 'N/A'}
                  </span>
                </div>

                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Notice Period</span>
                  <span className="font-semibold text-gray-900">{candidate.noticePeriod || 'N/A'}</span>
                </div>

                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Current CTC</span>
                  <span className="font-semibold text-gray-900">
                    {formatLpa(candidate.currentCtc)}
                  </span>
                </div>

                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Expected CTC</span>
                  <span className="font-semibold text-gray-900">
                    {formatLpa(candidate.expectedCtc)}
                  </span>
                </div>
              </div>
            </div>

            {/* Secure Resume Preview Box */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-3 shadow-sm">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-3 flex items-center justify-between">
                <span>Resume &amp; Documents</span>
                <ShieldCheck size={16} className="text-emerald-600" />
              </h3>

              {resumeDoc ? (
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs text-gray-900 block truncate max-w-[180px]">
                      {resumeDoc.fileName}
                    </span>
                    <span className="text-[10px] text-gray-400">Secure Document Access</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleResumeDownload()}
                    disabled={downloadingResume}
                    className="px-3.5 py-1.5 bg-[#FFC107] hover:bg-[#e5ad06] disabled:opacity-60 disabled:cursor-not-allowed text-black font-extrabold text-xs rounded-xl flex items-center gap-1 shadow-sm transition-all"
                  >
                    <Download size={13} />
                    <span>{downloadingResume ? 'Downloading...' : 'Download'}</span>
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No resume file attached.</p>
              )}
            </div>
          </div>

          {/* Right Column: Tabbed Workspace */}
          <div className="lg:col-span-2 space-y-6">
            {/* Workspace Tabs */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-2 shadow-sm flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth">
              {([
                { id: 'overview', label: 'Snapshot' },
                { id: 'notes', label: `Notes (${data.notes.length})` },
                { id: 'ratings', label: `Ratings (${data.ratings.length})` },
                { id: 'interviews', label: `Interviews (${data.interviews.length})` },
                { id: 'offer', label: `Offer (${data.offers.length})` },
                { id: 'timeline', label: 'Timeline' },
              ] satisfies Array<{ id: WorkspaceTab; label: string }>).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 sm:px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-[#FFC107] text-black shadow-sm font-extrabold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Dynamic Application Snapshot */}
            {activeTab === 'overview' && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 space-y-5 shadow-sm">
                <div className="flex items-start justify-between border-b border-gray-100 pb-4 gap-4">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-600">
                      Candidate Submitted Application
                    </p>
                    <h3 className="mt-1 text-base sm:text-lg font-extrabold text-gray-900">
                      Complete Application Snapshot
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSnapshotOpen((prev) => !prev)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 active:scale-95 text-gray-700 text-xs font-bold transition-all shrink-0 cursor-pointer shadow-2xs"
                  >
                    <span>{isSnapshotOpen ? 'Collapse' : 'Expand'}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isSnapshotOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {isSnapshotOpen && (
                  <div className="space-y-6 max-h-[520px] sm:max-h-[600px] overflow-y-auto pr-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] animate-in fade-in duration-200">
                    <section className="space-y-4">
                      <div className="flex items-center gap-2">
                        <FileQuestion size={17} className="text-amber-600" />
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">
                          Candidate Form Details
                        </h4>
                      </div>

                      <div className="grid gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-xs sm:grid-cols-2">
                        {candidateFormFields.map((field) => (
                          <DetailField key={field.label} label={field.label} value={field.value} />
                        ))}
                      </div>
                    </section>

                    <section className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Building2 size={17} className="text-amber-600" />
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">
                          Admin Job Posting Context
                        </h4>
                      </div>

                      <div className="grid gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-xs sm:grid-cols-2">
                        {jobPostingFields.map((field) => (
                          <DetailField key={field.label} label={field.label} value={field.value} />
                        ))}
                      </div>
                    </section>

                    <section className="grid gap-4 md:grid-cols-2">
                      <TextBlock title="Cover Letter" value={candidate.coverLetter} />
                      <TextBlock title="Job Short Summary" value={job.summary} />
                      <TextBlock title="Full Job Description" value={job.description} />
                      <TextBlock title="About Company" value={job.aboutCompany} />
                    </section>

                    <section className="grid gap-4 md:grid-cols-2">
                      <BulletList title="Responsibilities" items={job.responsibilities} />
                      <BulletList title="Requirements" items={job.requirements} />
                      <BulletList title="Preferred Skills" items={job.preferredSkills} />
                      <BulletList title="Benefits" items={job.benefits} />
                    </section>

                    <section className="space-y-4">
                      <div className="flex items-center gap-2">
                        <ListChecks size={17} className="text-amber-600" />
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">
                          Custom Questions &amp; Candidate Answers
                        </h4>
                      </div>

                      {customQuestions.length > 0 ? (
                        <div className="space-y-3">
                          {customQuestions.map((question, index) => (
                            <div key={question.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1">
                                  <span className="font-mono text-[10px] font-bold text-amber-600">
                                    QUESTION {index + 1}
                                  </span>
                                  <h5 className="text-sm font-extrabold text-gray-900">{question.question}</h5>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-gray-500 ring-1 ring-gray-200">
                                    {formatLabel(question.type)}
                                  </span>
                                  {question.isRequired && (
                                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase text-red-700 ring-1 ring-red-100">
                                      Required
                                    </span>
                                  )}
                                </div>
                              </div>
                              {question.options.length > 0 && (
                                <p className="mt-3 text-[11px] text-gray-400">
                                  Options: {question.options.join(', ')}
                                </p>
                              )}
                              <div className="mt-3 rounded-xl border border-white bg-white p-3 text-xs leading-relaxed text-gray-900 font-medium shadow-2xs">
                                {answerByQuestionId.get(question.id) || 'No answer submitted'}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs italic text-gray-400">
                          No custom application questions configured for this job.
                        </p>
                      )}

                      {additionalAnswers.length > 0 && (
                        <div className="space-y-3">
                          <h5 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-gray-900">
                            <GraduationCap size={16} className="text-amber-600" />
                            Additional Saved Answers
                          </h5>
                          {additionalAnswers.map((answer) => (
                            <div key={answer.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                              <span className="text-xs font-bold text-gray-900">{answer.question.question}</span>
                              <p className="mt-1 text-xs leading-relaxed text-gray-700">
                                {answer.answerText || 'No answer provided'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                      <div className="flex items-start gap-3">
                        <IndianRupee size={18} className="mt-0.5 text-amber-700" />
                        <div>
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-900">
                            Compensation Review
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-gray-700">
                            Candidate expectation is <strong>{formatLpa(candidate.expectedCtc)}</strong> against job range{' '}
                            <strong>{formatSalaryRange(job)}</strong>.
                          </p>
                        </div>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Recruiter Notes */}
            {activeTab === 'notes' && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-6 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
                  Recruiter Internal Notes
                </h3>

                {canCreateNote && <form onSubmit={handleAddNote} className="space-y-3">
                  <textarea
                    rows={3}
                    placeholder="Write a private recruiter note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={addingNote}
                    className="px-4 py-2 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs rounded-xl shadow-sm transition-all"
                  >
                    {addingNote ? 'Saving...' : 'Add Private Note'}
                  </button>
                </form>}

                <div className="space-y-3 pt-4 border-t border-gray-100 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {data.notes.map((n) => (
                    <div key={n.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                            <span className="font-semibold text-[11px] text-gray-800">{n.author.name}</span>
                            <span>•</span>
                            <span>{formatDateTime(n.createdAt)}</span>
                          </div>
                          {n.author.email && <p className="text-[10px] text-gray-400">{n.author.email}</p>}
                        </div>

                        {editingNoteId !== n.id && (canUpdateNote || canDeleteNote) && (
                          <div className="flex items-center gap-2">
                            {canUpdateNote && <button
                              type="button"
                              onClick={() => startEditingNote(n.id, n.content)}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold text-gray-700 transition hover:border-amber-300 hover:text-amber-700"
                            >
                              <Edit3 size={12} />
                              Edit
                            </button>}
                            {canDeleteNote && <button
                              type="button"
                              onClick={() => void handleDeleteNote(n.id)}
                              disabled={deletingNoteId === n.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[10px] font-bold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
                            >
                              {deletingNoteId === n.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                              Delete
                            </button>}
                          </div>
                        )}
                      </div>
                      
                      {editingNoteId === n.id && canUpdateNote ? (
                        <div className="space-y-3 mt-3 border-t border-gray-100 pt-3">
                          <textarea
                            rows={3}
                            value={editingNoteContent}
                            onChange={(e) => setEditingNoteContent(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                            placeholder="Write a private recruiter note..."
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEditingNote}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-700 transition hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveNoteEdit(n.id)}
                              disabled={savingNoteEdit}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#FFC107] px-3 py-1.5 text-[11px] font-extrabold text-black shadow-sm transition hover:bg-[#e5ad06] disabled:opacity-70"
                            >
                              {savingNoteEdit ? <Loader2 size={12} className="animate-spin" /> : <Edit3 size={12} />}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-line font-medium">{n.content}</p>
                      )}
                    </div>
                  ))}

                  {data.notes.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No notes added yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Candidate Ratings */}
            {activeTab === 'ratings' && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-6 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
                  Candidate Evaluations &amp; Ratings
                </h3>

                {canCreateRating && <form onSubmit={handleAddRating} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4 text-xs">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Overall (1-5)</label>
                      <RatingDropdown
                        value={newRating}
                        onChange={setNewRating}
                        labelTemplate={(r) => `${r} Stars`}
                        isBold={true}
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Communication</label>
                      <RatingDropdown
                        value={newCommRating}
                        onChange={setNewCommRating}
                        labelTemplate={(r) => `${r} / 5`}
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Technical Skills</label>
                      <RatingDropdown
                        value={newTechRating}
                        onChange={setNewTechRating}
                        labelTemplate={(r) => `${r} / 5`}
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Experience</label>
                      <RatingDropdown
                        value={newExpRating}
                        onChange={setNewExpRating}
                        labelTemplate={(r) => `${r} / 5`}
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Culture Fit</label>
                      <RatingDropdown
                        value={newCultureRating}
                        onChange={setNewCultureRating}
                        labelTemplate={(r) => `${r} / 5`}
                      />
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    placeholder="Evaluation feedback..."
                    value={newFeedback}
                    onChange={(e) => setNewFeedback(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs text-gray-900"
                  />

                  <button
                    type="submit"
                    disabled={submittingRating}
                    className="px-4 py-2 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold rounded-xl shadow-sm transition-all"
                  >
                    {submittingRating ? 'Saving...' : 'Submit Evaluation'}
                  </button>
                </form>}

                <div className="space-y-3 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {data.ratings.map((r) => (
                    <div key={r.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-[11px] text-gray-800">{r.evaluator.name}</span>
                          <p className="text-[10px] text-gray-400">{r.evaluator.email || 'Private review'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1.5 font-bold text-amber-600">
                            <Star size={14} className="fill-amber-500 text-amber-500" />
                            {r.overallRating} / 5
                          </span>
                          {editingRatingId !== r.id && (canUpdateRating || canDeleteRating) && (
                            <>
                              {canUpdateRating && <button
                                type="button"
                                onClick={() => startEditingRating(r)}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold text-gray-700 transition hover:border-amber-300 hover:text-amber-700"
                              >
                                <Edit3 size={12} />
                                Edit
                              </button>}
                              {canDeleteRating && <button
                                type="button"
                                onClick={() => void handleDeleteRating(r.id)}
                                disabled={deletingRatingId === r.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[10px] font-bold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
                              >
                                {deletingRatingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                Delete
                              </button>}
                            </>
                          )}
                        </div>
                      </div>
                      
                      {editingRatingId === r.id && canUpdateRating ? (
                        <div className="space-y-4 mt-4 border-t border-gray-100 pt-3">
                          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-700 mb-1">Overall</label>
                              <RatingDropdown
                                value={editingRatingForm.overallRating}
                                onChange={(value) => setEditingRatingForm((prev) => ({ ...prev, overallRating: value }))}
                                labelTemplate={(rating) => `${rating} Stars`}
                                isBold
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-700 mb-1">Comm</label>
                              <RatingDropdown
                                value={editingRatingForm.communicationRating}
                                onChange={(value) => setEditingRatingForm((prev) => ({ ...prev, communicationRating: value }))}
                                labelTemplate={(rating) => `${rating} / 5`}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-700 mb-1">Tech</label>
                              <RatingDropdown
                                value={editingRatingForm.technicalRating}
                                onChange={(value) => setEditingRatingForm((prev) => ({ ...prev, technicalRating: value }))}
                                labelTemplate={(rating) => `${rating} / 5`}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-700 mb-1">Exp</label>
                              <RatingDropdown
                                value={editingRatingForm.experienceRating}
                                onChange={(value) => setEditingRatingForm((prev) => ({ ...prev, experienceRating: value }))}
                                labelTemplate={(rating) => `${rating} / 5`}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-700 mb-1">Culture</label>
                              <RatingDropdown
                                value={editingRatingForm.cultureFitRating}
                                onChange={(value) => setEditingRatingForm((prev) => ({ ...prev, cultureFitRating: value }))}
                                labelTemplate={(rating) => `${rating} / 5`}
                              />
                            </div>
                          </div>
                          <textarea
                            rows={3}
                            value={editingRatingForm.feedback}
                            onChange={(e) => setEditingRatingForm((prev) => ({ ...prev, feedback: e.target.value }))}
                            className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-[11px] text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                            placeholder="Evaluation feedback..."
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={cancelEditingRating} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={() => void handleSaveRatingEdit(r.id)} disabled={savingRatingEdit} className="inline-flex items-center gap-1 rounded-lg bg-[#FFC107] px-3 py-1.5 text-[11px] font-extrabold text-black hover:bg-[#e5ad06] disabled:opacity-70">
                              {savingRatingEdit ? <Loader2 size={12} className="animate-spin" /> : <Edit3 size={12} />} Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {typeof r.communicationRating === 'number' && (
                              <span className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">
                                Communication {r.communicationRating}/5
                              </span>
                            )}
                            {typeof r.technicalRating === 'number' && (
                              <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">
                                Technical {r.technicalRating}/5
                              </span>
                            )}
                            {typeof r.experienceRating === 'number' && (
                              <span className="rounded-lg border border-violet-100 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-800">
                                Experience {r.experienceRating}/5
                              </span>
                            )}
                            {typeof r.cultureFitRating === 'number' && (
                              <span className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
                                Culture Fit {r.cultureFitRating}/5
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-gray-400">
                            <span>{formatDateTime(r.createdAt)}</span>
                            <span>Overall score used in average rating</span>
                          </div>
                          {r.feedback && <p className="text-[11px] text-gray-700 whitespace-pre-line font-medium">{r.feedback}</p>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}



            {/* Tab 4: Interviews */}
            {activeTab === 'interviews' && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-bold text-gray-900">Scheduled Interviews</h3>
                  {canCreateInterview && <button
                      onClick={() => {
                        setEditingInterviewId(null);
                        setIvDate('');
                        setIvType('VIDEO');
                        setIvMeetingUrl('');
                        setIvNotes('');
                        setShowScheduleModal(true);
                      }}
                      className="px-3.5 py-1.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <PlusCircle size={14} />
                      <span>Schedule Interview</span>
                    </button>}
                </div>

                <div className="space-y-4">
                  {data.interviews.map((iv) => (
                    <div key={iv.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900">{iv.type} Interview</span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-extrabold text-gray-700">{iv.status.replaceAll('_', ' ')}</span>
                          {canUpdateInterview && <button type="button" title="Edit interview" onClick={() => openInterviewEditor(iv)} className="text-gray-500 hover:text-blue-600"><Edit3 size={14} /></button>}
                          {canDeleteInterview && <button type="button" title="Delete interview" onClick={() => handleDeleteInterview(iv.id)} className="text-gray-500 hover:text-red-600"><Trash2 size={14} /></button>}
                        </div>
                      </div>

                      <p className="text-gray-600">
                        Date: <strong>{formatDateTime(iv.scheduledAt)}</strong> ({iv.durationMinutes} mins)
                      </p>

                      {iv.meetingUrl && (
                        <p className="text-amber-600 font-medium">
                          Meeting Link: <a href={iv.meetingUrl} target="_blank" rel="noreferrer" className="underline">{iv.meetingUrl}</a>
                        </p>
                      )}

                      {iv.feedback.length > 0 && (
                        <div className="pt-2 border-t border-gray-200 space-y-1">
                          <span className="font-bold text-emerald-700 block">Feedback Recorded</span>
                          <p className="text-gray-700">Recommendation: {iv.feedback[0].recommendation}</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {data.interviews.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No interviews scheduled yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* Tab 5: Offer */}
            {activeTab === 'offer' && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-bold text-gray-900">Offer Management</h3>
                  {canCreateOffer && <button
                      onClick={() => {
                        setEditingOfferId(null);
                        setOfferDesignation(data.job.title || '');
                        setOfferCtc('');
                        setOfferJoiningDate('');
                        setShowOfferModal(true);
                      }}
                      className="px-3.5 py-1.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <PlusCircle size={14} />
                      <span>Create &amp; Send Offer</span>
                    </button>}
                </div>

                <div className="space-y-4">
                  {data.offers.map((off) => (
                    <div key={off.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900">{off.designation}</span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-extrabold text-gray-700">{off.status.replaceAll('_', ' ')}</span>
                          {canUpdateOffer && <button type="button" title="Edit offer" onClick={() => openOfferEditor(off)} className="text-gray-500 hover:text-blue-600"><Edit3 size={14} /></button>}
                          {canDeleteOffer && <button type="button" title="Delete offer" onClick={() => handleDeleteOffer(off.id)} className="text-gray-500 hover:text-red-600"><Trash2 size={14} /></button>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-gray-700">
                        <div>
                          <span className="text-gray-400 block text-[10px]">Offered CTC</span>
                          <span className="font-bold text-gray-900">{formatLpa(off.ctc)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">Joining Location</span>
                          <span className="font-bold text-gray-900">{off.joiningLocation}</span>
                        </div>
                      </div>

                    </div>
                  ))}

                  {data.offers.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No offer generated for this candidate yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* Tab 6: Audit Timeline */}
            {activeTab === 'timeline' && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 gap-4">
                  <h3 className="text-sm font-bold text-gray-900">
                    Immutable Application Timeline
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsTimelineOpen((prev) => !prev)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 active:scale-95 text-gray-700 text-xs font-bold transition-all shrink-0 cursor-pointer shadow-2xs"
                  >
                    <span>{isTimelineOpen ? 'Collapse' : 'Expand'}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isTimelineOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {isTimelineOpen && (
                  <div className="space-y-4 max-h-[520px] sm:max-h-[600px] overflow-y-auto pr-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] animate-in fade-in duration-200 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-gray-200">
                    {data.activityLogs.map((log) => (
                      <div key={log.id} className="relative pl-8 space-y-1">
                        <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-white ring-2 ring-amber-100"></div>
                        <div className="flex items-center justify-between text-[11px] text-gray-400">
                          <span className="font-bold text-gray-900">{log.title}</span>
                          <span>{formatDateTime(log.createdAt)}</span>
                        </div>
                        {log.details && <p className="text-xs text-gray-600">{log.details}</p>}
                      </div>
                    ))}
                    {data.activityLogs.length === 0 && (
                      <p className="text-xs text-gray-400 italic">No timeline activity recorded yet.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Schedule Interview Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl my-4 max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <h3 className="text-sm font-bold text-gray-900">{editingInterviewId ? 'Edit Interview' : 'Schedule Interview'}</h3>
            <form onSubmit={handleScheduleInterview} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Date &amp; Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={ivDate}
                  onChange={(e) => setIvDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-900 font-semibold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Interview Type</label>
                <InterviewTypeDropdown value={ivType} onChange={setIvType} />
              </div>


              <div>
                <label className="block font-semibold text-gray-700 mb-1">Meeting URL</label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/xyz"
                  value={ivMeetingUrl}
                  onChange={(e) => setIvMeetingUrl(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-900 font-semibold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Interview Notes</label>
                <textarea
                  rows={3}
                  placeholder="Panel instructions, screening focus, or candidate context..."
                  value={ivNotes}
                  onChange={(e) => setIvNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-900 font-semibold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={schedulingIv}
                  className="px-4 py-2 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {schedulingIv ? 'Saving...' : editingInterviewId ? 'Save Changes' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Offer Modal */}
      {showOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl my-4 max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <h3 className="text-sm font-bold text-gray-900">{editingOfferId ? 'Edit Employment Offer' : 'Prepare Employment Offer'}</h3>
            <form onSubmit={handleCreateOffer} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Designation *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sales Manager"
                  value={offerDesignation}
                  onChange={(e) => setOfferDesignation(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-900 font-semibold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Offered CTC (Rs. Lakhs) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="e.g. 8.5"
                  value={offerCtc}
                  onChange={(e) => setOfferCtc(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-900 font-semibold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Joining Date</label>
                <input
                  type="date"
                  value={offerJoiningDate}
                  onChange={(e) => setOfferJoiningDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-gray-900 font-semibold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOfferModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingOffer}
                  className="px-4 py-2 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {creatingOffer ? 'Sending...' : editingOfferId ? 'Save Changes' : 'Send Offer Letter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
