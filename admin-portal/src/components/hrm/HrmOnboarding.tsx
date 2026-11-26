'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
type MatchedRecord = NonNullable<HrmOnboardingCaseRow['matches']>[number];
import { toast } from 'react-toastify';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, Loader2, RefreshCw, Search, ShieldQuestion, UserX, X } from 'lucide-react';
import { hrmApi, type HrmOnboardingCaseRow, type HrmOnboardingList, type HrmResolveReviewPayload } from '@/lib/hrmApi';
import {
  describeJoining, describeResolveOutcome, joiningTone, ONBOARDING_CHIPS, onboardingChipCounts,
  onboardingStatusClass, onboardingStatusLabel, progressTone, reasonProblem, type OnboardingChip,
} from '@/lib/hrmOnboardingPage';
import { getHrmBase } from '@/lib/hrmOrganisation';
import { describePageRange } from '@/lib/hrmPaging';
import { readOnboardingLinkFilters, rehireCandidates } from '@/lib/hrmOnboardingPage';
import { formatHrmStatus, getHrmErrorMessage, getHrmStatusClass, hasHrmPermission } from '@/lib/hrmUi';
import { useAuthStore } from '@/store/authStore';
import SearchableSelect from '@/components/ui/SearchableSelect';
import HrmModal from './HrmModal';
import HrmCancelJoiningDialog from './HrmCancelJoiningDialog';
import HrmConfirmJoiningDialog from './HrmConfirmJoiningDialog';
import { CONFIRMABLE_CASE_STATUSES } from '@/lib/hrmJoining';

const PAGE_SIZE = 20;
type Joining = '' | 'THIS_WEEK' | 'NEXT_30_DAYS' | 'OVERDUE';
type Option = { id: string | number; name: string };

const JOINING_OPTIONS: Array<{ id: Joining; name: string }> = [
  { id: '', name: 'Any joining date' },
  { id: 'THIS_WEEK', name: 'Joining this week' },
  { id: 'NEXT_30_DAYS', name: 'Joining in 30 days' },
  { id: 'OVERDUE', name: 'Joining date passed' },
];

const field = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';
const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60';
const secondary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>{children}</span>;
}

