'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, BookOpen, CalendarRange, CheckCircle2, ClipboardList, Database, FileText, LockKeyhole, Search, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { financeWorkspaceTabs, getVisibleFinanceWorkspaceGroups, type FinanceWorkspaceTab } from '@/lib/financeWorkspace';
import { financeWorkspaceScreens } from '@/components/financeWorkspace/moduleRegistry';

type FinanceHubHealth = {
  schemaReady: boolean;
  postingMode: 'OFF' | 'SHADOW' | 'LIVE';
  currentFinancialYear: { label: string; quarter: string };
};

const postingModeLabels: Record<FinanceHubHealth['postingMode'], string> = {
  OFF: 'Ledger posting off',
  SHADOW: 'Shadow posting (drafts)',
  LIVE: 'Live posting',
};

const rolePrefix = (pathname: string) => pathname.startsWith('/admin') ? '/admin' : '/employee';

const tabIcons = {
  overview: BookOpen,
  register: BookOpen,
  documents: FileText,
  approvals: ShieldCheck,
  activity: ClipboardList,
} as const;

const getTabIcon = (tab: FinanceWorkspaceTab) => tabIcons[tab.key as keyof typeof tabIcons] || BookOpen;

const renderTabIcon = (tab: FinanceWorkspaceTab, className: string) => {
  const Icon = getTabIcon(tab);
  if (Icon === FileText) return <FileText className={className} />;
  if (Icon === ShieldCheck) return <ShieldCheck className={className} />;
  if (Icon === ClipboardList) return <ClipboardList className={className} />;
  return <BookOpen className={className} />;
};

