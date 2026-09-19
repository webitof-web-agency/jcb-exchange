'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { formatDate } from '@/lib/i18n/formatters';
import BrandLoader from '@/components/ui/BrandLoader';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/authStore';
import { canUseRecruitmentPermission, recruitmentPermissions } from '@/lib/recruitmentPermissions';
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Star,
  ChevronDown,
  Edit3,
} from 'lucide-react';
import { buildPaginationItems } from '@/lib/paginationUtils';
import RatingDropdown from '@/components/recruitment/RatingDropdown';
import type { InterviewStatus } from '@/components/recruitment/InterviewStatusDropdown';
import { isInterviewNotificationActive } from '@/lib/interviewNotification';

interface InterviewItem {
  id: string;
  interviewType: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl?: string | null;
  meetingLocation?: string | null;
  status: InterviewStatus;
  interviewerName?: string | null;
  interviewerEmail?: string | null;
  notes?: string | null;
  application: {
    id: string;
    applicationRef: string;
    candidate: {
      fullName: string;
      email: string;
      mobile: string;
    };
    job: {
      title: string;
      jobCode: string;
    };
  };
  ratings?: Array<{
    id: string;
    overallRating: number;
    communicationRating?: number | null;
    technicalRating?: number | null;
    experienceRating?: number | null;
    cultureFitRating?: number | null;
    feedback?: string | null;
    createdAt: string;
    evaluator?: { name?: string | null; email?: string | null } | null;
  }>;
  feedback?: Array<{
    id: string;
    interviewerName: string;
    rating: number;
    recommendation: 'STRONG_HIRE' | 'HIRE' | 'NO_HIRE' | 'STRONG_NO_HIRE';
    strengths?: string | null;
    comments?: string | null;
  }>;
}

interface ApplicationOption {
  id: string;
  applicationRef: string;
  candidate?: { fullName?: string | null };
  job?: { title?: string | null };
}

