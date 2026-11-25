'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, ArrowDownUp, BarChart3, ChevronLeft, ChevronRight, Download, Loader2, MapPin, RefreshCw, X } from 'lucide-react';
import { hrmApi, type HrmReportPerson, type HrmReportSummary } from '@/lib/hrmApi';
import {
  barPercent, buildReportTiles, departmentRows, describeTruncation, headcountCsvFileName, headcountTotals, indiaMonth, isValidMonth,
  monthLabel, nextReportMonth, onboardingStatusHref, readBlobErrorMessage, shiftMonth, sortHeadcount, stateRows,
  type HeadcountRow, type HeadcountSort, type ReportTile,
} from '@/lib/hrmReports';
import { getHrmBase, officeHref } from '@/lib/hrmOrganisation';
import { onboardingStatusLabel } from '@/lib/hrmOnboardingPage';
import { formatHrmDate, getHrmErrorMessage, hasHrmPermission } from '@/lib/hrmUi';
import { useAuthStore } from '@/store/authStore';
import SearchableSelect from '@/components/ui/SearchableSelect';

type Option = { id: string | number; name: string };

const card = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const secondary = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';

const TILE_TONES: Record<ReportTile['tone'], string> = {
  slate: 'text-slate-950',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  sky: 'text-sky-700',
  rose: 'text-rose-700',
};

function Tile({ tile }: { tile: ReportTile }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tile.label}</p>
      <p className={`mt-2 text-2xl font-bold ${TILE_TONES[tile.tone]}`}>{tile.value}</p>
      {tile.hint ? <p className="mt-1 text-xs text-slate-500">{tile.hint}</p> : null}
    </div>
  );
}

