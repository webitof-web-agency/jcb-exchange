/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  BadgeCheck,
  Eye,
  FileCheck2,
  History,
  Loader2,
  Search,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import VerificationHistoryState from '@/components/vehicleTransport/VerificationHistoryState';
import {
  normalizeRcChallanForm,
  safeApiError,
  validateRcChallanForm,
  type RcChallanFormState,
  type RcChallanRecord,
  type RcChallanResult,
  type RcChallanHistoryRecord,
  type RcChallanHistoryResponse,
  type RcChallanVerificationResponse,
} from '@/lib/rcChallan';
import {
  sanitizeRcNumber,
  sanitizeChassisNumber,
  sanitizeEngineNumber,
} from '@/lib/verificationSanitizers';

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50';

const initialForm: RcChallanFormState = {
  rcNumber: '',
  chassisNumber: '',
  engineNumber: '',
};

const formatDate = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return 'Not available';
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return normalized;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
};

const formatMoney = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return 'Not available';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
};

const titleize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function SafeValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400">Not available</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-slate-400">No records returned</span>;
    return <ul className="space-y-1 text-slate-800">{value.map((item, index) => <li key={index} className="rounded-lg bg-slate-50 px-3 py-2"><SafeValue value={item} /></li>)}</ul>;
  }
  if (typeof value === 'object') {
    return <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">{Object.entries(value as Record<string, unknown>).map(([key, item]) => <div key={key} className="min-w-0"><span className="text-xs text-slate-500">{titleize(key)}</span><div className="break-words text-sm font-medium text-slate-800"><SafeValue value={item} /></div></div>)}</div>;
  }
  return <span className="break-words text-slate-800">{String(value)}</span>;
}

function Field({ label, value, money = false }: { label: string; value: unknown; money?: boolean }) {
  if (value === null || value === undefined || value === '') return <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-400">Not available</dd></div>;
  return <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-900">{money ? formatMoney(value) : <SafeValue value={value} />}</dd></div>;
}

