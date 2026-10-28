'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Plus, Search, Star } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { enumLabel, formatDate, formatInr, useFinanceHref, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { financeModulePath, financePortalPrefix, getVisibleFinanceWorkspaceGroups } from '@/lib/financeWorkspace';
import FinancePageHeader from './FinancePageHeader';
import { useFinancePrefs } from './financePrefs';
import { todayIso } from './ledgerLookups';
import type { Month } from './ReportModules';
import { Badge, LoadingState } from './ui';
import { useResource } from './useResource';
import VoucherDetail, { statusTone, type VoucherStatus } from './VoucherDetail';

const MonthBars = dynamic(() => import('./ReportModules').then((module) => module.MonthBars), { ssr: false, loading: () => <div className="h-64" /> });
const CHART = { income: '#2a78d6', costs: '#eb6834' } as const;

const OVERVIEW_READ = ['fh.dashboard.read', 'fh.reports.read', 'fh.ca.read'];
const ALERTS_READ = ['fh.dashboard.read', 'fh.approve', 'fh.books.read', 'fh.ca.read'];
const BOOKS_READ = ['fh.books.read', 'fh.books.manage', 'fh.books.post', 'fh.approve', 'fh.reports.read', 'fh.ca.read'];
const CASH_READ = ['fh.reports.read', 'fh.banking.read', 'fh.books.read', 'fh.ca.read'];
const DUES_READ = ['fh.arap.read', 'fh.arap.manage', 'fh.parties.read', 'fh.parties.manage', 'fh.sales.read', 'fh.purchases.read', 'fh.books.read', 'fh.reports.read', 'fh.ca.read'];

