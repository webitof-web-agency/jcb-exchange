/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Building2, CalendarDays, Eye, FileCheck2, History, Loader2, Search, ShieldAlert, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import {
  normalizeGstin,
  safeApiError,
  validateGstin,
  type GstRecord,
  type GstResultResponse,
} from '@/lib/gstVerification';
import { sanitizeGstin } from '@/lib/verificationSanitizers';

type HistoryResponse = { records: GstRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';

const formatDate = (value: unknown, active = false) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (/^18\d{2}-\d{2}-\d{2}/.test(value)) return active ? 'Not Applicable' : null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
};

const titleize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function SafeValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400 font-normal">Not available</span>;

  if (typeof value === 'boolean') {
    return <span className={value ? 'font-semibold text-emerald-700' : 'text-slate-600'}>{value ? 'Yes / Active' : 'No / Inactive'}</span>;
  }

  if (typeof value === 'string' && /^18\d{2}-\d{2}-\d{2}/.test(value)) {
    return <span className="text-slate-400 font-normal">Not Applicable</span>;
  }

  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-slate-400 font-normal">Not available</span>;
    return (
      <ul className="space-y-1.5 text-slate-800">
        {value.map((item, index) => (
          <li key={index} className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium">
            {typeof item === 'object' && item !== null ? <SafeValue value={item} /> : String(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    return (
      <div className="space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3">
        {Object.entries(value as Record<string, unknown>).map(([key, item]) => {
          if (item === null || item === undefined || item === '') return null;
          return (
            <div key={key} className="flex flex-col border-b border-slate-200/40 pb-1.5 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{titleize(key)}</span>
              <span className="min-w-0 break-all text-xs font-semibold text-slate-800 sm:text-right"><SafeValue value={item} /></span>
            </div>
          );
        })}
      </div>
    );
  }

  return <span className="min-w-0 break-all text-slate-800">{String(value)}</span>;
}

function Field({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 min-w-0 break-all text-sm font-semibold text-slate-900"><SafeValue value={value} /></dd>
    </div>
  );
}

function StatusBadge({ status }: { status: unknown }) {
  const label = typeof status === 'string' && status.trim() ? status : 'Not available';
  const normalized = label.toUpperCase();
  const tone = normalized === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : normalized === 'CANCELLED' || normalized === 'INACTIVE' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

function ResultPanel({ response }: { response: GstResultResponse }) {
  const result = response.result || {};
  const isActive = typeof result.gstinStatus === 'string' && result.gstinStatus.toUpperCase() === 'ACTIVE';
  return (
    <div className="mt-5 space-y-5" role="status" aria-live="polite">
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-800"><BadgeCheck className="h-5 w-5" />Surepass lookup completed</div>
        <div className="text-xs text-emerald-800">Provider response: {response.record.status}</div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><FileCheck2 className="h-5 w-5 text-amber-600" />GST Registration</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="GSTIN" value={result.gstin || response.record.maskedGstin} />
          <div className="rounded-xl border border-slate-100 bg-white p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">GST status</dt><dd className="mt-2"><StatusBadge status={result.gstinStatus || response.record.gstinStatus} /></dd></div>
          <Field label="Registration date" value={formatDate(result.dateOfRegistration)} />
          <Field label="Cancellation date" value={formatDate(result.dateOfCancellation, isActive)} />
          <Field label="Taxpayer type" value={result.taxpayerType} />
          <Field label="Constitution of business" value={result.constitutionOfBusiness} />
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Building2 className="h-5 w-5 text-amber-600" />Business Information</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Business name" value={result.businessName} /><Field label="Legal name" value={result.legalName} /><Field label="PAN" value={result.panNumber} /><Field label="Address" value={result.address} /><Field label="Address details" value={result.addressDetails} /></dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><FileCheck2 className="h-5 w-5 text-amber-600" />Complete Provider Response</h2>
        {result.providerData && typeof result.providerData === 'object' ? (
          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">View every safe field returned by Surepass</summary>
            <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">{JSON.stringify(result.providerData, null, 2)}</pre>
          </details>
        ) : <p className="mt-4 text-sm text-slate-500">No provider detail was returned.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><ShieldAlert className="h-5 w-5 text-amber-600" />Jurisdiction & Activities</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Central jurisdiction" value={result.centerJurisdiction} /><Field label="State jurisdiction" value={result.stateJurisdiction} /><Field label="Business activities" value={result.natureOfBusinessActivities} /><Field label="Core activity" value={result.natureOfCoreBusinessActivityDescription} /><Field label="Core activity code" value={result.natureOfCoreBusinessActivityCode} /></dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CalendarDays className="h-5 w-5 text-amber-600" />Additional & Filing Information</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Field visit conducted" value={result.fieldVisitConducted} /><Field label="Aadhaar validation" value={result.aadhaarValidation} /><Field label="Aadhaar validation date" value={formatDate(result.aadhaarValidationDate)} /><Field label="Filing status" value={result.filingStatus} /><Field label="Filing frequency" value={result.filingFrequency} /><Field label="HSN information" value={result.hsnInfo} /></dl>
      </section>
    </div>
  );
}

export default function GstVerificationPage() {
  const { user } = useAuthStore();
  const role = user?.role;
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const permissions = user?.permissions;
  const canVerify = isSuperAdmin || hasAnyPermission(permissions, ['gst.verification.read']);
  const canHistory = isSuperAdmin || hasAnyPermission(permissions, ['gst.verification.read']);
  const [gstin, setGstin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<GstResultResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [detail, setDetail] = useState<GstResultResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadHistory = useCallback(async (page = historyPage, search = historySearch) => {
    if (!canHistory) return;
    setHistoryLoading(true);
    try {
      const result = await api.get<HistoryResponse>('/gst-verification/history', { params: { page, limit: 20, search: search || undefined } });
      setHistory(result.data);
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load GST verification history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [canHistory, historyPage, historySearch]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setResponse(null);
    const cleanGstin = sanitizeGstin(gstin);
    setGstin(cleanGstin);
    const validationError = validateGstin(cleanGstin);
    if (validationError) { setError(validationError); return; }
    setBusy(true);
    try {
      const result = await api.post<GstResultResponse>('/gst-verification/verify', { id_number: normalizeGstin(cleanGstin) });
      setResponse(result.data);
      if (canHistory) void loadHistory(1, historySearch);
    } catch (requestError) {
      setError(safeApiError(requestError, 'GST details could not be verified.'));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const result = await api.get<GstResultResponse>(`/gst-verification/history/${id}`);
      setDetail(result.data);
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load this GST verification result.'));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <main className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Admin tool</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">GST Verification</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Verify a business GSTIN using the Surepass GSTIN Advanced Verification API. Enhanced business, filing and compliance details are shown exactly as returned by the provider.</p></div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Provider: Surepass</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><p>Enter the 15-character GSTIN. It is normalized to uppercase and validated before any provider request is made.</p></div>
            <form onSubmit={submit}>
              <label><span className="text-sm font-semibold text-slate-700">GSTIN <span className="text-red-500">*</span></span><input value={gstin} onChange={(event) => setGstin(sanitizeGstin(event.target.value))} className={inputClass} placeholder="08AKWPJ1234H1ZN" autoComplete="off" maxLength={15} aria-describedby="gstin-help" /></label>
              <p id="gstin-help" className="mt-2 text-xs text-slate-500">Example format: 08AKWPJ1234H1ZN</p>
              {error ? <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
              <button type="submit" disabled={busy || !canVerify} className={`${buttonClass} mt-6 w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}{busy ? 'Verifying…' : canVerify ? 'Verify GSTIN' : 'Verification not permitted'}</button>
            </form>
            {response ? <ResultPanel response={response} /> : null}
          </section>

          {canHistory ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><History className="h-5 w-5 text-amber-600" />Verification history</h2><p className="text-sm text-slate-500">Only masked GSTIN values are shown in the history list.</p></div><div className="flex gap-2"><input value={historySearch} onChange={(event) => setHistorySearch(sanitizeGstin(event.target.value, 30))} onKeyDown={(event) => { if (event.key === 'Enter') { setHistoryPage(1); void loadHistory(1, historySearch); } }} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Search masked GSTIN" /><button type="button" onClick={() => { setHistoryPage(1); void loadHistory(1, historySearch); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" aria-label="Search history"><Search className="h-4 w-4" /></button></div></div>{historyLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div> : history?.records.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">GSTIN</th><th className="px-3 py-3">Business</th><th className="px-3 py-3">GST status</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">Requested by</th><th className="px-3 py-3">Date</th><th className="px-3 py-3" /></tr></thead><tbody>{history.records.map((record) => <tr key={record.id} className="border-b border-slate-100"><td className="px-3 py-3 font-mono font-semibold text-slate-800">{record.maskedGstin}</td><td className="max-w-[220px] truncate px-3 py-3 text-slate-600" title={record.businessName || ''}>{record.businessName || 'Not available'}</td><td className="px-3 py-3"><StatusBadge status={record.gstinStatus} /></td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${record.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : record.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{record.status}</span></td><td className="px-3 py-3 text-slate-600">{record.requestedBy?.name || record.requestedBy?.email || 'Not available'}</td><td className="px-3 py-3 text-slate-500">{formatDate(record.createdAt)}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => void openDetail(record.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Eye className="h-3.5 w-3.5" />View</button></td></tr>)}</tbody></table></div> : <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No GST verification history found.</div>}{history?.pagination.totalPages && history.pagination.totalPages > 1 ? <div className="mt-5 flex items-center justify-between text-sm text-slate-600"><span>Page {history.pagination.page} of {history.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={historyPage <= 1} onClick={() => { const next = historyPage - 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={historyPage >= history.pagination.totalPages} onClick={() => { const next = historyPage + 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></div> : null}</section> : null}
        </div>
      </div>
      {detail ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="GST verification result"><div className="mx-auto my-4 w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-600">History detail</p><h2 className="mt-1 text-xl font-bold text-slate-900">GST Verification Result</h2></div><button type="button" onClick={() => setDetail(null)} disabled={detailLoading} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Close detail">Close</button></div><ResultPanel response={detail} /></div></div> : null}
    </main>
  );
}