export default function FinanceWorkspacePage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefix = rolePrefix(pathname);
  const selectedKey = searchParams.get('module');
  const user = useAuthStore((state) => state.user);
  const hasFullAccess = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const permittedGroups = useMemo(
    () => getVisibleFinanceWorkspaceGroups(user?.permissions, hasFullAccess),
    [hasFullAccess, user?.permissions],
  );
  const permittedModules = useMemo(
    () => permittedGroups.flatMap((group) => group.modules.map((module) => ({ ...module, groupKey: group.key, groupLabel: group.label }))),
    [permittedGroups],
  );
  const selectedModule = permittedModules.find((module) => module.key === selectedKey) || permittedModules[0];
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [health, setHealth] = useState<FinanceHubHealth | null>(null);

  useEffect(() => {
    if (!permittedModules.length) return;
    let cancelled = false;
    api.get('/finance-hub/health')
      .then((response) => { if (!cancelled) setHealth(response.data as FinanceHubHealth); })
      .catch(() => { if (!cancelled) setHealth(null); });
    return () => { cancelled = true; };
  }, [permittedModules.length]);

  const visibleGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return permittedGroups;
    return permittedGroups
      .map((group) => ({ ...group, modules: group.modules.filter((module) => `${module.label} ${module.description} ${group.label}`.toLowerCase().includes(normalized)) }))
      .filter((group) => group.modules.length > 0);
  }, [permittedGroups, query]);

  const chooseModule = (key: string) => {
    setActiveTab('overview');
    router.replace(`${prefix}/finance/workspace?module=${encodeURIComponent(key)}`);
  };

  if (!selectedModule) {
    return (
      <div className="min-h-full bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <LockKeyhole className="mx-auto h-9 w-9 text-slate-300" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">No finance workspace access</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Ask a super admin to give your role at least one Finance Workspace permission in Users → Roles.</p>
        </div>
      </div>
    );
  }

  const Screen = financeWorkspaceScreens[selectedModule.key];
  const tabs = selectedModule.tabs || financeWorkspaceTabs;
  const activeTabMeta = tabs.find((tab) => tab.key === activeTab) || tabs[0];
  const linkedPath = selectedModule.existingPath
    ? selectedModule.existingPath.replace('/admin', prefix)
    : null;

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto grid max-w-[1700px] gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div className="border-b border-slate-100 pb-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-600">Finance & Accounts</p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">Financial Reports & CA Workspace</h1>
            <p className="mt-2 text-xs leading-5 text-slate-500">Config-driven menu. Existing finance transactions, imports and deal flows remain linked.</p>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search finance module..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:bg-white" />
            </div>
          </div>
          <nav className="mt-4 space-y-4" aria-label="Financial workspace modules">
            {visibleGroups.map((group) => (
              <section key={group.key}>
                <div className="mb-1 px-2"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{group.label}</p></div>
                <div className="space-y-0.5">
                  {group.modules.map((module) => (
                    <button key={module.key} type="button" onClick={() => chooseModule(module.key)} className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${selectedModule.key === module.key ? 'bg-amber-50 font-semibold text-slate-950 ring-1 ring-amber-200' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
                      <span className="flex items-center justify-between gap-2"><span>{module.label}</span>{financeWorkspaceScreens[module.key] ? <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600">Ready</span> : module.status === 'linked' ? <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">Live</span> : null}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 space-y-5">
          <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-7">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">{selectedModule.groupLabel}</p><h2 className="mt-2 text-2xl font-bold sm:text-3xl">{selectedModule.label}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{selectedModule.description}</p></div>
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300"><LockKeyhole className="h-4 w-4 text-amber-300" /> Permission-controlled workspace</div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-400">Purpose</p><p className="mt-1 text-sm font-semibold text-white">{selectedModule.purpose}</p></div><div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-400">Status</p><p className="mt-1 text-sm font-semibold text-emerald-300">{Screen ? 'Ready to use' : selectedModule.status === 'linked' ? 'Existing flow linked' : 'Planned'}</p></div><div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-400">Control</p><p className="mt-1 text-sm font-semibold text-white">{Screen ? 'Permission-checked, every change audited' : 'Maker-checker + audit planned'}</p></div></div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3" aria-label="Books status">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><CalendarRange className="h-5 w-5 shrink-0 text-amber-600" /><div><p className="text-xs uppercase tracking-wide text-slate-500">Financial year</p><p className="text-sm font-bold text-slate-900">{health ? `${health.currentFinancialYear.label} · ${health.currentFinancialYear.quarter}` : '—'}</p></div></div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Database className={`h-5 w-5 shrink-0 ${health?.schemaReady ? 'text-emerald-600' : 'text-amber-600'}`} /><div><p className="text-xs uppercase tracking-wide text-slate-500">Books database</p><p className="text-sm font-bold text-slate-900">{!health ? 'Checking…' : health.schemaReady ? 'Installed' : 'Setup pending (migration not applied)'}</p></div></div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><ShieldCheck className="h-5 w-5 shrink-0 text-violet-600" /><div><p className="text-xs uppercase tracking-wide text-slate-500">Posting mode</p><p className="text-sm font-bold text-slate-900">{health ? postingModeLabels[health.postingMode] : '—'}</p></div></div>
          </section>

          {Screen ? <Screen /> : (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex gap-1 overflow-x-auto border-b border-slate-100 p-2" role="tablist" aria-label={`${selectedModule.label} workspace tabs`}>
              {tabs.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${activeTab === tab.key ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>{renderTabIcon(tab, 'h-4 w-4')}{tab.label}</button>)}
            </div>
            <div className="p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2">{renderTabIcon(activeTabMeta, 'h-5 w-5 text-amber-600')}<h3 className="text-lg font-bold text-slate-900">{activeTabMeta.label}</h3></div><p className="mt-1 text-sm text-slate-500">{activeTabMeta.description}</p></div>{linkedPath ? <Link href={linkedPath} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-300">Open existing flow <ArrowRight className="h-4 w-4" /></Link> : null}</div>
              <div className="mt-6 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-sm font-bold text-slate-900">Scope defined</p><p className="mt-1 text-xs leading-5 text-slate-500">Fields, filters, documents and action boundaries are recorded in the implementation plan.</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><ClipboardList className="h-5 w-5 text-blue-600" /><p className="mt-3 text-sm font-bold text-slate-900">API-first next step</p><p className="mt-1 text-xs leading-5 text-slate-500">This shell will connect only to validated endpoints and existing records.</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><ShieldCheck className="h-5 w-5 text-violet-600" /><p className="mt-3 text-sm font-bold text-slate-900">Safe by default</p><p className="mt-1 text-xs leading-5 text-slate-500">No destructive action is enabled in the workspace shell.</p></div></div>
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600"><p className="font-semibold text-slate-900">Implementation note</p><p className="mt-1 leading-6">{activeTabMeta.key === 'overview' ? 'Connect KPI cards and quick actions here after the module API and accounting rule are approved.' : `Connect the ${activeTabMeta.label.toLowerCase()} data contract here after field-level permissions and validation rules are approved.`}</p></div>
            </div>
          </section>
          )}

          <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Modules in menu</p><p className="mt-1 text-2xl font-bold text-slate-900">{permittedModules.length}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Existing links preserved</p><p className="mt-1 text-2xl font-bold text-emerald-700">{permittedModules.filter((module) => module.status === 'linked').length}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Groups</p><p className="mt-1 text-2xl font-bold text-slate-900">{permittedGroups.length}</p></div></section>
        </main>
      </div>
    </div>
  );
}
