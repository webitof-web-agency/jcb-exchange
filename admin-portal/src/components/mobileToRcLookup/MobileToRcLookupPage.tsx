/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  BadgeCheck,
  Check,
  Copy,
  Download,
  Eye,
  History,
  ListChecks,
  Loader2,
  Phone,
  Search,
  ShieldAlert,
  Truck,
  UserRound,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import VerificationHistoryState from '@/components/vehicleTransport/VerificationHistoryState';
import {
  normalizeMobileNumber,
  safeApiError,
  validateMobileNumber,
  type MobileToRcRecord,
  type MobileToRcResponse,
} from '@/lib/mobileToRc';
import { sanitizeMobileNumber } from '@/lib/verificationSanitizers';

type HistoryResponse = {
  records: MobileToRcRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50';

const formatDate = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const date = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== datePart) return null;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
};

const formatDateTime = (value: unknown) => {
  if (typeof value !== 'string') return 'Not available';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return value;
  }
};

function StatusBadge({ status }: { status: unknown }) {
  const label = typeof status === 'string' && status.trim() ? status : 'Not available';
  const normalized = label.toUpperCase();
  const tone = normalized === 'SUCCESS'
    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
    : normalized === 'FAILED'
      ? 'bg-red-100 text-red-700 border border-red-200'
      : 'bg-amber-100 text-amber-700 border border-amber-200';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{label}</span>;
}

