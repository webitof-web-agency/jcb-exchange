'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatDate } from '@/lib/i18n/formatters';
import BrandLoader from '@/components/ui/BrandLoader';
import { useTranslation } from '@/hooks/useTranslation';
import { isUuid } from '@/lib/routeSlug';
import { generateRecruitmentJobDetailPath, getRecruitmentPortalBasePath } from '@/lib/routePaths';
import { useAuthStore } from '@/store/authStore';
import { canUseRecruitmentPermission, recruitmentPermissions } from '@/lib/recruitmentPermissions';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  MapPin,
  Users,
  FileText,
  CheckCircle2,
  X,
  Trash2,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

interface JobDepartment {
  id: string;
  name: string;
  code?: string;
}

interface CustomQuestion {
  id: string;
  question: string;
  type: string;
  options?: string[];
  isRequired: boolean;
}

interface JobDetail {
  id: string;
  title: string;
  slug: string;
  jobCode: string;
  vacancies: number;
  employmentType: string;
  workMode: string;
  locationCity: string;
  locationState: string;
  locationAddress?: string | null;
  minExperience: number;
  maxExperience?: number | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  currency: string;
  salaryVisibility: boolean;
  summary?: string | null;
  description: string;
  responsibilities: string[];
  requirements: string[];
  deadline?: string | null;
  resumeRequired: boolean;
  coverLetterRequired: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'CLOSED' | 'ARCHIVED';
  postedAt?: string | null;
  createdAt: string;
  department: JobDepartment;
  customQuestions?: CustomQuestion[];
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  _count?: {
    applications: number;
  };
}

interface StageBreakdownItem {
  currentStage: string;
  _count: {
    id: number;
  };
}

