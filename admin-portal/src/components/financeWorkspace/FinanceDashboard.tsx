'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import {
  enumLabel,
  formatDate,
  formatInr,
  useFinanceHref,
  useFinanceWorkspaceAccess,
} from '@/lib/financeWorkspaceClient';
import {
  financeModulePath,
  financePortalPrefix,
  getVisibleFinanceWorkspaceGroups,
} from '@/lib/financeWorkspace';
import FinancePageHeader from './FinancePageHeader';
import { useFinancePrefs } from './financePrefs';
import { todayIso } from './ledgerLookups';
import type { Month } from './ReportModules';
import { Badge, LoadingState, StatusDot } from './ui';
import { useResource } from './useResource';
import VoucherDetail, { statusTone, type VoucherStatus } from './VoucherDetail';

const MonthBars = dynamic(
  () => import('./ReportModules').then((module) => module.MonthBars),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-lg bg-slate-100" /> },
);
const CHART = { income: '#2563eb', costs: '#ea580c' } as const;

const OVERVIEW_READ = ['fh.dashboard.read', 'fh.reports.read', 'fh.ca.read'];
const ALERTS_READ = ['fh.dashboard.read', 'fh.approve', 'fh.books.read', 'fh.ca.read'];
const BOOKS_READ = [
  'fh.books.read',
  'fh.books.manage',
  'fh.books.post',
  'fh.approve',
  'fh.reports.read',
  'fh.ca.read',
];
const CASH_READ = ['fh.reports.read', 'fh.banking.read', 'fh.books.read', 'fh.ca.read'];
const DUES_READ = [
  'fh.arap.read',
  'fh.arap.manage',
  'fh.parties.read',
  'fh.parties.manage',
  'fh.sales.read',
  'fh.purchases.read',
  'fh.books.read',
  'fh.reports.read',
  'fh.ca.read',
];

const fyStart = () => {
  const today = todayIso();
  return `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
};

type Overview = {
  asOf: string;
  fy: { start: string; label: string };
  kpis: {
    revenue: number;
    totalIncome: number;
    expenses: number;
    grossProfit: number;
    netProfit: number;
    cashAndBank: number;
    receivables: number;
    payables: number;
    gstPayable: number;
    postedLast30Days: number;
  };
  trend: Month[];
  topDebtors: Array<{ partyId: string; name: string; balance: number }>;
};
type Alert = { key: string; label: string; count: number; severity: 'high' | 'medium' | 'low'; module: string };
type BankCash = { rows: Array<{ id: string; name: string; kind: string; closing: number }> };
type Schedule = {
  id: string;
  side: 'RECEIVABLE' | 'PAYABLE';
  party: { name: string };
  dueDate: string;
  amount: number;
  overdue: boolean;
};
type VoucherList = {
  vouchers: Array<{
    id: string;
    number: string | null;
    type: string;
    date: string;
    status: VoucherStatus;
    narration: string;
    totalAmount: number;
    party: { name: string } | null;
  }>;
  summary: Array<{ status: VoucherStatus; count: number; amount: number }>;
};

/** Dashboard Card: Header with title, badge/link, and body. */
function Card({
  title,
  subtitle,
  href,
  linkLabel = 'View report',
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs ${className}`}
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50/70 via-slate-50/20 to-white px-3.5 sm:px-4">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle && <p className="truncate text-[11px] text-slate-500">{subtitle}</p>}
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-amber-600 transition hover:text-amber-700 hover:underline"
          >
            {linkLabel}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

const Muted = ({ children }: { children: ReactNode }) => (
  <p className="px-3.5 py-6 text-center text-[12px] text-slate-500">{children}</p>
);