function Field({ label, value }: { label: string; value: unknown }) {
  const available = value !== null && value !== undefined && value !== '';
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words text-sm font-semibold ${available ? 'text-slate-900 font-mono' : 'text-slate-400'}`}>
        {available ? String(value) : 'Not available'}
      </dd>
    </div>
  );
}

function ResultPanel({ response }: { response: MobileToRcResponse }) {
  const [copiedMobile, setCopiedMobile] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRcIndex, setCopiedRcIndex] = useState<number | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');

  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title="Mobile-to-RC lookup was not completed" record={response.record} />;
  }

  const result = response.result;
  const rcNumbers = result?.rcNumbers || [];
  const mobile = result?.mobileNumber || response.record.maskedMobileNumber || '';
  const totalCount = rcNumbers.length || response.record.rcNumbersCount || 0;

  const copyMobile = async () => {
    if (!mobile) return;
    try {
      await navigator.clipboard.writeText(mobile);
      setCopiedMobile(true);
      window.setTimeout(() => setCopiedMobile(false), 2000);
    } catch {
      // ignore
    }
  };

  const copyAllRcs = async () => {
    if (!rcNumbers.length) return;
    try {
      await navigator.clipboard.writeText(rcNumbers.join(', '));
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // ignore
    }
  };

  const copySingleRc = async (rc: string, index: number) => {
    try {
      await navigator.clipboard.writeText(rc);
      setCopiedRcIndex(index);
      window.setTimeout(() => setCopiedRcIndex(null), 1500);
    } catch {
      // ignore
    }
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfError('');
    try {
      const [{ pdf }, { MobileToRcPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./MobileToRcPdfDocument'),
      ]);
      const blob = await pdf(<MobileToRcPdfDocument result={result} record={response.record} />).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const cleanMobile = mobile.replace(/[^A-Za-z0-9*-]+/g, '-');
      anchor.download = `mobile-to-rc-${cleanMobile}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setPdfError('PDF could not be generated. Please try again.');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-5" role="status" aria-live="polite">
      {/* Top Completion Banner & PDF Action */}
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
          <BadgeCheck className="h-5 w-5 text-emerald-600" />
          Mobile to RC fleet lookup completed
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={response.record.status} />
          {response.cacheHit ? (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-emerald-700 shadow-sm border border-emerald-100">
              24h cached
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={pdfBusy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-amber-50 disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-amber-600" />}
            {pdfBusy ? 'Generating PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {pdfError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
          {pdfError}
        </div>
      ) : null}

      {/* Primary Overview Cards */}
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-amber-100">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-900">
            <Phone className="h-4 w-4 text-amber-600" />
            Queried Mobile &amp; Linked Fleet
          </h2>
          <span className="text-xs text-slate-500 font-medium">Surepass Registry</span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Mobile Box */}
          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">Queried Mobile Number</span>
              <p className="mt-1 font-mono text-2xl font-black text-amber-950 tracking-wider">{mobile || 'Not available'}</p>
            </div>
            {mobile ? (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyMobile()}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 shadow-sm transition hover:bg-amber-100"
                >
                  {copiedMobile ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-amber-700" />}
                  {copiedMobile ? 'Copied!' : 'Copy Mobile'}
                </button>
                <a
                  href={`tel:${mobile}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <Phone className="h-3.5 w-3.5 text-slate-500" />
                  Call
                </a>
              </div>
            ) : null}
          </div>

          {/* Fleet Count Box */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Registered Vehicles</span>
              <p className="mt-1 font-mono text-3xl font-extrabold text-slate-900">
                {totalCount}
                <span className="text-sm font-bold text-slate-500 ml-2">Vehicles Linked</span>
              </p>
            </div>
            {rcNumbers.length > 1 ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => void copyAllRcs()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100"
                >
                  {copiedAll ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
                  {copiedAll ? 'All RCs Copied!' : 'Copy All RC Numbers'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Linked Vehicles Grid / List */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900">
            <Truck className="h-4 w-4 text-amber-600" />
            Linked Vehicle Registration Numbers ({totalCount})
          </h2>
          {rcNumbers.length > 0 && !copiedAll ? (
            <button
              type="button"
              onClick={() => void copyAllRcs()}
              className="text-xs font-bold text-amber-700 hover:text-amber-800"
            >
              Copy All
            </button>
          ) : null}
        </div>

        {rcNumbers.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 w-16">#</th>
                  <th className="px-4 py-2.5">Vehicle Registration Number</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rcNumbers.map((rc, idx) => (
                  <tr key={rc} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-400">#{idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-base text-slate-900 tracking-wide">{rc}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void copySingleRc(rc, idx)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        {copiedRcIndex === idx ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        {copiedRcIndex === idx ? 'Copied' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-400">
            No vehicle registration numbers returned for this contact.
          </div>
        )}
      </section>

      {/* Verification Metadata Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-800">
          <UserRound className="h-4 w-4 text-amber-600" />
          Verification Audit Trail
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Provider Client ID" value={result?.providerClientId || response.record.providerClientId} />
          <Field label="Lookup Status" value={response.record.status} />
          <Field label="Verified Date & Time" value={formatDateTime(response.record.completedAt || response.record.createdAt)} />
          <Field label="Operator / Requested By" value={response.record.requestedBy?.name || response.record.requestedBy?.email || 'Authorized Operator'} />
          <Field label="System Record ID" value={response.record.id} />
        </dl>
      </section>
    </div>
  );
}

export default function MobileToRcLookupPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const permissions = user?.permissions;
  const canLookup = isSuperAdmin || hasAnyPermission(permissions, ['rc.mobile-to-rc.read']);
  const canHistory = isSuperAdmin || hasAnyPermission(permissions, ['rc.mobile-to-rc.read']);
  const [mobileNumber, setMobileNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<MobileToRcResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadHistory = useCallback(async (page = historyPage, search = historySearch) => {
    if (!canHistory) return;
    setHistoryLoading(true);
    try {
      const result = await api.get<HistoryResponse>('/mobile-to-rc/history', { params: { page, limit: 20, search: search || undefined } });
      setHistory(result.data);
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load Mobile To RC history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [canHistory, historyPage, historySearch]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setResponse(null);
    const cleanedMobile = sanitizeMobileNumber(mobileNumber, 16);
    const mobileError = validateMobileNumber(cleanedMobile);
    if (mobileError) { setError(mobileError); return; }
    setBusy(true);
    try {
      const result = await api.post<MobileToRcResponse>('/mobile-to-rc/lookup', { mobile_number: normalizeMobileNumber(cleanedMobile) });
      setResponse(result.data);
      if (canHistory) { setHistoryPage(1); void loadHistory(1, historySearch); }
    } catch (requestError) {
      setError(safeApiError(requestError, 'Mobile To RC lookup could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const result = await api.get<MobileToRcResponse>(`/mobile-to-rc/history/${id}`);
      setResponse(result.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load this Mobile To RC result.'));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <main className={embedded ? 'w-full' : 'min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8'}>
      <div className="mx-auto max-w-7xl">
        {!embedded ? <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Vehicle &amp; Transport</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Mobile To RC</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Find RC numbers associated with a mobile number through the configured Surepass service.</p></div><div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Provider: Surepass</div></div> : null}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] overflow-hidden"><div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="mb-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><p>Enter the mobile number. It is normalized and validated before any provider request. Use this lookup only with appropriate user consent.</p></div>
            <form onSubmit={submit}>
              <label><span className="text-sm font-semibold text-slate-700">Mobile Number <span className="text-red-500">*</span></span><input value={mobileNumber} onChange={(event) => setMobileNumber(sanitizeMobileNumber(event.target.value, 16))} className={inputClass} placeholder="8908885858" autoComplete="off" inputMode="numeric" maxLength={16} /></label>
              {error ? <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
              <button type="submit" disabled={busy || !canLookup} className={`${buttonClass} mt-6 w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}{busy ? 'Looking up…' : canLookup ? 'Lookup Mobile' : 'Lookup not permitted'}</button>
            </form>
            {response ? <ResultPanel response={response} /> : null}
          </div></section>
          {canHistory ? <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] overflow-hidden"><div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><History className="h-5 w-5 text-amber-600" />Mobile To RC History</h2><p className="text-sm text-slate-500">Only masked mobile numbers are shown in history.</p></div><div className="flex gap-2"><input value={historySearch} onChange={(event) => setHistorySearch(sanitizeMobileNumber(event.target.value, 30))} onKeyDown={(event) => { if (event.key === 'Enter') { setHistoryPage(1); void loadHistory(1, historySearch); } }} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Search masked mobile" /><button type="button" onClick={() => { setHistoryPage(1); void loadHistory(1, historySearch); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" aria-label="Search history"><Search className="h-4 w-4" /></button></div></div>
            {historyLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div> : history?.records.length ? <div className="mt-5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Mobile</th><th className="px-3 py-3">RC numbers</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">Date</th><th className="px-3 py-3" /></tr></thead><tbody>{history.records.map((record) => <tr key={record.id} className="border-b border-slate-100"><td className="px-3 py-3 font-mono font-semibold text-slate-800">{record.maskedMobileNumber}</td><td className="px-3 py-3 text-slate-600">{record.rcNumbersCount}</td><td className="px-3 py-3"><StatusBadge status={record.status} /></td><td className="px-3 py-3 text-slate-500">{formatDate(record.createdAt) || 'Not available'}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => void openDetail(record.id)} disabled={detailLoading} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Eye className="h-3.5 w-3.5" />View</button></td></tr>)}</tbody></table></div> : <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No Mobile To RC history found.</div>}
            {history?.pagination.totalPages && history.pagination.totalPages > 1 ? <div className="mt-5 flex items-center justify-between text-sm text-slate-600"><span>Page {history.pagination.page} of {history.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={historyPage <= 1} onClick={() => { const next = historyPage - 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={historyPage >= history.pagination.totalPages} onClick={() => { const next = historyPage + 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></div> : null}
          </div></section> : null}
        </div>
      </div>
      
    </main>
  );
}