const fyStart = () => {
  const today = todayIso();
  return `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
};

type Overview = { asOf: string; fy: { start: string; label: string }; kpis: { revenue: number; totalIncome: number; expenses: number; grossProfit: number; netProfit: number; cashAndBank: number; receivables: number; payables: number; gstPayable: number; postedLast30Days: number }; trend: Month[]; topDebtors: Array<{ partyId: string; name: string; balance: number }> };
type Alert = { key: string; label: string; count: number; severity: 'high' | 'medium' | 'low'; module: string };
type BankCash = { rows: Array<{ id: string; name: string; kind: string; closing: number }> };
type Schedule = { id: string; side: 'RECEIVABLE' | 'PAYABLE'; party: { name: string }; dueDate: string; amount: number; overdue: boolean };
type VoucherList = { vouchers: Array<{ id: string; number: string | null; type: string; date: string; status: VoucherStatus; narration: string; totalAmount: number; party: { name: string } | null }>; summary: Array<{ status: VoucherStatus; count: number; amount: number }> };

/** Dashboard card: 40px header row with title and an optional link, then the body. */
function Card({ title, href, linkLabel = 'Open', children, className = '' }: { title: string; href?: string; linkLabel?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3">
        <h2 className="truncate text-[13px] font-semibold text-slate-900">{title}</h2>
        {href ? <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-blue-700 hover:underline">{linkLabel}<ArrowUpRight className="h-3.5 w-3.5" /></Link> : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <p className="px-3 py-4 text-[12px] text-slate-500">{children}</p>;

function KpiStrip({ data, href }: { data: Overview; href: ReturnType<typeof useFinanceHref> }) {
  const tiles: Array<[string, number, string]> = [
    ['Revenue', data.kpis.revenue, 'profit-loss'],
    ['Expenses', data.kpis.expenses, 'expense-register'],
    ['Gross profit', data.kpis.grossProfit, 'vehicle-profitability'],
    ['Net profit', data.kpis.netProfit, 'profit-loss'],
    ['Cash & bank', data.kpis.cashAndBank, 'bank-cash-reports'],
    ['Receivables', data.kpis.receivables, 'customer-dues'],
    ['Payables', data.kpis.payables, 'supplier-partner-payables'],
    ['GST payable', data.kpis.gstPayable, 'gst-dashboard'],
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4 2xl:grid-cols-8">
      {tiles.map(([label, value, module]) => (
        <Link key={label} href={href(module)} className="group bg-white px-3 py-2.5 hover:bg-amber-50/50">
          <p className="flex items-center justify-between text-[11px] font-medium text-slate-500">{label}<ArrowUpRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" /></p>
          <p className={`mt-0.5 truncate text-[15px] font-semibold tabular-nums ${value < 0 ? 'text-red-700' : 'text-slate-900'}`}>{formatInr(value)}</p>
        </Link>
      ))}
    </div>
  );
}

/** Finance & Accounts home: books status, KPIs, work queues, cash position and every finance page. */
export default function FinanceDashboard() {
  const pathname = usePathname();
  const router = useRouter();
  const prefix = financePortalPrefix(pathname);
  const href = useFinanceHref();
  const access = useFinanceWorkspaceAccess();
  const user = useAuthStore((state) => state.user);
  const groups = useMemo(() => getVisibleFinanceWorkspaceGroups(user?.permissions, access.fullAccess), [access.fullAccess, user?.permissions]);
  const canExpenses = user?.role === 'SUPER_ADMIN' || hasAnyPermission(user?.permissions || [], ['finance.manage']);

  const canOverview = access.can(OVERVIEW_READ);
  const canBooks = access.can(BOOKS_READ);
  const canCash = access.can(CASH_READ);
  const canDues = access.can(DUES_READ);
  const today = todayIso();

  const overview = useResource(async () => (canOverview ? (await api.get('/finance-hub/dashboard/overview')).data as Overview : null), `dash-overview-${canOverview}`);
  const alerts = useResource(async () => (access.can(ALERTS_READ) ? ((await api.get('/finance-hub/dashboard/alerts')).data as { alerts: Alert[] }).alerts : null), 'dash-alerts');
  const vouchers = useResource(async () => (canBooks ? (await api.get('/finance-hub/vouchers', { params: { page: 1, pageSize: 8 } })).data as VoucherList : null), `dash-vouchers-${canBooks}`);
  const cash = useResource(async () => (canCash ? ((await api.get('/finance-hub/statements/bank-cash', { params: { from: fyStart(), to: today } })).data as BankCash).rows : null), `dash-cash-${canCash}`);
  const schedules = useResource(async () => {
    if (!canDues) return null;
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    return (await api.get('/finance-hub/receivables/schedules', { params: { status: 'PLANNED', to: in30 } })).data.schedules as Schedule[];
  }, `dash-schedules-${canDues}`);

  const prefs = useFinancePrefs();
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const statusCount = (status: VoucherStatus) => vouchers.data?.summary.find((row) => row.status === status)?.count ?? 0;
  const cashRows = (cash.data ?? []).filter((row) => row.kind === 'BANK' || row.kind === 'CASH' || row.kind === 'PETTY_CASH');
  const plannedIn = (schedules.data ?? []).filter((row) => row.side === 'RECEIVABLE').reduce((sum, row) => sum + row.amount, 0);
  const plannedOut = (schedules.data ?? []).filter((row) => row.side === 'PAYABLE').reduce((sum, row) => sum + row.amount, 0);

  const quickActions = [
    access.can(['fh.books.manage']) ? { label: 'Payment', href: href('payment-vouchers', { new: 'PAYMENT' }) } : null,
    access.can(['fh.books.manage']) ? { label: 'Receipt', href: href('receipt-vouchers', { new: 'RECEIPT' }) } : null,
    access.can(['fh.books.manage']) ? { label: 'Journal', href: href('journal-entries', { new: 'JOURNAL' }) } : null,
    access.can(['fh.purchases.manage']) ? { label: 'Purchase bill', href: href('purchase-bills-invoices', { new: 'PURCHASE_BILL' }) } : null,
    canExpenses ? { label: 'Expense', href: `${prefix}/finance/expenses?new=1` } : null,
  ].filter((action): action is { label: string; href: string } => action !== null);

  const directory = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((group) => ({ ...group, modules: group.modules.filter((module) => `${module.label} ${module.description} ${group.label}`.toLowerCase().includes(query)) }))
      .filter((group) => group.modules.length);
  }, [filter, groups]);

  if (!groups.length) {
    return (
      <div className="space-y-3">
        <FinancePageHeader />
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-[15px] font-semibold text-slate-900">No finance workspace access</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">Ask a super admin to give your role at least one Finance Workspace permission in Users → Roles.</p>
        </div>
      </div>
    );
  }

  const queue: Array<[string, number, string, 'red' | 'amber' | 'slate']> = [
    ['Pending approval', statusCount('PENDING_APPROVAL'), href('alerts-pending-approvals'), 'amber'],
    ['Drafts', statusCount('DRAFT'), href('day-book'), 'slate'],
    ['Rejected', statusCount('REJECTED'), href('day-book'), 'red'],
  ];

  return (
    <div className="space-y-3">
      <FinancePageHeader
        actions={quickActions.length ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-[11px] font-medium text-slate-500">New</span>
            {quickActions.map((action) => (
              <Link key={action.label} href={action.href} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-700 hover:border-amber-300 hover:bg-amber-50">
                <Plus className="h-3.5 w-3.5 text-amber-600" />{action.label}
              </Link>
            ))}
          </div>
        ) : null}
      />

      <div className="space-y-3 tabular-nums">
        <section className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
          {prefs.pins.length || prefs.recent.length ? (
            <>
              {prefs.pins.length ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />Pinned</span>
                  {prefs.pins.map((item) => <Link key={item.href} href={item.href} className="inline-flex h-7 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-[12px] font-medium text-slate-800 hover:bg-amber-100">{item.label}</Link>)}
                </div>
              ) : null}
              {prefs.recent.filter((item) => !prefs.isPinned(item.href)).length ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500"><Clock className="h-3.5 w-3.5" />Recent</span>
                  {prefs.recent.filter((item) => !prefs.isPinned(item.href)).slice(0, 6).map((item) => <Link key={item.href} href={item.href} className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-[12px] text-slate-700 hover:border-slate-300 hover:bg-slate-50">{item.label}</Link>)}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-[12px] text-slate-500"><Star className="mr-1 inline h-3.5 w-3.5 text-amber-500" />Pin the pages you use daily with the star in “All finance pages” below — they show up here. Press <kbd className="rounded border border-slate-200 px-1 text-[11px]">Ctrl K</kbd> to jump to any finance page.</p>
          )}
        </section>

        {canOverview ? (overview.loading ? <div className="h-[58px] animate-pulse rounded-lg bg-slate-200/60" /> : overview.data ? <KpiStrip data={overview.data} href={href} /> : null) : null}

        <div className="grid gap-3 xl:grid-cols-12">
          {canOverview ? (
            <Card title="Income vs costs · last 12 months" href={href('profit-loss')} linkLabel="Profit & loss" className="xl:col-span-8">
              <div className="p-3">
                {overview.loading ? <LoadingState /> : overview.data ? (
                  <MonthBars data={overview.data.trend.map((month) => ({ month: month.month, income: month.revenue + month.otherIncome, costs: month.cogs + month.expenses }))} series={[{ key: 'income', name: 'Income', color: CHART.income }, { key: 'costs', name: 'Cost of sales + expenses', color: CHART.costs }]} />
                ) : <Muted>{overview.error || 'Not available.'}</Muted>}
              </div>
            </Card>
          ) : null}

          <div className={`grid content-start gap-3 ${canOverview ? 'xl:col-span-4' : 'xl:col-span-12 md:grid-cols-2'}`}>
            {canBooks ? (
              <Card title="Work queue" href={href('day-book')} linkLabel="Day book">
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  {queue.map(([label, count, link, tone]) => (
                    <Link key={label} href={link} className="px-3 py-2.5 hover:bg-slate-50">
                      <p className="text-[11px] font-medium text-slate-500">{label}</p>
                      <p className={`text-[15px] font-semibold tabular-nums ${count && tone === 'red' ? 'text-red-700' : count && tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{vouchers.loading ? '…' : count}</p>
                    </Link>
                  ))}
                </div>
              </Card>
            ) : null}
            {alerts.data !== null ? (
              <Card title="Needs attention" href={href('alerts-pending-approvals')} linkLabel="All alerts">
                {alerts.loading ? <LoadingState /> : alerts.error ? <Muted>{alerts.error}</Muted> : !alerts.data?.length ? (
                  <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-emerald-700"><CheckCircle2 className="h-4 w-4" />Nothing needs attention.</p>
                ) : (
                  <ul className="max-h-[236px] divide-y divide-slate-100 overflow-y-auto">
                    {alerts.data.map((alert) => (
                      <li key={alert.key}>
                        <Link href={href(alert.module)} className="flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-amber-50/40">
                          <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${alert.severity === 'high' ? 'text-red-600' : alert.severity === 'medium' ? 'text-amber-600' : 'text-slate-400'}`} />
                          <span className="min-w-0 flex-1 truncate text-slate-700">{alert.label}</span>
                          <Badge tone={alert.severity === 'high' ? 'red' : alert.severity === 'medium' ? 'amber' : 'slate'}>{alert.count}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {canCash ? (
            <Card title="Cash & bank balances" href={href('bank-cash-reports')} linkLabel="Report">
              {cash.loading ? <LoadingState /> : cash.error ? <Muted>{cash.error}</Muted> : !cashRows.length ? <Muted>No bank or cash accounts yet.</Muted> : (
                <ul className="divide-y divide-slate-100 text-[13px]">
                  {cashRows.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-1.5"><span className="truncate text-slate-700">{row.name}</span><span className={`shrink-0 font-medium tabular-nums ${row.closing < 0 ? 'text-red-700' : 'text-slate-900'}`}>{formatInr(row.closing)}</span></li>)}
                  <li className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-1.5 font-semibold"><span>Total</span><span className="tabular-nums">{formatInr(cashRows.reduce((sum, row) => sum + row.closing, 0))}</span></li>
                </ul>
              )}
            </Card>
          ) : null}
          {canDues ? (
            <Card title="Next 30 days" href={href('payment-schedules')} linkLabel="Schedules">
              <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
                <div className="px-3 py-2"><p className="text-[11px] font-medium text-emerald-700">Expected in</p><p className="text-[15px] font-semibold tabular-nums">{formatInr(plannedIn)}</p></div>
                <div className="px-3 py-2"><p className="text-[11px] font-medium text-amber-700">Planned out</p><p className="text-[15px] font-semibold tabular-nums">{formatInr(plannedOut)}</p></div>
              </div>
              {schedules.loading ? <LoadingState /> : schedules.error ? <Muted>{schedules.error}</Muted> : !(schedules.data ?? []).length ? <Muted>Nothing scheduled in the next 30 days.</Muted> : (
                <ul className="max-h-[220px] divide-y divide-slate-100 overflow-y-auto text-[13px]">
                  {(schedules.data ?? []).map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="min-w-0 truncate"><span className={`mr-1.5 tabular-nums ${row.overdue ? 'font-medium text-red-700' : 'text-slate-500'}`}>{formatDate(row.dueDate)}</span>{row.party.name}</span>
                      <span className={`shrink-0 font-medium tabular-nums ${row.side === 'RECEIVABLE' ? 'text-emerald-700' : 'text-amber-700'}`}>{row.side === 'RECEIVABLE' ? '+' : '−'}{formatInr(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
          {canOverview ? (
            <Card title="Largest receivables" href={href('customer-dues')} linkLabel="Customer dues">
              {overview.loading ? <LoadingState /> : !overview.data?.topDebtors.length ? <Muted>No outstanding receivables.</Muted> : (
                <ul className="divide-y divide-slate-100 text-[13px]">
                  {overview.data.topDebtors.map((row) => <li key={row.partyId} className="flex items-center justify-between gap-3 px-3 py-1.5"><span className="truncate text-slate-700">{row.name}</span><span className="shrink-0 font-medium tabular-nums">{formatInr(row.balance)}</span></li>)}
                </ul>
              )}
            </Card>
          ) : null}
        </div>

        {canBooks ? (
          <Card title="Recent vouchers" href={href('day-book')} linkLabel="Day book">
            {vouchers.loading ? <LoadingState /> : vouchers.error ? <Muted>{vouchers.error}</Muted> : !vouchers.data?.vouchers.length ? <Muted>No vouchers yet.</Muted> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="bg-slate-50 text-[11px] font-medium text-slate-500"><tr><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Number</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Party / narration</th><th className="px-3 py-2 text-right font-medium">Amount</th><th className="px-3 py-2 font-medium">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {vouchers.data.vouchers.map((voucher) => (
                      <tr key={voucher.id} onClick={() => setOpenVoucher(voucher.id)} className="h-9 cursor-pointer hover:bg-amber-50/40">
                        <td className="whitespace-nowrap px-3 tabular-nums text-slate-600">{formatDate(voucher.date)}</td>
                        <td className="px-3 font-mono text-[12px] font-medium text-slate-900">{voucher.number ?? <span className="font-sans text-slate-400">Draft</span>}</td>
                        <td className="px-3 text-slate-700">{enumLabel(voucher.type)}</td>
                        <td className="max-w-[420px] truncate px-3 text-slate-700">{voucher.party?.name ? <span className="font-medium text-slate-900">{voucher.party.name} · </span> : null}{voucher.narration}</td>
                        <td className="px-3 text-right font-medium tabular-nums">{formatInr(voucher.totalAmount)}</td>
                        <td className="px-3"><Badge tone={statusTone[voucher.status]}>{enumLabel(voucher.status)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[13px] font-semibold text-slate-900">All finance pages</h2>
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a page…" className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-[13px] outline-none focus:border-amber-400 focus:bg-white" />
            </div>
          </div>
          {!directory.length ? <Muted>No page matches “{filter}”.</Muted> : (
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {directory.map((group) => (
                <div key={group.key} id={group.key} className="scroll-mt-4 bg-white px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{group.label}</p>
                  <ul className="mt-1">
                    {group.modules.map((module) => {
                      const moduleHref = financeModulePath(prefix, module.key);
                      const pinned = prefs.isPinned(moduleHref);
                      return (
                        <li key={module.key} className="group/item -mx-1 flex items-center rounded hover:bg-amber-50">
                          <Link href={moduleHref} title={module.description} className="min-w-0 flex-1 truncate px-1 py-0.5 text-[13px] text-slate-700 group-hover/item:text-slate-950">{module.label}</Link>
                          <button type="button" onClick={() => prefs.togglePin({ href: moduleHref, label: module.label, group: group.label })} title={pinned ? 'Unpin' : 'Pin to quick access'} aria-pressed={pinned} className={`shrink-0 rounded p-0.5 ${pinned ? 'text-amber-500' : 'text-slate-300 opacity-0 hover:text-amber-500 focus:opacity-100 group-hover/item:opacity-100'}`}>
                            <Star className={`h-3.5 w-3.5 ${pinned ? 'fill-amber-400' : ''}`} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {openVoucher ? (
        <VoucherDetail
          key={openVoucher}
          voucherId={openVoucher}
          onClose={() => setOpenVoucher(null)}
          onChanged={vouchers.reload}
          onOpen={setOpenVoucher}
          onEdit={() => router.push(href('day-book'))}
        />
      ) : null}
    </div>
  );
}