function ApplicationSelectDropdown({
  applications,
  value,
  onChange,
}: {
  applications: ApplicationOption[];
  value: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

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

  const selectedApp = applications.find((a) => a.id === value);
  const { t } = useTranslation();
  const displayLabel = selectedApp
    ? `${selectedApp.candidate?.fullName || 'Candidate'} - ${selectedApp.job?.title || 'Job'} (${selectedApp.applicationRef})`
    : t('recruitment.selectCandidateApp', 'Select candidate application...');

  return (
    <div className="relative inline-block w-full text-left" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-900 hover:border-gray-300 focus:outline-none transition-all cursor-pointer shadow-sm"
      >
        <span className={selectedApp ? 'text-gray-900 font-semibold truncate' : 'text-gray-400 font-medium truncate'}>
          {displayLabel}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-[100] mt-1.5 w-full min-w-[200px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-60 overflow-y-auto space-y-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {applications.map((app) => {
              const isSelected = app.id === value;
              const label = `${app.candidate?.fullName || 'Candidate'} - ${app.job?.title || 'Job'} (${app.applicationRef})`;
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => {
                    onChange(app.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors duration-150 ${isSelected
                      ? 'bg-amber-50/80 font-bold text-gray-950'
                      : 'text-gray-700 font-medium hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <span className="leading-tight text-[13px] truncate">{label}</span>
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

function InterviewTypeDropdown({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const options = [
    { value: 'VIDEO', label: t('recruitment.videoCall', 'Video Call') },
    { value: 'PHONE', label: t('recruitment.phoneCall', 'Phone Call') },
    { value: 'IN_PERSON', label: t('recruitment.inPerson', 'In Person') },
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
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-900 hover:border-gray-300 focus:outline-none transition-all cursor-pointer shadow-sm"
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
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors duration-150 ${isSelected
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

export default function AdminInterviewsPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const canCreateInterview = canUseRecruitmentPermission(currentUser, recruitmentPermissions.interviewsCreate);
  const canUpdateInterview = canUseRecruitmentPermission(currentUser, recruitmentPermissions.interviewsUpdate);
  const canDeleteInterview = canUseRecruitmentPermission(currentUser, recruitmentPermissions.interviewsDelete);
  const canManageScorecard = canUseRecruitmentPermission(currentUser, recruitmentPermissions.interviewsScorecard);
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Modals
  const [selectedInterviewForFeedback, setSelectedInterviewForFeedback] = useState<InterviewItem | null>(null);
  const [scorecardRatingId, setScorecardRatingId] = useState<string | null>(null);
  const [scorecardOverall, setScorecardOverall] = useState('4');
  const [scorecardCommunication, setScorecardCommunication] = useState('4');
  const [scorecardTechnical, setScorecardTechnical] = useState('4');
  const [scorecardExperience, setScorecardExperience] = useState('4');
  const [scorecardCultureFit, setScorecardCultureFit] = useState('4');
  const [scorecardFeedback, setScorecardFeedback] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [deletingScorecard, setDeletingScorecard] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleType, setScheduleType] = useState('VIDEO');
  const [scheduleUrl, setScheduleUrl] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const fetchInterviews = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/recruitment/admin/interviews');
      const interviewList = res.data?.interviews || res.data?.data;
      if (res.data?.success && Array.isArray(interviewList)) {
        setInterviews(interviewList);
      } else {
        setInterviews([]);
        setError('Unable to load interviews.');
      }
    } catch (err: unknown) {
      console.warn('Backend interviews fetch failed:', err);
      setInterviews([]);
      setError('Unable to load interviews. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInterviews();
  }, []);

  useEffect(() => {
    const handleInterviewRefresh = () => {
      void fetchInterviews();
    };

    window.addEventListener('recruitment_interviews_updated', handleInterviewRefresh);
    return () => window.removeEventListener('recruitment_interviews_updated', handleInterviewRefresh);
  }, []);

  const loadApplications = async () => {
    try {
      const res = await api.get('/recruitment/admin/applications?limit=100&compact=true');
      const list = res.data?.applications || res.data?.data;
      if (!Array.isArray(list)) throw new Error('Invalid applications response');
      setApplications(list);
      return true;
    } catch {
      alert('Unable to load applications for scheduling.');
      return false;
    }
  };

  const resetScheduleForm = () => {
    setSelectedApplicationId('');
    setScheduleDate('');
    setScheduleType('VIDEO');
    setScheduleUrl('');
    setScheduleNotes('');
    setEditingInterviewId(null);
  };

  const openScheduleModal = async () => {
    if (!canCreateInterview) return;
    if (await loadApplications()) {
      resetScheduleForm();
      setShowScheduleModal(true);
    }
  };

  const handleScheduleInterview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingInterviewId ? !canUpdateInterview : !canCreateInterview) return;
    if (!selectedApplicationId || !scheduleDate) return;
    try {
      setSavingSchedule(true);
      const payload = {
        applicationId: selectedApplicationId,
        scheduledAt: scheduleDate,
        type: scheduleType,
        meetingUrl: scheduleUrl.trim(),
        notes: scheduleNotes.trim(),
      };
      if (editingInterviewId) {
        await api.patch(`/recruitment/admin/interviews/${editingInterviewId}`, payload);
      } else {
        await api.post('/recruitment/admin/interviews', payload);
      }
      setShowScheduleModal(false);
      resetScheduleForm();
      await fetchInterviews();
      window.dispatchEvent(new Event('recruitment_interviews_updated'));
    } catch {
      alert('Failed to schedule interview.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const openEditInterview = async (item: InterviewItem) => {
    if (!canUpdateInterview) return;
    if (!(await loadApplications())) return;
    setEditingInterviewId(item.id);
    setSelectedApplicationId(item.application.id);
    setScheduleDate(new Date(item.scheduledAt).toISOString().slice(0, 16));
    setScheduleType(['VIDEO', 'PHONE', 'IN_PERSON'].includes(item.interviewType) ? item.interviewType : 'VIDEO');
    setScheduleUrl(item.meetingUrl || '');
    setScheduleNotes(item.notes || '');
    setShowScheduleModal(true);
  };

  const handleDeleteInterview = async (interviewId: string) => {
    if (!canDeleteInterview) return;
    if (!window.confirm('Delete this interview?')) return;
    try {
      await api.delete(`/recruitment/admin/interviews/${interviewId}`);
      await fetchInterviews();
      window.dispatchEvent(new Event('recruitment_interviews_updated'));
    } catch {
      alert('Failed to delete interview.');
    }
  };

  const openScorecard = (item: InterviewItem) => {
    if (!canManageScorecard) return;
    const rating = item.ratings?.[0];
    setSelectedInterviewForFeedback(item);
    setScorecardRatingId(rating?.id || null);
    setScorecardOverall(String(rating?.overallRating ?? 4));
    setScorecardCommunication(String(rating?.communicationRating ?? 4));
    setScorecardTechnical(String(rating?.technicalRating ?? 4));
    setScorecardExperience(String(rating?.experienceRating ?? 4));
    setScorecardCultureFit(String(rating?.cultureFitRating ?? 4));
    setScorecardFeedback(rating?.feedback || '');
  };

  const closeScorecard = () => {
    setSelectedInterviewForFeedback(null);
    setScorecardRatingId(null);
    setScorecardFeedback('');
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageScorecard) return;
    if (!selectedInterviewForFeedback) return;

    try {
      setSubmittingFeedback(true);
      const payload = {
        overallRating: scorecardOverall,
        communicationRating: scorecardCommunication,
        technicalRating: scorecardTechnical,
        experienceRating: scorecardExperience,
        cultureFitRating: scorecardCultureFit,
        feedback: scorecardFeedback.trim(),
      };
      if (scorecardRatingId) {
        await api.patch(`/recruitment/admin/applications/${selectedInterviewForFeedback.application.id}/ratings/${scorecardRatingId}`, payload);
      } else {
        await api.post(`/recruitment/admin/applications/${selectedInterviewForFeedback.application.id}/ratings`, payload);
      }

      alert(scorecardRatingId ? 'Evaluation updated successfully!' : 'Evaluation submitted successfully!');
      closeScorecard();
      await fetchInterviews();
    } catch (err) {
      console.error('Failed to save evaluation:', err);
      alert('Failed to save evaluation. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleDeleteScorecard = async () => {
    if (!canManageScorecard) return;
    if (!selectedInterviewForFeedback || !scorecardRatingId || !window.confirm('Delete this evaluation?')) return;
    try {
      setDeletingScorecard(true);
      await api.delete(`/recruitment/admin/applications/${selectedInterviewForFeedback.application.id}/ratings/${scorecardRatingId}`);
      alert('Evaluation deleted successfully.');
      closeScorecard();
      await fetchInterviews();
    } catch (err) {
      console.error('Failed to delete evaluation:', err);
      alert('Failed to delete evaluation. Please try again.');
    } finally {
      setDeletingScorecard(false);
    }
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const safeInterviews = useMemo(() => (Array.isArray(interviews) ? interviews : []), [interviews]);

  const filteredInterviews = useMemo(() => {
    const searchLower = deferredSearchTerm.trim().toLowerCase();

    return safeInterviews.filter((item) => {
      const matchesSearch =
        !searchLower ||
        item.application?.candidate?.fullName?.toLowerCase().includes(searchLower) ||
        item.application?.job?.title?.toLowerCase().includes(searchLower) ||
        (item.interviewerName && item.interviewerName.toLowerCase().includes(searchLower));

      return matchesSearch;
    });
  }, [deferredSearchTerm, safeInterviews]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openPageSizeDropdown, setOpenPageSizeDropdown] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement;
      if (!target?.closest?.('.rows-per-page-dropdown-container')) {
        setOpenPageSizeDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, pageSize]);

  const totalPages = Math.ceil(filteredInterviews.length / pageSize) || 1;
  const paginatedInterviews = useMemo(
    () => filteredInterviews.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredInterviews, pageSize]
  );
  const startItemIndex = filteredInterviews.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItemIndex = Math.min(currentPage * pageSize, filteredInterviews.length);

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <main className="max-w-7xl mx-auto px-0 pt-0 pb-6 w-full space-y-4 flex-grow">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-gray-900">{t('recruitment.interviewsTitle', 'Interview Management')}</h2>
            <p className="text-xs text-gray-500 mt-1">{t('recruitment.interviewsSubtitle', 'Schedule and manage candidate interview rounds.')}</p>
          </div>
          {canCreateInterview && <button type="button" onClick={() => { setEditingInterviewId(null); void openScheduleModal(); }} className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-4 py-2.5 text-xs font-extrabold text-black shadow-sm hover:bg-[#e5ad06] shrink-0 self-start sm:self-auto"><Plus size={16} /> {t('recruitment.scheduleInterview', 'Schedule Interview')}</button>}
        </div>
        {/* Filter Bar */}
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200/80 shadow-sm flex flex-col gap-3">
          <div className="relative flex items-center w-full">
            <Search size={16} className="absolute left-3 text-gray-400" />
            <input
              type="text"
              placeholder={t('recruitment.searchApplications', 'Search candidate name, job title, or interviewer...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder-gray-400 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:bg-white hover:bg-gray-100/70 transition-all font-medium"
            />
          </div>

        </div>

        {/* Interviews List Container */}
        {loading ? (
          <BrandLoader variant="section" size="sm" bg="light" text={t('recruitment.analyticsLoading', 'Loading interview schedules...')} className="rounded-2xl border border-gray-200 bg-white p-12 text-center" />
        ) : error ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-12 text-center">
            <AlertCircle className="mx-auto mb-3 text-rose-500" size={40} />
            <h4 className="text-lg font-bold text-gray-900">{t('recruitment.unableToLoadInterviews', 'Unable to load interviews')}</h4>
            <p className="mt-1 text-sm text-gray-500">{error}</p>
            <button
              type="button"
              onClick={() => void fetchInterviews()}
              className="mt-4 rounded-xl bg-[#FFC107] px-4 py-2 text-xs font-extrabold text-black transition hover:bg-[#e5ad06]"
            >
              {t('recruitment.retry', 'Try Again')}
            </button>
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <CalendarIcon className="mx-auto text-gray-300 mb-3" size={48} />
            <h4 className="text-lg font-bold text-gray-900">{t('recruitment.noInterviewsMatch', 'No interviews match your filters')}</h4>
            <p className="text-sm text-gray-500 mt-1">{t('recruitment.adjustSearchOrSchedule', 'Adjust search terms or schedule a new interview round.')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="max-h-[calc(100vh-320px)] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedInterviews.map((item) => {
                  const dateObj = new Date(item.scheduledAt);
                  const formattedDate = formatDate(item.scheduledAt);
                  const formattedTime = dateObj.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-gray-200/90 shadow-sm hover:shadow-md transition p-5 flex flex-col justify-between"
                    >
                      <div>
                        {/* Candidate & Job Info */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <h4 className="text-base font-extrabold text-gray-900 leading-snug">
                              {item.application.candidate.fullName}
                            </h4>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                              For <span className="font-semibold text-gray-700">{item.application.job.title}</span>
                            </p>
                            <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                              Ref: {item.application.applicationRef}
                            </p>
                          </div>

                          <div className="flex items-start gap-2 shrink-0">
                            <span className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-extrabold text-gray-700">
                              {item.status.replaceAll('_', ' ')}
                            </span>
                            {item.status === 'SCHEDULED' && isInterviewNotificationActive(item.scheduledAt, item.durationMinutes, currentTime) && (
                              <span
                                className="relative mt-2 inline-flex h-2.5 w-2.5"
                                title="Interview notification active"
                                aria-label="Interview notification active"
                                role="status"
                              >
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Date & Time Box */}
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200/80 mb-4 space-y-1.5 text-xs">
                          <div className="flex items-center gap-2 text-gray-700 font-semibold">
                            <CalendarIcon size={14} className="text-amber-500" />
                            <span>{formattedDate}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Clock size={14} className="text-amber-500" />
                            <span>
                              {formattedTime} ({item.durationMinutes} mins)
                            </span>
                          </div>
                        </div>

                        {/* Meeting Link / Location */}
                        {item.meetingUrl && (
                          <div className="mb-4">
                            <a
                              href={item.meetingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 border border-blue-200"
                            >
                              <Video size={14} />
                              <span>{t('recruitment.joinVideoMeeting', 'Join Video Meeting')}</span>
                              <ExternalLink size={12} />
                            </a>
                          </div>
                        )}

                        {/* Feedback summary if completed */}
                        {item.ratings && item.ratings.length > 0 && (
                          <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-200 mb-4 text-xs">
                            <div className="flex items-center justify-between font-bold text-emerald-900 mb-1">
                              <span className="flex items-center gap-1">
                                <Star size={13} className="text-amber-500 fill-amber-500" /> {t('recruitment.evaluationRating', 'Evaluation Rating')}
                              </span>
                              <span>{item.ratings[0].overallRating} / 5</span>
                            </div>
                            {item.ratings[0].feedback && (
                              <p className="text-[11px] text-gray-600 italic mt-1 line-clamp-2">
                                &quot;{item.ratings[0].feedback}&quot;
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions Footer */}
                      <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                        {canManageScorecard && <button
                            onClick={() => openScorecard(item)}
                            className="px-3 py-1.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs"
                          >
                            <MessageSquare size={13} />
                            <span>{item.ratings?.length ? t('recruitment.editScorecard', 'Edit Scorecard') : t('recruitment.addScorecard', 'Add Scorecard')}</span>
                          </button>}

                        {(canDeleteInterview || canUpdateInterview) && <div className="flex items-center gap-1">
                          {canDeleteInterview && <button type="button" title="Delete interview" onClick={() => void handleDeleteInterview(item.id)} className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-bold transition">
                            <XCircle size={16} />
                          </button>}
                          {canUpdateInterview && <button type="button" title="Edit interview" onClick={() => void openEditInterview(item)} className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition">
                            <Edit3 size={16} />
                          </button>}
                        </div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pagination Footer - Matches Jobs/Listings module */}
            {filteredInterviews.length > 0 && (
              <div className="flex flex-col gap-4 border border-gray-200/80 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-gray-500 sm:justify-start">
                  <div>
                    Showing <span className="font-bold text-gray-900">{startItemIndex}</span> to{' '}
                    <span className="font-bold text-gray-900">{endItemIndex}</span> of{' '}
                    <span className="font-bold text-gray-900">{filteredInterviews.length}</span> entries
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
        )}
      </main>

      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 my-4 max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
               <h3 className="text-base font-extrabold text-gray-900">{editingInterviewId ? t('recruitment.editInterview', 'Edit Interview') : t('recruitment.scheduleInterview', 'Schedule Interview')}</h3>
              <button type="button" onClick={() => setShowScheduleModal(false)} className="text-gray-400 hover:text-gray-700 text-xl font-bold">×</button>
            </div>
            <form onSubmit={handleScheduleInterview} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.candidateApplication', 'Candidate Application')} *</label>
                <ApplicationSelectDropdown
                  applications={applications}
                  value={selectedApplicationId}
                  onChange={setSelectedApplicationId}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.dateTime', 'Date & Time')} *</label>
                <input
                  required
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.interviewType', 'Interview Type')}</label>
                <InterviewTypeDropdown value={scheduleType} onChange={setScheduleType} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.meetingUrl', 'Meeting URL')}</label>
                <input
                  type="url"
                  value={scheduleUrl}
                  onChange={(e) => setScheduleUrl(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.interviewNotes', 'Interview Notes')}</label>
                <textarea
                  rows={3}
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  placeholder={t('recruitment.notesPlaceholder', 'Panel instructions, screening focus, or candidate context...')}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                />
              </div>
              <div className="pt-3 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowScheduleModal(false)} className="px-4 py-2.5 bg-gray-100 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-200 transition">{t('roleManagement.cancel', 'Cancel')}</button>
                 <button type="submit" disabled={savingSchedule} className="px-5 py-2.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs rounded-xl shadow-md transition-all disabled:opacity-50">{savingSchedule ? t('recruitment.saving', 'Saving...') : editingInterviewId ? t('recruitment.editInterview', 'Update Interview') : t('recruitment.scheduleInterview', 'Schedule Interview')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shared Candidate Rating scorecard */}
      {selectedInterviewForFeedback && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] my-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
              <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <Star className="text-amber-500 fill-amber-500" size={20} />
                {scorecardRatingId ? t('recruitment.editEvaluation', 'Edit Evaluation') : t('recruitment.submitScorecard', 'Submit Interview Scorecard')}
              </h3>
              <button
                type="button"
                onClick={closeScorecard}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
                aria-label="Close scorecard"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback} className="space-y-4 text-xs">
              <div>
                <p className="text-xs text-gray-500 font-medium">{t('recruitment.candidate', 'Candidate')}</p>
                <p className="text-sm font-extrabold text-gray-900">
                  {selectedInterviewForFeedback.application.candidate.fullName}
                </p>
                <p className="text-xs text-gray-500">
                  {t('recruitment.stage', 'Round')}: {selectedInterviewForFeedback.interviewType}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div>
                  <label className="mb-1 block font-semibold text-gray-700">{t('recruitment.overall', 'Overall (1-5)')}</label>
                  <RatingDropdown value={scorecardOverall} onChange={setScorecardOverall} labelTemplate={(rating) => `${rating} Stars`} isBold />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-gray-700">{t('recruitment.communication', 'Communication')}</label>
                  <RatingDropdown value={scorecardCommunication} onChange={setScorecardCommunication} labelTemplate={(rating) => `${rating} / 5`} />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-gray-700">{t('recruitment.technicalSkills', 'Technical Skills')}</label>
                  <RatingDropdown value={scorecardTechnical} onChange={setScorecardTechnical} labelTemplate={(rating) => `${rating} / 5`} />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-gray-700">{t('recruitment.experience', 'Experience')}</label>
                  <RatingDropdown value={scorecardExperience} onChange={setScorecardExperience} labelTemplate={(rating) => `${rating} / 5`} />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-gray-700">{t('recruitment.cultureFit', 'Culture Fit')}</label>
                  <RatingDropdown value={scorecardCultureFit} onChange={setScorecardCultureFit} labelTemplate={(rating) => `${rating} / 5`} />
                </div>
              </div>

              <textarea
                rows={3}
                placeholder={t('recruitment.feedbackPlaceholder', 'Evaluation feedback...')}
                value={scorecardFeedback}
                onChange={(event) => setScorecardFeedback(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs font-semibold text-gray-900 placeholder:text-gray-400 outline-none focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/50"
              />

              <div className="pt-4 border-t border-gray-200 flex justify-end gap-3">
                {scorecardRatingId && canManageScorecard && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteScorecard()}
                    disabled={deletingScorecard || submittingFeedback}
                    className="mr-auto px-4 py-2.5 rounded-xl border border-red-200 bg-white text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {deletingScorecard ? t('recruitment.deleting', 'Deleting...') : t('recruitment.deleteEvaluation', 'Delete Evaluation')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeScorecard}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-200 transition"
                >
                  {t('roleManagement.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submittingFeedback}
                  className="px-5 py-2.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  {submittingFeedback ? t('recruitment.saving', 'Saving...') : scorecardRatingId ? t('recruitment.updateEvaluation', 'Update Evaluation') : t('recruitment.submitEvaluation', 'Submit Evaluation')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
