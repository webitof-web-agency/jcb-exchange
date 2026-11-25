'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronRight, Download, LayoutGrid, List, Loader2, Mail, Phone, Plus, RefreshCw, Search, UserRound, Users, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import SearchableSelect from '@/components/ui/SearchableSelect';
import HistoryPagination from '@/components/ui/HistoryPagination';
import { hrmApi, type HrmDirectoryQuery, type HrmDirectoryResponse, type HrmEmployee } from '@/lib/hrmApi';
import {
  DEFAULT_DIRECTORY_FILTERS,
  DIRECTORY_PAGE_SIZES,
  ARCHIVED_TAB,
  DIRECTORY_TABS,
  EMPLOYMENT_TYPE_OPTIONS,
  countActiveFilters,
  employeesToCsv,
  getAvatarTone,
  getAssignmentLocation,
  getEmployeeDisplayName,
  getInitials,
  getTabCount,
  hasAnyDirectoryFilter,
  nextSort,
  parseDirectoryParams,
  toDirectoryApiQuery,
  toDirectorySearch,
  type DirectoryFilters,
  type DirectorySort,
} from '@/lib/hrmDirectory';
import { formatHrmDate, formatHrmStatus, getHrmErrorMessage, getHrmStatusClass, hasHrmPermission, HRM_EMPLOYEE_MANAGE_PERMISSIONS } from '@/lib/hrmUi';
import { describeHrmReachProblem } from '@/lib/hrmAccess';
import HrmAddEmployeeDialog from './HrmAddEmployeeDialog';
import HrmKycChips from './HrmKycChips';

type Portal = 'admin' | 'employee';

const EXPORT_LIMIT = 5000;
const SORT_OPTIONS = [
  { id: 'createdAt:desc', name: 'Newest first' },
  { id: 'name:asc', name: 'Name A–Z' },
  { id: 'name:desc', name: 'Name Z–A' },
  { id: 'joinedOn:desc', name: 'Joined: latest' },
  { id: 'joinedOn:asc', name: 'Joined: earliest' },
  { id: 'status:asc', name: 'Status' },
] as const;
const isPlaceholderOption = (id: string | number) => String(id).startsWith('__current__:');

function EmployeeAvatar({ employee, size = 'md' }: { employee: HrmEmployee; size?: 'md' | 'lg' }) {
  const name = getEmployeeDisplayName(employee);
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full font-bold ${getAvatarTone(employee.id)} ${size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-xs'}`}>
      {getInitials(name)}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getHrmStatusClass(status)}`}>{formatHrmStatus(status)}</span>;
}

function AssignmentSummary({ employee }: { employee: HrmEmployee }) {
  const assignment = employee.currentAssignment;
  if (!assignment) return <span className="text-xs italic text-slate-500" title="No active assignment yet">Not assigned</span>;
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-slate-800">{assignment.designation}</p>
      <p className="truncate text-xs text-slate-500">{assignment.orgUnit?.name ?? '—'}{assignment.employmentType ? ` · ${formatHrmStatus(assignment.employmentType)}` : ''}</p>
      {getAssignmentLocation(assignment) ? <p className="truncate text-xs text-slate-500">{getAssignmentLocation(assignment)}</p> : null}
    </div>
  );
}

function SortHeader({ label, column, filters, onSort, className = '' }: { label: string; column: DirectorySort; filters: DirectoryFilters; onSort: (column: DirectorySort) => void; className?: string }) {
  const active = filters.sort === column;
  const Icon = !active ? ArrowUpDown : filters.order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (filters.order === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-4 py-3 font-semibold ${className}`}>
      <button type="button" onClick={() => onSort(column)} className={`inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-slate-900 ${active ? 'text-slate-900' : ''}`}>
        {label}<Icon className={`h-3 w-3 ${active ? 'text-amber-600' : 'text-slate-300'}`} />
      </button>
    </th>
  );
}

