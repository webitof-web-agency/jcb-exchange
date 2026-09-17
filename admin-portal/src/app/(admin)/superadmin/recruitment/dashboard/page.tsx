'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import api from '@/lib/api';
import { formatDate } from '@/lib/i18n/formatters';
import BrandLoader from '@/components/ui/BrandLoader';
import { useTranslation } from '@/hooks/useTranslation';
import {
  generateRecruitmentApplicationDetailPath,
  getRecruitmentPortalBasePath,
} from '@/lib/routePaths';
import {
  Briefcase,
  FileText,
  Clock,
  UserCheck,
  Calendar,
  Award,
  CheckCircle2,
  Users,
  ChevronRight,
  TrendingUp,
  ArrowUpRight,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

interface DashboardData {
  stats: {
    activeJobs: number;
    totalApplications: number;
    newApplications: number;
    underReview: number;
    interviewsScheduled: number;
    selectedCandidates: number;
    offersSent: number;
    hiredCandidates: number;
  };
  charts: {
    applicationsByJob: Array<{ jobTitle: string; count: number }>;
    applicationsByDepartment: Array<{ departmentName: string; count: number }>;
    pipelineFunnel: Array<{ stage: string; count: number }>;
  };
  recentApplications: Array<{
    id: string;
    applicationRef: string;
    currentStage: string;
    appliedAt: string;
    candidate: { fullName: string; email: string; mobile: string };
    job: { title: string; jobCode: string; department?: { name: string } };
  }>;
  upcomingInterviews: Array<{
    id: string;
    scheduledAt: string;
    type: string;
    candidate: { fullName: string; mobile: string };
    job: { title: string };
    interviewer?: { name: string };
  }>;
}

const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#6366F1'];

export default function RecruitmentDashboardPage() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const recruitmentBasePath = getRecruitmentPortalBasePath(pathname);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/recruitment/admin/dashboard');
      if (res.data?.success) {
        setData(res.data);
      }
    } catch (err: unknown) {
      console.error('Failed to load dashboard:', err);
      setError(t('recruitment.analyticsLoading', 'Unable to load recruitment analytics.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchDashboard]);

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <main className="max-w-7xl mx-auto px-0 pt-0 pb-6 w-full space-y-4 flex-grow">
        {/* Loading State */}
        {loading && (
          <BrandLoader variant="section" size="sm" bg="light" text={t('recruitment.analyticsLoading', 'Loading Recruitment Analytics...')} className="rounded-2xl border border-gray-200 bg-white shadow-sm" />
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl text-center space-y-3">
            <AlertCircle size={32} className="mx-auto text-red-500" />
            <p className="text-sm font-semibold">{error}</p>
            <button
              onClick={() => void fetchDashboard()}
              className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all"
            >
              {t('recruitment.retry', 'Retry')}
            </button>
          </div>
        )}

        {!loading && data && (
          <>
            {/* 8 KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {/* 1. Active Jobs */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-2 shadow-sm hover:border-amber-400 transition-all">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Briefcase size={16} />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">{t('recruitment.activeJobs', 'Active Jobs')}</span>
                  <span className="text-xl font-extrabold text-gray-900">{data.stats.activeJobs}</span>
                </div>
              </div>

              {/* 2. Total Applications */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-2 shadow-sm hover:border-blue-400 transition-all">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <FileText size={16} />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">{t('recruitment.totalApplications', 'Total Applications')}</span>
                  <span className="text-xl font-extrabold text-gray-900">{data.stats.totalApplications}</span>
                </div>
              </div>

              {/* 3. New Applications */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-2 shadow-sm hover:border-cyan-400 transition-all">
                <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
                  <Clock size={16} />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">{t('recruitment.newSubmissions', 'New Submissions')}</span>
                  <span className="text-xl font-extrabold text-gray-900">{data.stats.newApplications}</span>
                </div>
              </div>

              {/* 4. Under Review */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-2 shadow-sm hover:border-purple-400 transition-all">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <UserCheck size={16} />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">{t('recruitment.underReview', 'Under Review')}</span>
                  <span className="text-xl font-extrabold text-gray-900">{data.stats.underReview}</span>
                </div>
              </div>

              {/* 5. Interviews Scheduled */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-2 shadow-sm hover:border-indigo-400 transition-all">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Calendar size={16} />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">{t('recruitment.interviews', 'Interviews')}</span>
                  <span className="text-xl font-extrabold text-gray-900">{data.stats.interviewsScheduled}</span>
                </div>
              </div>

              {/* 6. Selected Candidates */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-2 shadow-sm hover:border-emerald-400 transition-all">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Users size={16} />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">{t('recruitment.selected', 'Selected')}</span>
                  <span className="text-xl font-extrabold text-gray-900">{data.stats.selectedCandidates}</span>
                </div>
              </div>

              {/* 7. Offers Sent */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-2 shadow-sm hover:border-violet-400 transition-all">
                <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold">
                  <Award size={16} />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">{t('recruitment.offersSent', 'Offers Sent')}</span>
                  <span className="text-xl font-extrabold text-gray-900">{data.stats.offersSent}</span>
                </div>
              </div>

              {/* 8. Hired Candidates */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-2 shadow-sm hover:border-green-400 transition-all">
                <div className="w-8 h-8 rounded-xl bg-green-50 text-green-600 flex items-center justify-center font-bold">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">{t('recruitment.hiredTotal', 'Hired Total')}</span>
                  <span className="text-xl font-extrabold text-gray-900">{data.stats.hiredCandidates}</span>
                </div>
              </div>
            </div>

            {/* Analytics Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Funnel Pipeline */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-sm lg:col-span-2">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <TrendingUp size={16} className="text-amber-500" />
                    {t('recruitment.pipelineFunnel', 'Recruitment Pipeline Conversion Funnel')}
                  </h3>
                  <Link
                    href={`${recruitmentBasePath}/pipeline`}
                    className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    <span>{t('recruitment.viewKanban', 'View Kanban Pipeline')}</span>
                    <ArrowUpRight size={14} />
                  </Link>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.charts.pipelineFunnel} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                      <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#F59E0B" radius={[6, 6, 0, 0]}>
                        {data.charts.pipelineFunnel.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Department Distribution */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
                  {t('recruitment.appsByDept', 'Applications by Department')}
                </h3>

                <div className="h-64 w-full">
                  {data.charts.applicationsByDepartment.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.charts.applicationsByDepartment}
                          dataKey="count"
                          nameKey="departmentName"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''} (${((percent || 0) * 100).toFixed(0)}%)`}
                        >
                          {data.charts.applicationsByDepartment.map((_, idx) => (
                            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400">
                      {t('recruitment.noDeptData', 'No department data available')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tables Section: Recent Applications & Upcoming Interviews */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Applications */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-bold text-gray-900">{t('recruitment.recentApps', 'Recent Applications')}</h3>
                  <Link
                    href={`${recruitmentBasePath}/applications`}
                    className="text-xs font-semibold text-amber-600 hover:underline flex items-center gap-1"
                  >
                    {t('recruitment.viewAll', 'View All')}
                    <ChevronRight size={14} />
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-[10px] uppercase font-bold text-gray-400">
                        <th className="py-2">{t('recruitment.candidate', 'Candidate')}</th>
                        <th className="py-2">{t('recruitment.job', 'Job')}</th>
                        <th className="py-2">{t('recruitment.stage', 'Stage')}</th>
                        <th className="py-2 text-right">{t('recruitment.applied', 'Applied')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs">
                      {data.recentApplications.map((app) => (
                        <tr key={app.id} className="hover:bg-gray-50/60">
                          <td className="py-3 font-semibold text-gray-900">
                            <Link href={generateRecruitmentApplicationDetailPath(recruitmentBasePath, app)} className="hover:text-amber-600">
                              {app.candidate.fullName}
                            </Link>
                            <span className="block text-[10px] text-gray-400 font-normal">{app.candidate.email}</span>
                          </td>
                          <td className="py-3 text-gray-700 font-medium">
                            {app.job.title}
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/60 text-[10px] font-bold">
                              {app.currentStage}
                            </span>
                          </td>
                          <td className="py-3 text-right text-gray-400 text-[11px]">
                            {formatDate(app.appliedAt)}
                          </td>
                        </tr>
                      ))}

                      {data.recentApplications.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-xs text-gray-400">
                            {t('recruitment.noApplications', 'No applications submitted yet.')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Upcoming Interviews */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-bold text-gray-900">{t('recruitment.upcomingInterviews', 'Upcoming Scheduled Interviews')}</h3>
                  <Link
                    href={`${recruitmentBasePath}/interviews`}
                    className="text-xs font-semibold text-amber-600 hover:underline flex items-center gap-1"
                  >
                    {t('recruitment.manageInterviews', 'Manage Interviews')}
                    <ChevronRight size={14} />
                  </Link>
                </div>

                <div className="space-y-3">
                  {data.upcomingInterviews.map((iv) => (
                    <div key={iv.id} className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-gray-900">{iv.candidate.fullName}</h4>
                        <p className="text-[11px] text-gray-500">{iv.job.title} • {iv.type} Interview</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-amber-600 block">
                          {formatDate(iv.scheduledAt)}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(iv.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}

                  {data.upcomingInterviews.length === 0 && (
                    <div className="p-6 text-center text-xs text-gray-400">
                      {t('recruitment.noInterviews', 'No interviews currently scheduled.')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
