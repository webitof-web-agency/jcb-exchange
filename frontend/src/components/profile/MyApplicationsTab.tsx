"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Calendar, ChevronRight, X, User as UserIcon, FileText, Clock } from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';

type ApplicationAnswer = {
  id: string;
  answerText: string | null;
  answerJson: unknown;
  question: { id: string; question: string; type: string };
};

type ApplicationDocument = {
  id: string;
  documentType: string;
  fileUrl: string;
  originalName: string;
};

type StageHistory = {
  id: string;
  toStage: string;
  createdAt: string;
};

type JobDetail = {
  id: string;
  title: string;
  jobCode: string;
  department: { id: string; name: string };
  customQuestions?: { id: string; question: string }[];
};

type MyApplicationDetail = {
  id: string;
  applicationRef: string;
  currentStage: string;
  appliedAt: string;
  job: JobDetail;
  answers: ApplicationAnswer[];
  documents: ApplicationDocument[];
  stageHistory: StageHistory[];
  candidate: {
    fullName: string;
    email: string;
    mobile: string;
    totalExperience: number | null;
  };
};

type MyApplicationSummary = {
  id: string;
  applicationRef: string;
  currentStage: string;
  appliedAt: string;
  job: { title: string; jobCode: string; department: { name: string } };
};

const getStageBadgeColor = (stage: string) => {
  const normalized = stage.toUpperCase();
  if (['NEW', 'APPLIED'].includes(normalized)) return 'bg-blue-100 text-blue-800';
  if (['UNDER_REVIEW', 'SCREENING'].includes(normalized)) return 'bg-yellow-100 text-yellow-800';
  if (normalized.includes('INTERVIEW')) return 'bg-purple-100 text-purple-800';
  if (['SELECTED', 'HIRED', 'OFFER_ACCEPTED'].includes(normalized)) return 'bg-green-100 text-green-800';
  if (['REJECTED', 'WITHDRAWN'].includes(normalized)) return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
};

