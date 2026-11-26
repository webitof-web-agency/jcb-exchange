'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, Building2, CalendarDays, ChevronRight, Clock3, Globe2, Landmark, MapPin, Pencil, Plus, Power, RefreshCw, Search, Trash2, TriangleAlert, UserPlus, Users, X } from 'lucide-react';
import { hrmApi, type HrmOrganisation, type HrmOrganisationUnit } from '@/lib/hrmApi';
import {
  buildStateRows, countStateRows, departmentsOf, filterStateRows, formatManagerNames, getHrmBase, groupOrganisation, officeHref,
  statesWithoutOffice, summariseOrganisation, type StateFilter, type StateRowStatus,
} from '@/lib/hrmOrganisation';
import { getHrmErrorMessage, hasHrmPermission } from '@/lib/hrmUi';
import { describeUpcomingManagers } from '@/lib/hrmOnboardingPage';
import { useAuthStore } from '@/store/authStore';
import HrmDepartmentsSection from './HrmDepartmentsSection';
import HrmShifts from './HrmShifts';
import HrmHolidays from './HrmHolidays';
import { DefaultStar } from './HrmHeadOfficeField';
import { AddStateOfficesDialog, AddUnitDialog, DeleteUnitDialog, HeadOfficeSetupDialog, RenameUnitDialog, ToggleUnitDialog } from './HrmOrganisationDialogs';
import { ActiveChip, Count, Empty, IconButton, SectionCard, orgTh } from './orgUi';

type OrganisationTab = 'STRUCTURE' | 'SHIFTS' | 'HOLIDAYS';
const ORGANISATION_TABS = ['STRUCTURE', 'SHIFTS', 'HOLIDAYS'] as const;
/** ?tab=shifts / ?tab=holidays opens that section (links from the profile's shift card). */
const tabFromQuery = (value: string | null): OrganisationTab => {
  const upper = (value ?? '').toUpperCase();
  return (ORGANISATION_TABS as readonly string[]).includes(upper) ? upper as OrganisationTab : 'STRUCTURE';
};

type Dialog =
  | { type: 'add'; kind: 'STATE' | 'HEAD_OFFICE'; stateId?: number }
  | { type: 'bulk' }
  | { type: 'setup' }
  | { type: 'rename'; unit: HrmOrganisationUnit }
  | { type: 'toggle'; unit: HrmOrganisationUnit }
  | { type: 'delete'; unit: HrmOrganisationUnit }
  | null;

// Only states that have an office are listed, so "not set up" here can only mean an office that is switched off.
const STATE_FILTERS: Array<{ id: StateFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'COVERED', label: 'Covered' },
  { id: 'VACANT', label: 'Vacant' },
  { id: 'NOT_SET_UP', label: 'Switched off' },
];