/** High-density Executive 8-KPI Strip */
function KpiStrip({ data, href }: { data: Overview; href: ReturnType<typeof useFinanceHref> }) {
  const tiles: Array<{
    label: string;
    value: number;
    module: string;
    tone: 'emerald' | 'amber' | 'rose' | 'sky' | 'slate';
    hint?: string;
  }> = [
    { label: 'Revenue', value: data.kpis.revenue, module: 'profit-loss', tone: 'emerald' },
    { label: 'Total Expenses', value: data.kpis.expenses, module: 'expense-register', tone: 'rose' },
    { label: 'Gross Profit', value: data.kpis.grossProfit, module: 'vehicle-profitability', tone: 'emerald' },
    { label: 'Net Profit', value: data.kpis.netProfit, module: 'profit-loss', tone: data.kpis.netProfit >= 0 ? 'emerald' : 'rose' },
    { label: 'Cash & Bank', value: data.kpis.cashAndBank, module: 'bank-cash-reports', tone: 'sky' },
    { label: 'Receivables', value: data.kpis.receivables, module: 'customer-dues', tone: 'amber' },
    { label: 'Payables', value: data.kpis.payables, module: 'supplier-partner-payables', tone: 'slate' },
    { label: 'GST Liability', value: data.kpis.gstPayable, module: 'gst-dashboard', tone: 'slate' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-8">
      {tiles.map((tile) => {
        const isNegative = tile.value < 0;
        return (
          <Link
            key={tile.label}
            href={href(tile.module)}
            className="group relative overflow-hidden rounded-xl border border-slate-200/90 bg-white p-3 transition-all duration-150 hover:border-amber-400 hover:shadow-2xs active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {tile.label}
              </span>
              <ArrowUpRight className="h-3 w-3 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-amber-600" />
            </div>
            <p
              className={`mt-1 truncate text-[15px] sm:text-[16px] font-semibold tracking-tight tabular-nums ${
                isNegative ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              {formatInr(tile.value)}
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  tile.tone === 'emerald'
                    ? 'bg-emerald-500'
                    : tile.tone === 'rose'
                    ? 'bg-rose-500'
                    : tile.tone === 'amber'
                    ? 'bg-amber-500'
                    : 'bg-sky-500'
                }`}
              />
              <span className="text-[10px] font-medium text-slate-400">View ledger ›</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** Finance & Accounts Command Center */
export default function FinanceDashboard() {
  const pathname = usePathname();
  const router = useRouter();
  const prefix = financePortalPrefix(pathname);
  const href = useFinanceHref();
  const access = useFinanceWorkspaceAccess();
  const user = useAuthStore((state) => state.user);
  const groups = useMemo(
    () => getVisibleFinanceWorkspaceGroups(user?.permissions, access.fullAccess),
    [access.fullAccess, user?.permissions],
  );
  const canExpenses =
    user?.role === 'SUPER_ADMIN' || hasAnyPermission(user?.permissions || [], ['finance.manage']);

  const canOverview = access.can(OVERVIEW_READ);
  const canBooks = access.can(BOOKS_READ);
  const canCash = access.can(CASH_READ);
  const canDues = access.can(DUES_READ);
  const today = todayIso();

  const overview = useResource(
    async () =>
      canOverview ? ((await api.get('/finance-hub/dashboard/overview')).data as Overview) : null,
    `dash-overview-${canOverview}`,
  );
  const alerts = useResource(
    async () =>
      access.can(ALERTS_READ)
        ? ((await api.get('/finance-hub/dashboard/alerts')).data as { alerts: Alert[] }).alerts
        : null,
    'dash-alerts',
  );
  const vouchers = useResource(
    async () =>
      canBooks
        ? ((await api.get('/finance-hub/vouchers', { params: { page: 1, pageSize: 8 } }))
            .data as VoucherList)
        : null,
    `dash-vouchers-${canBooks}`,
  );
  const cash = useResource(
    async () =>
      canCash
        ? ((
            await api.get('/finance-hub/statements/bank-cash', {
              params: { from: fyStart(), to: today },
            })
          ).data as BankCash).rows
        : null,
    `dash-cash-${canCash}`,
  );
  const schedules = useResource(async () => {
    if (!canDues) return null;
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    return (
      await api.get('/finance-hub/receivables/schedules', {
        params: { status: 'PLANNED', to: in30 },
      })
    ).data.schedules as Schedule[];
  }, `dash-schedules-${canDues}`);

  const prefs = useFinancePrefs();
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const statusCount = (status: VoucherStatus) =>
    vouchers.data?.summary.find((row) => row.status === status)?.count ?? 0;
  const cashRows = (cash.data ?? []).filter(
    (row) => row.kind === 'BANK' || row.kind === 'CASH' || row.kind === 'PETTY_CASH',
  );
  const totalCashBank = cashRows.reduce((sum, row) => sum + row.closing, 0);
  const plannedIn = (schedules.data ?? [])
    .filter((row) => row.side === 'RECEIVABLE')
    .reduce((sum, row) => sum + row.amount, 0);
  const plannedOut = (schedules.data ?? [])
    .filter((row) => row.side === 'PAYABLE')
    .reduce((sum, row) => sum + row.amount, 0);

  const quickActions = [
    access.can(['fh.books.manage'])
      ? { label: 'Payment Voucher', href: href('payment-vouchers', { new: 'PAYMENT' }), primary: true }
      : null,
    access.can(['fh.books.manage'])
      ? { label: 'Receipt Voucher', href: href('receipt-vouchers', { new: 'RECEIPT' }), primary: false }
      : null,
    access.can(['fh.books.manage'])
      ? { label: 'Journal Entry', href: href('journal-entries', { new: 'JOURNAL' }), primary: false }
      : null,
    access.can(['fh.purchases.manage'])
      ? { label: 'Purchase Bill', href: href('purchase-bills-invoices', { new: 'PURCHASE_BILL' }), primary: false }
      : null,
    canExpenses
      ? { label: 'Record Expense', href: `${prefix}/finance/expenses?new=1`, primary: false }
      : null,
    access.can(['fh.banking.manage'])
      ? { label: 'Bank Reconciliation', href: href('bank-reconciliation'), primary: false }
      : null,
  ].filter((action): action is { label: string; href: string; primary: boolean } => action !== null);

  const directory = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((group) => ({
        ...group,
        modules: group.modules.filter((module) =>
          `${module.label} ${module.description} ${group.label}`.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.modules.length);
  }, [filter, groups]);

  if (!groups.length) {
    return (
      <div className="space-y-3">
        <FinancePageHeader />
        <div className="rounded-xl border border-slate-200/90 bg-white p-8 text-center shadow-2xs">
          <p className="text-[15px] font-semibold text-slate-900">No finance workspace access</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">
            Ask a super admin to give your role at least one Finance Workspace permission in Users → Roles.
          </p>
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
      {/* Executive Command Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200/80">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-[14px] font-semibold tracking-tight text-slate-900">
              Finance & Accounts Command Center
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <StatusDot tone="green" pulse /> Books Active
              </span>
              <span>·</span>
              <span>FY 2026–27</span>
              <span>·</span>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-mono text-[10px]">
                Ctrl+K Quick Jump
              </kbd>
            </div>
          </div>
        </div>

        {/* Quick Action Launchpad */}
        <div className="flex flex-wrap items-center gap-1.5">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={`inline-flex h-7.5 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition-all duration-150 ${
                action.primary
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-semibold shadow-2xs hover:from-amber-300 hover:to-amber-400'
                  : 'border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-medium'
              }`}
            >
              <Plus className="h-3.5 w-3.5 text-amber-700" />
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-3 tabular-nums">
        {/* Pinned & Quick Access Ribbon */}
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 shadow-2xs">
          {prefs.pins.length || prefs.recent.length ? (
            <div className="flex flex-wrap items-center gap-3">
              {prefs.pins.length ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                    Pinned
                  </span>
                  {prefs.pins.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex h-6.5 items-center rounded-md border border-amber-200 bg-amber-50/70 px-2 text-[11.5px] font-medium text-slate-800 transition hover:bg-amber-100"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}

              {prefs.recent.filter((item) => !prefs.isPinned(item.href)).length ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    Recent
                  </span>
                  {prefs.recent
                    .filter((item) => !prefs.isPinned(item.href))
                    .slice(0, 5)
                    .map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="inline-flex h-6.5 items-center rounded-md border border-slate-200/80 px-2 text-[11.5px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        {item.label}
                      </Link>
                    ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] text-slate-500">
              <Star className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
              Pin pages you use daily for instant 1-click access. Press{' '}
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10.5px]">Ctrl K</kbd> to open
              any page.
            </p>
          )}

          <div className="hidden sm:block text-[11px] text-slate-400 font-medium">
            Press <kbd className="rounded border border-slate-200 px-1 text-[10px]">/</kbd> on any page to search
          </div>
        </section>

        {/* 8-Tile Executive Metric Strip */}
        {canOverview ? (
          overview.loading ? (
            <div className="h-16 animate-pulse rounded-xl bg-slate-200/60" />
          ) : overview.data ? (
            <KpiStrip data={overview.data} href={href} />
          ) : null
        ) : null}

        {/* 3-Column Balanced Operational Grid */}
        <div className="grid gap-3 xl:grid-cols-12">
          {/* Main Chart: Income vs Costs (8 cols) */}
          {canOverview ? (
            <Card
              title="Income vs Costs · Last 12 Months"
              subtitle="Revenue and other operating income compared with acquisition cost & overheads"
              href={href('profit-loss')}
              linkLabel="Full P&L"
              className="xl:col-span-8"
            >
              <div className="p-3.5">
                {overview.loading ? (
                  <LoadingState />
                ) : overview.data ? (
                  <MonthBars
                    data={overview.data.trend.map((month) => ({
                      month: month.month,
                      income: month.revenue + month.otherIncome,
                      costs: month.cogs + month.expenses,
                    }))}
                    series={[
                      { key: 'income', name: 'Total Income', color: CHART.income },
                      { key: 'costs', name: 'Costs & Expenses', color: CHART.costs },
                    ]}
                  />
                ) : (
                  <Muted>{overview.error || 'Performance metrics not available.'}</Muted>
                )}
              </div>
            </Card>
          ) : null}

          {/* Right Rail: Action Queue & Needs Attention (4 cols) */}
          <div className={`grid content-start gap-3 ${canOverview ? 'xl:col-span-4' : 'xl:col-span-12 md:grid-cols-2'}`}>
            {canBooks ? (
              <Card title="Daily Work Queue" subtitle="Action items requiring review" href={href('day-book')} linkLabel="Day Book">
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  {queue.map(([label, count, link, tone]) => (
                    <Link key={label} href={link} className="p-3 text-center transition hover:bg-slate-50/80">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{label}</p>
                      <p
                        className={`mt-1 text-[18px] font-bold tabular-nums ${
                          count && tone === 'red'
                            ? 'text-rose-600'
                            : count && tone === 'amber'
                            ? 'text-amber-600'
                            : 'text-slate-800'
                        }`}
                      >
                        {vouchers.loading ? '…' : count}
                      </p>
                    </Link>
                  ))}
                </div>
              </Card>
            ) : null}

            {alerts.data !== null ? (
              <Card
                title="Needs Attention"
                subtitle="High-priority alerts & compliance warnings"
                href={href('alerts-pending-approvals')}
                linkLabel="View all"
              >
                {alerts.loading ? (
                  <LoadingState />
                ) : alerts.error ? (
                  <Muted>{alerts.error}</Muted>
                ) : !alerts.data?.length ? (
                  <p className="flex items-center gap-2 p-4 text-[13px] font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    All operational queues and compliance items are clear.
                  </p>
                ) : (
                  <ul className="max-h-[220px] divide-y divide-slate-100 overflow-y-auto">
                    {alerts.data.map((alert) => (
                      <li key={alert.key}>
                        <Link
                          href={href(alert.module)}
                          className="flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] transition hover:bg-amber-50/40"
                        >
                          <AlertTriangle
                            className={`h-3.5 w-3.5 shrink-0 ${
                              alert.severity === 'high'
                                ? 'text-rose-600'
                                : alert.severity === 'medium'
                                ? 'text-amber-600'
                                : 'text-slate-400'
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{alert.label}</span>
                          <Badge tone={alert.severity === 'high' ? 'red' : alert.severity === 'medium' ? 'amber' : 'slate'}>
                            {alert.count}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}
          </div>
        </div>

        {/* 3-Column Operational Health & Liquidity Strip */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {/* Bank & Cash Balances */}
          {canCash ? (
            <Card
              title="Liquid Bank & Cash Balances"
              subtitle={`Total: ${formatInr(totalCashBank)}`}
              href={href('bank-cash-reports')}
              linkLabel="Accounts report"
            >
              {cash.loading ? (
                <LoadingState />
              ) : cash.error ? (
                <Muted>{cash.error}</Muted>
              ) : !cashRows.length ? (
                <Muted>No bank or cash accounts configured yet.</Muted>
              ) : (
                <ul className="divide-y divide-slate-100 text-[12.5px]">
                  {cashRows.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
                      <span className="truncate font-medium text-slate-700">{row.name}</span>
                      <span
                        className={`shrink-0 font-semibold tabular-nums ${
                          row.closing < 0 ? 'text-rose-700' : 'text-slate-900'
                        }`}
                      >
                        {formatInr(row.closing)}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 bg-slate-50/70 px-3.5 py-2 text-[13px] font-bold">
                    <span>Total Liquid Position</span>
                    <span className="tabular-nums text-slate-950">{formatInr(totalCashBank)}</span>
                  </li>
                </ul>
              )}
            </Card>
          ) : null}

          {/* 30-Day Liquidity Forecast */}
          {canDues ? (
            <Card
              title="Next 30 Days Forecast"
              subtitle="Scheduled inflows vs commitments"
              href={href('payment-schedules')}
              linkLabel="View schedules"
            >
              <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
                <div className="p-3">
                  <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                    <TrendingUp className="h-3 w-3" /> Expected In
                  </p>
                  <p className="mt-0.5 text-[16px] font-bold tabular-nums text-emerald-950">
                    {formatInr(plannedIn)}
                  </p>
                </div>
                <div className="p-3">
                  <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-rose-700">
                    <TrendingDown className="h-3 w-3" /> Planned Out
                  </p>
                  <p className="mt-0.5 text-[16px] font-bold tabular-nums text-rose-950">
                    {formatInr(plannedOut)}
                  </p>
                </div>
              </div>
              {schedules.loading ? (
                <LoadingState />
              ) : schedules.error ? (
                <Muted>{schedules.error}</Muted>
              ) : !(schedules.data ?? []).length ? (
                <Muted>No payments or receipts scheduled for the next 30 days.</Muted>
              ) : (
                <ul className="max-h-[200px] divide-y divide-slate-100 overflow-y-auto text-[12.5px]">
                  {(schedules.data ?? []).map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 px-3.5 py-1.5">
                      <span className="min-w-0 truncate">
                        <span
                          className={`mr-1.5 tabular-nums text-[11px] ${
                            row.overdue ? 'font-semibold text-rose-700' : 'text-slate-500'
                          }`}
                        >
                          {formatDate(row.dueDate)}
                        </span>
                        <span className="text-slate-800">{row.party.name}</span>
                      </span>
                      <span
                        className={`shrink-0 font-semibold tabular-nums ${
                          row.side === 'RECEIVABLE' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {row.side === 'RECEIVABLE' ? '+' : '−'}
                        {formatInr(row.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {/* Top Outstanding Debtors */}
          {canOverview ? (
            <Card
              title="Largest Receivables"
              subtitle="Customers with highest balance due"
              href={href('customer-dues')}
              linkLabel="All customer dues"
            >
              {overview.loading ? (
                <LoadingState />
              ) : !overview.data?.topDebtors.length ? (
                <Muted>No outstanding receivables.</Muted>
              ) : (
                <ul className="divide-y divide-slate-100 text-[12.5px]">
                  {overview.data.topDebtors.map((row) => (
                    <li key={row.partyId} className="flex items-center justify-between gap-3 px-3.5 py-2">
                      <span className="truncate font-medium text-slate-800">{row.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                        {formatInr(row.balance)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>

        {/* Live Recent Vouchers Activity Table */}
        {canBooks ? (
          <Card
            title="Recent Vouchers & Journal Activity"
            subtitle="Real-time transaction posting log"
            href={href('day-book')}
            linkLabel="Open Day Book"
          >
            {vouchers.loading ? (
              <LoadingState />
            ) : vouchers.error ? (
              <Muted>{vouchers.error}</Muted>
            ) : !vouchers.data?.vouchers.length ? (
              <Muted>No vouchers recorded in this period.</Muted>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[12.5px]">
                  <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3.5 py-2">Date</th>
                      <th className="px-3.5 py-2">Voucher #</th>
                      <th className="px-3.5 py-2">Type</th>
                      <th className="px-3.5 py-2">Party / Narration</th>
                      <th className="px-3.5 py-2 text-right">Amount</th>
                      <th className="px-3.5 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vouchers.data.vouchers.map((voucher) => (
                      <tr
                        key={voucher.id}
                        onClick={() => setOpenVoucher(voucher.id)}
                        className="cursor-pointer transition-colors hover:bg-amber-50/40"
                      >
                        <td className="whitespace-nowrap px-3.5 py-2 tabular-nums text-slate-600">
                          {formatDate(voucher.date)}
                        </td>
                        <td className="px-3.5 py-2 font-mono text-[12px] font-semibold text-slate-900">
                          {voucher.number ?? <span className="font-sans font-normal text-slate-400">Draft</span>}
                        </td>
                        <td className="px-3.5 py-2 font-medium text-slate-700">
                          {enumLabel(voucher.type)}
                        </td>
                        <td className="max-w-[380px] truncate px-3.5 py-2 text-slate-700">
                          {voucher.party?.name ? (
                            <span className="font-semibold text-slate-900">{voucher.party.name} · </span>
                          ) : null}
                          {voucher.narration}
                        </td>
                        <td className="px-3.5 py-2 text-right font-semibold tabular-nums text-slate-900">
                          {formatInr(voucher.totalAmount)}
                        </td>
                        <td className="px-3.5 py-2">
                          <Badge tone={statusTone[voucher.status]}>{enumLabel(voucher.status)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}

        {/* Complete Finance Modules Directory with Search Filter */}
        <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="flex flex-col gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50/70 via-slate-50/20 to-white px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight text-slate-900">
                All Finance & Accounts Modules
              </h2>
              <p className="text-[11px] text-slate-500">
                Comprehensive directory across all 15 operational finance domains
              </p>
            </div>
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter 96+ finance pages…"
                className="h-8 w-full rounded-lg border border-slate-200/90 bg-white pl-8 pr-2.5 text-[12.5px] outline-none transition hover:border-slate-300 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 shadow-2xs"
              />
            </div>
          </div>

          {!directory.length ? (
            <Muted>No finance page matches “{filter}”.</Muted>
          ) : (
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {directory.map((group) => (
                <div key={group.key} id={group.key} className="scroll-mt-4 bg-white p-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {group.label}
                    </p>
                    <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-500">
                      {group.modules.length}
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {group.modules.map((module) => {
                      const moduleHref = financeModulePath(prefix, module.key);
                      const pinned = prefs.isPinned(moduleHref);
                      return (
                        <li
                          key={module.key}
                          className="group/item flex items-center justify-between rounded-md px-1.5 py-1 transition hover:bg-amber-50/60"
                        >
                          <Link
                            href={moduleHref}
                            title={module.description}
                            className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700 transition group-hover/item:text-slate-950 font-medium"
                          >
                            {module.label}
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              prefs.togglePin({
                                href: moduleHref,
                                label: module.label,
                                group: group.label,
                              })
                            }
                            title={pinned ? 'Unpin from quick access' : 'Pin to quick access'}
                            aria-pressed={pinned}
                            className={`shrink-0 rounded p-1 transition ${
                              pinned
                                ? 'text-amber-500'
                                : 'text-slate-300 opacity-0 hover:text-amber-500 focus:opacity-100 group-hover/item:opacity-100'
                            }`}
                          >
                            <Star className={`h-3 w-3 ${pinned ? 'fill-amber-400' : ''}`} />
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
