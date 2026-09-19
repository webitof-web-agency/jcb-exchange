'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Briefcase, ChevronRight, Sparkles } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export default function RecruitmentHeaderNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const routeTitleMap: Record<string, { title: string; subtitle: string }> = {
    '/dashboard': {
      title: t('recruitment.dashboardTitleHeader', 'Recruitment Dashboard'),
      subtitle: t('recruitment.dashboardSubtitleHeader', 'Hiring metrics, application statistics & active pipelines'),
    },
    '/jobs': {
      title: t('recruitment.jobsTitleHeader', 'Job Postings Management'),
      subtitle: t('recruitment.jobsSubtitleHeader', 'Create, publish, duplicate, and manage recruitment openings'),
    },
    '/applications': {
      title: t('recruitment.applicationsTitleHeader', 'Candidate Applications'),
      subtitle: t('recruitment.applicationsSubtitleHeader', 'Track, filter, review candidates and update hiring stages'),
    },
    '/pipeline': {
      title: t('recruitment.pipelineTitleHeader', 'Kanban Hiring Pipeline'),
      subtitle: t('recruitment.pipelineSubtitleHeader', 'Drag and drop candidate cards across sequential hiring stages'),
    },
    '/interviews': {
      title: t('recruitment.interviewsTitleHeader', 'Interview Management Workspace'),
      subtitle: t('recruitment.interviewsSubtitleHeader', 'Track video interviews, panel evaluations & scorecards'),
    },
    '/offers': {
      title: t('recruitment.offersTitleHeader', 'Offer Management & Generation'),
      subtitle: t('recruitment.offersSubtitleHeader', 'Issue compensation letters and track candidate acceptances'),
    },
    '/departments': {
      title: t('recruitment.departmentsTitleHeader', 'Department Management'),
      subtitle: t('recruitment.departmentsSubtitleHeader', 'Organize openings and candidates by department'),
    },
    '/settings': {
      title: t('recruitment.settingsTitleHeader', 'Recruitment Settings'),
      subtitle: t('recruitment.settingsSubtitleHeader', 'Configure departments and email communication templates'),
    },
  };

  // Find matching sub-route info
  const subRouteKey = Object.keys(routeTitleMap).find((key) => pathname.endsWith(key) || pathname.includes(`${key}/`));
  const currentRouteInfo = subRouteKey ? routeTitleMap[subRouteKey] : {
    title: t('recruitment.atsTitle', 'Recruitment ATS'),
    subtitle: t('recruitment.atsSubtitle', 'Applicant Tracking & Hiring Platform'),
  };

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-gray-200/80 shadow-xs transition-all">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 font-bold shrink-0 shadow-xs">
            <Briefcase size={18} className="sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              <span>{t('recruitment.atsTitle', 'Recruitment ATS')}</span>
              <ChevronRight size={12} className="text-gray-400" />
              <span className="text-amber-600 truncate">{currentRouteInfo.title}</span>
            </div>
            <h1 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight leading-snug truncate">
              {currentRouteInfo.title}
            </h1>
            <p className="hidden sm:block text-[10px] text-gray-400 font-medium truncate">{currentRouteInfo.subtitle}</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold bg-amber-50 text-amber-800 px-3 py-1.5 rounded-xl border border-amber-200/80 shrink-0">
          <Sparkles size={14} className="text-amber-500" />
          <span>{t('recruitment.atsActive', 'ATS Active')}</span>
        </div>
      </div>
    </header>
  );
}
