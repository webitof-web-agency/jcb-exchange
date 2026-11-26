'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, Search, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { hrmApi, type HrmAccessReview as AccessReview } from '@/lib/hrmApi';
import { describeHrmAccess, issueLink, RECRUITMENT_VIEW_LABELS, SEVERITY_LABELS, toAccessReviewQuery } from '@/lib/hrmAccessReview';
import { readBlobErrorMessage } from '@/lib/hrmReports';
import { formatHrmStatus, getHrmErrorMessage } from '@/lib/hrmUi';
import SearchableSelect from '@/components/ui/SearchableSelect';

const card = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const secondary = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const th = 'sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_#e2e8f0]';

type View = 'issues' | 'people';

/** All-India HR: who can see which state, and what looks wrong, with a link to where it is fixed. */
export default function HrmAccessReview({ portal }: { portal: 'admin' | 'employee' }) {
  const [view, setView] = useState<View>('issues');
  const [issue, setIssue] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stateId, setStateId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AccessReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return undefined;
    const timer = window.setTimeout(() => { setSearch(next); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    const ticket = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await hrmApi.getAccessReview(toAccessReviewQuery({ view, issue, search, stateId, page }));
        if (ticket !== requestRef.current) return;
        setData(response.data);
      } catch (failure) {
        if (ticket !== requestRef.current) return;
        setData(null);
        setError(getHrmErrorMessage(failure, 'The access review could not be loaded.'));
      } finally {
        if (ticket === requestRef.current) setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [view, issue, search, stateId, page, reloadKey]);

  const download = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await hrmApi.downloadAccessReviewCsv(toAccessReviewQuery({ view, issue, search, stateId, page: 1 }));
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hrm-access-${view}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      toast.error(await readBlobErrorMessage(failure, getHrmErrorMessage(failure, 'The CSV could not be downloaded.')));
    } finally {
      setDownloading(false);
    }
  }, [downloading, view, issue, search, stateId]);

  const switchView = (next: View) => { setView(next); setPage(1); };
  const states = data?.states ?? [];
  const stateName = states.find((state) => String(state.id) === stateId)?.name;
  const types = data?.summary.types.filter((type) => type.count > 0 || type.code === issue) ?? [];
  const pagination = data?.pagination;
  // The rows on screen belong to the view that was loaded.
  const rowsReady = data?.view === view;

  return (
    <div className="w-full space-y-4">
      <header className={`${card} flex flex-col gap-3 p-5 lg:flex-row lg:items-end lg:justify-between`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">People access</p>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-950"><ShieldCheck className="h-6 w-6 text-amber-500" aria-hidden="true" /> Access review</h2>
          <p className="mt-1 text-sm text-slate-500">Who can see which state, and what looks wrong. Fix a problem from its link.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={download} disabled={downloading || !data}>{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download CSV</button>
          <button type="button" className={secondary} onClick={() => setReloadKey((value) => value + 1)} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</span>
          <button type="button" className={secondary} onClick={() => setReloadKey((value) => value + 1)}>Try again</button>
        </div>
      ) : null}

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Access review view" className="flex gap-2">
            {([['issues', `Problems${data ? ` (${data.summary.issues})` : ''}`], ['people', 'Who sees what']] as const).map(([id, label]) => (
              <button key={id} role="tab" type="button" aria-selected={view === id} onClick={() => switchView(id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${view === id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
            ))}
            {data?.summary.high ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"><ShieldAlert className="h-3.5 w-3.5" />{data.summary.high} high priority</span> : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block sm:w-64">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name, code, office or state" className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </label>
            <div className="sm:w-52">
              <SearchableSelect id="hrm-access-state" options={states} value={stateId} displayValue={stateName ?? ''} onChange={(option) => { setStateId(String(option.id)); setPage(1); }} placeholder="All states" clearable onClear={() => { setStateId(''); setPage(1); }} />
            </div>
          </div>
        </div>

        {view === 'issues' && types.length ? (
          <div role="group" aria-label="Problem type" className="custom-scrollbar flex gap-2 overflow-x-auto border-b border-slate-100 px-4 py-2.5">
            {issue ? <button type="button" onClick={() => { setIssue(''); setPage(1); }} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">All types <X className="h-3 w-3" /></button> : null}
            {types.map((type) => (
              <button key={type.code} type="button" aria-pressed={issue === type.code} onClick={() => { setIssue(issue === type.code ? '' : type.code); setPage(1); }} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${issue === type.code ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                {type.title}<span className={`rounded-full px-1.5 text-[11px] font-bold ${issue === type.code ? 'bg-white/20' : 'bg-white text-slate-600'}`}>{type.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!data || !rowsReady ? (
          loading ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking access…</p> : <p className="p-10 text-center text-sm text-slate-500">Nothing to show.</p>
        ) : view === 'issues' ? (
          data.issues.length ? (
            <ul className="divide-y divide-slate-100">
              {data.issues.map((row, index) => {
                const severity = SEVERITY_LABELS[row.severity];
                const link = issueLink(row, portal);
                return (
                  <li key={`${row.code}-${row.person?.userId ?? row.person?.employeeId ?? row.office?.id ?? row.jobId ?? index}-${index}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${severity.tone}`}>{severity.label}</span>
                        {row.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-600">{row.detail}</p>
                      <p className="text-[11px] text-slate-500">{[row.person ? `${row.person.name}${row.person.employeeCode ? ` (${row.person.employeeCode})` : ''}` : null, row.office?.name, !row.office ? row.stateName : null].filter(Boolean).join(' · ')}</p>
                    </div>
                    {link ? <Link href={link.href} className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 sm:self-center">{link.label}<ChevronRight className="h-3.5 w-3.5" /></Link> : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="p-10 text-center text-sm text-emerald-700">{issue || search || stateId ? 'Nothing matches these filters.' : 'No problem found.'}</p>
        ) : data.people.length ? (
          <div className="custom-scrollbar max-h-[36rem] overflow-auto">
            <table className="min-w-full text-sm">
              <thead><tr><th scope="col" className={th}>Person</th><th scope="col" className={th}>Role</th><th scope="col" className={th}>HRM access</th><th scope="col" className={th}>Recruitment</th><th scope="col" className={th}>Manages</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.people.map((row) => (
                  <tr key={row.userId} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      {row.employee ? <Link href={`/${portal}/hrm/${encodeURIComponent(row.employee.id)}`} className="font-semibold text-slate-900 hover:text-amber-700">{row.name}</Link> : <span className="font-semibold text-slate-900">{row.name}</span>}
                      <span className="block text-xs text-slate-500">{[row.employee?.employeeCode ?? 'No HR record', row.email].filter(Boolean).join(' · ')}</span>
                      {row.loginStatus !== 'ACTIVE' ? <span className="mt-0.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Login {formatHrmStatus(row.loginStatus)}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{row.accountRole === 'SUPER_ADMIN' ? 'Super Admin' : row.roleName ?? <span className="text-slate-400">No role</span>}</td>
                    <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{describeHrmAccess(row.hr).map((label) => <span key={label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.hr.allIndia ? 'bg-violet-50 text-violet-700' : label === 'Own record only' ? 'bg-slate-100 text-slate-500' : 'bg-sky-50 text-sky-800'}`}>{label}</span>)}</div></td>
                    <td className={`px-4 py-2.5 text-xs font-semibold ${row.recruitment === 'NONE' ? 'text-amber-700' : row.recruitment === 'ALL' ? 'text-violet-700' : 'text-slate-700'}`}>{RECRUITMENT_VIEW_LABELS[row.recruitment]}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{row.manages.length ? row.manages.map((item) => <span key={item.officeId} className="block">{item.officeName}{item.kind === 'CHARGE' ? <span className="ml-1 rounded-full bg-violet-50 px-1.5 text-[10px] font-bold text-violet-700">Additional charge</span> : null}</span>) : <span className="text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p-10 text-center text-sm text-slate-500">Nobody matches these filters.</p>}

        {pagination && rowsReady && pagination.totalPages > 1 ? (
          <nav aria-label="Pages" className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
            <span>{pagination.total} in total</span>
            <div className="flex items-center gap-2">
              <button type="button" className={secondary} onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || pagination.page <= 1}><ChevronLeft className="h-4 w-4" />Previous</button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button type="button" className={secondary} onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} disabled={loading || pagination.page >= pagination.totalPages}>Next<ChevronRight className="h-4 w-4" /></button>
            </div>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
