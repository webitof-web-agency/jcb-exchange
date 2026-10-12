/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */
'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CalendarDays, CarFront, Eye, FileCheck2, History, Loader2, MapPin, Search, ShieldAlert, UserRound, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import VerificationHistoryState from '@/components/vehicleTransport/VerificationHistoryState';
import {
  normalizeDrivingLicenseNumber,
  safeApiError,
  validateDrivingLicenseDob,
  validateDrivingLicenseNumber,
  type DrivingLicenseRecord,
  type DrivingLicenseResultResponse,
} from '@/lib/drivingLicenseVerification';

type HistoryResponse = {
  records: DrivingLicenseRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50';

const formatDate = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (value === '1800-01-01') return 'Not applicable';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
};

const titleize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function SafeValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400">Not available</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-slate-400">Not available</span>;
    return <ul className="space-y-1 text-slate-800">{value.map((item, index) => <li key={index} className="rounded-lg bg-slate-50 px-3 py-2">{typeof item === 'object' && item !== null ? <SafeValue value={item} /> : String(item)}</li>)}</ul>;
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

function ResultPanel({ response }: { response: DrivingLicenseResultResponse }) {
  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title="Driving license verification was not completed" record={response.record} />;
  }
  const result = response.result || {};
  const profileImage = typeof result.profileImage === 'string' ? result.profileImage : null;
  const lessInfo = result.lessInfo === true;
  return <div className="mt-6 space-y-5" role="status" aria-live="polite">
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-sm font-bold text-emerald-800"><BadgeCheck className="h-5 w-5" />Verification request completed</div><StatusBadge status={response.record.status} /></div>
    {lessInfo ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Limited driving license information was returned by the verification provider.</div> : null}
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><FileCheck2 className="h-5 w-5 text-amber-600" />Verification</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="License number" value={result.licenseNumber || response.record.maskedLicenseNumber} /><Field label="Current status" value={result.currentStatus} /><Field label="State" value={result.state} /></dl></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><UserRound className="h-5 w-5 text-amber-600" />License Holder</h2><div className="mt-4 flex flex-col gap-4 sm:flex-row">{profileImage ? <div className="shrink-0"><img src={profileImage} alt="Driving license holder" className="h-28 w-24 rounded-xl border border-slate-200 object-cover" /></div> : null}<dl className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2"><Field label="Name" value={result.name} /><Field label="Father / husband name" value={result.fatherOrHusbandName} /><Field label="Date of birth" value={formatDate(result.dob)} /><Field label="Gender" value={result.gender} /><Field label="Blood group" value={result.bloodGroup} /><Field label="Citizenship" value={result.citizenship} /></dl></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CalendarDays className="h-5 w-5 text-amber-600" />License Details</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Issuing authority" value={result.issuingAuthority} /><Field label="Authority code" value={result.issuingAuthorityCode} /><Field label="Original issue date" value={formatDate(result.originalIssueDate)} /><Field label="Issue date" value={formatDate(result.issueDate)} /><Field label="Expiry date" value={formatDate(result.expiryDate)} /><Field label="Transport issue date" value={formatDate(result.transportIssueDate)} /><Field label="Transport expiry date" value={formatDate(result.transportExpiryDate)} /></dl></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CarFront className="h-5 w-5 text-amber-600" />Vehicle Authorization</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Vehicle classes" value={result.vehicleClasses} /><Field label="Vehicle class descriptions" value={result.vehicleClassDescriptions} /><Field label="Badge numbers" value={result.badgeNumbers} /></dl></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><MapPin className="h-5 w-5 text-amber-600" />Addresses</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Permanent address" value={result.permanentAddress} /><Field label="Permanent PIN code" value={result.permanentZip} /><Field label="City" value={result.cityName} /><Field label="Temporary address" value={result.temporaryAddress} /><Field label="Temporary PIN code" value={result.temporaryZip} /></dl></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><ShieldAlert className="h-5 w-5 text-amber-600" />Additional Information</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Partial information" value={lessInfo ? 'Yes' : result.lessInfo === false ? 'No' : null} /><Field label="Additional checks" value={result.additionalChecks} /></dl></section>
  </div>;
}

export default function DrivingLicenseVerificationPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const permissions = user?.permissions;
  const canVerify = isSuperAdmin || hasAnyPermission(permissions, ['driving-license.verification.read']);
  const canHistory = isSuperAdmin || hasAnyPermission(permissions, ['driving-license.verification.read']);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<DrivingLicenseResultResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadHistory = useCallback(async (page = historyPage, search = historySearch) => {
    if (!canHistory) return;
    setHistoryLoading(true);
    try {
      const result = await api.get<HistoryResponse>('/driving-license-verification/history', { params: { page, limit: 20, search: search || undefined } });
      setHistory(result.data);
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load driving license verification history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [canHistory, historyPage, historySearch]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setResponse(null);
    const licenseError = validateDrivingLicenseNumber(licenseNumber);
    const dobError = validateDrivingLicenseDob(dob);
    if (licenseError) { setError(licenseError); return; }
    if (dobError) { setError(dobError); return; }
    setBusy(true);
    try {
      const result = await api.post<DrivingLicenseResultResponse>('/driving-license-verification/verify', { id_number: normalizeDrivingLicenseNumber(licenseNumber), dob });
      setResponse(result.data);
      if (canHistory) { setHistoryPage(1); void loadHistory(1, historySearch); }
    } catch (requestError) {
      setError(safeApiError(requestError, 'Driving license verification could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const result = await api.get<DrivingLicenseResultResponse>(`/driving-license-verification/history/${id}`);
      setResponse(result.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load this driving license verification result.'));
    } finally {
      setDetailLoading(false);
    }
  };

  return <main className={embedded ? 'w-full' : 'min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8'}><div className="mx-auto max-w-7xl">{!embedded ? <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Vehicle &amp; Transport</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Vehicle &amp; Transport</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Vehicle and transport verification services. Driving License Verification is the first available service in this module.</p></div><div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Provider: Surepass</div></div> : null}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"><section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] overflow-hidden"><div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><div className="mb-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><p>Enter the license number and holder date of birth. The license number is normalized and validated before any provider request.</p></div><form onSubmit={submit}><label><span className="text-sm font-semibold text-slate-700">Driving License Number <span className="text-red-500">*</span></span><input value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value.slice(0, 50))} className={inputClass} placeholder="UP2020150000000" autoComplete="off" maxLength={50} /></label><label className="mt-5 block"><span className="text-sm font-semibold text-slate-700">Date of Birth <span className="text-red-500">*</span></span><input type="date" value={dob} onChange={(event) => setDob(event.target.value)} className={inputClass} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} /></label>{error ? <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}<button type="submit" disabled={busy || !canVerify} className={`${buttonClass} mt-6 w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}{busy ? 'Verifying…' : canVerify ? 'Verify License' : 'Verification not permitted'}</button></form>{response ? <ResultPanel response={response} /> : null}</div></section>
      {canHistory ? <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] overflow-hidden"><div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><History className="h-5 w-5 text-amber-600" />Driving License Verification History</h2><p className="text-sm text-slate-500">Only masked license numbers are shown in history.</p></div><div className="flex gap-2"><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value.toUpperCase().slice(0, 50))} onKeyDown={(event) => { if (event.key === 'Enter') { setHistoryPage(1); void loadHistory(1, historySearch); } }} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Search masked license" /><button type="button" onClick={() => { setHistoryPage(1); void loadHistory(1, historySearch); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" aria-label="Search history"><Search className="h-4 w-4" /></button></div></div>{historyLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div> : history?.records.length ? <div className="mt-5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">DL Number</th><th className="px-3 py-3">Name</th><th className="px-3 py-3">State</th><th className="px-3 py-3">License status</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">Date</th><th className="px-3 py-3" /></tr></thead><tbody>{history.records.map((record) => <tr key={record.id} className="border-b border-slate-100"><td className="px-3 py-3 font-mono font-semibold text-slate-800">{record.maskedLicenseNumber}</td><td className="px-3 py-3 text-slate-600">{record.holderName || 'Not available'}</td><td className="px-3 py-3 text-slate-600">{record.state || 'Not available'}</td><td className="px-3 py-3"><StatusBadge status={record.currentStatus} /></td><td className="px-3 py-3"><StatusBadge status={record.status} /></td><td className="px-3 py-3 text-slate-500">{formatDate(record.createdAt)}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => void openDetail(record.id)} disabled={detailLoading} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Eye className="h-3.5 w-3.5" />View</button></td></tr>)}</tbody></table></div> : <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No driving license verification history found.</div>}{history?.pagination.totalPages && history.pagination.totalPages > 1 ? <div className="mt-5 flex items-center justify-between text-sm text-slate-600"><span>Page {history.pagination.page} of {history.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={historyPage <= 1} onClick={() => { const next = historyPage - 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={historyPage >= history.pagination.totalPages} onClick={() => { const next = historyPage + 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></div> : null}</div></section> : null}</div></div></main>;
}
