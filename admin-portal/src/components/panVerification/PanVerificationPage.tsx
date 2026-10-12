/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CheckCircle2, Eye, FileSearch, History, Loader2, Search, ShieldAlert, XCircle } from 'lucide-react';
import api from '@/lib/api';
import {
  normalizePan,
  operationLabel,
  safeApiError,
  validateDob,
  validatePan,
  type PanRecord,
  type PanResultResponse,
} from '@/lib/panVerification';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';

type Tab = 'verify' | 'aadhaar' | 'contact' | 'comprehensive' | 'history';
type ContactResult = { pan?: unknown; emails?: unknown; mobileNumbers?: unknown };
type HistoryResponse = { records: PanRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';

const toArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const formatDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

function ComprehensiveV2ResultPanel({ response }: { response: PanResultResponse }) {
  const result = response.result || {};
  const details = result.panDetails && typeof result.panDetails === 'object' ? result.panDetails as Record<string, unknown> : {};
  const address = details.address && typeof details.address === 'object' ? details.address as Record<string, unknown> : {};
  const nameParts = toArray(details.fullNameSplit).join(' · ');
  const booleanValue = (value: unknown) => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : 'Not available';
  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
        <BadgeCheck className="h-5 w-5" /> PAN Comprehensive V2 completed
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><span className="text-slate-500">PAN</span><p className="font-semibold text-slate-900">{String(result.panNumber || result.pan || response.record.maskedPan)}</p></div>
        <div><span className="text-slate-500">Full name</span><p className="font-semibold text-slate-900">{String(details.fullName || 'Not available')}</p></div>
        {nameParts ? <div><span className="text-slate-500">Name parts</span><p className="font-semibold text-slate-900">{nameParts}</p></div> : null}
        <div><span className="text-slate-500">Category</span><p className="font-semibold text-slate-900">{String(details.category || 'Not available')}</p></div>
        <div><span className="text-slate-500">Date of birth</span><p className="font-semibold text-slate-900">{String(details.dob || 'Not available')}</p></div>
        <div><span className="text-slate-500">Input DOB</span><p className="font-semibold text-slate-900">{String(details.inputDob || 'Not available')}</p></div>
        <div><span className="text-slate-500">Gender</span><p className="font-semibold text-slate-900">{String(details.gender || 'Not available')}</p></div>
        <div><span className="text-slate-500">Provider status</span><p className="font-semibold text-slate-900">{String(details.status || 'Not available')}</p></div>
        <div><span className="text-slate-500">Masked Aadhaar</span><p className="font-semibold text-slate-900">{String(details.maskedAadhaar || 'Not available')}</p></div>
        <div><span className="text-slate-500">Email</span><p className="font-semibold text-slate-900">{String(details.email || 'Not available')}</p></div>
        <div><span className="text-slate-500">Phone</span><p className="font-semibold text-slate-900">{String(details.phoneNumber || 'Not available')}</p></div>
        <div><span className="text-slate-500">Aadhaar linked</span><p className="font-semibold text-slate-900">{booleanValue(details.aadhaarLinked)}</p></div>
        <div><span className="text-slate-500">DOB verified</span><p className="font-semibold text-slate-900">{booleanValue(details.dobVerified)}</p></div>
        <div><span className="text-slate-500">DOB check</span><p className="font-semibold text-slate-900">{booleanValue(details.dobCheck)}</p></div>
        <div><span className="text-slate-500">Limited information</span><p className="font-semibold text-slate-900">{booleanValue(details.lessInfo)}</p></div>
        <div><span className="text-slate-500">Sole proprietor</span><p className="font-semibold text-slate-900">{booleanValue(result.isSoleProprietor)}</p></div>
        <div><span className="text-slate-500">Director</span><p className="font-semibold text-slate-900">{booleanValue(result.isDirector)}</p></div>
        <div><span className="text-slate-500">Salaried</span><p className="font-semibold text-slate-900">{booleanValue(result.isSalaried)}</p></div>
        <div className="sm:col-span-2"><span className="text-slate-500">Address</span><p className="font-semibold text-slate-900">{String(address.full || [address.line1, address.streetName, address.city, address.state, address.zip, address.country].filter(Boolean).join(', ') || 'Not available')}</p></div>
        <div><span className="text-slate-500">Address line 1</span><p className="font-semibold text-slate-900">{String(address.line1 || 'Not available')}</p></div>
        <div><span className="text-slate-500">Address line 2</span><p className="font-semibold text-slate-900">{String(address.line2 || 'Not available')}</p></div>
        <div><span className="text-slate-500">Street</span><p className="font-semibold text-slate-900">{String(address.streetName || 'Not available')}</p></div>
        <div><span className="text-slate-500">City</span><p className="font-semibold text-slate-900">{String(address.city || 'Not available')}</p></div>
        <div><span className="text-slate-500">State</span><p className="font-semibold text-slate-900">{String(address.state || 'Not available')}</p></div>
        <div><span className="text-slate-500">ZIP</span><p className="font-semibold text-slate-900">{String(address.zip || 'Not available')}</p></div>
        <div><span className="text-slate-500">Country</span><p className="font-semibold text-slate-900">{String(address.country || 'Not available')}</p></div>
      </div>
      {result.providerData && typeof result.providerData === 'object' ? (
        <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Complete provider response data</summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(result.providerData, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function ResultPanel({ response }: { response: PanResultResponse }) {
  if (response.record.operation === 'PAN_COMPREHENSIVE_V2') {
    return <ComprehensiveV2ResultPanel response={response} />;
  }
  const result = response.result || {};
  const contact = result as ContactResult;
  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
        <CheckCircle2 className="h-5 w-5" />
        {operationLabel(response.record.operation)} completed
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><span className="text-slate-500">PAN</span><p className="font-semibold text-slate-900">{String(result.pan || response.record.maskedPan)}</p></div>
        {'fullName' in result ? <div><span className="text-slate-500">Full name</span><p className="font-semibold text-slate-900">{String(result.fullName || '—')}</p></div> : null}
        {'dob' in result ? <div><span className="text-slate-500">Date of birth</span><p className="font-semibold text-slate-900">{String(result.dob || '—')}</p></div> : null}
        {'status' in result ? <div><span className="text-slate-500">Provider status</span><p className="font-semibold text-slate-900">{String(result.status || '—')}</p></div> : null}
        {'aadhaarNumber' in result ? <div><span className="text-slate-500">Aadhaar</span><p className="font-semibold text-slate-900">{String(result.aadhaarNumber || 'Not available')}</p></div> : null}
        {'emails' in result ? <div><span className="text-slate-500">Email(s)</span><p className="font-semibold text-slate-900">{toArray(contact.emails).join(', ') || 'Not available'}</p></div> : null}
        {'mobileNumbers' in result ? <div><span className="text-slate-500">Mobile number(s)</span><p className="font-semibold text-slate-900">{toArray(contact.mobileNumbers).join(', ') || 'Not available'}</p></div> : null}
      </div>
    </div>
  );
}

export default function PanVerificationPage() {
  const { user } = useAuthStore();
  const role = user?.role;
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const permissions = user?.permissions;
  const canVerify = isSuperAdmin || hasAnyPermission(permissions, ['pan.verification.read']);
  const canAadhaar = isSuperAdmin || hasAnyPermission(permissions, ['pan.verification.read']);
  const canContact = isSuperAdmin || hasAnyPermission(permissions, ['pan.verification.read']);
  const canHistory = isSuperAdmin || hasAnyPermission(permissions, ['pan.verification.read']);

  const [tab, setTab] = useState<Tab>('verify');
  const [pan, setPan] = useState('');
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [fetchEmail, setFetchEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<PanResultResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [detail, setDetail] = useState<PanResultResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadHistory = useCallback(async (page = historyPage, search = historySearch) => {
    if (!canHistory) return;
    setHistoryLoading(true);
    try {
      const result = await api.get<HistoryResponse>('/pan-verification/history', { params: { page, limit: 20, search: search || undefined } });
      setHistory(result.data);
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load PAN verification history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [canHistory, historyPage, historySearch]);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [loadHistory, tab]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setResponse(null);
    const panError = validatePan(pan);
    if (panError) return setError(panError);
    if (tab === 'verify') {
      if (!fullName.trim()) return setError('Full name is required.');
      const dobError = validateDob(dob);
      if (dobError) return setError(dobError);
    }

    setBusy(true);
    try {
      const endpoint = tab === 'verify'
        ? '/pan-verification/verify'
        : tab === 'aadhaar'
          ? '/pan-verification/to-aadhaar'
          : tab === 'contact'
            ? '/pan-verification/contact'
            : '/pan-verification/comprehensive-v2';
      const payload = tab === 'verify'
        ? { id_number: normalizePan(pan), full_name: fullName.trim().replace(/\s+/g, ' '), dob }
        : tab === 'aadhaar'
          ? { pan_number: normalizePan(pan) }
          : tab === 'contact'
            ? { id_number: normalizePan(pan), ...(fetchEmail ? { fetch_email: true } : {}) }
            : { id_number: normalizePan(pan) };
      const result = await api.post<PanResultResponse>(endpoint, payload);
      setResponse(result.data);
      if (canHistory) void loadHistory(1, historySearch);
    } catch (requestError) {
      setError(safeApiError(requestError, 'PAN verification could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const result = await api.get<PanResultResponse>(`/pan-verification/history/${id}`);
      setDetail(result.data);
    } catch (requestError) {
      setError(safeApiError(requestError, 'Unable to load this verification result.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const tabs = useMemo(() => [
    { key: 'verify' as const, label: 'PAN Verify', icon: FileSearch, allowed: canVerify },
    { key: 'aadhaar' as const, label: 'PAN to Aadhaar', icon: ShieldAlert, allowed: canAadhaar },
    { key: 'contact' as const, label: 'PAN to Email / Mobile', icon: Search, allowed: canContact },
    { key: 'comprehensive' as const, label: 'Comprehensive V2', icon: BadgeCheck, allowed: canVerify },
    { key: 'history' as const, label: 'History', icon: History, allowed: canHistory },
  ], [canAadhaar, canContact, canHistory, canVerify]);

  const selectedTab = tabs.find((item) => item.key === tab) || tabs[0];

  return (
    <main className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Admin tool</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">PAN Verification</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Run each PAN operation independently. Results are masked in history and protected on the server.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Provider: Surepass</div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 p-2" role="tablist" aria-label="PAN verification operations">
            {tabs.map(({ key, label, icon: Icon, allowed }) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} disabled={!allowed} onClick={() => { setTab(key); setError(''); setResponse(null); }} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'} disabled:cursor-not-allowed disabled:opacity-40`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>

          {tab !== 'history' ? (
            <div className="p-5 sm:p-7">
              <div className="mb-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p>{selectedTab?.label} sends one request only. PAN is normalized before validation and is never shown unmasked.</p>
              </div>
              <form onSubmit={submit} className="max-w-3xl">
                <div className={`grid gap-5 ${tab === 'verify' ? 'md:grid-cols-2' : ''}`}>
                  <label className={tab === 'verify' ? '' : 'max-w-xl'}>
                    <span className="text-sm font-semibold text-slate-700">PAN number <span className="text-red-500">*</span></span>
                    <input value={pan} onChange={(event) => setPan(normalizePan(event.target.value).slice(0, 10))} className={inputClass} placeholder="ABCDE1234F" autoComplete="off" maxLength={10} />
                  </label>
                  {tab === 'verify' ? <>
                    <label><span className="text-sm font-semibold text-slate-700">Full name <span className="text-red-500">*</span></span><input value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} placeholder="As per PAN record" maxLength={150} /></label>
                    <label><span className="text-sm font-semibold text-slate-700">Date of birth <span className="text-red-500">*</span></span><input type="date" value={dob} onChange={(event) => setDob(event.target.value)} className={inputClass} /></label>
                  </> : null}
                </div>
                {tab === 'contact' ? <label className="mt-5 flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={fetchEmail} onChange={(event) => setFetchEmail(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />Request linked email when available</label> : null}
                {error ? <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
                <button type="submit" disabled={busy || !selectedTab?.allowed} className={`${buttonClass} mt-6`}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {busy ? 'Verifying…' : `Run ${selectedTab?.label}`}
                </button>
              </form>
              {response ? <ResultPanel response={response} /> : null}
            </div>
          ) : (
            <div className="p-5 sm:p-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-lg font-bold text-slate-900">Verification history</h2><p className="text-sm text-slate-500">Only masked PAN values are displayed in the list.</p></div>
                <div className="flex gap-2"><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value.toUpperCase().slice(0, 10))} onKeyDown={(event) => { if (event.key === 'Enter') { setHistoryPage(1); void loadHistory(1, historySearch); } }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Search masked PAN" /><button type="button" onClick={() => { setHistoryPage(1); void loadHistory(1, historySearch); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Search className="h-4 w-4" /></button></div>
              </div>
              {historyLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div> : history?.records.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">PAN</th><th className="px-3 py-3">Operation</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Requested by</th><th className="px-3 py-3">Date</th><th className="px-3 py-3"> </th></tr></thead><tbody>{history.records.map((record) => <tr key={record.id} className="border-b border-slate-100"><td className="px-3 py-3 font-mono font-semibold text-slate-800">{record.maskedPan}</td><td className="px-3 py-3 text-slate-600">{operationLabel(record.operation)}</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${record.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : record.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{record.status}</span></td><td className="px-3 py-3 text-slate-600">{record.requestedBy?.name || record.requestedBy?.email || '—'}</td><td className="px-3 py-3 text-slate-500">{formatDate(record.createdAt)}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => void openDetail(record.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">{detailLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}View</button></td></tr>)}</tbody></table></div> : <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No PAN verification history found.</div>}
              {history?.pagination.totalPages && history.pagination.totalPages > 1 ? <div className="mt-5 flex items-center justify-between text-sm text-slate-600"><span>Page {history.pagination.page} of {history.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={historyPage <= 1} onClick={() => { const next = historyPage - 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={historyPage >= history.pagination.totalPages} onClick={() => { const next = historyPage + 1; setHistoryPage(next); void loadHistory(next, historySearch); }} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></div> : null}
            </div>
          )}
        </div>
      </div>

      {detail ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="PAN verification result"><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-600">History detail</p><h2 className="mt-1 text-xl font-bold text-slate-900">{operationLabel(detail.record.operation)}</h2></div><button type="button" onClick={() => setDetail(null)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Close detail">Close</button></div><ResultPanel response={detail} /></div></div> : null}
    </main>
  );
}