const STATUS_CHIP: Record<StateRowStatus, { label: string; className: string }> = {
  COVERED: { label: 'Covered', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  VACANT: { label: 'Vacant', className: 'bg-amber-50 text-amber-800 ring-amber-600/30' },
  NOT_SET_UP: { label: 'Not set up', className: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  SWITCHED_OFF: { label: 'Switched off', className: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
};

const secondaryButton = 'inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:self-auto';

function StatusChip({ status }: { status: StateRowStatus }) {
  const { label, className } = STATUS_CHIP[status];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${className}`}>{label}</span>;
}

type Stat = { label: string; value: string; hint: string; tone?: 'good' | 'warn'; filter?: StateFilter };

/** The coverage numbers in one compact strip; the state ones filter the state list when clicked. */
function CoverageStrip({ stats, onPick }: { stats: Stat[]; onPick: (filter: StateFilter) => void }) {
  return (
    <div role="group" aria-label="India coverage" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-sm sm:grid-cols-4 lg:grid-cols-7">
      {stats.map((stat, index) => {
        const { filter } = stat;
        const body = (
          <>
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
            <p className={`mt-0.5 text-xl font-bold ${stat.tone === 'good' ? 'text-emerald-700' : stat.tone === 'warn' ? 'text-amber-700' : 'text-slate-950'}`}>{stat.value}</p>
            <p className="truncate text-[11px] text-slate-500">{stat.hint}</p>
          </>
        );
        // The seventh box fills the empty cell of the two and four column layouts.
        const cell = `bg-white px-4 py-3 text-left ${index === stats.length - 1 ? 'col-span-2 lg:col-span-1' : ''}`;
        return filter ? (
          <div key={stat.label} className={`${cell} relative transition hover:bg-amber-50`}>
            {body}
            <button type="button" onClick={() => onPick(filter)} aria-label={`Show ${stat.label.toLowerCase()} states`} title="Show these states" className="absolute inset-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400" />
          </div>
        ) : <div key={stat.label} className={cell}>{body}</div>;
      })}
    </div>
  );
}

/**
 * Organisation: the head office, the company's departments and the state offices of every state, with who manages
 * each office and which states are still vacant or not set up. Everything here feeds the Add employee form, offers
 * and the directory. Departments are edited only in their section (HrmDepartmentsSection).
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
  // A state appears once its office is added.
  const stateRows = useMemo(() => (organisation ? buildStateRows(organisation).filter((row) => row.unit) : []), [organisation]);
  const stateCounts = useMemo(() => countStateRows(stateRows, query), [stateRows, query]);
  const visibleStateRows = useMemo(() => filterStateRows(stateRows, stateFilter, query), [stateRows, stateFilter, query]);
  const openStates = useMemo(() => (organisation ? statesWithoutOffice(organisation).length : 0), [organisation]);
  // Switched-off head offices and other units are hidden unless asked for (state offices and departments always show).
  const hiddenUnits = organisation?.units.filter((unit) => !unit.isActive && (unit.kind === 'HEAD_OFFICE' || unit.kind === 'OTHER')).length ?? 0;
  const searching = Boolean(query.trim());

  const showStates = (filter: StateFilter) => {
    setStateFilter(filter);
    document.getElementById('hrm-org-states')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const unitActions = (unit: HrmOrganisationUnit) => canManage ? (
    <>
      <IconButton label={unit.kind === 'HEAD_OFFICE' ? `Edit ${unit.name} (name and place)` : `Edit ${unit.name}`} onClick={() => setDialog({ type: 'rename', unit })}><Pencil className="h-4 w-4" /></IconButton>
      <IconButton label={`${unit.isActive ? 'Switch off' : 'Switch on'} ${unit.name}`} tone={unit.isActive ? 'default' : 'success'} onClick={() => setDialog({ type: 'toggle', unit })}><Power className="h-4 w-4" /></IconButton>
      {/* The dialog says why when a unit cannot be deleted (people work there, past placements, access or offers). */}
      <IconButton label={`Delete ${unit.name}`} tone="danger" onClick={() => setDialog({ type: 'delete', unit })}><Trash2 className="h-4 w-4" /></IconButton>
    </>
  ) : null;
  const viewLink = (unit: HrmOrganisationUnit, label = 'View') => (
    <Link href={officeHref(base, unit.id)} aria-label={`${label} ${unit.name}`} className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">{label}<ChevronRight className="h-3.5 w-3.5" /></Link>
  );

  const stats: Stat[] = summary ? [
    { label: 'State offices', value: `${summary.stateOffices}/${summary.totalStates}`, hint: 'set up' },
    { label: 'Covered', value: String(summary.covered), hint: summary.coveredByCharge ? `${summary.coveredByCharge} on additional charge` : 'have a manager', tone: 'good', filter: 'COVERED' },
    { label: 'Vacant', value: String(summary.vacant), hint: 'no manager', ...(summary.vacant ? { tone: 'warn' as const } : {}), filter: 'VACANT' },
    { label: 'Joining soon', value: String(summary.joiningSoon), hint: 'manager joining' },
    { label: 'Not set up', value: String(summary.notSetUp), hint: 'states without office' },
    { label: 'Staff in states', value: String(summary.staffInStates), hint: 'state offices' },
    { label: 'Head office staff', value: String(summary.staffInHeadOffice), hint: 'head office' },
  ] : [];

  return (
    <div className="w-full space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">People operations</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Organisation</h2>
            <p className="mt-0.5 text-sm text-slate-500">Head office, departments and state offices.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organisation?.scope.allIndia ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20" title="You can see every state and every employee"><Globe2 className="h-3.5 w-3.5" /> All India access</span> : null}
            <button type="button" onClick={reload} disabled={loading} className={secondaryButton}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
        </header>

        <div role="tablist" aria-label="Organisation sections" className="custom-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200">
          {([
            { id: 'STRUCTURE', label: 'Offices & departments', icon: Landmark },
            { id: 'SHIFTS', label: 'Shifts', icon: Clock3 },
            { id: 'HOLIDAYS', label: 'Holidays', icon: CalendarDays },
          ] as const).filter(({ id }) => (visibleTabs as readonly string[]).includes(id)).map(({ id, label, icon: Icon }) => (
            <button key={id} id={`hrm-org-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`hrm-org-panel-${id}`} tabIndex={tab === id ? 0 : -1} onKeyDown={onTabKeyDown} onClick={() => setTab(id)} className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${tab === id ? 'border-amber-500 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </div>

        {canReadAttendance ? <div role="tabpanel" id="hrm-org-panel-SHIFTS" aria-labelledby="hrm-org-tab-SHIFTS" hidden={tab !== 'SHIFTS'}>{tab === 'SHIFTS' ? <HrmShifts canManage={canManageAttendance} /> : null}</div> : null}
        <div role="tabpanel" id="hrm-org-panel-HOLIDAYS" aria-labelledby="hrm-org-tab-HOLIDAYS" hidden={tab !== 'HOLIDAYS'}>{tab === 'HOLIDAYS' ? <HrmHolidays canManage={canManageAttendance} states={organisation?.states ?? []} /> : null}</div>

        <div role="tabpanel" id="hrm-org-panel-STRUCTURE" aria-labelledby="hrm-org-tab-STRUCTURE" hidden={tab !== 'STRUCTURE'} className="space-y-4">
          {tab === 'STRUCTURE' && error ? (
            <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
              <button type="button" onClick={reload} className="self-start rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 sm:self-auto">Try again</button>
            </div>
          ) : null}

          {tab !== 'STRUCTURE' ? null : !organisation && loading ? (
            <div role="status" className="space-y-4"><span className="sr-only">Loading organisation…</span>{[0, 1, 2].map((index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>
          ) : organisation && summary ? (
            <>
              {!summary.headOffice ? (
                <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950"><Landmark className="h-5 w-5" /></span>
                    <div>
                      <h2 className="text-sm font-bold text-slate-950">Set up the head office</h2>
                      <p className="mt-0.5 max-w-xl text-sm text-slate-600">Choose its state and city. State offices can be added as you open them.</p>
                    </div>
                  </div>
                  {canManage ? <button type="button" onClick={() => setDialog({ type: 'setup' })} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500"><Landmark className="h-4 w-4" /> Set up head office</button> : <p className="text-xs font-medium text-amber-800">Ask an administrator to set it up.</p>}
                </section>
              ) : null}

              <CoverageStrip stats={stats} onPick={showStates} />
              {summary.unplacedStaff > 0 ? (
                <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{summary.unplacedStaff} employee{summary.unplacedStaff === 1 ? ' has' : 's have'} no office assigned yet – transfer them to place them.</span>
                </p>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search office, department, state or manager" aria-label="Search organisation" maxLength={120} autoComplete="off" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                  {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button> : null}
                </div>
                {canManage && hiddenUnits ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="h-4 w-4 rounded accent-amber-500" /> Show switched-off offices ({hiddenUnits})</label>
                ) : null}
              </div>

              <SectionCard
                icon={Landmark}
                title="Head office"
                description={groups.headOffices.length > 1 ? 'Where the company is run from. Forms choose the default one (★) first.' : 'Where the company is run from.'}
                count={groups.headOffices.length}
                action={canManage && summary.headOffice ? <button type="button" onClick={() => setDialog({ type: 'add', kind: 'HEAD_OFFICE' })} className={secondaryButton}><Plus className="h-3.5 w-3.5" /> Add head office unit</button> : undefined}
              >
                {groups.headOffices.length ? (
                  <ul className="divide-y divide-slate-100">
                    {groups.headOffices.map((office) => {
                      const departments = departmentsOf(organisation.units, office.id).length;
                      return (
                        <li key={office.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">{office.name} <ActiveChip active={office.isActive} />{office.isDefault ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300" title="Chosen first in forms, and used wherever no head office is chosen. Change it by editing another head office."><DefaultStar /> Default</span> : null}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span className="font-mono">{office.code}</span>
                              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[office.city?.name, office.state?.name].filter(Boolean).join(', ') || 'No location'}</span>
                              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{office.employeeCount} employee{office.employeeCount === 1 ? '' : 's'}</span>
                              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{departments} department{departments === 1 ? '' : 's'}</span>
                              {office.managers.length ? <span>Managed by {formatManagerNames(office.managers)}</span> : null}
                              {office.chargeHolders?.length ? <span>Additional charge: {formatManagerNames(office.chargeHolders)}</span> : null}
                            </p>
                          </div>
                          <div className="flex items-center justify-end gap-0.5">{viewLink(office, 'View office')}{unitActions(office)}</div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Empty icon={Landmark} title={searching ? 'No head office matches' : 'No head office yet'} description={searching ? 'Try a different search.' : 'Use “Set up head office” above.'} />
                )}
              </SectionCard>

              <HrmDepartmentsSection canManage={canManage} query={query} reloadKey={reloadKey} onChanged={reload} />

              <SectionCard
                id="hrm-org-states"
                icon={MapPin}
                title="State offices"
                description={`${summary.stateOffices} of ${summary.totalStates} states have an office.`}
                count={visibleStateRows.length}
                action={canManage && openStates ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setDialog({ type: 'bulk' })} className={secondaryButton}>Add several</button>
                    <button type="button" onClick={() => setDialog({ type: 'add', kind: 'STATE' })} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"><Plus className="h-3.5 w-3.5" /> Add state office</button>
                  </div>
                ) : undefined}
              >
                <div role="group" aria-label="Filter states" className="custom-scrollbar flex gap-2 overflow-x-auto border-b border-slate-100 px-4 py-2.5 sm:px-5">
                  {STATE_FILTERS.filter(({ id }) => id !== 'NOT_SET_UP' || stateCounts.NOT_SET_UP > 0 || stateFilter === 'NOT_SET_UP').map(({ id, label }) => {
                    const selected = stateFilter === id;
                    return (
                      <button key={id} type="button" aria-pressed={selected} onClick={() => setStateFilter(id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${selected ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                        {label}
                        <span className={`rounded-full px-1.5 py-px text-[11px] font-bold ${selected ? 'bg-white/20 text-white' : 'bg-white text-slate-600'}`}>{stateCounts[id]}</span>
                      </button>
                    );
                  })}
                </div>
                {visibleStateRows.length ? (
                  <div className="custom-scrollbar max-h-[32rem] overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead><tr><th scope="col" className={orgTh}>State</th><th scope="col" className={`${orgTh} hidden md:table-cell`}>Office</th><th scope="col" className={orgTh}>Manager</th><th scope="col" className={orgTh}>Staff</th><th scope="col" className={`${orgTh} text-right`}><span className="sr-only">Actions</span></th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleStateRows.map((row) => {
                          const { unit } = row;
                          return (
                            <tr key={row.stateId} className={row.status === 'SWITCHED_OFF' ? 'bg-slate-50/60 text-slate-500' : 'hover:bg-slate-50/60'}>
                              <td className="px-4 py-2.5 font-semibold text-slate-900">{unit ? <Link href={officeHref(base, unit.id)} className="hover:text-amber-700 hover:underline">{row.stateName}</Link> : row.stateName}{unit ? <span className="block text-[11px] font-normal text-slate-500 md:hidden">{unit.name}</span> : null}</td>
                              <td className="hidden px-4 py-2.5 text-slate-600 md:table-cell">{unit ? <>{unit.name}<span className="block font-mono text-[11px] text-slate-400">{unit.code}</span></> : <span className="text-slate-400">—</span>}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  {row.managers.length ? <span className="text-slate-700">{formatManagerNames(row.managers)}</span> : null}
                                  {row.chargeHolders.length ? <span className="inline-flex items-center gap-1 text-slate-700">{row.managers.length ? '+ ' : ''}{formatManagerNames(row.chargeHolders)}<span title="Looks after this state besides their own posting" className="rounded-full bg-violet-50 px-1.5 py-px text-[10px] font-bold text-violet-700">Additional charge</span></span> : null}
                                  <StatusChip status={row.status} />
                                </div>
                                {row.upcomingManagers.length ? <p className="mt-1 flex items-center gap-1 text-xs font-medium text-sky-700"><UserPlus className="h-3 w-3 shrink-0" />{describeUpcomingManagers(row.upcomingManagers)}</p> : null}
                              </td>
                              <td className="px-4 py-2.5">{unit ? <Count value={row.employeeCount} label="Employees working from this office" /> : <span className="text-slate-400">—</span>}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center justify-end gap-0.5">
                                  {unit ? <>{viewLink(unit)}{unitActions(unit)}</> : null}
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
                    title={stateRows.length ? 'No state office matches' : 'No state office yet'}
                    description={stateRows.length ? 'Try a different search or filter.' : canManage ? 'Add the office of each state as you open it. It then appears here.' : 'Ask an administrator to add the state offices.'}
                    action={stateRows.length
                      ? (searching || stateFilter !== 'ALL' ? <button type="button" onClick={() => { setQuery(''); setStateFilter('ALL'); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Clear search and filter</button> : null)
                      : (canManage && openStates ? <button type="button" onClick={() => setDialog({ type: 'add', kind: 'STATE' })} className={secondaryButton}><Plus className="h-3.5 w-3.5" /> Add state office</button> : null)}
                  />
                )}
              </SectionCard>

              {groups.others.length ? (
                <SectionCard icon={Building2} title="Other units" description="Units created earlier that are not a department, state office or head office." count={groups.others.length}>
                  <div className="custom-scrollbar max-h-80 overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead><tr><th scope="col" className={orgTh}>Name</th><th scope="col" className={orgTh}>Type</th><th scope="col" className={orgTh}>Employees</th><th scope="col" className={orgTh}>Status</th>{canManage ? <th scope="col" className={`${orgTh} text-right`}><span className="sr-only">Actions</span></th> : null}</tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {groups.others.map((unit) => (
                          <tr key={unit.id}><td className="px-4 py-2.5 font-semibold text-slate-900">{unit.name}</td><td className="px-4 py-2.5 text-slate-600">{unit.type}</td><td className="px-4 py-2.5"><Count value={unit.employeeCount} label="Employees" /></td><td className="px-4 py-2.5"><ActiveChip active={unit.isActive} /></td>{canManage ? <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-0.5">{unitActions(unit)}</div></td> : null}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              ) : null}
            </>
          ) : null}
        </div>

      {organisation && dialog?.type === 'add' ? <AddUnitDialog key={`${dialog.kind}-${dialog.stateId ?? ''}`} organisation={organisation} kind={dialog.kind} initialStateId={dialog.stateId} onClose={closeDialog} onDone={done} /> : null}
      {organisation && dialog?.type === 'bulk' ? <AddStateOfficesDialog organisation={organisation} onClose={closeDialog} onDone={done} /> : null}
      {organisation && dialog?.type === 'setup' ? <HeadOfficeSetupDialog organisation={organisation} onClose={closeDialog} onDone={done} /> : null}
      {organisation && dialog?.type === 'rename' ? <RenameUnitDialog organisation={organisation} unit={dialog.unit} onClose={closeDialog} onDone={done} /> : null}
      {organisation && dialog?.type === 'toggle' ? <ToggleUnitDialog unit={dialog.unit} departmentCount={dialog.unit.kind === 'HEAD_OFFICE' ? departmentsOf(organisation.units, dialog.unit.id).length : 0} moveTo={organisation.units.find((unit) => unit.kind === 'HEAD_OFFICE' && unit.isDefault && unit.id !== dialog.unit.id)?.name} onClose={closeDialog} onDone={done} /> : null}
      {organisation && dialog?.type === 'delete' ? <DeleteUnitDialog unit={dialog.unit} departmentCount={dialog.unit.kind === 'HEAD_OFFICE' ? departmentsOf(organisation.units, dialog.unit.id).length : 0} moveTo={organisation.units.find((unit) => unit.kind === 'HEAD_OFFICE' && unit.isDefault && unit.id !== dialog.unit.id)?.name} onClose={closeDialog} onDone={done} /> : null}
    </div>
  );
}
