'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, Building2, CalendarDays, ChevronRight, CircleCheck, Clock3, Globe2, Landmark, MapPin, Pencil, Plus, Power, RefreshCw, Search, Trash2, TriangleAlert, UserPlus, Users, X, type LucideIcon } from 'lucide-react';
import { hrmApi, type HrmOrganisation, type HrmOrganisationUnit } from '@/lib/hrmApi';
import {
  buildStateRows, countStateRows, departmentsOf, filterStateRows, formatManagerNames, getHrmBase, groupOrganisation, officeHref,
  statesWithoutOffice, summariseOrganisation, type StateFilter, type StateRowStatus,
} from '@/lib/hrmOrganisation';
import { getHrmErrorMessage, hasHrmPermission } from '@/lib/hrmUi';
import { describeUpcomingManagers } from '@/lib/hrmOnboardingPage';
import { useAuthStore } from '@/store/authStore';
import HrmShifts from './HrmShifts';
import HrmHolidays from './HrmHolidays';
import { AddStateOfficesDialog, AddUnitDialog, DeleteUnitDialog, HeadOfficeSetupDialog, RenameUnitDialog, ToggleUnitDialog } from './HrmOrganisationDialogs';

type OrganisationTab = 'STRUCTURE' | 'SHIFTS' | 'HOLIDAYS';
const ORGANISATION_TABS = ['STRUCTURE', 'SHIFTS', 'HOLIDAYS'] as const;
/** ?tab=shifts / ?tab=holidays opens that section (links from the profile's shift card). */
const tabFromQuery = (value: string | null): OrganisationTab => {
  const upper = (value ?? '').toUpperCase();
  return (ORGANISATION_TABS as readonly string[]).includes(upper) ? upper as OrganisationTab : 'STRUCTURE';
};

type Dialog =
  | { type: 'add'; kind: 'STATE' | 'DEPARTMENT' | 'HEAD_OFFICE'; stateId?: number }
  | { type: 'bulk' }
  | { type: 'setup' }
  | { type: 'rename'; unit: HrmOrganisationUnit }
  | { type: 'toggle'; unit: HrmOrganisationUnit }
  | { type: 'delete'; unit: HrmOrganisationUnit }
  | null;

const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';

const STATE_FILTERS: Array<{ id: StateFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'COVERED', label: 'Covered' },
  { id: 'VACANT', label: 'Vacant' },
  { id: 'NOT_SET_UP', label: 'Not set up' },
];

