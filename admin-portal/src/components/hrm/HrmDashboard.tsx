'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BarChart3, BriefcaseBusiness, CalendarDays, ChevronRight, CircleCheck, ClipboardList, Plus, RefreshCw, Search, Users, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { hrmApi, type HrmEmployee, type HrmReach } from '@/lib/hrmApi';
import { describeHrmReachProblem } from '@/lib/hrmAccess';
import HrmKycChips from './HrmKycChips';
import HrmOperationsPanels from './HrmOperationsPanels';
import { formatHrmDate, formatHrmStatus, getHrmErrorMessage, getHrmModulePath, getHrmStatusClass, hasHrmPermission, HRM_EMPLOYEE_MANAGE_PERMISSIONS, HRM_MODULES, type HrmModuleTab } from '@/lib/hrmUi';

type HrmDashboardProps = { portal: 'admin' | 'employee'; initialModule?: HrmOperationsTab };
type HrmOperationsTab = Exclude<HrmModuleTab, 'overview' | 'kyc'>;

const statusOptions = ['', 'DRAFT', 'PRE_ONBOARDING', 'ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'NOTICE_PERIOD', 'EXITED', 'TERMINATED'];
const moduleIcons: LucideIcon[] = [CalendarDays, ClipboardList, BriefcaseBusiness, CircleCheck, AlertCircle];

export default function HrmDashboard({ portal, initialModule = 'attendance' }: HrmDashboardProps) {
  const { user } = useAuthStore();
  const [employees, setEmployees] = useState<HrmEmployee[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [activeModule, setActiveModule] = useState<HrmOperationsTab>(initialModule);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canManageEmployees = hasHrmPermission(user?.permissions, HRM_EMPLOYEE_MANAGE_PERMISSIONS, isSuperAdmin);
  const canReadReports = hasHrmPermission(user?.permissions, ['hrm.employees.read'], isSuperAdmin);
  // Only the modules the viewer may use (the same lists as the sidebar and the page guard).
  const visibleModules = HRM_MODULES.filter((module) => hasHrmPermission(user?.permissions, module.permissions, isSuperAdmin));
  const [reach, setReach] = useState<HrmReach | undefined>(undefined);

  // Only the newest search may write the list: an older, slower answer is ignored.
  const requestRef = useRef(0);
  const loadEmployees = useCallback(async () => {
    const ticket = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const response = await hrmApi.listEmployees({ ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status } : {}) });
      if (ticket !== requestRef.current) return;
      setEmployees(response.data.employees || []);
      setReach(response.data.reach);
    } catch (requestError) {
      if (ticket !== requestRef.current) return;
      setError(getHrmErrorMessage(requestError, 'Unable to load the employee master.'));
    } finally {
      if (ticket === requestRef.current) setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadEmployees(); }, 250);
    return () => window.clearTimeout(timer);
  }, [loadEmployees]);

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter((employee) => employee.status === 'ACTIVE').length,
    onboarding: employees.filter((employee) => employee.status === 'ONBOARDING' || employee.status === 'PRE_ONBOARDING').length,
    pending: employees.filter((employee) => employee.status === 'DRAFT').length,
  }), [employees]);

  // The page guard only opens a section the viewer may use; fall back to the first visible one all the same.
  const selectedModule = visibleModules.find((module) => module.id === activeModule) ?? visibleModules[0] ?? null;
  const selectedId = selectedModule?.id ?? activeModule;
  const reachProblem = describeHrmReachProblem(reach);
  const statCards: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: 'Total employees', value: stats.total, icon: Users },
    { label: 'Active', value: stats.active, icon: BriefcaseBusiness },
    { label: 'Onboarding', value: stats.onboarding, icon: ChevronRight },
    { label: 'Draft records', value: stats.pending, icon: AlertCircle },
  ];

  return (
    <main className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">People operations</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">HRM workspace</h1><p className="mt-1 text-sm text-slate-500">Employee records, attendance, leave, compensation, performance and exit in one controlled workspace.</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => void loadEmployees()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>{canReadReports ? <Link href={`/${portal}/hrm/reports`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><BarChart3 className="h-4 w-4" /> Reports</Link> : null}{canManageEmployees ? <Link href={`/${portal}/hrm?add=1`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Add employee</Link> : null}</div>
        </header>

        {error ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="HRM summary">{statCards.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><Icon className="h-4 w-4 text-amber-500" /></div><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p></div>)}</section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="hrm-modules-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-600">HRM operations</p><h2 id="hrm-modules-title" className="mt-1 font-bold text-slate-950">Open every existing people module</h2><p className="mt-1 text-sm text-slate-500">Choose a module, then open an employee record directly in that workspace.</p></div><p className="text-xs font-medium text-slate-500">Access follows your assigned HRM permissions.</p></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{visibleModules.map((module) => { const Icon = moduleIcons[HRM_MODULES.indexOf(module)] ?? CalendarDays; const selected = selectedId === module.id; return <button key={module.id} type="button" onClick={() => setActiveModule(module.id)} aria-pressed={selected} className={`min-h-32 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${selected ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-slate-50'}`}><Icon className={`h-5 w-5 ${selected ? 'text-amber-700' : 'text-slate-500'}`} /><p className="mt-3 text-sm font-bold text-slate-900">{module.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{module.description}</p></button>; })}</div>
        </section>

        <HrmOperationsPanels portal={portal} />

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Selected workspace</p><h2 className="mt-1 text-sm font-bold text-slate-950">{selectedModule ? `Choose employee for ${selectedModule.label}` : 'Employees'}</h2></div><div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, name or email" className="min-h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">{statusOptions.map((option) => <option key={option} value={option}>{option ? formatHrmStatus(option) : 'All statuses'}</option>)}</select></div>{loading ? <div className="p-10 text-center text-sm text-slate-500">Loading employee records…</div> : employees.length === 0 && reachProblem ? <div role="note" className="m-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>HRM access is not set up for your login.</strong> {reachProblem}</span></div> : employees.length === 0 ? <div className="p-10 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">No employee records found</p><p className="mt-1 text-xs text-slate-500">Add an employee or initiate onboarding, then open {formatHrmStatus(selectedId)} from this list.</p></div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Employee</th><th className="px-4 py-3 font-semibold">Contact</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">KYC</th><th className="px-4 py-3 font-semibold">Joined</th><th className="px-4 py-3 text-right font-semibold">{selectedModule ? `Open ${formatHrmStatus(selectedId)}` : ''}</th></tr></thead><tbody className="divide-y divide-slate-100">{employees.map((employee) => <tr key={employee.id} className="hover:bg-slate-50"><td className="px-4 py-3"><Link href={`/${portal}/hrm/${employee.id}`} className="font-semibold text-slate-900 hover:text-amber-700">{employee.preferredName || employee.legalName}</Link><p className="mt-0.5 text-xs text-slate-500">{employee.employeeCode}</p></td><td className="px-4 py-3 text-slate-600">{employee.workEmail || employee.mobile || '—'}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getHrmStatusClass(employee.status)}`}>{formatHrmStatus(employee.status)}</span></td><td className="px-4 py-3"><HrmKycChips portal={portal} employeeId={employee.id} kyc={employee.kyc} /></td><td className="px-4 py-3 text-slate-600">{formatHrmDate(employee.joinedOn)}</td><td className="px-4 py-3 text-right">{selectedModule ? <Link href={getHrmModulePath(portal, employee.id, selectedModule.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50">Open {formatHrmStatus(selectedModule.id)} <ChevronRight className="h-3.5 w-3.5" /></Link> : null}</td></tr>)}</tbody></table></div>}</section>
      </div>
    </main>
  );
}