function StatusBadge({ status }: { status: unknown }) {
  const label = typeof status === 'string' && status.trim() ? status : 'Unknown';
  const normalized = label.toUpperCase();
  const tone = normalized === 'PENDING'
    ? 'bg-amber-100 text-amber-800'
    : normalized === 'PAID' || normalized === 'SUCCESS' || normalized === 'CLOSED'
      ? 'bg-emerald-100 text-emerald-700'
      : normalized === 'FAILED'
        ? 'bg-red-100 text-red-700'
        : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

function CourtBadge({ value }: { value: boolean | null }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${value === true ? 'bg-red-100 text-red-700' : value === false ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>{value === true ? 'Yes' : value === false ? 'No' : 'Unknown'}</span>;
}

function SummaryCards({ summary }: { summary: RcChallanResult['summary'] }) {
  const cards = [
    { label: 'Returned challans', value: String(summary.totalChallans), tone: 'text-slate-950' },
    { label: 'Returned amount', value: formatMoney(summary.totalReturnedAmount), tone: 'text-slate-950' },
    { label: 'Known pending', value: `${summary.knownPendingCount} · ${formatMoney(summary.knownPendingAmount)}`, tone: 'text-amber-700' },
    { label: 'Court challans', value: String(summary.courtChallanCount), tone: 'text-red-700' },
    { label: 'Blacklist records', value: String(summary.blacklistCount), tone: 'text-red-700' },
  ];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map((card) => <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p><p className={`mt-2 text-lg font-black ${card.tone}`}>{card.value}</p></div>)}</div>;
}

function ChallanTable({ challans, onSelect }: { challans: RcChallanRecord[]; onSelect: (challan: RcChallanRecord) => void }) {
  if (!challans.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">No challan records were returned for this search.</div>;
  return <div className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden rounded-2xl border border-slate-200"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Challan</th><th className="px-3 py-3">Offense</th><th className="px-3 py-3">Date / state</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Court</th><th className="px-3 py-3" /></tr></thead><tbody>{challans.map((challan) => <tr key={challan.recordKey} className="border-t border-slate-100 align-top"><td className="px-3 py-3 font-mono font-semibold text-slate-800">{challan.challanNumber || 'Not available'}</td><td className="max-w-[300px] px-3 py-3 leading-relaxed text-slate-700">{challan.offenseDetails || 'Not available'}</td><td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(challan.challanDate)}<br /><span className="text-xs text-slate-400">{challan.state || 'State unknown'}</span></td><td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">{formatMoney(challan.amount)}</td><td className="px-3 py-3"><StatusBadge status={challan.challanStatus} /></td><td className="px-3 py-3"><CourtBadge value={challan.courtChallan} /></td><td className="px-3 py-3 text-right"><button type="button" onClick={() => onSelect(challan)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Eye className="h-3.5 w-3.5" />Details</button></td></tr>)}</tbody></table></div>;
}

function ResultPanel({ response }: { response: RcChallanVerificationResponse }) {
  const [selectedChallan, setSelectedChallan] = useState<RcChallanRecord | null>(null);
  if (response.record.status !== 'SUCCESS') {
    return <VerificationHistoryState title="RC Challan lookup was not completed" record={response.record} />;
  }
  const result = response.result;
  if (!result) return null;

  return <div className="mt-6 space-y-5" role="status" aria-live="polite">
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-sm font-bold text-emerald-800"><BadgeCheck className="h-5 w-5" />RC Challan lookup completed</div><StatusBadge status={response.record.status} /></div>
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-600">Search result</p><h2 className="mt-1 text-lg font-bold text-slate-900">{response.record.maskedRcNumber}</h2></div><p className="text-xs text-slate-500">{response.cacheHit ? 'Source: Saved DB result' : `Provider: ${response.record.providerEnvironment || 'Configured Surepass'}`}</p></div><p className="mt-3 text-sm text-slate-600">Amounts below are calculated from records returned by Surepass. Only challans explicitly marked <strong>Pending</strong> are included in the known pending amount.</p></div>
    <SummaryCards summary={result.summary} />
    <section className="space-y-3"><div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileCheck2 className="h-5 w-5 text-amber-600" />Challan records</h2><p className="text-sm text-slate-500">Unknown provider fields remain marked as unavailable.</p></div></div><ChallanTable challans={result.challans} onSelect={setSelectedChallan} /></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><ShieldAlert className="h-5 w-5 text-red-600" />Blacklist information</h2>{result.blacklist.length ? <div className="mt-4 space-y-2">{result.blacklist.map((item, index) => <div key={index} className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm"><SafeValue value={item} /></div>)}</div> : <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No blacklist records were returned for this search.</p>}</section>
    {selectedChallan ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Challan detail"><div className="mx-auto my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-600">Challan detail</p><h2 className="mt-1 text-xl font-bold text-slate-900">{selectedChallan.challanNumber || 'Challan record'}</h2></div><button type="button" onClick={() => setSelectedChallan(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close challan details"><X className="h-5 w-5" /></button></div><dl className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Challan number" value={selectedChallan.challanNumber} /><Field label="Serial number" value={selectedChallan.number} /><Field label="Offense description" value={selectedChallan.offenseDetails} /><Field label="Challan date" value={formatDate(selectedChallan.challanDate)} /><Field label="State" value={selectedChallan.state} /><Field label="Challan place" value={selectedChallan.challanPlace} /><Field label="RTO" value={selectedChallan.rto} /><Field label="Accused name" value={selectedChallan.accusedName} /><Field label="Fine amount" value={selectedChallan.amount} money /><Field label="Challan status" value={selectedChallan.challanStatus} /><Field label="Court challan" value={selectedChallan.courtChallan === null ? 'Unknown' : selectedChallan.courtChallan ? 'Yes' : 'No'} /><Field label="Source / upstream code" value={selectedChallan.upstreamCode} /></dl></div></div> : null}
  </div>;
}

function HistoryTable({ records, onSelect }: { records: RcChallanHistoryRecord[]; onSelect: (id: string) => void }) {
  if (!records.length) return <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No RC Challan history found.</div>;
  return <div className="mt-5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">RC number</th><th className="px-3 py-3">Returned</th><th className="px-3 py-3">Known pending</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">Date</th><th className="px-3 py-3" /></tr></thead><tbody>{records.map((record) => <tr key={record.id} className="border-b border-slate-100"><td className="px-3 py-3 font-mono font-semibold text-slate-800">{record.maskedRcNumber}</td><td className="px-3 py-3 text-slate-600">{record.totalChallans}</td><td className="px-3 py-3 text-slate-600">{record.knownPendingCount} · {formatMoney(record.knownPendingAmount)}</td><td className="px-3 py-3 text-slate-600">{formatMoney(record.totalReturnedAmount)}</td><td className="px-3 py-3"><StatusBadge status={record.status} /></td><td className="px-3 py-3 text-slate-500">{formatDate(record.createdAt)}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => onSelect(record.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Eye className="h-3.5 w-3.5" />View</button></td></tr>)}</tbody></table></div>;
}

export default function RcChallanVerificationPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const permissions = user?.permissions;
  const canVerify = isSuperAdmin || hasAnyPermission(permissions, ['rc.challan.verification.read']);
  const canHistory = isSuperAdmin || hasAnyPermission(permissions, ['rc.challan.verification.read']);
  const [form, setForm] = useState<RcChallanFormState>(initialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<RcChallanVerificationResponse | null>(null);
  const [history, setHistory] = useState<RcChallanHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);

  const loadHistory = useCallback(async (page = historyPage, search = historySearch) => {
    if (!canHistory) return;
    setHistoryLoading(true);
    try {
      const result = await api.get<RcChallanHistoryResponse>('/rc-challan-verification/history', { params: { page, limit: 20, search: search || undefined } });
      setHistory(result.data);
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load RC Challan history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [canHistory, historyPage, historySearch]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setResponse(null);
    const cleanForm = {
      rcNumber: sanitizeRcNumber(form.rcNumber),
      chassisNumber: sanitizeChassisNumber(form.chassisNumber),
      engineNumber: sanitizeEngineNumber(form.engineNumber),
    };
    setForm(cleanForm);
    const validationError = validateRcChallanForm(cleanForm);
    if (validationError) { setError(validationError); return; }
    setBusy(true);
    try {
      const result = await api.post<RcChallanVerificationResponse>('/rc-challan-verification/verify', normalizeRcChallanForm(cleanForm));
      setResponse(result.data);
      if (canHistory) { setHistoryPage(1); void loadHistory(1, historySearch); }
    } catch (requestError) {
      setError(safeApiError(requestError, 'RC Challan could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    setError('');
    try {
      const result = await api.get<RcChallanVerificationResponse>(`/rc-challan-verification/history/${id}`);
      setResponse(result.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load this RC Challan result.'));
    }
  };

  return <main className={embedded ? 'w-full' : 'min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8'}><div className="mx-auto max-w-7xl">{!embedded ? <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Vehicle &amp; Transport</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">RC Challan</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Search challan records and blacklist information through the configured Surepass RC Challan service.</p></div><div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Provider: Surepass</div></div> : null}<div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"><section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] overflow-hidden"><div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><div className="mb-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><p>Enter complete identifiers. They are normalized and validated before any billable provider request.</p></div><form onSubmit={submit} className="space-y-5"><label className="block"><span className="text-sm font-semibold text-slate-700">Vehicle Registration Number <span className="text-red-500">*</span></span><input value={form.rcNumber} onChange={(event) => setForm((current) => ({ ...current, rcNumber: sanitizeRcNumber(event.target.value) }))} className={inputClass} placeholder="HR55AP0244" autoComplete="off" maxLength={30} /></label><label className="block"><span className="text-sm font-semibold text-slate-700">Chassis Number <span className="text-red-500">*</span></span><input value={form.chassisNumber} onChange={(event) => setForm((current) => ({ ...current, chassisNumber: sanitizeChassisNumber(event.target.value) }))} className={inputClass} placeholder="MA3JMTB1SPB851591" autoComplete="off" maxLength={100} /></label><label className="block"><span className="text-sm font-semibold text-slate-700">Engine Number <span className="text-red-500">*</span></span><input value={form.engineNumber} onChange={(event) => setForm((current) => ({ ...current, engineNumber: sanitizeEngineNumber(event.target.value) }))} className={inputClass} placeholder="K10CNC265773" autoComplete="off" maxLength={100} /></label>{error ? <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />{error}</div> : null}<button type="submit" disabled={busy || !canVerify} className={`${buttonClass} w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}{busy ? 'Verifying…' : canVerify ? 'Verify Challan' : 'Verification not permitted'}</button></form>{response ? <ResultPanel response={response} /> : null}</div></section>{canHistory ? <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:max-h-[calc(100vh-140px)] overflow-hidden"><div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><History className="h-5 w-5 text-amber-600" />RC Challan History</h2><p className="text-sm text-slate-500">Sensitive chassis and engine values are never shown in history.</p></div><div className="flex gap-2"><input value={historySearch} onChange={(event) => setHistorySearch(sanitizeRcNumber(event.target.value))} onKeyDown={(event) => { if (event.key === 'Enter') { setHistoryPage(1); void loadHistory(1, historySearch); } }} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Search masked RC" /><button type="button" onClick={() => { setHistoryPage(1); void loadHistory(1, historySearch); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" aria-label="Search history"><Search className="h-4 w-4" /></button></div></div>{historyLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div> : history ? <HistoryTable records={history.records} onSelect={openDetail} /> : <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No history loaded.</div>}{history?.pagination.totalPages && history.pagination.totalPages > 1 ? <div className="mt-5 flex items-center justify-between text-sm text-slate-600"><span>Page {history.pagination.page} of {history.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={historyPage <= 1} onClick={() => { const next = historyPage - 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={historyPage >= history.pagination.totalPages} onClick={() => { const next = historyPage + 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></div> : null}</div></section> : null}</div></div></main>;
}