const formatStageLabel = (stage: string) => {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function MyApplicationsTab() {
  const [applications, setApplications] = useState<MyApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [appDetail, setAppDetail] = useState<MyApplicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/recruitment/my-applications');
      if (res.data.success) {
        setApplications(res.data.applications);
      } else {
        throw new Error('The applications response was invalid.');
      }
    } catch (err: unknown) {
      console.error('Failed to fetch applications', err);
      setError('Failed to load applications. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  const handleViewDetail = async (id: string) => {
    setSelectedAppId(id);
    setDetailLoading(true);
    try {
      const res = await api.get(`/recruitment/my-applications/${id}`);
      if (res.data.success) {
        setAppDetail(res.data.application);
      }
    } catch (err) {
      console.error('Failed to fetch application details', err);
    } finally {
      setDetailLoading(false);
    }
  };

  // The full application view is now a route; keep the legacy modal handler isolated for old state.
  void handleViewDetail;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <BrandLoader size="md" variant="section" bg="light" />
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900">My Applications</h2>
          <p className="mt-1 text-sm text-gray-500">Track the status of your job applications</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => void fetchApplications()} className="shrink-0 font-bold underline">
            Retry
          </button>
        </div>
      )}

      {applications.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-dashed border-gray-300 bg-gray-50">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
            <Briefcase className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">No Applications Found</h3>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            You haven&apos;t applied for any positions yet. Explore our open roles and start your journey!
          </p>
        </div>
      ) : (
        <div className="grid gap-4 max-h-[65vh] overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {applications.map((app) => (
            <div key={app.id} className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-[#FFC107] hover:shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStageBadgeColor(app.currentStage)}`}>
                      {formatStageLabel(app.currentStage)}
                    </span>
                    <span className="text-sm font-medium text-gray-500">#{app.applicationRef}</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{app.job.title}</h3>
                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-gray-400" />
                      {app.job.department?.name || 'General'}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      Applied: {new Date(app.appliedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <Link
                    href={`/profile/applications/${encodeURIComponent(app.applicationRef)}`}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-[#FFC107] hover:text-black"
                  >
                    View Status
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedAppId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAppId(null)} />
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-gray-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFC107]/20 text-[#B38700]">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Application Details</h3>
                  {appDetail && <p className="text-xs text-gray-500 font-medium">Ref: {appDetail.applicationRef}</p>}
                </div>
              </div>
              <button
                onClick={() => setSelectedAppId(null)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {detailLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <BrandLoader size="sm" variant="section" bg="light" />
                </div>
              ) : appDetail ? (
                <div className="space-y-6">
                  {/* Status Banner */}
                  <div className={`p-4 rounded-xl border flex items-start gap-4 ${appDetail.currentStage.includes('REJECT') ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
                    <div className={`mt-0.5 rounded-full p-1.5 ${appDetail.currentStage.includes('REJECT') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`text-sm font-bold ${appDetail.currentStage.includes('REJECT') ? 'text-red-900' : 'text-blue-900'}`}>
                        Current Status: {formatStageLabel(appDetail.currentStage)}
                      </h4>
                      <p className={`text-xs mt-1 ${appDetail.currentStage.includes('REJECT') ? 'text-red-700' : 'text-blue-700'}`}>
                        Applied on {new Date(appDetail.appliedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Form Details Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Candidate Form Submitted */}
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-gray-500" />
                          <h4 className="font-bold text-gray-900">Submitted Information</h4>
                        </div>
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
                          <div>
                            <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Full Name</span>
                            <span className="text-sm font-medium text-gray-900">{appDetail.candidate.fullName}</span>
                          </div>
                          <div>
                            <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</span>
                            <span className="text-sm font-medium text-gray-900">{appDetail.candidate.email}</span>
                          </div>
                          <div>
                            <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Mobile</span>
                            <span className="text-sm font-medium text-gray-900">{appDetail.candidate.mobile}</span>
                          </div>
                          <div>
                            <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Experience</span>
                            <span className="text-sm font-medium text-gray-900">{appDetail.candidate.totalExperience ? `${appDetail.candidate.totalExperience} Years` : 'Fresher'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Custom Questions */}
                      {appDetail.answers && appDetail.answers.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <h4 className="font-bold text-gray-900">Application Questions</h4>
                          </div>
                          <div className="p-5 divide-y divide-gray-100">
                            {appDetail.answers.map((answer) => (
                              <div key={answer.id} className="py-3 first:pt-0 last:pb-0">
                                <p className="text-sm font-semibold text-gray-900 mb-1.5">{answer.question?.question}</p>
                                <p className="text-sm text-gray-600 whitespace-pre-wrap">{answer.answerText || 'No answer provided'}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                      {/* Job Snapshot */}
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-gray-400" />
                          Job Details
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <span className="block text-xs text-gray-500">Position</span>
                            <span className="text-sm font-bold text-gray-900">{appDetail.job.title}</span>
                          </div>
                          <div>
                            <span className="block text-xs text-gray-500">Department</span>
                            <span className="text-sm font-medium text-gray-900">{appDetail.job.department?.name || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="block text-xs text-gray-500">Job Code</span>
                            <span className="text-sm font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{appDetail.job.jobCode}</span>
                          </div>
                        </div>
                      </div>

                      {/* Documents */}
                      {appDetail.documents && appDetail.documents.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                          <h4 className="font-bold text-gray-900 mb-3">Documents</h4>
                          <div className="space-y-2">
                            {appDetail.documents.map(doc => (
                              <a
                                key={doc.id}
                                href={api.getUri({ url: doc.fileUrl })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors group"
                              >
                                <FileText className="w-5 h-5 text-red-500 group-hover:text-red-600" />
                                <span className="text-sm font-medium text-gray-700 truncate">{doc.originalName}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stage Timeline */}
                      {appDetail.stageHistory && appDetail.stageHistory.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                          <h4 className="font-bold text-gray-900 mb-4">Application History</h4>
                          <div className="space-y-4">
                            {appDetail.stageHistory.map((history, idx) => (
                              <div key={history.id} className="relative pl-6">
                                {idx !== appDetail.stageHistory.length - 1 && (
                                  <div className="absolute left-2 top-6 bottom-[-16px] w-0.5 bg-gray-200"></div>
                                )}
                                <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-2 border-white bg-[#FFC107] shadow-sm"></div>
                                <div className="text-sm font-semibold text-gray-900">{formatStageLabel(history.toStage)}</div>
                                <div className="text-xs text-gray-500">{new Date(history.createdAt).toLocaleString()}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
