'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, ArrowLeft, ArrowRightLeft, ChevronLeft, ChevronRight, Landmark, Loader2, MapPin, Power, RefreshCw, RotateCcw, Search, UserCog, UserPlus, Users } from 'lucide-react';
import { hrmApi, type HrmMoveResult, type HrmOfficeDetail, type HrmOfficeTeamMember } from '@/lib/hrmApi';
import { getInitials } from '@/lib/hrmDirectory';
import { clampPage, describePageRange, totalPagesOf } from '@/lib/hrmPaging';
import { describeMoveResult, describeNationalManagers, describeReplaceResult, officeCoverageLabel } from '@/lib/hrmLifecycle';
import { formatHrmDate, formatHrmStatus, getHrmErrorMessage, getHrmStatusClass } from '@/lib/hrmUi';
import { describeUpcomingManagers, type UpcomingManager } from '@/lib/hrmOnboardingPage';
import { AppointManagerDialog, DeactivateDialog, ReplaceManagerDialog, TransferDialog } from './HrmLifecycleDialogs';
import HrmModal from './HrmModal';

type Portal = 'admin' | 'employee';
type Person = { id: string; name: string; employeeCode: string };
type Dialog =
  | { type: 'transfer'; employee: Person }
  | { type: 'deactivate'; employee: Person }
  | { type: 'reactivate'; employee: Person }
  | { type: 'appoint' }
  | { type: 'replace'; outgoing: Person }
  | null;

const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
const smallButton = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const TEAM_PAGE_SIZE = 50;
const primaryButton = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500 disabled:opacity-60';

function Tile({ label, value, hint, tone = 'neutral' }: { label: string; value: string | number; hint?: string; tone?: 'neutral' | 'warning' }) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${tone === 'warning' ? 'border-amber-200' : 'border-slate-200'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold text-slate-950">{value}</p>
      {hint ? <p className="mt-0.5 text-xs leading-4 text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Chip({ tone, children }: { tone: 'green' | 'red' | 'grey' | 'amber'; children: React.ReactNode }) {
  const palette = tone === 'green' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : tone === 'red' ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : tone === 'amber' ? 'bg-amber-50 text-amber-800 ring-amber-600/20' : 'bg-slate-100 text-slate-600 ring-slate-500/20';
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${palette}`}>{children}</span>;
}

function Avatar({ name, tone = 'slate' }: { name: string; tone?: 'amber' | 'slate' }) {
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`} aria-hidden="true">{getInitials(name)}</span>;
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading office">
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />)}</div>
      <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />
    </div>
  );
}