function Progress({ row }: { row: HrmOnboardingCaseRow }) {
  if (!row.progress) return <span className="text-xs text-slate-400">—</span>;
  const { done, total, percent } = row.progress;
  return (
    <div className="min-w-28" title={`${done} of ${total} joining steps done`}>
      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600"><span>{done}/{total}</span><span>{percent}%</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Joining checklist">
        <div className={`h-full rounded-full ${progressTone(percent)}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ResolveReviewDialog({ row, onClose, onDone }: { row: HrmOnboardingCaseRow; onClose: () => void; onDone: (message: string) => void }) {
  const [action, setAction] = useState<HrmResolveReviewPayload['action']>('CREATE_NEW');
  const [reason, setReason] = useState('');
  // Only a former employee this offer actually matched (same email or mobile) can be re-hired: the server refuses others.
  const formerMatches = useMemo(() => rehireCandidates(row.matches ?? []), [row.matches]);
  const [chosen, setChosen] = useState<MatchedRecord | null>(() => (formerMatches.length === 1 ? formerMatches[0]! : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (saving) return;
    const problem = reasonProblem(reason);
    if (problem) { setError(problem); return; }
    if (action === 'USE_EXISTING' && !chosen) { setError('Choose the earlier HR record of this person.'); return; }
    setSaving(true);
    setError('');
    try {
      const response = await hrmApi.resolveOnboardingReview(row.id, { action, reason: reason.trim(), ...(action === 'USE_EXISTING' && chosen ? { employeeId: chosen.id } : {}) });
      onDone(describeResolveOutcome(response.data.result));
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'The case could not be decided.'));
    } finally {
      setSaving(false);
    }
  };

  const options: Array<{ id: HrmResolveReviewPayload['action']; title: string; text: string }> = [
    { id: 'CREATE_NEW', title: 'Different person: create a new HR record', text: 'The match is somebody else (for example a shared family mobile number).' },
    { id: 'USE_EXISTING', title: 'Same person who left earlier: re-hire on their record', text: formerMatches.length ? 'Their earlier record is re-opened; the old assignment and salary are closed.' : 'Not possible here: none of the matching records belongs to somebody who left.' },
    { id: 'DISMISS', title: 'Close: not needed', text: 'For example a duplicate offer. Nothing is created.' },
  ];

  return (
    <HrmModal
      title="Decide this onboarding"
      description={`${row.candidateName ?? 'The candidate'} matched an existing HR record.`}
      onClose={onClose}
      busy={saving}
      lockDismiss={saving || Boolean(reason.trim())}
      size="lg"
      error={error}
      footer={<><button type="button" onClick={onClose} className={secondary} disabled={saving}>Close</button><button type="button" onClick={() => void submit()} className={primary} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Confirm</button></>}
    >
      <div className="space-y-4 text-sm">
        {row.reviewNote ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">{row.reviewNote}</p> : null}
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold text-slate-700">What is it?</legend>
          {options.map((option) => (
            <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${action === option.id ? 'border-amber-400 bg-amber-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="hrm-resolve-action" value={option.id} checked={action === option.id} disabled={option.id === 'USE_EXISTING' && !formerMatches.length} onChange={() => { setAction(option.id); setError(''); }} className="mt-1 accent-amber-500 disabled:opacity-50" />
              <span><span className="block font-semibold text-slate-900">{option.title}</span><span className="text-xs text-slate-500">{option.text}</span></span>
            </label>
          ))}
        </fieldset>
        {action === 'USE_EXISTING' ? (
          <div className="space-y-2">
            <p className="font-semibold text-slate-700">Earlier HR record of this person</p>
            <p className="text-xs text-slate-500">Only the records that share this candidate&apos;s email or mobile number and belong to somebody who left.</p>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
              {formerMatches.map((record) => (
                <button key={record.id} type="button" onClick={() => setChosen(record)} aria-pressed={chosen?.id === record.id} className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 ${chosen?.id === record.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                  <span><span className="block font-semibold text-slate-900">{record.name}</span><span className="text-xs text-slate-500">{record.employeeCode} · same {record.matchedBy}</span></span>
                  <Chip className={getHrmStatusClass(record.status)}>{formatHrmStatus(record.status)}</Chip>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <label htmlFor="hrm-resolve-reason" className="block font-semibold text-slate-700">Reason</label>
          <textarea id="hrm-resolve-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" placeholder="What you checked and why" />
        </div>
      </div>
    </HrmModal>
  );
}

/**
 * Onboarding: everybody between "offer accepted" and "joined", within the viewer's scope. Shows the joining date,
 * the checklist progress and cases that matched an existing HR record; HR opens the profile to complete the steps,
 * cancels a joining (no-show) or decides a review.
 */
export default function HrmOnboardingPage() {
  const pathname = usePathname();
  const base = getHrmBase(pathname);
  const { user } = useAuthStore();
  // Only a Super Admin holds every HRM permission (the backend gives ALL_ACCESS to SUPER_ADMIN only).
  const allAccess = user?.role === 'SUPER_ADMIN';
  const canManage = hasHrmPermission(user?.permissions, ['hrm.onboarding.manage'], allAccess);
  const canResolve = canManage && hasHrmPermission(user?.permissions, ['hrm.employees.manage'], allAccess);
  // The profile (and the Confirm joining dialog, which first loads the joining context) need hrm.employees.read.
  const canOpenProfile = hasHrmPermission(user?.permissions, ['hrm.employees.read'], allAccess);
  // Confirm joining: onboarding.manage + employees.manage (as deciding a review) and employees.read for the context.
  const canConfirm = canResolve && canOpenProfile;
  // The state / department filters come from GET /hrm/organisation (hrm.org.read): without it they are not offered.
  const canReadOrg = hasHrmPermission(user?.permissions, ['hrm.org.read', 'hrm.org.manage'], allAccess);

  const [chip, setChip] = useState<OnboardingChip>('OPEN');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [joining, setJoining] = useState<Joining>('');
  const [stateId, setStateId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HrmOnboardingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [states, setStates] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [dialog, setDialog] = useState<{ type: 'cancel' | 'resolve' | 'confirm'; row: HrmOnboardingCaseRow } | null>(null);
  const requestRef = useRef(0);

  // A link such as ?status=NEEDS_REVIEW&stateId=27 (from the Reports page) opens on that chip with those filters;
  // other open statuses open "Open".
  useEffect(() => {
    const filters = readOnboardingLinkFilters(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of the URL after mount (no hydration mismatch) */
    if (filters.chip) setChip(filters.chip);
    if (filters.stateId) setStateId(filters.stateId);
    if (filters.orgUnitId) setOrgUnitId(filters.orgUnitId);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // States and departments for the filters (from the organisation; hidden without org.read).
  useEffect(() => {
    if (!canReadOrg) return undefined;
    let cancelled = false;
    hrmApi.getOrganisation().then((response) => {
      if (cancelled) return;
      const organisation = response.data.organisation;
      setStates(organisation.states.map((state) => ({ id: state.id, name: state.name })));
      setDepartments(organisation.units.filter((unit) => unit.kind === 'DEPARTMENT' && unit.isActive).map((unit) => ({ id: unit.id, name: unit.name })));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [canReadOrg]);

  useEffect(() => {
    const ticket = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await hrmApi.listOnboardingCases({
          status: chip, page, limit: PAGE_SIZE,
          ...(search ? { search } : {}), ...(joining ? { joining } : {}),
          ...(stateId ? { stateId: Number(stateId) } : {}), ...(orgUnitId ? { orgUnitId } : {}),
        });
        if (ticket !== requestRef.current) return;
        const next = response.data;
        // The page may have emptied (somebody joined / was cancelled): go to the last page that exists.
        if (!next.cases.length && page > 1 && next.pagination.totalPages < page) { setPage(next.pagination.totalPages); return; }
        setData({ cases: next.cases, statusCounts: next.statusCounts, pagination: next.pagination });
      } catch (requestError) {
        if (ticket === requestRef.current) setError(getHrmErrorMessage(requestError, 'Unable to load onboarding.'));
      } finally {
        if (ticket === requestRef.current) setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [chip, page, search, joining, stateId, orgUnitId, reloadKey]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const counts = useMemo(() => onboardingChipCounts(data?.statusCounts ?? {}), [data?.statusCounts]);
  const finish = (message: string) => { toast.success(message); setDialog(null); reload(); };
  const filtered = Boolean(search || joining || stateId || orgUnitId);
  const pagination = data?.pagination;

  return (
    <div className="w-full space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">People operations</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Onboarding</h2>
            <p className="mt-1 text-sm text-slate-500">Everyone whose offer was accepted, until they join: joining date, checklist and anything that needs a decision.</p>
          </div>
          <button type="button" onClick={reload} disabled={loading} className={secondary}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </header>

        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {ONBOARDING_CHIPS.map(({ id, label }) => {
            const selected = chip === id;
            return (
              <button key={id} type="button" aria-pressed={selected} onClick={() => { setChip(id); setPage(1); }} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${selected ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'}`}>
                {label}<span className={`rounded-full px-1.5 py-px text-[11px] font-bold ${selected ? 'bg-white/20 text-white' : id === 'NEEDS_REVIEW' && counts.NEEDS_REVIEW ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{counts[id]}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name or employee code" aria-label="Search onboarding" className={`${field} pl-9 pr-8`} />
            {searchInput ? <button type="button" onClick={() => setSearchInput('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button> : null}
          </div>
          <SearchableSelect id="hrm-onboarding-joining" options={JOINING_OPTIONS} value={joining} displayValue={JOINING_OPTIONS.find((option) => option.id === joining)?.name ?? ''} onChange={(option) => { setJoining(String(option.id) as Joining); setPage(1); }} placeholder="Joining date" className="w-full" />
          {states.length ? <SearchableSelect id="hrm-onboarding-state" options={states} value={stateId} displayValue={states.find((option) => String(option.id) === stateId)?.name ?? ''} onChange={(option) => { setStateId(String(option.id)); setPage(1); }} clearable onClear={() => { setStateId(''); setPage(1); }} placeholder="Any state" className="w-full" /> : null}
          {departments.length ? <SearchableSelect id="hrm-onboarding-department" options={departments} value={orgUnitId} displayValue={departments.find((option) => String(option.id) === orgUnitId)?.name ?? ''} onChange={(option) => { setOrgUnitId(String(option.id)); setPage(1); }} clearable onClear={() => { setOrgUnitId(''); setPage(1); }} placeholder="Any department" className="w-full" /> : null}
        </div>

        {error ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
            <button type="button" onClick={reload} className="self-start rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 sm:self-auto">Try again</button>
          </div>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-busy={loading}>
          {!data && loading ? (
            <div role="status" className="space-y-2 p-4"><span className="sr-only">Loading onboarding…</span>{[0, 1, 2, 3].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : data && data.cases.length ? (
            <ul className="divide-y divide-slate-100">
              {data.cases.map((row) => {
                const tone = joiningTone(row.targetJoiningDate, row.status);
                return (
                  <li key={row.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-950">
                        {row.employee?.name ?? row.candidateName ?? 'Candidate'}
                        {row.employee ? <span className="font-mono text-xs font-normal text-slate-500">{row.employee.employeeCode}</span> : null}
                        <Chip className={onboardingStatusClass(row.status)}>{onboardingStatusLabel(row.status)}</Chip>
                        {row.employee?.archived ? <Chip className="bg-slate-100 text-slate-600 ring-slate-300">Archived</Chip> : null}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{[row.offer?.designation, row.offer?.department, row.offer?.placeOfPosting].filter(Boolean).join(' · ') || 'No offer details'}{row.offer?.applicationRef ? ` · ${row.offer.applicationRef}` : ''}</p>
                      {row.reviewNote ? <p className={`mt-1 text-xs ${row.status === 'NEEDS_REVIEW' ? 'text-amber-800' : 'text-slate-500'}`}>{row.reviewNote}</p> : null}
                    </div>
                    <p className={`text-xs font-semibold ${tone === 'overdue' ? 'text-rose-700' : tone === 'soon' ? 'text-amber-700' : 'text-slate-600'}`}>{describeJoining(row.targetJoiningDate, row.status)}</p>
                    <Progress row={row} />
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {row.employee && canOpenProfile ? <Link href={`${base}/${encodeURIComponent(row.employee.id)}`} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">{row.employee.archived ? 'Open record' : 'Open profile'}<ExternalLink className="h-3.5 w-3.5" /></Link> : null}
                      {row.status === 'NEEDS_REVIEW' && canResolve ? <button type="button" onClick={() => setDialog({ type: 'resolve', row })} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"><ShieldQuestion className="h-3.5 w-3.5" />Decide</button> : null}
                      {canConfirm && row.employee && !row.employee.archived && CONFIRMABLE_CASE_STATUSES.has(row.status) ? <button type="button" onClick={() => setDialog({ type: 'confirm', row })} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-3.5 w-3.5" />Confirm joining</button> : null}
                      {canManage && ['NEEDS_REVIEW', 'PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL'].includes(row.status) ? <button type="button" onClick={() => setDialog({ type: 'cancel', row })} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"><UserX className="h-3.5 w-3.5" />Cancel joining</button> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : data ? (
            <div className="px-6 py-12 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-800">{filtered ? 'Nobody matches these filters' : chip === 'OPEN' ? 'Nobody is waiting to join' : 'Nothing here yet'}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{filtered ? 'Change or clear the filters.' : 'People appear here as soon as they accept an offer.'}</p>
              {filtered ? <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setJoining(''); setStateId(''); setOrgUnitId(''); setPage(1); }} className={`${secondary} mt-4`}>Clear filters</button> : null}
            </div>
          ) : null}
          {pagination && pagination.total > 0 ? (
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>{describePageRange(pagination, data?.cases.length ?? 0)}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || pagination.page <= 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><ChevronLeft className="h-3.5 w-3.5" />Previous</button>
                <span>Page {pagination.page} of {pagination.totalPages}</span>
                <button type="button" onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} disabled={loading || pagination.page >= pagination.totalPages} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Next<ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ) : null}
        </section>

      {dialog?.type === 'confirm' && dialog.row.employee ? <HrmConfirmJoiningDialog employeeId={dialog.row.employee.id} onClose={() => setDialog(null)} onDone={(result) => finish(`${result.employeeCode} joined and is now active.`)} /> : null}
      {dialog?.type === 'cancel' ? <HrmCancelJoiningDialog caseId={dialog.row.id} name={dialog.row.employee?.name ?? dialog.row.candidateName ?? 'This person'} onClose={() => setDialog(null)} onDone={finish} /> : null}
      {dialog?.type === 'resolve' ? <ResolveReviewDialog row={dialog.row} onClose={() => setDialog(null)} onDone={finish} /> : null}
    </div>
  );
}
