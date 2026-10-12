/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CalendarDays, CarFront, Eye, FileCheck2, History, Loader2, MapPin, Search, ShieldAlert, UserRound, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import VerificationHistoryState from '@/components/vehicleTransport/VerificationHistoryState';
import {
  normalizeRcNumber,
  safeApiError,
  validateRcNumber,
  type RcOwnerHistoryRecord,
  type RcOwnerHistoryResponse,
} from '@/lib/rcOwnerHistory';

type HistoryResponse = {
  records: RcOwnerHistoryRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50';

const formatDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
};

const titleize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function SafeValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400">Not available</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-slate-400">Not available</span>;
    return <ul className="space-y-1 text-slate-800">{value.map((item, index) => <li key={index} className="rounded-lg bg-slate-50 px-3 py-2"><SafeValue value={item} /></li>)}</ul>;
  }
  if (typeof value === 'object') {
    return <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">{Object.entries(value as Record<string, unknown>).map(([key, item]) => <div key={key} className="min-w-0"><span className="text-xs text-slate-500">{titleize(key)}</span><div className="break-words text-sm font-medium text-slate-800"><SafeValue value={item} /></div></div>)}</div>;
  }
  return <span className="break-words text-slate-800">{String(value)}</span>;
}

function Field({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  return <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-900"><SafeValue value={value} /></dd></div>;
}

function StatusBadge({ status }: { status: unknown }) {
  const label = typeof status === 'string' && status.trim() ? status : 'Not available';
  const normalized = label.toUpperCase();
  const tone = normalized === 'ACTIVE' || normalized === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : normalized === 'FAILED' || normalized === 'INACTIVE' || normalized === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

function ResultPanel({ response }: { response: RcOwnerHistoryResponse }) {
  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title="RC owner verification was not completed" record={response.record} />;
  }
  const result = response.result || {};
  const lessInfo = result.lessInfo === true;
  return <div className="mt-6 space-y-5" role="status" aria-live="polite">
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-sm font-bold text-emerald-800"><BadgeCheck className="h-5 w-5" />RC verification completed</div><StatusBadge status={response.record.status} /></div>
    {lessInfo ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Limited vehicle information was returned by the verification provider.</div> : null}
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><FileCheck2 className="h-5 w-5 text-amber-600" />Registration</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="RC number" value={result.rcNumber || response.record.maskedRcNumber} /><Field label="Registration date" value={formatDate(result.registrationDate)} /><Field label="RC status" value={result.rcStatus} /><Field label="Owner number" value={result.ownerNumber} /></dl></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><UserRound className="h-5 w-5 text-amber-600" />Owner details</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Owner name" value={result.ownerName} /><Field label="Father name" value={result.fatherName} /><Field label="Mobile number" value={result.mobileNumber} /><Field label="Present address" value={result.presentAddress} /><Field label="Permanent address" value={result.permanentAddress} /></dl></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CarFront className="h-5 w-5 text-amber-600" />Vehicle details</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Category" value={result.vehicleCategoryDescription || result.vehicleCategory} /><Field label="Maker" value={result.makerDescription} /><Field label="Model" value={result.makerModel} /><Field label="Variant" value={result.variant} /><Field label="Body type" value={result.bodyType} /><Field label="Fuel type" value={result.fuelType} /><Field label="Color" value={result.color} /><Field label="Emission norms" value={result.normsType} /><Field label="Chassis number" value={result.vehicleChasiNumber} /><Field label="Engine number" value={result.vehicleEngineNumber} /><Field label="Financed" value={typeof result.financed === 'boolean' ? (result.financed ? 'Yes' : 'No') : null} /><Field label="Financer" value={result.financer} /></dl></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CalendarDays className="h-5 w-5 text-amber-600" />Validity and compliance</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Manufacturing month" value={result.manufacturingDateFormatted || result.manufacturingDate} /><Field label="Fitness valid up to" value={formatDate(result.fitUpTo)} /><Field label="Insurance valid up to" value={formatDate(result.insuranceUpto)} /><Field label="Tax valid up to" value={formatDate(result.taxUpto)} /><Field label="Tax paid up to" value={formatDate(result.taxPaidUpto)} /><Field label="PUCC valid up to" value={formatDate(result.puccUpto)} /><Field label="Permit issue date" value={formatDate(result.permitIssueDate)} /><Field label="Permit valid from" value={formatDate(result.permitValidFrom)} /><Field label="Permit valid up to" value={formatDate(result.permitValidUpto)} /><Field label="Permit type" value={result.permitType} /><Field label="Blacklist status" value={result.blacklistStatus} /><Field label="Non-use status" value={result.nonUseStatus} /></dl></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><MapPin className="h-5 w-5 text-amber-600" />Provider details</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Registered at" value={result.registeredAt} /><Field label="Insurance company" value={result.insuranceCompany} /><Field label="Insurance policy number" value={result.insurancePolicyNumber} /><Field label="PUCC number" value={result.puccNumber} /><Field label="Permit number" value={result.permitNumber} /><Field label="National permit number" value={result.nationalPermitNumber} /><Field label="NOC details" value={result.nocDetails} /><Field label="Challan details" value={result.challanDetails} /></dl></section>
  </div>;
}

export default function RcOwnerHistoryPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const permissions = user?.permissions;
  const canVerify = isSuperAdmin || hasAnyPermission(permissions, ['rc.owner-history.read']);
  const canHistory = isSuperAdmin || hasAnyPermission(permissions, ['rc.owner-history.read']);
  const [rcNumber, setRcNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<RcOwnerHistoryResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadHistory = useCallback(async (page = historyPage, search = historySearch) => {
    if (!canHistory) return;
    setHistoryLoading(true);
    try {
      const result = await api.get<HistoryResponse>('/rc-owner-history/history', { params: { page, limit: 20, search: search || undefined } });
      setHistory(result.data);
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load RC owner history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [canHistory, historyPage, historySearch]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setResponse(null);
    const rcError = validateRcNumber(rcNumber);
    if (rcError) { setError(rcError); return; }
    setBusy(true);
    try {
      const result = await api.post<RcOwnerHistoryResponse>('/rc-owner-history/verify', { id_number: normalizeRcNumber(rcNumber) });
      setResponse(result.data);
      if (canHistory) { setHistoryPage(1); void loadHistory(1, historySearch); }
    } catch (requestError) {
      setError(safeApiError(requestError, 'RC owner history verification could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const result = await api.get<RcOwnerHistoryResponse>(`/rc-owner-history/history/${id}`);
      setResponse(result.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load this RC owner history result.'));
    } finally {
      setDetailLoading(false);
    }
  };

  return <main className={embedded ? 'w-full' : 'min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8'}><div className="mx-auto max-w-7xl">{!embedded ? <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Vehicle &amp; Transport</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">RC Owner History</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Verify registered vehicle and owner details through the configured Surepass RC Full service.</p></div><div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Provider: Surepass</div></div> : null}<div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"><section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] overflow-hidden"><div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><div className="mb-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><p>Enter the vehicle registration number. It is normalized and validated before any provider request.</p></div><form onSubmit={submit}><label><span className="text-sm font-semibold text-slate-700">Vehicle Registration Number <span className="text-red-500">*</span></span><input value={rcNumber} onChange={(event) => setRcNumber(event.target.value.slice(0, 30))} className={inputClass} placeholder="RJ12XJ1234" autoComplete="off" maxLength={30} /></label>{error ? <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}<button type="submit" disabled={busy || !canVerify} className={`${buttonClass} mt-6 w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}{busy ? 'Verifying…' : canVerify ? 'Verify RC' : 'Verification not permitted'}</button></form>{response ? <ResultPanel response={response} /> : null}</div></section>{canHistory ? <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] overflow-hidden"><div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><History className="h-5 w-5 text-amber-600" />RC Owner History</h2><p className="text-sm text-slate-500">Only masked registration numbers are shown in history.</p></div><div className="flex gap-2"><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value.toUpperCase().slice(0, 30))} onKeyDown={(event) => { if (event.key === 'Enter') { setHistoryPage(1); void loadHistory(1, historySearch); } }} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Search masked RC" /><button type="button" onClick={() => { setHistoryPage(1); void loadHistory(1, historySearch); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" aria-label="Search history"><Search className="h-4 w-4" /></button></div></div>{historyLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div> : history?.records.length ? <div className="mt-5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">RC number</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3">Vehicle</th><th className="px-3 py-3">RC status</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">Date</th><th className="px-3 py-3" /></tr></thead><tbody>{history.records.map((record) => <tr key={record.id} className="border-b border-slate-100"><td className="px-3 py-3 font-mono font-semibold text-slate-800">{record.maskedRcNumber}</td><td className="px-3 py-3 text-slate-600">{record.ownerName || 'Not available'}</td><td className="px-3 py-3 text-slate-600">{record.vehicleCategory || 'Not available'}</td><td className="px-3 py-3"><StatusBadge status={record.rcStatus} /></td><td className="px-3 py-3"><StatusBadge status={record.status} /></td><td className="px-3 py-3 text-slate-500">{formatDate(record.createdAt.slice(0, 10)) || 'Not available'}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => void openDetail(record.id)} disabled={detailLoading} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Eye className="h-3.5 w-3.5" />View</button></td></tr>)}</tbody></table></div> : <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No RC owner history found.</div>}{history?.pagination.totalPages && history.pagination.totalPages > 1 ? <div className="mt-5 flex items-center justify-between text-sm text-slate-600"><span>Page {history.pagination.page} of {history.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={historyPage <= 1} onClick={() => { const next = historyPage - 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={historyPage >= history.pagination.totalPages} onClick={() => { const next = historyPage + 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></div> : null}</div></section> : null}</div></div></main>;
}