export default function SuperadminJobDetailPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const canDelete = canUseRecruitmentPermission(currentUser, recruitmentPermissions.jobsDelete);
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const recruitmentBasePath = getRecruitmentPortalBasePath(pathname);
  const jobId = params?.id as string;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [stageBreakdown, setStageBreakdown] = useState<StageBreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchJobDetail = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/recruitment/admin/jobs/${jobId}`);
      if (res.data?.success && res.data.job) {
        const nextJob = res.data.job as JobDetail;
        setJob(nextJob);
        setStageBreakdown(res.data.stageBreakdown || []);
        if (isUuid(jobId) && nextJob.slug) {
          router.replace(generateRecruitmentJobDetailPath(recruitmentBasePath, nextJob));
        }
      } else {
        setError('Job posting details not found.');
      }
    } catch (err: unknown) {
      console.error('Failed to load job details:', err);
      setError('Failed to load job details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [jobId, recruitmentBasePath, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchJobDetail();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchJobDetail]);

  const handleDeleteJob = async () => {
    if (!job) return;
    if (confirm(`Are you sure you want to delete "${job.title}"? This action cannot be undone.`)) {
      try {
        setDeleting(true);
        const res = await api.delete(`/recruitment/admin/jobs/${job.id}`);
        if (res.data?.success) {
          router.push(`${recruitmentBasePath}/jobs`);
        }
      } catch {
        alert('Failed to delete job posting.');
      } finally {
        setDeleting(false);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold">Published</span>;
      case 'DRAFT':
        return <span className="px-3 py-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-full text-xs font-bold">Draft</span>;
      case 'PAUSED':
        return <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-bold">Paused</span>;
      case 'CLOSED':
        return <span className="px-3 py-1 bg-rose-50 text-rose-800 border border-rose-200 rounded-full text-xs font-bold">Closed</span>;
      default:
        return <span className="px-3 py-1 bg-gray-100 text-gray-600 border border-gray-200 rounded-full text-xs font-bold">{status}</span>;
    }
  };

  const formatStageLabel = (stage: string) => {
    return stage
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  if (loading) {
    return (
      <BrandLoader variant="fullscreen" size="md" bg="light" text="Loading job details..." />
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-6">
        <div className="max-w-3xl mx-auto bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
            <X size={24} />
          </div>
          <h3 className="text-lg font-bold text-gray-900">{error || 'Job not found'}</h3>
          <p className="text-xs text-gray-500">The requested job posting might have been removed or is unavailable.</p>
          <Link
            href={`${recruitmentBasePath}/jobs`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-semibold text-xs rounded-xl transition"
          >
            <ArrowLeft size={16} />
            <span>Back to All Jobs</span>
          </Link>
        </div>
      </div>
    );
  }

  const hasSalary = Boolean(job.minSalary || job.maxSalary);

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 space-y-6">
        {/* Navigation Breadcrumb & Actions Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
              <Link href={`${recruitmentBasePath}/jobs`} className="hover:text-gray-900 transition flex items-center gap-1">
                <ArrowLeft size={14} />
                <span>{t('recruitment.recruitmentJobs', 'Jobs')}</span>
              </Link>
              <span>/</span>
              <span className="text-gray-900 font-semibold truncate max-w-xs">{job.title}</span>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <h1 className="text-xl font-black text-gray-900 tracking-tight">{job.title}</h1>
              {getStatusBadge(job.status)}
            </div>
            <p className="text-xs font-mono text-gray-400">{t('recruitment.jobCode', 'Job Reference Code')}: {job.jobCode}</p>
          </div>

          {canDelete ? <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={deleting}
              onClick={handleDeleteJob}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs transition disabled:opacity-50"
            >
              <Trash2 size={14} />
              <span>{t('recruitment.deleteJob', 'Delete Job')}</span>
            </button>
          </div> : null}
        </div>

        {/* Top Key Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
              <Building2 size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('recruitment.department', 'Department')}</p>
              <h3 className="text-sm font-bold text-gray-900">{job.department?.name || 'N/A'}</h3>
              {job.department?.code && (
                <p className="text-[10px] text-gray-400 font-mono">{job.department.code}</p>
              )}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
              <MapPin size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('recruitment.location', 'Location')}</p>
              <h3 className="text-sm font-bold text-gray-900">{job.locationCity}, {job.locationState}</h3>
              {job.locationAddress && (
                <p className="text-[10px] text-gray-400 truncate max-w-[160px]">{job.locationAddress}</p>
              )}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
              <Users size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('recruitment.vacancies', 'Vacancies')}</p>
              <h3 className="text-base font-black text-gray-900">{job.vacancies} {t('recruitment.openings', 'Openings')}</h3>
              <p className="text-[10px] text-emerald-600 font-semibold">{job.workMode} • {job.employmentType}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-700 rounded-xl">
              <FileText size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('recruitment.applicationsCount', 'Applications')}</p>
              <h3 className="text-base font-black text-purple-900">{job._count?.applications || 0} {t('recruitment.recruitmentCandidates', 'Candidates')}</h3>
              <Link href={`${recruitmentBasePath}/applications?jobSlug=${encodeURIComponent(job.slug)}`} className="text-[10px] text-purple-600 font-bold hover:underline">
                {t('recruitment.viewAllApplications', 'View All Applications')} &rarr;
              </Link>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overview Specification Card */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                <Briefcase size={16} className="text-amber-600" />
                <span>{t('recruitment.jobOverview', 'Job Overview & Specifications')}</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-gray-50/70 p-3.5 rounded-xl border border-gray-100 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Employment Type:</span>
                    <span className="font-bold text-gray-900">{job.employmentType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Work Mode:</span>
                    <span className="font-bold text-gray-900">{job.workMode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Experience Required:</span>
                    <span className="font-bold text-gray-900">
                      {job.minExperience} {job.maxExperience ? `- ${job.maxExperience}` : '+'} Yrs
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50/70 p-3.5 rounded-xl border border-gray-100 space-y-2">
                  {hasSalary ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Salary Range:</span>
                        <span className="font-bold text-gray-900">
                          {job.minSalary ? `₹${job.minSalary.toLocaleString()}` : ''}
                          {job.maxSalary ? ` - ₹${job.maxSalary.toLocaleString()}` : ''} / Yr
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Public Salary:</span>
                        <span className="font-bold text-gray-900">{job.salaryVisibility ? 'Visible' : 'Hidden'}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-medium">Salary:</span>
                      <span className="font-bold text-gray-900">Not Specified</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Short Pitch / Summary */}
            {job.summary && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-2">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-600" />
                  <span>Job Summary</span>
                </h2>
                <p className="text-xs text-gray-700 leading-relaxed bg-amber-50/30 p-3.5 rounded-xl border border-amber-100/60 font-medium">
                  {job.summary}
                </p>
              </div>
            )}

            {/* Full Job Description */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">Full Job Description</h2>
              <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed space-y-2 font-normal">
                {job.description}
              </div>
            </div>

            {/* Responsibilities */}
            {job.responsibilities && job.responsibilities.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-3">
                <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">Key Responsibilities</h2>
                <ul className="space-y-2 text-xs text-gray-700">
                  {job.responsibilities.map((resp, index) => (
                    <li key={index} className="flex items-start gap-2.5">
                      <CheckCircle2 size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <span>{resp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Requirements & Qualifications */}
            {job.requirements && job.requirements.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-3">
                <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Requirements &amp; Qualifications</h2>
                <ul className="space-y-2 text-xs text-gray-700">
                  {job.requirements.map((req, index) => (
                    <li key={index} className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Custom Application Questions Preview */}
            {job.customQuestions && job.customQuestions.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-3">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                  <HelpCircle size={16} className="text-amber-600" />
                  <span>Custom Application Questions ({job.customQuestions.length})</span>
                </h2>

                <div className="space-y-3">
                  {job.customQuestions.map((q, idx) => (
                    <div key={q.id || idx} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/80 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900">
                          {idx + 1}. {q.question}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-[10px] font-mono">
                            {q.type}
                          </span>
                          {q.isRequired && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-semibold">
                              Required
                            </span>
                          )}
                        </div>
                      </div>
                      {q.options && q.options.length > 0 && (
                        <p className="text-[11px] text-gray-500 font-medium italic">
                          Options: {q.options.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column / Sidebar Widgets (1/3) */}
          <div className="space-y-6">
            {/* Stage Breakdown Pipeline */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">Application Pipeline Breakdown</h3>

              {stageBreakdown.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No applications recorded yet for this job.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {stageBreakdown.map((sb) => (
                    <div key={sb.currentStage} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="font-semibold text-gray-700">{formatStageLabel(sb.currentStage)}</span>
                      <span className="font-extrabold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full text-xs">
                        {sb._count.id}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Application Requirements & Dates */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-3 text-xs">
              <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">Application Settings</h3>

              <div className="space-y-2">
                <div className="flex justify-between items-center py-1">
                  <span className="text-gray-500 font-medium">Resume Required:</span>
                  <span className={`font-bold ${job.resumeRequired ? 'text-emerald-700' : 'text-gray-400'}`}>
                    {job.resumeRequired ? 'Yes' : 'Optional'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-gray-100">
                  <span className="text-gray-500 font-medium">Cover Letter Required:</span>
                  <span className={`font-bold ${job.coverLetterRequired ? 'text-emerald-700' : 'text-gray-400'}`}>
                    {job.coverLetterRequired ? 'Yes' : 'Optional'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-gray-100">
                  <span className="text-gray-500 font-medium">Posting Date:</span>
                  <span className="font-bold text-gray-800">
                    {formatDate(job.postedAt || job.createdAt)}
                  </span>
                </div>
                {job.deadline && (
                  <div className="flex justify-between items-center py-1 border-t border-gray-100">
                    <span className="text-gray-500 font-medium">Deadline:</span>
                    <span className="font-bold text-amber-700">
                      {formatDate(job.deadline)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Created By User Info */}
            {job.createdBy && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-2 text-xs">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Created By</h3>
                <p className="font-bold text-gray-900">{job.createdBy.name}</p>
                <p className="text-gray-400 font-mono text-[11px]">{job.createdBy.email}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