function EmployeeCard({ employee, href, portal }: { employee: HrmEmployee; href: string; portal: Portal }) {
  return (
    <li className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md">
      <div className="flex items-start gap-3">
        <EmployeeAvatar employee={employee} size="lg" />
        <div className="min-w-0 flex-1">
          <Link href={href} className="block truncate font-bold text-slate-950 after:absolute after:inset-0 after:rounded-2xl group-hover:text-amber-700">{getEmployeeDisplayName(employee)}</Link>
          <p className="text-xs text-slate-500">{employee.employeeCode}</p>
        </div>
        <StatusChip status={employee.status} />
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-slate-600">
        <p className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{employee.currentAssignment?.designation ?? 'Not assigned'}</span></p>
        <p className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{employee.currentAssignment?.orgUnit?.name ?? '—'}{getAssignmentLocation(employee.currentAssignment) ? ` · ${getAssignmentLocation(employee.currentAssignment)}` : ''}</span></p>
        <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{employee.workEmail ?? '—'}</span></p>
        <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{employee.mobile ?? '—'}</span></p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="relative z-10"><HrmKycChips portal={portal} employeeId={employee.id} kyc={employee.kyc} /></div>
        <span className="text-[11px] text-slate-500">Joined {formatHrmDate(employee.joinedOn)}</span>
      </div>
    </li>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div role="status" className="divide-y divide-slate-100">
      <span className="sr-only">Loading employees…</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-3 px-4 py-3.5">
          <span className="h-9 w-9 rounded-full bg-slate-100" />
          <span className="flex-1 space-y-2"><span className="block h-3 w-40 rounded bg-slate-100" /><span className="block h-2.5 w-24 rounded bg-slate-100" /></span>
          <span className="hidden h-3 w-32 rounded bg-slate-100 md:block" />
          <span className="h-5 w-16 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

/**
 * Employee directory for HRM: status tabs with counts, search, filters, sortable table or card view, and
 * server-side paging. All of it lives in the URL, so a refreshed or shared link shows the same list.
 */
export default function HrmEmployeeDirectory({ portal }: { portal: Portal }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canAddEmployee = hasHrmPermission(user?.permissions, HRM_EMPLOYEE_MANAGE_PERMISSIONS, isSuperAdmin);
  // Export only pages through GET /hrm/employees, so it needs exactly what the list needs.
  const canExport = hasHrmPermission(user?.permissions, ['hrm.employees.read'], isSuperAdmin);

  const filters = useMemo(() => parseDirectoryParams(searchParams), [searchParams]);
  const [data, setData] = useState<HrmDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  // The search box keeps its own text while typing and writes it to the URL after a short pause.
  const [searchText, setSearchText] = useState(filters.q);
  const [urlQuery, setUrlQuery] = useState(filters.q);
  const [sentQuery, setSentQuery] = useState(filters.q);
  if (urlQuery !== filters.q) {
    setUrlQuery(filters.q);
    // The URL changed to something this box did not send (back/forward, sidebar link): adopt it.
    if (filters.q !== sentQuery) {
      setSearchText(filters.q);
      setSentQuery(filters.q);
    }
  }

  const [showCreate, setShowCreate] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  // router.replace commits a moment later. Until it does, changes build on the filters last asked for,
  // so two quick changes (or Clear followed by a pending search) cannot undo each other.
  const pendingRef = useRef<DirectoryFilters | null>(null);
  useEffect(() => { pendingRef.current = null; }, [searchParams]);

  const navigate = useCallback((next: DirectoryFilters) => {
    pendingRef.current = next;
    const query = toDirectorySearch(next);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router]);

  const update = useCallback((patch: Partial<DirectoryFilters>) => {
    navigate({ ...(pendingRef.current ?? filters), ...patch, page: patch.page ?? 1 });
  }, [filters, navigate]);

  useEffect(() => {
    const value = searchText.trim();
    const asked = pendingRef.current ? pendingRef.current.q : filters.q;
    if (value === asked) return undefined;
    const timer = window.setTimeout(() => {
      setSentQuery(value);
      update({ q: value });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText, filters.q, update]);

  const queryKey = JSON.stringify(toDirectoryApiQuery(filters));
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await hrmApi.listEmployees(JSON.parse(queryKey) as HrmDirectoryQuery);
        if (!cancelled) setData(response.data);
      } catch (requestError) {
        if (!cancelled) setError(getHrmErrorMessage(requestError, 'Unable to load the employee directory.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [queryKey, reloadKey]);

  // A filter can shrink the list below the page in the URL; move to the last page that exists.
  const totalPages = data?.pagination?.totalPages;
  useEffect(() => {
    if (totalPages && filters.page > totalPages) update({ page: totalPages });
  }, [totalPages, filters.page, update]);

  const employees = data?.employees ?? [];
  // An empty list because the login has no HR profile / no access scope (not because there is nobody): say why.
  const reachProblem = describeHrmReachProblem(data?.reach);
  const total = data?.pagination?.total ?? 0;
  const activeFilterCount = countActiveFilters(filters);
  const anyFilter = hasAnyDirectoryFilter(filters);
  const showCards = filters.view === 'cards';

  const departmentOptions = useMemo(() => (data?.facets?.departments ?? []).map((unit) => ({ id: unit.id, name: unit.name })), [data?.facets?.departments]);
  const designationOptions = useMemo(() => (data?.facets?.designations ?? []).map((name) => ({ id: name, name })), [data?.facets?.designations]);
  const typeOptions = useMemo(() => EMPLOYMENT_TYPE_OPTIONS.map((value) => ({ id: value, name: formatHrmStatus(value) })), []);
  const kycOptions = useMemo(() => [{ id: 'complete', name: 'KYC complete' }, { id: 'pending', name: 'KYC pending' }], []);

  const clearAll = () => {
    setSearchText('');
    setSentQuery('');
    navigate({ ...DEFAULT_DIRECTORY_FILTERS, view: filters.view, sort: filters.sort, order: filters.order, limit: filters.limit });
  };

  const profileHref = (employee: HrmEmployee) => `/${portal}/hrm/${encodeURIComponent(employee.id)}`;

  const openCreate = () => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShowCreate(true);
  };

  // ?add=1 (for example from the HRM workspace) opens Add employee once.
  const addRequested = searchParams.get('add') === '1';
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the dialog the link asked for
    if (addRequested && canAddEmployee) setShowCreate(true);
  }, [addRequested, canAddEmployee]);
  const archivedView = filters.tab === ARCHIVED_TAB;
  const closeCreate = useCallback(() => {
    setShowCreate(false);
    openerRef.current?.focus();
  }, []);

  // A new employee shows up straight away: back to page 1, no filters, newest first.
  const handleCreated = useCallback(() => {
    setSearchText('');
    setSentQuery('');
    navigate({ ...DEFAULT_DIRECTORY_FILTERS, view: filters.view, limit: filters.limit });
    setReloadKey((value) => value + 1);
  }, [filters.limit, filters.view, navigate]);

  // A department or designation was created, renamed, switched off or deleted from the Add Employee form: the names in the
  // list and in the filter choices (both come with the same answer) are read again, even if the form is then cancelled.
  const handleListsChanged = useCallback(() => setReloadKey((value) => value + 1), []);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: HrmEmployee[] = [];
      const base = JSON.parse(queryKey) as HrmDirectoryQuery;
      let page = 1;
      let pages = 1;
      let matching = 0;
      do {
        const response = await hrmApi.listEmployees({ ...base, page, limit: 100 });
        rows.push(...response.data.employees);
        pages = response.data.pagination?.totalPages ?? 1;
        matching = response.data.pagination?.total ?? rows.length;
        page += 1;
      } while (page <= pages && rows.length < EXPORT_LIMIT);
      const blob = new Blob(['﻿', employeesToCsv(rows)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hrm-employees-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (rows.length < matching) toast.warn(`Exported the first ${rows.length} of ${matching} employees. Narrow the filters to export the rest.`);
      else toast.success(`Exported ${rows.length} employee${rows.length === 1 ? '' : 's'}.`);
    } catch (requestError) {
      toast.error(getHrmErrorMessage(requestError, 'Unable to export the directory.'));
    } finally {
      setExporting(false);
    }
  };

  const toolbarSelect = 'w-full sm:w-44';

  return (
    <main className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">People operations</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Employee directory</h1>
            <p aria-live="polite" className="mt-1 text-sm text-slate-500">
              {!data?.pagination ? 'Every employee record in one place.' : anyFilter ? `${total} ${total === 1 ? 'employee matches' : 'employees match'} your filters` : `${total} ${total === 1 ? 'employee' : 'employees'} you can access`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {canExport ? (
              <button type="button" onClick={() => void exportCsv()} disabled={exporting || loading || total === 0} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export
              </button>
            ) : null}
            {canAddEmployee ? (
              <button type="button" onClick={openCreate} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" /> Add employee
              </button>
            ) : null}
          </div>
        </header>

        <section ref={sectionRef} className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Employee directory">
          <nav aria-label="Employee status" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-2">
            {DIRECTORY_TABS.map((tab) => {
              const count = getTabCount(tab.id, data?.counts, data?.archivedTotal);
              const selected = filters.tab === tab.id;
              return (
                <button key={tab.id || 'all'} type="button" aria-current={selected ? 'true' : undefined} onClick={() => update({ tab: tab.id })} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${selected ? 'border-amber-500 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  {tab.label}
                  {count !== null ? <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${selected ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{count}</span> : null}
                </button>
              );
            })}
          </nav>
          {archivedView ? (
            <p className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs leading-5 text-slate-600" role="note">Never joined — kept for history. These records are read-only: the joining was cancelled, nothing was deleted.</p>
          ) : null}

          <div className="flex flex-col gap-3 border-b border-slate-100 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:max-w-xs sm:flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search name, code, email or mobile"
                  aria-label="Search employees"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
                {searchText ? (
                  <button type="button" onClick={() => setSearchText('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
                ) : null}
              </div>
              <SearchableSelect options={departmentOptions} value={filters.orgUnitId} displayValue={departmentOptions.find((option) => option.id === filters.orgUnitId)?.name ?? ''} loading={!data && Boolean(filters.orgUnitId)} onChange={(option) => { if (!isPlaceholderOption(option.id)) update({ orgUnitId: String(option.id) }); }} placeholder="Department" size="sm" clearable onClear={() => update({ orgUnitId: '' })} className={toolbarSelect} disabled={!departmentOptions.length && !filters.orgUnitId} />
              <SearchableSelect options={designationOptions} value={filters.designation} onChange={(option) => { if (!isPlaceholderOption(option.id)) update({ designation: String(option.id) }); }} placeholder="Designation" size="sm" clearable onClear={() => update({ designation: '' })} className={toolbarSelect} disabled={!designationOptions.length && !filters.designation} />
              <SearchableSelect options={typeOptions} value={filters.employmentType} onChange={(option) => { if (!isPlaceholderOption(option.id)) update({ employmentType: String(option.id) }); }} placeholder="Employment type" size="sm" clearable onClear={() => update({ employmentType: '' })} className={toolbarSelect} />
              <SearchableSelect options={kycOptions} value={filters.kyc} onChange={(option) => { if (!isPlaceholderOption(option.id)) update({ kyc: option.id === 'complete' ? 'complete' : 'pending' }); }} placeholder="KYC status" size="sm" clearable onClear={() => update({ kyc: '' })} className={toolbarSelect} />
              <SearchableSelect options={[...SORT_OPTIONS]} value={`${filters.sort}:${filters.order}`} displayValue={SORT_OPTIONS.find((option) => option.id === `${filters.sort}:${filters.order}`)?.name ?? 'Sort'} onChange={(option) => { const [sort, order] = String(option.id).split(':'); if (sort && order) update({ sort: sort as DirectorySort, order: order === 'asc' ? 'asc' : 'desc' }); }} placeholder="Sort by" size="sm" searchable={false} className={`${toolbarSelect} ${showCards ? '' : 'md:hidden'}`} />
              {anyFilter ? (
                <button type="button" onClick={clearAll} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                  <X className="h-3.5 w-3.5" /> Clear{activeFilterCount ? ` (${activeFilterCount})` : ''}
                </button>
              ) : null}
            </div>
            <div className="hidden shrink-0 self-start rounded-lg border border-slate-200 p-0.5 md:inline-flex" role="group" aria-label="Directory layout">
              {([['table', 'Table view', List], ['cards', 'Card view', LayoutGrid]] as const).map(([view, label, Icon]) => (
                <button key={view} type="button" aria-pressed={filters.view === view} aria-label={label} title={label} onClick={() => update({ view, page: filters.page })} className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${filters.view === view ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div role="alert" className="m-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
              <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="self-start rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 sm:self-auto">Try again</button>
            </div>
          ) : null}

          {error ? null : loading && employees.length === 0 ? (
            <LoadingRows count={Math.min(filters.limit, 8)} />
          ) : employees.length === 0 && reachProblem ? (
            <div role="note" className="m-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong>HRM access is not set up for your login.</strong> {reachProblem}</span>
            </div>
          ) : employees.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Users className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-800">{anyFilter ? 'No employees match these filters' : 'No employees yet'}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{anyFilter ? 'Try a different search or remove a filter.' : 'Add an employee or start onboarding from a recruitment offer to build the directory.'}</p>
              {anyFilter ? (
                <button type="button" onClick={clearAll} className="mt-4 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Clear filters</button>
              ) : canAddEmployee ? (
                <button type="button" onClick={openCreate} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"><Plus className="h-3.5 w-3.5" /> Add employee</button>
              ) : null}
            </div>
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
              {!showCards ? (
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <SortHeader label="Employee" column="name" filters={filters} onSort={(column) => update(nextSort(filters, column))} />
                        <th scope="col" className="px-4 py-3 font-semibold">Role &amp; department</th>
                        <th scope="col" className="hidden px-4 py-3 font-semibold xl:table-cell">Reporting to</th>
                        <th scope="col" className="hidden px-4 py-3 font-semibold lg:table-cell">Contact</th>
                        <SortHeader label="Status" column="status" filters={filters} onSort={(column) => update(nextSort(filters, column))} />
                        <th scope="col" className="px-4 py-3 font-semibold">KYC</th>
                        <SortHeader label="Joined" column="joinedOn" filters={filters} onSort={(column) => update(nextSort(filters, column))} className="hidden xl:table-cell" />
                        <th scope="col" className="w-8 px-2 py-3"><span className="sr-only">Open</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {employees.map((employee) => (
                        <tr key={employee.id} onClick={() => router.push(profileHref(employee))} className="cursor-pointer transition hover:bg-amber-50/40">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <EmployeeAvatar employee={employee} />
                              <div className="min-w-0">
                                <Link href={profileHref(employee)} onClick={(event) => event.stopPropagation()} className="block truncate font-semibold text-slate-900 hover:text-amber-700">{getEmployeeDisplayName(employee)}</Link>
                                <p className="text-xs text-slate-500">{employee.employeeCode}</p>
                              </div>
                            </div>
                          </td>
                          <td className="max-w-[16rem] px-4 py-3"><AssignmentSummary employee={employee} /></td>
                          <td className="hidden px-4 py-3 text-slate-600 xl:table-cell">{employee.currentAssignment?.managerEmployee?.legalName ?? '—'}</td>
                          <td className="hidden max-w-[14rem] px-4 py-3 lg:table-cell">
                            <p className="truncate text-slate-700">{employee.workEmail ?? '—'}</p>
                            <p className="text-xs text-slate-500">{employee.mobile ?? ''}</p>
                          </td>
                          <td className="px-4 py-3"><StatusChip status={employee.status} /></td>
                          <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><HrmKycChips portal={portal} employeeId={employee.id} kyc={employee.kyc} /></td>
                          <td className="hidden whitespace-nowrap px-4 py-3 text-slate-600 xl:table-cell">{formatHrmDate(employee.joinedOn)}</td>
                          <td className="px-2 py-3 text-slate-300"><ChevronRight className="h-4 w-4" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <ul className={`grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3 ${showCards ? '' : 'md:hidden'}`}>
                {employees.map((employee) => <EmployeeCard key={employee.id} employee={employee} href={profileHref(employee)} portal={portal} />)}
              </ul>
            </div>
          )}

          {!error && data?.pagination && total > 0 ? (
            <div className="px-4 pb-3">
              <HistoryPagination
                page={data.pagination.page}
                pageSize={data.pagination.limit}
                total={total}
                totalPages={data.pagination.totalPages}
                pageSizes={[...DIRECTORY_PAGE_SIZES]}
                disabled={loading}
                onPageChange={(page) => { update({ page }); sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}
                onPageSizeChange={(limit) => update({ limit })}
              />
            </div>
          ) : null}
        </section>

      </div>

      {showCreate && canAddEmployee ? <HrmAddEmployeeDialog portal={portal} allIndia={data?.reach?.allIndia} onClose={closeCreate} onCreated={handleCreated} onListsChanged={handleListsChanged} /> : null}
    </main>
  );
}
