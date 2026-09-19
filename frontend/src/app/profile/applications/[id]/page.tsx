'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, Calendar, Clock, FileText, MapPin, User } from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';

type Application = {
  applicationRef: string;
  currentStage: string;
  appliedAt: string;
  candidate: { fullName: string; email: string; mobile: string; totalExperience?: number | null };
  job: { title: string; jobCode: string; locationCity?: string; locationState?: string; department?: { name: string } };
  documents?: Array<{ id: string; fileUrl: string; fileName?: string; originalName?: string; category?: string; documentType?: string }>;
  stageHistory?: Array<{ id: string; toStage: string; createdAt: string }>;
  interviews?: Array<{ id: string; type: string; scheduledAt: string; status: string; meetingUrl?: string | null }>;
  offers?: Array<{ id: string; designation: string; ctc: string | number; joiningDate?: string | null; status: string }>;
};

const label = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export default function ApplicationDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void params.then(({ id }) => api.get(`/recruitment/my-applications/${id}`).then((res) => {
        const nextApplication = res.data.application as Application;
        setApplication(nextApplication);

        if (nextApplication.applicationRef && nextApplication.applicationRef !== id) {
          router.replace(`/profile/applications/${encodeURIComponent(nextApplication.applicationRef)}`, { scroll: false });
        }
      }))
      .catch(() => setError('Unable to load application details.'))
      .finally(() => setLoading(false));
  }, [params, router]);

  if (loading) return <BrandLoader variant="section" size="md" bg="light" text="Loading application details..." />;
  if (error || !application) return <div className="mx-auto max-w-3xl p-8 text-center text-red-700">{error || 'Application not found.'}</div>;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-950 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/profile?tab=applications" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-black"><ArrowLeft size={16} /> Back to My Applications</Link>
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-semibold text-gray-500">{application.applicationRef}</p><h1 className="mt-1 text-2xl font-black">{application.job.title}</h1><p className="mt-1 text-sm text-gray-600">{application.job.department?.name || 'General'} · {application.job.jobCode}</p></div>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-900">{label(application.currentStage)}</span>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-gray-600"><Calendar size={16} /> Applied {new Date(application.appliedAt).toLocaleDateString()}</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200"><h2 className="mb-5 flex items-center gap-2 text-lg font-bold"><User size={19} /> Submitted Information</h2><div className="grid gap-4 sm:grid-cols-2 text-sm"><div><b>Full Name</b><p>{application.candidate.fullName}</p></div><div><b>Email</b><p>{application.candidate.email}</p></div><div><b>Mobile</b><p>{application.candidate.mobile}</p></div><div><b>Experience</b><p>{application.candidate.totalExperience ? `${application.candidate.totalExperience} Years` : 'Fresher'}</p></div></div></section>
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200"><h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Clock size={19} /> Application History</h2><div className="max-h-80 space-y-4 overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">{(application.stageHistory || []).map((item) => <div key={item.id} className="border-l-2 border-amber-400 pl-4"><p className="font-semibold">{label(item.toStage)}</p><p className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</p></div>)}</div></section>
          </div>
          <div className="space-y-6">
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200"><h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Briefcase size={19} /> Job Details</h2><p className="font-bold">{application.job.title}</p><p className="mt-2 text-sm text-gray-600">{application.job.department?.name || 'General'}</p>{application.job.locationCity && <p className="mt-2 flex items-center gap-1 text-sm text-gray-600"><MapPin size={15} /> {application.job.locationCity}, {application.job.locationState}</p>}</section>
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200"><h2 className="mb-4 text-lg font-bold">Documents</h2><div className="space-y-2">{(application.documents || []).length ? application.documents?.map((doc) => { const name = doc.fileName || doc.originalName || doc.category || doc.documentType || 'Document'; return <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-sm font-semibold text-gray-900"><FileText className="shrink-0 text-red-600" size={20} /><span className="min-w-0 flex-1 truncate">{name}</span></div>; }) : <p className="text-sm text-gray-500">No documents uploaded.</p>}</div></section>
          </div>
        </div>
      </div>
    </main>
  );
}
