/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Eye, FileCheck2, History, Loader2, Search, ShieldAlert, XCircle } from 'lucide-react';
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
import { sanitizeRcNumber } from '@/lib/verificationSanitizers';
import RcCardTemplatePreview from './RcCardTemplatePreview';

export type RcLookupVariant = 'owner-history';

const LOOKUP_CONFIG: Record<RcLookupVariant, { label: string; permission: string; basePath: string; description: string }> = {
  'owner-history': {
    label: 'RC Owner History',
    permission: 'rc.owner-history.read',
    basePath: '/rc-owner-history',
    description: 'View registered vehicle and owner history through the configured Surepass RC service.',
  },
};

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

function StatusBadge({ status }: { status: unknown }) {
  const label = typeof status === 'string' && status.trim() ? status : 'Not available';
  const normalized = label.toUpperCase();
  const tone = normalized === 'ACTIVE' || normalized === 'SUCCESS'
    ? 'bg-emerald-100 text-emerald-700'
    : normalized === 'FAILED' || normalized === 'INACTIVE' || normalized === 'CANCELLED'
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700';
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

export default function RcLookupPage({ embedded = false, variant }: { embedded?: boolean; variant: RcLookupVariant }) {
  const config = LOOKUP_CONFIG[variant];
  const isOwnerHistory = variant === 'owner-history';
  const { user } = useAuthStore();
  const canAccess = user?.role === 'SUPER_ADMIN' || hasAnyPermission(user?.permissions, [config.permission]);
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
    if (!canAccess) return;
    setHistoryLoading(true);
    try {
      const result = await api.get<HistoryResponse>(`${config.basePath}/history`, { params: { page, limit: 20, search: search || undefined } });
      setHistory(result.data);
    } catch (requestError) {
      setError(safeApiError(requestError, `Unable to load ${config.label} history.`));
    } finally {
      setHistoryLoading(false);
    }
  }, [canAccess, config.basePath, config.label, historyPage, historySearch]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setResponse(null);
    const cleanRc = sanitizeRcNumber(rcNumber);
    setRcNumber(cleanRc);
    const rcError = validateRcNumber(cleanRc);
    if (rcError) { setError(rcError); return; }
    setBusy(true);
    try {
      const result = await api.post<RcOwnerHistoryResponse>(`${config.basePath}/verify`, { id_number: normalizeRcNumber(cleanRc) });
      setResponse(result.data);
      setHistoryPage(1);
      void loadHistory(1, historySearch);
    } catch (requestError) {
      setError(safeApiError(requestError, `${config.label} verification could not be completed.`));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const result = await api.get<RcOwnerHistoryResponse>(`${config.basePath}/history/${id}`);
      setResponse(result.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setError(safeApiError(requestError, `Unable to load this ${config.label} result.`));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTemplateUploaded = (nextResponse: RcOwnerHistoryResponse) => {
    setResponse(nextResponse);
    setHistoryPage(1);
    setHistory((current) => {
      if (!current) return current;
      const alreadyListed = current.records.some(
        (record) => record.id === nextResponse.record.id || record.maskedRcNumber === nextResponse.record.maskedRcNumber,
      );
      return {
        ...current,
        records: [
          nextResponse.record,
          ...current.records.filter((record) => (
            record.id !== nextResponse.record.id
            && record.maskedRcNumber !== nextResponse.record.maskedRcNumber
          )),
        ].slice(0, current.pagination.limit),
        pagination: {
          ...current.pagination,
          page: 1,
          total: current.pagination.total + (alreadyListed ? 0 : 1),
          totalPages: Math.ceil((current.pagination.total + (alreadyListed ? 0 : 1)) / current.pagination.limit),
        },
      };
    });
  };

  return <main className={embedded ? 'w-full' : 'min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8'}>
    <div className="mx-auto max-w-7xl">
      {!embedded ? <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Vehicle &amp; Transport</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">{config.label}</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">{config.description}</p></div><div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Provider: Surepass</div></div> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] lg:overflow-hidden"><div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="mb-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><p>Enter the vehicle registration number. It is normalized and validated before any provider request.</p></div>
          <form onSubmit={submit}><label><span className="text-sm font-semibold text-slate-700">Vehicle Registration Number <span className="text-red-500">*</span></span><input value={rcNumber} onChange={(event) => setRcNumber(sanitizeRcNumber(event.target.value))} className={inputClass} placeholder="RJ12XJ1234" autoComplete="off" maxLength={30} /></label>{error ? <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}<button type="submit" disabled={busy || !canAccess} className={`${buttonClass} mt-6 w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}{busy ? 'Verifying…' : canAccess ? `Verify ${config.label}` : 'Verification not permitted'}</button></form>
          {response ? (
            response.record.status === 'SUCCESS' ? (
              <RcCardTemplatePreview response={response} onUploaded={handleTemplateUploaded} />
            ) : (
              <VerificationHistoryState title={`${config.label} verification was not completed`} record={response.record} />
            )
          ) : null}
        </div></section>
        {canAccess ? <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] lg:overflow-hidden"><div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><History className="h-5 w-5 text-amber-600" />{config.label}</h2><p className="text-sm text-slate-500">{isOwnerHistory ? 'Only uploaded templates are shown in history.' : 'Only masked registration numbers are shown in history.'}</p></div><div className="flex gap-2"><input value={historySearch} onChange={(event) => setHistorySearch(sanitizeRcNumber(event.target.value))} onKeyDown={(event) => { if (event.key === 'Enter') { setHistoryPage(1); void loadHistory(1, historySearch); } }} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Search masked RC" /><button type="button" onClick={() => { setHistoryPage(1); void loadHistory(1, historySearch); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" aria-label="Search history"><Search className="h-4 w-4" /></button></div></div>
          {historyLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div> : history?.records.length ? <div className="mt-5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">{isOwnerHistory ? <><th className="px-3 py-3">RC number</th><th className="px-3 py-3">Template</th><th className="px-3 py-3">Date</th><th className="px-3 py-3" /></> : <><th className="px-3 py-3">RC number</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3">Vehicle</th><th className="px-3 py-3">RC status</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">Date</th><th className="px-3 py-3" /></>}</tr></thead><tbody>{history.records.map((record) => isOwnerHistory ? <tr key={record.id} className="border-b border-slate-100"><td className="px-3 py-3 font-mono font-semibold text-slate-800">{record.maskedRcNumber}</td><td className="px-3 py-3"><span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Template saved</span></td><td className="px-3 py-3 text-slate-500">{formatDate(record.createdAt.slice(0, 10)) || 'Not available'}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => void openDetail(record.id)} disabled={detailLoading} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Eye className="h-3.5 w-3.5" />View template</button></td></tr> : <tr key={record.id} className="border-b border-slate-100"><td className="px-3 py-3 font-mono font-semibold text-slate-800">{record.maskedRcNumber}</td><td className="px-3 py-3 text-slate-600">{record.ownerName || 'Not available'}</td><td className="px-3 py-3 text-slate-600">{record.vehicleCategory || 'Not available'}</td><td className="px-3 py-3"><StatusBadge status={record.rcStatus} /></td><td className="px-3 py-3"><StatusBadge status={record.status} /></td><td className="px-3 py-3 text-slate-500">{formatDate(record.createdAt.slice(0, 10)) || 'Not available'}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => void openDetail(record.id)} disabled={detailLoading} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Eye className="h-3.5 w-3.5" />View</button></td></tr>)}</tbody></table></div> : <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No {config.label} history found.</div>}
          {history?.pagination.totalPages && history.pagination.totalPages > 1 ? <div className="mt-5 flex items-center justify-between text-sm text-slate-600"><span>Page {history.pagination.page} of {history.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={historyPage <= 1} onClick={() => { const next = historyPage - 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={historyPage >= history.pagination.totalPages} onClick={() => { const next = historyPage + 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></div> : null}
        </div></section> : null}
      </div>
    </div>
  </main>;
}
