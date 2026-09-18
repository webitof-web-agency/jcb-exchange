'use client';

import React from 'react';
import Link from 'next/link';
import {
  Briefcase,
  MapPin,
  Clock,
  Calendar,
  IndianRupee,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ChevronLeft,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface JobDepartment {
  name?: string | null;
}

interface JobSummary {
  id: string;
  slug: string;
  title: string;
  locationCity?: string | null;
  locationState?: string | null;
  employmentType: string;
}

interface JobDetail {
  id: string;
  slug: string;
  title: string;
  jobCode?: string | null;
  department?: JobDepartment | null;
  locationAddress?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
  employmentType: string;
  workMode: string;
  minExperience?: number | null;
  maxExperience?: number | null;
  vacancies: number;
  deadline?: string | null;
  summary?: string | null;
  description?: string | null;
  responsibilities?: string[] | null;
  requirements?: string[] | null;
  salaryVisibility: boolean;
  minSalary?: number | null;
  maxSalary?: number | null;
  postedAt?: string | null;
}

interface JobDetailClientProps {
  job: JobDetail;
  relatedJobs: JobSummary[];
}

export default function JobDetailClient({ job, relatedJobs }: JobDetailClientProps) {
  const { t } = useTranslation();

  const formatSalary = (min: number | null | undefined, max: number | null | undefined) => {
    const minVal = min ? Number(min) : null;
    const maxVal = max ? Number(max) : null;
    if (!minVal && !maxVal) return t('careers.notDisclosed', 'Not Disclosed');
    const formatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
    if (minVal && maxVal) return `₹${formatter.format(minVal)} - ₹${formatter.format(maxVal)} / yr`;
    if (minVal) return `From ₹${formatter.format(minVal)} / yr`;
    return `Up to ₹${formatter.format(maxVal!)} / yr`;
  };

  const formatExperience = (min: number | null | undefined, max: number | null | undefined) => {
    const minExp = min || 0;
    const maxExp = max || null;
    if (minExp === 0 && !maxExp) return t('careers.freshersExperienced', 'Freshers / Experienced');
    if (minExp === 0 && maxExp) return `0 - ${maxExp} ${t('careers.yrsLabel', 'Yrs')}`;
    if (minExp > 0 && maxExp) return `${minExp} - ${maxExp} ${t('careers.yrsLabel', 'Yrs')}`;
    if (minExp > 0 && !maxExp) return `${minExp}+ ${t('careers.yrsLabel', 'Yrs')}`;
    return `0+ ${t('careers.yrsLabel', 'Yrs')}`;
  };

  const formatEmploymentType = (type: string) => {
    switch (type) {
      case 'FULL_TIME': return t('careers.fullTime', 'Full Time');
      case 'PART_TIME': return t('careers.partTime', 'Part Time');
      case 'CONTRACT': return t('careers.contract', 'Contract');
      case 'INTERNSHIP': return t('careers.internship', 'Internship');
      case 'FREELANCE': return t('careers.freelance', 'Freelance');
      default: return type;
    }
  };

  const formatWorkMode = (mode: string) => {
    switch (mode) {
      case 'ON_SITE': return t('careers.onSite', 'On-site');
      case 'REMOTE': return t('careers.remote', 'Remote');
      case 'HYBRID': return t('careers.hybrid', 'Hybrid');
      default: return mode;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Header Navigation */}
      <div className="bg-white border-b border-gray-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-amber-600 transition-colors"
          >
            <ChevronLeft size={16} />
            <span>{t('careers.backToOpenings', 'Back to All Openings')}</span>
          </Link>
        </div>
      </div>

      {/* Job Title & Summary Banner */}
      <section className="bg-gradient-to-br from-gray-950 via-gray-900 to-amber-950 text-white py-10 sm:py-12 px-4 sm:px-6 lg:px-8 shadow-inner">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-3 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold uppercase tracking-wider">
                  {job.department?.name || 'Department'}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-white/10 text-gray-300 text-xs font-mono font-medium">
                  Ref: {job.jobCode}
                </span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                {job.title}
              </h1>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm font-medium text-gray-300 pt-1">
                <span className="flex items-center gap-2">
                  <MapPin size={16} className="text-amber-400 shrink-0" />
                  <span>{job.locationAddress ? `${job.locationAddress}, ${job.locationCity}` : `${job.locationCity}, ${job.locationState}`}</span>
                </span>

                <span className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-400 shrink-0" />
                  <span>{formatEmploymentType(job.employmentType)} • {formatWorkMode(job.workMode)}</span>
                </span>

                <span className="flex items-center gap-2">
                  <Briefcase size={16} className="text-amber-400 shrink-0" />
                  <span>{formatExperience(job.minExperience, job.maxExperience)}</span>
                </span>
              </div>
            </div>

            {/* Apply CTA Box in Banner */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 p-5 rounded-2xl text-center flex flex-col items-center justify-center space-y-3 w-full sm:w-auto shrink-0 shadow-lg">
              <div className="text-xs text-amber-300 font-extrabold uppercase tracking-wider text-center">
                {job.vacancies === 1
                  ? t('careers.vacancyAvailable', '{count} Vacancy Available', { count: job.vacancies })
                  : t('careers.vacanciesAvailable', '{count} Vacancies Available', { count: job.vacancies })}
              </div>

              <Link
                href={`/jobs/${job.slug}/apply`}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-md hover:shadow-lg"
              >
                <span>{t('careers.applyForPosition', 'Apply For Position')}</span>
                <ArrowRight size={16} />
              </Link>

              {job.deadline && (
                <p className="text-[11px] text-gray-300 font-medium text-center">
                  {t('careers.deadline', 'Deadline')}: {new Date(job.deadline).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Grid Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Single Unified Concise Card Container */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200/80 p-6 sm:p-8 space-y-8 shadow-xs divide-y divide-gray-100">
            {/* Summary Callout Box */}
            {job.summary && (
              <div className="bg-amber-50/80 border border-amber-200/80 p-5 rounded-2xl space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-2">
                  <Sparkles size={15} className="text-amber-600" />
                  <span>{t('careers.jobSummary', 'Job Summary')}</span>
                </h3>
                <p className="text-sm sm:text-[15px] font-medium text-gray-800 leading-relaxed">
                  {job.summary}
                </p>
              </div>
            )}

            {/* Detailed Job Description */}
            {job.description && (
              <div className={job.summary ? "pt-8 space-y-4" : "space-y-4"}>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                  {t('careers.jobOverview', 'Job Overview & Description')}
                </h2>
                <div className="text-sm sm:text-[15px] text-gray-700 leading-relaxed whitespace-pre-line space-y-4 font-normal">
                  {job.description}
                </div>
              </div>
            )}

            {/* Key Responsibilities */}
            {job.responsibilities && job.responsibilities.length > 0 && (
              <div className="pt-8 space-y-4">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                  {t('careers.keyResponsibilities', 'Key Responsibilities')}
                </h2>
                <ul className="space-y-3">
                  {job.responsibilities.map((resp: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-3 text-sm sm:text-[15px] text-gray-700 font-medium leading-relaxed">
                      <CheckCircle2 size={18} className="text-amber-500 shrink-0 mt-0.5" />
                      <span>{resp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Candidate Requirements */}
            {job.requirements && job.requirements.length > 0 && (
              <div className="pt-8 space-y-4">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                  {t('careers.requirementsQualifications', 'Requirements & Qualifications')}
                </h2>
                <ul className="space-y-3">
                  {job.requirements.map((req: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-3 text-sm sm:text-[15px] text-gray-700 font-medium leading-relaxed">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Sticky Key Specs & Related Jobs */}
        <div className="space-y-6">
          <div className="sticky top-24 space-y-6">
            {/* Quick Specifications Card */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-5 shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 uppercase tracking-widest border-b border-gray-100 pb-3">
                {t('careers.jobSnapshot', 'Job Snapshot')}
              </h3>

              <div className="space-y-4 text-xs">
                <div className="flex items-start gap-3">
                  <IndianRupee size={17} className="text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-gray-400 block text-[10px] sm:text-[11px] uppercase font-bold tracking-wider mb-0.5">{t('careers.offeredCompensation', 'Offered Compensation')}</span>
                    <span className="font-extrabold text-gray-900 text-base sm:text-lg">
                      {job.salaryVisibility
                          ? formatSalary(job.minSalary, job.maxSalary)
                        : t('careers.notDisclosed', 'Not Disclosed')}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Briefcase size={17} className="text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-gray-400 block text-[10px] sm:text-[11px] uppercase font-bold tracking-wider mb-0.5">{t('careers.experienceRequired', 'Experience Required')}</span>
                    <span className="font-bold text-gray-900 text-sm sm:text-base">
                      {formatExperience(job.minExperience, job.maxExperience)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar size={17} className="text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-gray-400 block text-[10px] sm:text-[11px] uppercase font-bold tracking-wider mb-0.5">{t('careers.postedDate', 'Posted Date')}</span>
                    <span className="font-bold text-gray-900 text-sm">
                      {job.postedAt ? new Date(job.postedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : t('careers.recentlyPosted', 'Recently')}
                    </span>
                  </div>
                </div>
              </div>

              <Link
                href={`/jobs/${job.slug}/apply`}
                className="w-full py-3.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 mt-4"
              >
                <span>{t('careers.applyNow', 'Apply Now')}</span>
                <ArrowRight size={16} />
              </Link>
            </div>

            {/* Related Jobs */}
            {relatedJobs.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-xs">
                <h3 className="text-xs font-extrabold text-gray-900 uppercase tracking-widest border-b border-gray-100 pb-3">
                  {t('careers.similarOpenings', 'Similar Openings')}
                </h3>

                <div className="space-y-3">
                  {relatedJobs.map((rel) => (
                    <Link
                      key={rel.id}
                      href={`/jobs/${rel.slug}`}
                      className="block p-3.5 rounded-xl border border-gray-100 hover:border-amber-300 hover:bg-amber-50/40 transition-all group"
                    >
                      <h4 className="text-xs sm:text-sm font-bold text-gray-900 group-hover:text-amber-600 line-clamp-1">
                        {rel.title}
                      </h4>
                      <p className="text-[11px] text-gray-500 mt-1 font-medium">
                        {rel.locationCity}, {rel.locationState} • {formatEmploymentType(rel.employmentType)}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