function HeadcountTable({
  title, by, rows, onPick, pickedKey, onDownload, downloading,
}: {
  title: string;
  by: 'state' | 'department';
  rows: HeadcountRow[];
  onPick?: (row: HeadcountRow) => void;
  pickedKey?: string;
  onDownload: () => void;
  downloading: boolean;
}) {
  const [sort, setSort] = useState<HeadcountSort>('total');
  const sorted = useMemo(() => sortHeadcount(rows, sort), [rows, sort]);
  const totals = useMemo(() => headcountTotals(rows), [rows]);
  const max = useMemo(() => rows.reduce((value, row) => Math.max(value, row.total), 0), [rows]);
  const headingId = `hrm-report-${by}`;
  return (
    <section className={`${card} overflow-hidden`} aria-labelledby={headingId}>
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 id={headingId} className="font-bold text-slate-950">{title}</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={() => setSort((value) => (value === 'total' ? 'name' : 'total'))} aria-label={`Sort ${title} by ${sort === 'total' ? 'name' : 'total'}`}>
            <ArrowDownUp className="h-4 w-4" /> {sort === 'total' ? 'By total' : 'By name'}
          </button>
          <button type="button" className={secondary} onClick={onDownload} disabled={downloading || !rows.length}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download CSV
          </button>
        </div>
      </div>
      {!rows.length ? (
        <p className="p-6 text-center text-sm text-slate-500">No people to count here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">{by === 'state' ? 'State' : 'Department'}</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Working</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">On notice</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Joining</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">On hold</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((row) => {
                const picked = pickedKey === row.key;
                const clickable = Boolean(onPick) && row.key !== 'none';
                return (
                  <tr key={row.key} className={`${picked ? 'bg-amber-50' : ''} ${clickable ? 'hover:bg-amber-50/50' : ''}`}>
                    <td className="px-4 py-2.5">
                      {clickable ? (
                        <button type="button" onClick={() => onPick?.(row)} className="text-left font-semibold text-slate-900 hover:text-amber-700" aria-pressed={picked} title={`Show only ${row.name}`}>{row.name}</button>
                      ) : <span className="font-semibold text-slate-700">{row.name}</span>}
                      {/* The bar is decoration; the numbers are in the cells. */}
                      <div className="mt-1 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${barPercent(row.total, max)}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{row.working}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{row.notice}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{row.joining}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{row.onHold}</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-950">{row.total}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-sm font-bold text-slate-950">
              <tr>
                <th scope="row" className="px-4 py-2.5 text-left">Total</th>
                <td className="px-3 py-2.5 text-right tabular-nums">{totals.working}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totals.notice}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totals.joining}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totals.onHold}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totals.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function PeopleList({ title, count, people, base, emptyText, linkNames = true, footnote }: {
  title: string; count: number; people: HrmReportPerson[]; base: string; emptyText: string;
  /** False when the viewer cannot open these profiles (scoped viewers and people who left). */
  linkNames?: boolean;
  footnote?: string;
}) {
  const note = describeTruncation(people.length, count);
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <h2 className="font-bold text-slate-950">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{count}</span>
      </div>
      {!people.length ? <p className="p-6 text-center text-sm text-slate-500">{emptyText}</p> : (
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
          {people.map((person) => (
            <li key={person.id} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                {linkNames
                  ? <Link href={`${base}/${encodeURIComponent(person.id)}`} className="font-semibold text-slate-900 hover:text-amber-700">{person.name}</Link>
                  : <span className="font-semibold text-slate-900">{person.name}</span>}
                <p className="truncate text-xs text-slate-500">{[person.employeeCode, person.designation, person.state].filter(Boolean).join(' · ')}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-600">{formatHrmDate(person.date)}</span>
            </li>
          ))}
        </ul>
      )}
      {note ? <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{note}</p> : null}
      {footnote && people.length ? <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{footnote}</p> : null}
    </section>
  );
}

/** Director / HR reports: headcount state-wise and department-wise, joinings and exits, onboarding, KYC, vacant states. */
export default function HrmReports() {
  const pathname = usePathname();
  const base = getHrmBase(pathname);
  const { user } = useAuthStore();
  const allAccess = user?.role === 'SUPER_ADMIN';
  // The organisation endpoints (filters, office pages) need hrm.org.read itself; org.manage does not imply it.
  const canReadOrg = hasHrmPermission(user?.permissions, ['hrm.org.read'], allAccess);
  const canOpenOnboarding = hasHrmPermission(user?.permissions, ['hrm.onboarding.read', 'hrm.onboarding.manage'], allAccess);

  const [month, setMonth] = useState(() => indiaMonth());
  const [stateId, setStateId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [report, setReport] = useState<HrmReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [states, setStates] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [downloading, setDownloading] = useState<'state' | 'department' | null>(null);
  const requestRef = useRef(0);

  // Filters need the organisation (states / departments); without org.read they are hidden.
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
        const response = await hrmApi.getReportSummary({
          ...(isValidMonth(month) ? { month } : {}),
          ...(stateId ? { stateId: Number(stateId) } : {}),
          ...(orgUnitId ? { orgUnitId } : {}),
        });
        if (ticket !== requestRef.current) return;
        setReport(response.data.report);
      } catch (requestError) {
        if (ticket !== requestRef.current) return;
        // The old numbers belong to other filters: do not keep showing them under the new ones.
        setReport(null);
        setError(getHrmErrorMessage(requestError, 'The reports could not be loaded.'));
      } finally {
        if (ticket === requestRef.current) setLoading(false);
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [month, stateId, orgUnitId, reloadKey]);

  const download = useCallback(async (by: 'state' | 'department') => {
    if (downloading) return;
    setDownloading(by);
    try {
      const response = await hrmApi.downloadHeadcountCsv({ by, ...(stateId ? { stateId: Number(stateId) } : {}), ...(orgUnitId ? { orgUnitId } : {}) });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = headcountCsvFileName(by);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      toast.error(await readBlobErrorMessage(requestError, getHrmErrorMessage(requestError, 'The CSV could not be downloaded.')));
    } finally {
      setDownloading(null);
    }
  }, [downloading, orgUnitId, stateId]);

  const tiles = report ? buildReportTiles(report) : [];
  const byState = report ? stateRows(report) : [];
  const byDepartment = report ? departmentRows(report) : [];
  const stateName = states.find((state) => String(state.id) === stateId)?.name;
  const departmentName = departments.find((department) => String(department.id) === orgUnitId)?.name;
  const filtered = Boolean(stateId || orgUnitId);
  const onboardingEntries = report?.onboarding ? Object.entries(report.onboarding).filter(([, count]) => (count ?? 0) > 0) : [];
  const nextMonth = nextReportMonth(month);

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className={`${card} flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">People reports</p>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-950"><BarChart3 className="h-6 w-6 text-amber-500" aria-hidden="true" /> HRM reports</h2>
            <p className="mt-1 text-sm text-slate-500">Headcount state-wise and department-wise, joinings and exits, onboarding, KYC and vacant states.</p>
            {report && !report.scope.allIndia ? <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Showing your states only</p> : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div>
              <label htmlFor="hrm-report-month" className="block text-xs font-semibold text-slate-600">Joinings and exits of</label>
              <div className="mt-1 flex items-center gap-1">
                <button type="button" className={secondary} onClick={() => setMonth((value) => shiftMonth(isValidMonth(value) ? value : indiaMonth(), -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
                <input id="hrm-report-month" type="month" value={month} max={indiaMonth()} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm" />
                <button type="button" className={secondary} onClick={() => setMonth((value) => nextReportMonth(value).next)} disabled={!nextMonth.canGoNext} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            {states.length ? (
              <div className="w-full sm:w-52">
                <span className="block text-xs font-semibold text-slate-600">State</span>
                <div className="mt-1">
                  <SearchableSelect id="hrm-report-state" options={states} value={stateId} displayValue={stateName ?? ''} onChange={(option) => setStateId(String(option.id))} placeholder="All states" clearable onClear={() => setStateId('')} />
                </div>
              </div>
            ) : null}
            {departments.length ? (
              <div className="w-full sm:w-52">
                <span className="block text-xs font-semibold text-slate-600">Department</span>
                <div className="mt-1">
                  <SearchableSelect id="hrm-report-department" options={departments} value={orgUnitId} displayValue={departmentName ?? ''} onChange={(option) => setOrgUnitId(String(option.id))} placeholder="All departments" clearable onClear={() => setOrgUnitId('')} />
                </div>
              </div>
            ) : null}
            <button type="button" className={secondary} onClick={() => setReloadKey((value) => value + 1)} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
        </header>

        {filtered ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>Filtered:</span>
            {stateId ? <button type="button" onClick={() => setStateId('')} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">{stateName ?? 'State'} <X className="h-3 w-3" aria-hidden="true" /><span className="sr-only">Remove state filter</span></button> : null}
            {orgUnitId ? <button type="button" onClick={() => setOrgUnitId('')} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">{departmentName ?? 'Department'} <X className="h-3 w-3" aria-hidden="true" /><span className="sr-only">Remove department filter</span></button> : null}
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</span>
            <button type="button" className={secondary} onClick={() => setReloadKey((value) => value + 1)}>Try again</button>
          </div>
        ) : null}

        {!report && loading ? <div className={`${card} p-10 text-center text-sm text-slate-500`} role="status"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" aria-hidden="true" />Loading reports…</div> : null}

        {report ? (
          <div className={`space-y-5 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
              {tiles.map((tile) => <Tile key={tile.key} tile={tile} />)}
            </section>

            <div className="grid gap-5 xl:grid-cols-2">
              <HeadcountTable
                title="Headcount by state"
                by="state"
                rows={byState}
                pickedKey={stateId || undefined}
                onPick={states.length ? (row) => setStateId((current) => (current === row.key ? '' : row.key)) : undefined}
                onDownload={() => void download('state')}
                downloading={downloading === 'state'}
              />
              <HeadcountTable
                title="Headcount by department"
                by="department"
                rows={byDepartment}
                pickedKey={orgUnitId || undefined}
                onPick={departments.length ? (row) => setOrgUnitId((current) => (current === row.key ? '' : row.key)) : undefined}
                onDownload={() => void download('department')}
                downloading={downloading === 'department'}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Joinings use the "in scope at any time in the month" rule, so they can include people who have since
                  left or moved out of a scoped viewer's reach (their profile would answer 403): names link for all-India only. */}
              <PeopleList
                title={`Joined in ${monthLabel(report.month)}`}
                count={report.joinings.count}
                people={report.joinings.people}
                base={base}
                emptyText="Nobody joined in this month."
                linkNames={report.scope.allIndia}
                footnote={report.scope.allIndia ? undefined : 'Open a profile from the Employee Directory: people who have since left or moved are visible to all-India HR.'}
              />
              <PeopleList
                title={`Left in ${monthLabel(report.month)}`}
                count={report.exits.count}
                people={report.exits.people}
                base={base}
                emptyText="Nobody left in this month."
                linkNames={report.scope.allIndia}
                footnote={report.scope.allIndia ? undefined : 'Profiles of people who left are visible to all-India HR.'}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className={`${card} p-4`}>
                <h2 className="font-bold text-slate-950">Onboarding pipeline</h2>
                {!report.onboarding ? <p className="mt-3 text-sm text-slate-500">Needs the hrm.onboarding.read permission.</p> : !onboardingEntries.length ? <p className="mt-3 text-sm text-slate-500">No onboarding cases.</p> : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {onboardingEntries.map(([status, count]) => {
                      const content = <><span>{onboardingStatusLabel(status)}</span><span className="rounded-full bg-white px-1.5 text-[11px] font-bold">{count}</span></>;
                      const className = 'inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700';
                      return canOpenOnboarding
                        ? <Link key={status} href={onboardingStatusHref(base, status, { stateId, orgUnitId })} className={`${className} hover:bg-amber-100 hover:text-amber-900`}>{content}</Link>
                        : <span key={status} className={className}>{content}</span>;
                    })}
                  </div>
                )}
              </section>
              <section className={`${card} p-4`}>
                <h2 className="font-bold text-slate-950">Vacant states <span className="text-sm font-semibold text-slate-500">({report.vacantStates.length})</span></h2>
                <p className="mt-1 text-xs text-slate-500">State offices with no working State Manager today.</p>
                {!report.vacantStates.length ? <p className="mt-3 text-sm text-emerald-700">Every state office has a manager.</p> : (
                  <ul className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto">
                    {report.vacantStates.map((office) => (
                      <li key={office.officeId} className="flex items-center justify-between py-2 text-sm">
                        {canReadOrg ? <Link href={officeHref(base, office.officeId)} className="font-semibold text-slate-900 hover:text-amber-700">{office.office}</Link> : <span className="font-semibold text-slate-800">{office.office}</span>}
                        <span className="text-xs text-slate-500">{office.state ?? ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