/** Confirms bringing a suspended person back to work (their login is enabled again). */
function ReactivateConfirm({ employee, onClose, onDone }: { employee: Person; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await hrmApi.reactivateEmployee(employee.id);
      toast.success(response.data.loginEnabled ? `${employee.employeeCode} is active again and their login is enabled.` : `${employee.employeeCode} is active again.`);
      onDone();
    } catch (failure) {
      setError(getHrmErrorMessage(failure, 'Unable to reactivate the employee.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <HrmModal
      title={`Reactivate ${employee.name}`}
      description="They return to work with their existing assignment. A login that HRM suspended is enabled again."
      size="sm"
      busy={saving}
      onClose={onClose}
      footer={(
        <div className="w-full">
          {error ? <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
            <button type="button" data-autofocus onClick={() => void confirm()} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{saving ? 'Reactivating…' : 'Reactivate'}
            </button>
          </div>
        </div>
      )}
    >
      <p className="text-sm text-slate-600">{employee.name} ({employee.employeeCode}) is suspended right now.</p>
    </HrmModal>
  );
}

/**
 * One office (the head office or a state office): who manages it, who works there and what can be done about it.
 * Managers can be appointed, replaced or moved; any team member can be transferred or deactivated from here.
 */
export default function HrmOfficeDetailPage({ officeId, portal }: { officeId: string; portal: Portal }) {
  const [detail, setDetail] = useState<HrmOfficeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  // The team is paged by the server (an office can have any number of people); the search is debounced.
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const requestRef = useRef(0);
  // Who is joining as manager of a vacant office (from the organisation overview; the office detail has no such list).
  const [upcoming, setUpcoming] = useState<UpcomingManager[]>([]);

  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return undefined;
    const timer = window.setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  const isVacant = Boolean(detail?.vacant);
  useEffect(() => {
    if (!isVacant) return undefined;
    let cancelled = false;
    hrmApi.getOrganisation().then((response) => {
      if (cancelled) return;
      const unit = response.data.organisation.units.find((candidate) => candidate.id === officeId);
      setUpcoming(unit?.upcomingManagers ?? []);
    }).catch(() => { if (!cancelled) setUpcoming([]); });
    return () => { cancelled = true; };
  }, [isVacant, officeId, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    const request = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await hrmApi.getOfficeDetail(officeId, { page, limit: TEAM_PAGE_SIZE, ...(search ? { search } : {}) });
        // Only the newest request may update the screen.
        if (cancelled || request !== requestRef.current) return;
        const office = response.data.office;
        const clamped = office.teamPage ? clampPage(office.teamPage) : null;
        if (clamped !== null && clamped !== page) {
          setPage(clamped);
          return;
        }
        setDetail(office);
      } catch (loadError) {
        if (!cancelled && request === requestRef.current) setError(getHrmErrorMessage(loadError, 'Unable to load the office.'));
      } finally {
        if (!cancelled && request === requestRef.current) setLoading(false);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [officeId, reloadKey, page, search]);

  const reload = useCallback(() => setReloadKey((current) => current + 1), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const profileHref = (id: string) => `/${portal}/hrm/${encodeURIComponent(id)}`;
  const officeNames = useMemo(() => (detail ? { [detail.office.id]: detail.office.name } : {}), [detail]);

  const finish = (message?: string) => {
    if (message) toast.success(message);
    setDialog(null);
    reload();
  };

  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <Link href={`/${portal}/hrm/organisation`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-amber-700"><ArrowLeft className="h-4 w-4" />Organisation</Link>
        {loading ? <Skeleton /> : (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
            <p role="alert" className="mt-3 text-sm font-semibold text-slate-800">{error || 'Unable to load the office.'}</p>
            <button type="button" onClick={reload} className={`${smallButton} mt-4`}><RefreshCw className="h-3.5 w-3.5" />Try again</button>
          </div>
        )}
      </div>
    );
  }

  const { office, managers, team, counts, abilities } = detail;
  const teamPage = detail.teamPage ?? { page: 1, limit: TEAM_PAGE_SIZE, total: team.length, totalPages: 1, search: '' };
  const teamPages = totalPagesOf(teamPage);
  const isState = office.kind === 'STATE';
  const coverage = officeCoverageLabel(office, managers.length);
  const national = describeNationalManagers(detail.nationalOperationsManagers);
  // The dialogs search employees, read lifecycle details and the designation list: all of that needs hrm.employees.read.
  // When the server hid the team for lack of it, no button is offered that would open a dialog that cannot work.
  const canSeePeople = !detail.teamHidden;
  const canMove = abilities.canManageAssignments && office.isActive && canSeePeople;
  const canTransfer = abilities.canManageAssignments && canSeePeople;
  const canDeactivate = abilities.canManageAssignments && abilities.canManageEmployees && canSeePeople;
  const canReactivate = abilities.canManageEmployees && canSeePeople;
  const place = [office.city?.name, office.state?.name].filter(Boolean).join(', ');
  const person = (member: HrmOfficeTeamMember): Person => ({ id: member.employee.id, name: member.employee.name, employeeCode: member.employee.employeeCode });

  const rowActions = (member: HrmOfficeTeamMember) => {
    const suspended = member.employee.status === 'SUSPENDED';
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {canTransfer ? <button type="button" onClick={() => setDialog({ type: 'transfer', employee: person(member) })} className={smallButton}><ArrowRightLeft className="h-3.5 w-3.5" />Transfer</button> : null}
        {suspended && canReactivate ? <button type="button" onClick={() => setDialog({ type: 'reactivate', employee: person(member) })} className={smallButton}><RotateCcw className="h-3.5 w-3.5" />Reactivate</button> : null}
        {!suspended && canDeactivate ? <button type="button" onClick={() => setDialog({ type: 'deactivate', employee: person(member) })} className={`${smallButton} text-rose-700 hover:bg-rose-50`}><Power className="h-3.5 w-3.5" />Deactivate</button> : null}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <Link href={`/${portal}/hrm/organisation`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-amber-700"><ArrowLeft className="h-4 w-4" />Organisation</Link>

      {error ? (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={reload} className="shrink-0 font-semibold underline">Retry</button>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">{isState ? <MapPin className="h-5 w-5" /> : <Landmark className="h-5 w-5" />}</span>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-950">{office.name}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{isState ? 'State office' : 'Head office'}{place ? ` · ${place}` : ''} · <span className="font-mono text-xs">{office.code}</span></p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip tone={office.isActive ? 'green' : 'grey'}>{office.isActive ? 'Active' : 'Switched off'}</Chip>
                {coverage ? <Chip tone={coverage === 'Vacant' ? 'red' : 'green'}>{coverage}</Chip> : null}
                {isVacant && upcoming.length ? <span className="text-xs font-medium text-sky-700">{describeUpcomingManagers(upcoming)}</span> : null}
                {loading ? <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Refreshing…</span> : null}
              </div>
            </div>
          </div>
          {isState && canMove ? <button type="button" onClick={() => setDialog({ type: 'appoint' })} className={primaryButton}><UserPlus className="h-4 w-4" />Appoint manager</button> : null}
        </div>
        {!office.isActive ? <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">This office is switched off. Its history stays here, but people cannot be moved into it until it is switched on again from the Organisation page.</p> : null}
      </section>

      <div className={`grid grid-cols-2 gap-3 ${isState ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <Tile label="Staff" value={detail.teamHidden ? '—' : counts.staff} hint={detail.teamHidden ? 'Needs hrm.employees.read' : 'Working from this office'} />
        {isState ? <Tile label="Managers" value={counts.managers} hint={counts.managers === 0 ? 'Nobody manages this state yet' : counts.managers === 1 ? 'One manager' : 'More than one manager'} tone={counts.managers === 0 ? 'warning' : 'neutral'} /> : null}
        <Tile label="On leave" value={detail.teamHidden ? '—' : counts.onLeave} />
        <Tile label="National Operations Manager" value={national.value} hint={national.hint} />
      </div>

      {isState ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="hrm-office-managers">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="hrm-office-managers" className="font-bold text-slate-950">Managers</h2>
              <p className="text-xs text-slate-500">A state can have more than one manager. They report to the National Operations Manager by default.</p>
            </div>
            {managers.length && canMove ? <button type="button" onClick={() => setDialog({ type: 'appoint' })} className={smallButton}><UserPlus className="h-3.5 w-3.5" />Add another manager</button> : null}
          </div>
          {managers.length ? (
            <ul className="grid gap-3 p-4 sm:grid-cols-2">
              {managers.map((manager) => (
                <li key={manager.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={manager.name} tone="amber" />
                    <div className="min-w-0 flex-1">
                      <Link href={profileHref(manager.id)} className="block truncate font-bold text-slate-950 hover:text-amber-700">{manager.name}</Link>
                      <p className="truncate text-xs text-slate-500">{manager.employeeCode} · {manager.designation}</p>
                      <p className="mt-0.5 text-xs text-slate-400">Manager since {formatHrmDate(manager.since)}</p>
                    </div>
                  </div>
                  {canMove || canTransfer ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {canMove ? <button type="button" onClick={() => setDialog({ type: 'replace', outgoing: { id: manager.id, name: manager.name, employeeCode: manager.employeeCode } })} className={smallButton}><UserCog className="h-3.5 w-3.5" />Replace</button> : null}
                      {canTransfer ? <button type="button" onClick={() => setDialog({ type: 'transfer', employee: { id: manager.id, name: manager.name, employeeCode: manager.employeeCode } })} className={smallButton}><ArrowRightLeft className="h-3.5 w-3.5" />Transfer</button> : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-6 py-10 text-center">
              <UserCog className="mx-auto h-8 w-8 text-amber-300" />
              <p className="mt-3 text-sm font-semibold text-slate-800">No manager – appoint one</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">{office.isActive ? `${office.name} has nobody managing it. Pick an existing employee; they report to the National Operations Manager by default.` : 'Switch the office on before appointing a manager.'}</p>
              {canMove ? <button type="button" onClick={() => setDialog({ type: 'appoint' })} className={`${primaryButton} mt-4`}><UserPlus className="h-4 w-4" />Appoint manager</button> : null}
            </div>
          )}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="hrm-office-team">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Users className="h-4 w-4" /></span>
            <div>
              <h2 id="hrm-office-team" className="font-bold text-slate-950">Team{detail.teamHidden ? null : <span className="ml-1 inline-flex min-w-7 items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{teamPage.total}</span>}</h2>
              <p className="text-xs text-slate-500">Everyone who works from this office, within the people you are allowed to see.</p>
            </div>
          </div>
          {detail.teamHidden ? null : (
            <label className="relative block w-full sm:w-64">
              <span className="sr-only">Search the team</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search name or code"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </label>
          )}
        </div>
        {detail.teamHidden ? (
          <div className="px-6 py-10 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mx-auto mt-3 max-w-md text-sm font-semibold text-slate-800">You can see who manages this office but not the people in it. Employee details need the hrm.employees.read permission.</p>
          </div>
        ) : team.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-300" />
            {search ? (
              <>
                <p className="mt-3 text-sm font-semibold text-slate-800">Nobody matches “{search}”</p>
                <button type="button" onClick={() => setSearchInput('')} className={`${smallButton} mt-3`}>Clear search</button>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm font-semibold text-slate-800">Nobody works from this office yet</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">Add an employee with this office, or transfer someone here from their profile.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50"><tr>
                  <th scope="col" className={th}>Employee</th><th scope="col" className={th}>Designation</th><th scope="col" className={th}>Department</th><th scope="col" className={th}>City</th>
                  <th scope="col" className={th}>Reports to</th><th scope="col" className={th}>Status</th><th scope="col" className={th}>Since</th><th scope="col" className={th}><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {team.map((member) => (
                    <tr key={member.employee.id} className="align-middle hover:bg-slate-50/60">
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={member.employee.name} /><div className="min-w-0"><Link href={profileHref(member.employee.id)} className="block truncate font-semibold text-slate-900 hover:text-amber-700">{member.employee.name}</Link><span className="block text-xs text-slate-500">{member.employee.employeeCode}</span></div></div></td>
                      <td className="px-4 py-3 text-slate-700">{member.designation}{member.isOfficeManager ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">Manager</span> : null}</td>
                      <td className="px-4 py-3 text-slate-600">{member.department?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{member.city?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{member.reportsTo ? <Link href={profileHref(member.reportsTo.id)} className="hover:text-amber-700">{member.reportsTo.name}</Link> : '—'}</td>
                      <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getHrmStatusClass(member.employee.status)}`}>{formatHrmStatus(member.employee.status)}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatHrmDate(member.since)}</td>
                      <td className="px-4 py-3">{rowActions(member)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden">
              {team.map((member) => (
                <li key={member.employee.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={member.employee.name} />
                    <div className="min-w-0 flex-1">
                      <Link href={profileHref(member.employee.id)} className="block truncate font-semibold text-slate-900">{member.employee.name}</Link>
                      <p className="truncate text-xs text-slate-500">{member.employee.employeeCode} · {member.designation}</p>
                    </div>
                    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getHrmStatusClass(member.employee.status)}`}>{formatHrmStatus(member.employee.status)}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div><dt className="text-slate-400">Department</dt><dd className="font-medium text-slate-700">{member.department?.name ?? '—'}</dd></div>
                    <div><dt className="text-slate-400">City</dt><dd className="font-medium text-slate-700">{member.city?.name ?? '—'}</dd></div>
                    <div><dt className="text-slate-400">Reports to</dt><dd className="font-medium text-slate-700">{member.reportsTo?.name ?? '—'}</dd></div>
                    <div><dt className="text-slate-400">Since</dt><dd className="font-medium text-slate-700">{formatHrmDate(member.since)}</dd></div>
                  </dl>
                  {member.isOfficeManager ? <Chip tone="amber">Manager</Chip> : null}
                  {rowActions(member)}
                </li>
              ))}
            </ul>
            <nav aria-label="Team pages" className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span aria-live="polite">{describePageRange(teamPage, team.length)}</span>
              {teamPages > 1 ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || teamPage.page <= 1} className={smallButton}><ChevronLeft className="h-3.5 w-3.5" />Previous</button>
                  <span>Page {teamPage.page} of {teamPages}</span>
                  <button type="button" onClick={() => setPage((current) => Math.min(teamPages, current + 1))} disabled={loading || teamPage.page >= teamPages} className={smallButton}>Next<ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              ) : null}
            </nav>
          </>
        )}
      </section>

      {dialog?.type === 'transfer' ? (
        <TransferDialog employee={dialog.employee} currentOfficeUnitId={office.id} onClose={closeDialog} onDone={(result: HrmMoveResult) => finish(describeMoveResult(result, officeNames, 'Transfer saved'))} />
      ) : null}
      {dialog?.type === 'deactivate' ? <DeactivateDialog employee={dialog.employee} onClose={closeDialog} onDone={() => finish()} /> : null}
      {dialog?.type === 'reactivate' ? <ReactivateConfirm employee={dialog.employee} onClose={closeDialog} onDone={() => finish()} /> : null}
      {dialog?.type === 'appoint' ? (
        <AppointManagerDialog
          office={{ id: office.id, name: office.name, stateId: office.state?.id ?? null }}
          nationalOperationsManagers={detail.nationalOperationsManagers}
          onClose={closeDialog}
          onDone={(result) => finish(describeMoveResult(result, officeNames, 'Manager appointed'))}
        />
      ) : null}
      {dialog?.type === 'replace' ? (
        <ReplaceManagerDialog
          office={{ id: office.id, name: office.name, stateId: office.state?.id ?? null }}
          outgoing={dialog.outgoing}
          nationalOperationsManagers={detail.nationalOperationsManagers}
          canDeactivate={abilities.canManageEmployees}
          onClose={closeDialog}
          onDone={(result) => finish(describeReplaceResult(result, office.name, result.officeNames))}
        />
      ) : null}
    </div>
  );
}