const STATUS_CHIP: Record<StateRowStatus, { label: string; className: string }> = {
  COVERED: { label: 'Covered', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  VACANT: { label: 'Vacant', className: 'bg-amber-50 text-amber-800 ring-amber-600/30' },
  NOT_SET_UP: { label: 'Not set up', className: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  SWITCHED_OFF: { label: 'Switched off', className: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
};

function ActiveChip({ active }: { active: boolean }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${active ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-600 ring-slate-500/20'}`}>{active ? 'Active' : 'Inactive'}</span>;
}

function StatusChip({ status }: { status: StateRowStatus }) {
  const { label, className } = STATUS_CHIP[status];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>{label}</span>;
}

function Count({ value, label }: { value: number; label: string }) {
  return <span title={label} className="inline-flex min-w-7 items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{value}</span>;
}

function SectionCard({ icon: Icon, title, description, count, action, children }: { icon: typeof Building2; title: string; description: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Icon className="h-4 w-4" /></span>
          <div>
            <h2 className="flex items-center gap-2 font-bold text-slate-950">{title} <Count value={count} label={`${count} shown`} /></h2>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ icon: Icon, title, description, action }: { icon: typeof Building2; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <Icon className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function CoverageTile({ label, value, hint, icon: Icon, tone = 'default' }: { label: string; value: string; hint: string; icon: LucideIcon; tone?: 'default' | 'good' | 'warn' }) {
  const box = tone === 'warn' ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white';
  const icon = tone === 'good' ? 'text-emerald-600' : 'text-amber-500';
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${box}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-sm text-slate-500">{label}</span><Icon className={`h-4 w-4 shrink-0 ${icon}`} /></div>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

/**
 * Organisation: the head office, its departments and the state offices of every state, with who manages each
 * office and which states are still vacant or not set up. Administrators add a state, department or head office
 * unit at any time; everything here feeds the Add employee form and the directory.
 */
export default function HrmOrganisationPage() {
  const pathname = usePathname();
  const base = getHrmBase(pathname);
  const [organisation, setOrganisation] = useState<HrmOrganisation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [stateFilter, setStateFilter] = useState<StateFilter>('ALL');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedTab, setSelectedTab] = useState<OrganisationTab | null>(null);
  const queryTab = useSyncExternalStore(
    () => () => undefined,
    () => tabFromQuery(new URLSearchParams(window.location.search).get('tab')),
    () => 'STRUCTURE' as OrganisationTab,
  );
  const { user } = useAuthStore();
  // Only a Super Admin holds every HRM permission (same as the backend).
  const allAccess = user?.role === 'SUPER_ADMIN';
  const canReadAttendance = hasHrmPermission(user?.permissions, ['hrm.attendance.read', 'hrm.attendance.manage'], allAccess);
  const canManageAttendance = hasHrmPermission(user?.permissions, ['hrm.attendance.manage'], allAccess);
  // Holidays are readable with org.read too (this page already needs it); shifts need attendance access.
  const visibleTabs = ORGANISATION_TABS.filter((id) => id !== 'SHIFTS' || canReadAttendance);
  const wanted = selectedTab ?? queryTab;
  const tab: OrganisationTab = (visibleTabs as readonly string[]).includes(wanted) ? wanted : 'STRUCTURE';
  const setTab = (next: OrganisationTab) => setSelectedTab(next);
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const index = visibleTabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + visibleTabs.length) % visibleTabs.length;
    const nextTab = visibleTabs[next]!;
    setTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`hrm-org-tab-${nextTab}`)?.focus());
  };

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await hrmApi.getOrganisation();
        if (!cancelled) setOrganisation(response.data.organisation);
      } catch (requestError) {
        if (!cancelled) setError(getHrmErrorMessage(requestError, 'Unable to load the organisation.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const done = useCallback((message: string) => {
    toast.success(message);
    setDialog(null);
    reload();
  }, [reload]);

  const canManage = organisation?.abilities.canManage ?? false;
  const summary = useMemo(() => (organisation ? summariseOrganisation(organisation) : null), [organisation]);
  const groups = useMemo(() => groupOrganisation(organisation?.units ?? [], { query, showInactive }), [organisation?.units, query, showInactive]);
  const stateRows = useMemo(() => (organisation ? buildStateRows(organisation) : []), [organisation]);
  const stateCounts = useMemo(() => countStateRows(stateRows, query), [stateRows, query]);
  const visibleStateRows = useMemo(() => filterStateRows(stateRows, stateFilter, query), [stateRows, stateFilter, query]);
  const openStates = useMemo(() => (organisation ? statesWithoutOffice(organisation).length : 0), [organisation]);
  const searching = Boolean(query.trim());

  const rowActions = (unit: HrmOrganisationUnit) => canManage ? (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={() => setDialog({ type: 'rename', unit })} aria-label={`Rename ${unit.name}`} title="Rename" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
      <button type="button" onClick={() => setDialog({ type: 'toggle', unit })} aria-label={`${unit.isActive ? 'Switch off' : 'Switch on'} ${unit.name}`} title={unit.isActive ? 'Switch off' : 'Switch on'} className={`rounded-lg p-2 hover:bg-slate-100 ${unit.isActive ? 'text-slate-400 hover:text-rose-600' : 'text-emerald-600 hover:text-emerald-700'}`}><Power className="h-4 w-4" /></button>
      {/* Delete: only a unit nobody works in (the server also refuses one with past placements, access or open offers).
          A head office goes together with its departments; any other unit must have nothing under it. */}
      {unit.employeeCount === 0 && (unit.kind === 'HEAD_OFFICE' || unit.childCount === 0) ? <button type="button" onClick={() => setDialog({ type: 'delete', unit })} aria-label={`Delete ${unit.name}`} title="Delete" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button> : null}
    </div>
  ) : null;
  const actionHeader = canManage ? <th scope="col" className={`${th} text-right`}><span className="sr-only">Actions</span></th> : null;
  const addButton = (kind: 'STATE' | 'DEPARTMENT' | 'HEAD_OFFICE', label: string) => canManage ? (
    <button type="button" onClick={() => setDialog({ type: 'add', kind })} className="inline-flex h-9 items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:self-auto"><Plus className="h-3.5 w-3.5" /> {label}</button>
  ) : null;
  const bulkButton = (className: string) => canManage && openStates ? (
    <button type="button" onClick={() => setDialog({ type: 'bulk' })} className={className}><MapPin className="h-4 w-4" /> Add state offices</button>
  ) : null;
  const viewLink = (unit: HrmOrganisationUnit, label = 'View') => (
    <Link href={officeHref(base, unit.id)} aria-label={`${label} ${unit.name}`} className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">{label}<ChevronRight className="h-3.5 w-3.5" /></Link>
  );

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">People operations</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Organisation</h2>
            <p className="mt-1 text-sm text-slate-500">Raipur head office, its departments and every state office, with who manages each one.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organisation?.scope.allIndia ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20" title="You can see every state and every employee"><Globe2 className="h-3.5 w-3.5" /> All India access</span> : null}
            <button type="button" onClick={reload} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
            {bulkButton('inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50')}
            {canManage ? <button type="button" onClick={() => setDialog({ type: 'add', kind: 'STATE' })} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Add</button> : null}
          </div>
        </header>

        <div role="tablist" aria-label="Organisation sections" className="flex flex-wrap gap-2">
          {([
            { id: 'STRUCTURE', label: 'Offices & departments', icon: Landmark },
            { id: 'SHIFTS', label: 'Shifts', icon: Clock3 },
            { id: 'HOLIDAYS', label: 'Holidays', icon: CalendarDays },
          ] as const).filter(({ id }) => (visibleTabs as readonly string[]).includes(id)).map(({ id, label, icon: Icon }) => (
            <button key={id} id={`hrm-org-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`hrm-org-panel-${id}`} tabIndex={tab === id ? 0 : -1} onKeyDown={onTabKeyDown} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${tab === id ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'}`}><Icon className="h-3.5 w-3.5" />{label}</button>
          ))}
        </div>

        {canReadAttendance ? <div role="tabpanel" id="hrm-org-panel-SHIFTS" aria-labelledby="hrm-org-tab-SHIFTS" hidden={tab !== 'SHIFTS'}>{tab === 'SHIFTS' ? <HrmShifts canManage={canManageAttendance} /> : null}</div> : null}
        <div role="tabpanel" id="hrm-org-panel-HOLIDAYS" aria-labelledby="hrm-org-tab-HOLIDAYS" hidden={tab !== 'HOLIDAYS'}>{tab === 'HOLIDAYS' ? <HrmHolidays canManage={canManageAttendance} states={organisation?.states ?? []} /> : null}</div>

        <div role="tabpanel" id="hrm-org-panel-STRUCTURE" aria-labelledby="hrm-org-tab-STRUCTURE" hidden={tab !== 'STRUCTURE'} className="space-y-5">
        {tab === 'STRUCTURE' && error ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
            <button type="button" onClick={reload} className="self-start rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 sm:self-auto">Try again</button>
          </div>
        ) : null}

        {tab !== 'STRUCTURE' ? null : !organisation && loading ? (
          <div role="status" className="space-y-4"><span className="sr-only">Loading organisation…</span>{[0, 1, 2].map((index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>
        ) : organisation && summary ? (
          <>
            {!summary.headOffice ? (
              <section className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950"><Landmark className="h-5 w-5" /></span>
                  <div>
                    <h2 className="font-bold text-slate-950">Set up the head office</h2>
                    <p className="mt-0.5 max-w-xl text-sm text-slate-600">Start with the Raipur head office and its departments. State offices can be added one by one as you open them.</p>
                  </div>
                </div>
                {canManage ? <button type="button" onClick={() => setDialog({ type: 'setup' })} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500"><Landmark className="h-4 w-4" /> Set up head office</button> : <p className="text-xs font-medium text-amber-800">Ask an administrator to set it up.</p>}
              </section>
            ) : null}

            <section aria-label="India coverage" className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <CoverageTile label="State offices set up" value={`${summary.stateOffices} of ${summary.totalStates}`} hint="states with an active office" icon={MapPin} />
                <CoverageTile label="Covered" value={String(summary.covered)} hint="have a manager" icon={CircleCheck} tone="good" />
                <CoverageTile label="Vacant (no manager)" value={String(summary.vacant)} hint="office without a manager" icon={TriangleAlert} tone={summary.vacant ? 'warn' : 'default'} />
                <CoverageTile label="Joining soon" value={String(summary.joiningSoon)} hint="vacant, State Manager joining" icon={UserPlus} />
                <CoverageTile label="Not set up" value={String(summary.notSetUp)} hint="no active office yet" icon={Globe2} />
                <CoverageTile label="Staff in states" value={String(summary.staffInStates)} hint="work from a state office" icon={Users} />
                <CoverageTile label="Staff at head office" value={String(summary.staffInHeadOffice)} hint="work from the head office" icon={Landmark} />
              </div>
              {summary.unplacedStaff > 0 ? (
                <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{summary.unplacedStaff} employee{summary.unplacedStaff === 1 ? ' has' : 's have'} no office assigned yet – transfer them to place them.</span>
                </p>
              ) : null}
            </section>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, state or manager" aria-label="Search organisation" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button> : null}
              </div>
              {canManage && summary.inactive ? (
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="h-4 w-4 rounded accent-amber-500" /> Show inactive departments and units ({summary.inactive})</label>
              ) : null}
            </div>

            <SectionCard icon={Landmark} title="Head office" description="Where the company is run from." count={groups.headOffices.length} action={summary.headOffice ? addButton('HEAD_OFFICE', 'Add head office unit') : null}>
              {groups.headOffices.length ? (
                <ul className="divide-y divide-slate-100">
                  {groups.headOffices.map((office) => {
                    const departments = departmentsOf(organisation.units, office.id);
                    return (
                      <li key={office.id} className="px-5 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-950">{office.name} <ActiveChip active={office.isActive} /></p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span>{office.code}</span>
                              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[office.city?.name, office.state?.name].filter(Boolean).join(', ') || 'No location'}</span>
                              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{office.employeeCount} employee{office.employeeCount === 1 ? '' : 's'} here</span>
                              {office.managers.length ? <span>Managed by {formatManagerNames(office.managers)}</span> : null}
                            </p>
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            {viewLink(office, 'View office')}
                            {rowActions(office)}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {departments.length ? departments.map((department) => <span key={department.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{department.name}</span>) : <span className="text-xs text-slate-500">No departments yet.</span>}
                          {canManage && office.isActive ? <button type="button" onClick={() => setDialog({ type: 'add', kind: 'DEPARTMENT' })} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-amber-400 hover:text-amber-700"><Plus className="h-3 w-3" /> Department</button> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty icon={Landmark} title={searching ? 'No head office matches' : 'No head office yet'} description={searching ? 'Try a different search.' : 'Use “Set up head office” above to create the Raipur head office.'} />
              )}
            </SectionCard>

            <SectionCard icon={Building2} title="Departments" description="Used when adding employees and in the directory." count={groups.departments.length} action={addButton('DEPARTMENT', 'Add department')}>
              {groups.departments.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50"><tr><th scope="col" className={th}>Department</th><th scope="col" className={`${th} hidden md:table-cell`}>Code</th><th scope="col" className={`${th} hidden sm:table-cell`}>Head office</th><th scope="col" className={th}>Employees</th><th scope="col" className={th}>Status</th>{actionHeader}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {groups.departments.map((unit) => (
                        <tr key={unit.id} className={unit.isActive ? '' : 'bg-slate-50/60 text-slate-500'}>
                          <td className="px-4 py-3 font-semibold text-slate-900">{unit.name}</td>
                          <td className="hidden px-4 py-3 font-mono text-xs text-slate-500 md:table-cell">{unit.code}</td>
                          <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{unit.parent?.name ?? '—'}</td>
                          <td className="px-4 py-3"><Count value={unit.employeeCount} label="Employees placed in this department" /></td>
                          <td className="px-4 py-3"><ActiveChip active={unit.isActive} /></td>
                          {canManage ? <td className="px-4 py-3">{rowActions(unit)}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon={Building2} title={searching ? 'No department matches' : 'No departments yet'} description={searching ? 'Try a different search.' : 'Add the departments employees will be placed in, such as Finance or Sales.'} action={!searching ? addButton('DEPARTMENT', 'Add department') : null} />
              )}
            </SectionCard>

            <SectionCard
              icon={MapPin}
              title="State offices"
              description={`${summary.stateOffices} of ${summary.totalStates} states have an office. Every state is listed, so you can see what is covered and what is still open.`}
              count={visibleStateRows.length}
              action={bulkButton('inline-flex h-9 items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:self-auto')}
            >
              <div role="group" aria-label="Filter states" className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
                {STATE_FILTERS.map(({ id, label }) => {
                  const selected = stateFilter === id;
                  return (
                    <button key={id} type="button" aria-pressed={selected} onClick={() => setStateFilter(id)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${selected ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                      {label}
                      <span className={`rounded-full px-1.5 py-px text-[11px] font-bold ${selected ? 'bg-white/20 text-white' : 'bg-white text-slate-600'}`}>{stateCounts[id]}</span>
                    </button>
                  );
                })}
              </div>
              {visibleStateRows.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50"><tr><th scope="col" className={th}>State</th><th scope="col" className={`${th} hidden sm:table-cell`}>Office</th><th scope="col" className={th}>Managers</th><th scope="col" className={th}>Staff</th><th scope="col" className={`${th} text-right`}><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleStateRows.map((row) => {
                        const { unit } = row;
                        return (
                          <tr key={row.stateId} className={row.status === 'SWITCHED_OFF' ? 'bg-slate-50/60 text-slate-500' : ''}>
                            <td className="px-4 py-3 font-semibold text-slate-900">{unit ? <Link href={officeHref(base, unit.id)} className="hover:text-amber-700 hover:underline">{row.stateName}</Link> : row.stateName}</td>
                            <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{unit ? <>{unit.name}<span className="block font-mono text-[11px] text-slate-400">{unit.code}</span></> : <span className="text-slate-400">—</span>}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                {row.managers.length ? <span className="text-slate-700">{formatManagerNames(row.managers)}</span> : <span className="text-slate-400">—</span>}
                                <StatusChip status={row.status} />
                              </div>
                              {row.upcomingManagers.length ? <p className="mt-1 flex items-center gap-1 text-xs font-medium text-sky-700"><UserPlus className="h-3 w-3 shrink-0" />{describeUpcomingManagers(row.upcomingManagers)}</p> : null}
                            </td>
                            <td className="px-4 py-3">{unit ? <Count value={row.employeeCount} label="Employees working from this office" /> : <span className="text-slate-400">—</span>}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {unit ? viewLink(unit, 'View') : canManage ? (
                                  <button type="button" onClick={() => setDialog({ type: 'add', kind: 'STATE', stateId: row.stateId })} aria-label={`Add office in ${row.stateName}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:border-amber-300 hover:bg-amber-50"><Plus className="h-3.5 w-3.5" /> Add office</button>
                                ) : null}
                                {unit ? rowActions(unit) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon={MapPin}
                  title={stateRows.length ? 'No state matches' : 'No states found'}
                  description={stateRows.length ? 'Try a different search or filter.' : 'The location master has no states for India yet.'}
                  action={stateRows.length && (searching || stateFilter !== 'ALL') ? <button type="button" onClick={() => { setQuery(''); setStateFilter('ALL'); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Clear search and filter</button> : null}
                />
              )}
            </SectionCard>

            {groups.others.length ? (
              <SectionCard icon={Building2} title="Other units" description="Units created earlier that are not a department, state office or head office." count={groups.others.length}>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50"><tr><th scope="col" className={th}>Name</th><th scope="col" className={th}>Type</th><th scope="col" className={th}>Employees</th><th scope="col" className={th}>Status</th>{actionHeader}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {groups.others.map((unit) => (
                        <tr key={unit.id}><td className="px-4 py-3 font-semibold text-slate-900">{unit.name}</td><td className="px-4 py-3 text-slate-600">{unit.type}</td><td className="px-4 py-3"><Count value={unit.employeeCount} label="Employees" /></td><td className="px-4 py-3"><ActiveChip active={unit.isActive} /></td>{canManage ? <td className="px-4 py-3">{rowActions(unit)}</td> : null}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            ) : null}
          </>
        ) : null}
        </div>
      </div>

      {organisation && dialog?.type === 'add' ? <AddUnitDialog key={`${dialog.kind}-${dialog.stateId ?? ''}`} organisation={organisation} initialKind={dialog.kind} initialStateId={dialog.stateId} onClose={closeDialog} onDone={done} /> : null}
      {organisation && dialog?.type === 'bulk' ? <AddStateOfficesDialog organisation={organisation} onClose={closeDialog} onDone={done} /> : null}
      {organisation && dialog?.type === 'setup' ? <HeadOfficeSetupDialog organisation={organisation} onClose={closeDialog} onDone={done} /> : null}
      {dialog?.type === 'rename' ? <RenameUnitDialog unit={dialog.unit} onClose={closeDialog} onDone={done} /> : null}
      {dialog?.type === 'toggle' ? <ToggleUnitDialog unit={dialog.unit} onClose={closeDialog} onDone={done} /> : null}
      {dialog?.type === 'delete' && organisation ? <DeleteUnitDialog unit={dialog.unit} departmentNames={dialog.unit.kind === 'HEAD_OFFICE' ? departmentsOf(organisation.units, dialog.unit.id).map((department) => department.name) : []} onClose={closeDialog} onDone={done} /> : null}
    </div>
  );
}
