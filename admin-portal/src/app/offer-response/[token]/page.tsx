'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import { BriefcaseBusiness, CalendarDays, CheckCircle2, FileText, MapPin, XCircle } from 'lucide-react';
import api from '@/lib/api';

type Offer = {
  candidateName: string;
  jobTitle: string;
  designation: string;
  joiningLocation: string;
  joiningDate: string | null;
  offerValidUntil: string | null;
  status: string;
};

const getError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.error || 'Unable to process this offer.' : 'Unable to process this offer.';

export default function OfferResponsePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOffer = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await api.get<{ offer: Offer }>(`/recruitment/public/offers/${encodeURIComponent(token)}`);
      setOffer(response.data.offer);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadOffer(); }, [token]);

  const respond = async (action: 'ACCEPT' | 'DECLINE') => {
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ status: string; message: string }>(`/recruitment/public/offers/${encodeURIComponent(token)}/respond`, { action });
      setNotice(response.data.message);
      setOffer((current) => current ? { ...current, status: response.data.status } : current);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const canRespond = offer?.status === 'SENT';
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-3"><div className="rounded-2xl bg-[#FFC107] p-3 text-black shadow-md"><BriefcaseBusiness className="h-7 w-7" /></div><div><p className="text-xl font-black tracking-tight text-slate-900">JCB Exchange</p><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Employment offer</p></div></div>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-9">
          {loading ? <div className="py-12 text-center text-sm font-semibold text-slate-500">Loading your offer...</div> : offer ? <>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-6"><div><p className="text-sm font-semibold text-slate-500">Dear {offer.candidateName},</p><h1 className="mt-2 text-2xl font-black text-slate-900">Your employment offer</h1><p className="mt-1 text-sm text-slate-500">Please review the offer details and choose your response.</p></div><FileText className="hidden h-9 w-9 text-amber-500 sm:block" /></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Position</p><p className="mt-1 font-extrabold text-slate-900">{offer.designation}</p><p className="mt-0.5 text-xs text-slate-500">{offer.jobTitle}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Location</p><p className="mt-1 flex items-center gap-1.5 font-extrabold text-slate-900"><MapPin className="h-4 w-4 text-amber-600" />{offer.joiningLocation}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Joining date</p><p className="mt-1 flex items-center gap-1.5 font-extrabold text-slate-900"><CalendarDays className="h-4 w-4 text-amber-600" />{offer.joiningDate ? new Date(offer.joiningDate).toLocaleDateString('en-IN') : 'As discussed'}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p><p className={`mt-1 font-extrabold ${offer.status === 'ACCEPTED' ? 'text-emerald-700' : offer.status === 'DECLINED' ? 'text-rose-700' : offer.status === 'EXPIRED' ? 'text-slate-500' : 'text-amber-700'}`}>{offer.status}</p></div></div>
            <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-950">The complete offer letter PDF was included with the email. This secure response link is personal to this offer and should not be forwarded.</div>
            {error ? <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div> : null}
            {notice ? <div role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div> : null}
            {canRespond ? <div className="mt-7 grid gap-3 sm:grid-cols-2"><button type="button" disabled={submitting} onClick={() => void respond('ACCEPT')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 className="h-5 w-5" />Accept offer</button><button type="button" disabled={submitting} onClick={() => void respond('DECLINE')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-extrabold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><XCircle className="h-5 w-5" />Decline offer</button></div> : <p className="mt-7 text-center text-sm font-bold text-slate-600">This offer is no longer awaiting a response.</p>}
          </> : <div className="py-12 text-center"><XCircle className="mx-auto h-10 w-10 text-rose-500" /><h1 className="mt-3 text-xl font-black text-slate-900">Offer link unavailable</h1><p className="mt-2 text-sm text-slate-500">{error || 'This offer link is invalid or has expired.'}</p></div>}
        </section>
      </div>
    </main>
  );
}
