'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronRight, Download, Printer } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '@/lib/api';
import { enumLabel, formatDate, formatInr, useFinanceHref } from '@/lib/financeWorkspaceClient';
import { todayIso } from './ledgerLookups';
import { downloadCsv } from './TaxModules';
import { Badge, Button, DatePresets, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Panel, tableHeadClass, Tabs } from './ui';
import { useResource } from './useResource';

// Chart colours: first three slots of the validated categorical palette (safe for every pair).
export const SERIES = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a' } as const;
const fyStart = () => {
  const today = todayIso();
  return `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
};
const compact = (value: number) => (Math.abs(value) >= 10000000 ? `${(value / 10000000).toFixed(1)}Cr` : Math.abs(value) >= 100000 ? `${(value / 100000).toFixed(1)}L` : Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(Math.round(value)));

type Line = { line: string; amount: number; accounts: Array<{ id: string; code: string; name: string; amount: number }> };
type ProfitLoss = { from: string; to: string; income: Line[]; totalIncome: number; expenses: Line[]; totalExpenses: number; profitBeforeTax: number; tax: Line; profitAfterTax: number; grossProfit: number; grossMarginPercent: number | null; previous: (Omit<ProfitLoss, 'previous'>) | null };

const RangeBar = ({ range, onChange, extra }: { range: { from: string; to: string }; onChange: (range: { from: string; to: string }) => void; extra?: React.ReactNode }) => (
  <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
    <Field label="From"><input type="date" value={range.from} onChange={(event) => onChange({ ...range, from: event.target.value })} className={inputClass} /></Field>
    <Field label="To"><input type="date" value={range.to} onChange={(event) => onChange({ ...range, to: event.target.value })} className={inputClass} /></Field>
    <DatePresets from={range.from} to={range.to} onSelect={onChange} />
    {extra}
  </div>
);

/** Statement rows with drill-down to ledgers. */
const StatementRows = ({ lines, previous, open, toggle }: { lines: Line[]; previous?: Line[]; open: Set<string>; toggle: (key: string) => void }) => (
  <>
    {lines.map((line) => {
      const before = previous?.find((item) => item.line === line.line)?.amount;
      return (
        <Fragment key={line.line}>
          <tr className="hover:bg-slate-50">
            <td className="px-3 py-2"><button type="button" onClick={() => toggle(line.line)} disabled={!line.accounts.length} className="inline-flex items-center gap-1 text-left disabled:cursor-default">{line.accounts.length ? (open.has(line.line) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}{line.line}</button></td>
            <td className="px-3 py-2 text-right">{formatInr(line.amount)}</td>
            {previous ? <td className="px-3 py-2 text-right text-slate-500">{formatInr(before ?? 0)}</td> : null}
          </tr>
          {open.has(line.line) ? line.accounts.map((account) => (
            <tr key={account.id} className="text-xs text-slate-500"><td className="px-3 py-1 pl-12"><span className="font-mono">{account.code}</span> {account.name}</td><td className="px-3 py-1 text-right">{formatInr(account.amount)}</td>{previous ? <td /> : null}</tr>
          )) : null}
        </Fragment>
      );
    })}
  </>
);

const printArea = (id: string, title: string) => {
  const element = document.getElementById(id);
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!element || !win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:12px system-ui,sans-serif;margin:24px;color:#0f172a}table{width:100%;border-collapse:collapse}td,th{padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:left}td:nth-child(n+2),th:nth-child(n+2){text-align:right}button{all:unset}svg{display:none}</style></head><body><h2>${title}</h2>${element.outerHTML}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
};

/** Statement of profit and loss (Schedule III layout) with previous-year comparison. */
export function ProfitLossModule() {
  const [range, setRange] = useState({ from: fyStart(), to: todayIso() });
  const [compare, setCompare] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const data = useResource(async () => (await api.get('/finance-hub/statements/profit-loss', { params: { ...range, compare: compare ? 'previous-year' : undefined } })).data as ProfitLoss, `pl-${range.from}-${range.to}-${compare}`);
  const toggle = (key: string) => setOpen((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const pl = data.data;
  const exportCsv = () => pl && downloadCsv(`profit-loss-${range.from}-${range.to}.csv`, ['Section', 'Line', 'Ledger', 'Amount'], [...pl.income.flatMap((line) => line.accounts.map((account) => ['Income', line.line, `${account.code} ${account.name}`, account.amount])), ...pl.expenses.flatMap((line) => line.accounts.map((account) => ['Expenses', line.line, `${account.code} ${account.name}`, account.amount])), ['Result', 'Profit before tax', '', pl.profitBeforeTax], ['Result', 'Tax expense', '', pl.tax.amount], ['Result', 'Profit after tax', '', pl.profitAfterTax]]);
  return (
    <Panel title="Profit & loss" description="Statement of profit and loss from posted entries, in the Schedule III order. Click a line for its ledgers." actions={pl ? <><Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>CSV</Button><Button icon={<Printer className="h-4 w-4" />} onClick={() => printArea('pl-table', `Profit & loss ${formatDate(range.from)} – ${formatDate(range.to)}`)}>Print</Button></> : null}>
      <RangeBar range={range} onChange={setRange} extra={<label className="flex items-center gap-2 pb-3 text-[13px]"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} className="h-4 w-4 accent-amber-500" />Compare with previous year</label>} />
      {data.loading ? <LoadingState /> : data.error || !pl ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : (
        <div className="p-3">
          <div className="mb-3 grid gap-3 sm:grid-cols-4">
            {[['Total income', pl.totalIncome], ['Gross profit', pl.grossProfit], ['Profit before tax', pl.profitBeforeTax], ['Profit after tax', pl.profitAfterTax]].map(([label, value]) => <div key={label as string} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className={`text-[15px] font-semibold ${(value as number) < 0 ? 'text-red-700' : ''}`}>{formatInr(value as number)}</p></div>)}
          </div>
          <table id="pl-table" className="w-full max-w-3xl text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2" /><th className="px-3 py-2 text-right">{formatDate(pl.from)} – {formatDate(pl.to)}</th>{pl.previous ? <th className="px-3 py-2 text-right">Previous year</th> : null}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><td className="px-3 py-2" colSpan={pl.previous ? 3 : 2}>Income</td></tr>
              <StatementRows lines={pl.income} previous={pl.previous?.income} open={open} toggle={toggle} />
              <tr className="font-semibold"><td className="px-3 py-2">Total income</td><td className="px-3 py-2 text-right">{formatInr(pl.totalIncome)}</td>{pl.previous ? <td className="px-3 py-2 text-right text-slate-500">{formatInr(pl.previous.totalIncome)}</td> : null}</tr>
              <tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><td className="px-3 py-2" colSpan={pl.previous ? 3 : 2}>Expenses</td></tr>
              <StatementRows lines={pl.expenses} previous={pl.previous?.expenses} open={open} toggle={toggle} />
              <tr className="font-semibold"><td className="px-3 py-2">Total expenses</td><td className="px-3 py-2 text-right">{formatInr(pl.totalExpenses)}</td>{pl.previous ? <td className="px-3 py-2 text-right text-slate-500">{formatInr(pl.previous.totalExpenses)}</td> : null}</tr>
              <tr className="font-semibold"><td className="px-3 py-2">Profit before tax</td><td className="px-3 py-2 text-right">{formatInr(pl.profitBeforeTax)}</td>{pl.previous ? <td className="px-3 py-2 text-right text-slate-500">{formatInr(pl.previous.profitBeforeTax)}</td> : null}</tr>
              <StatementRows lines={[pl.tax]} previous={pl.previous ? [pl.previous.tax] : undefined} open={open} toggle={toggle} />
              <tr className="bg-slate-900 font-semibold text-white"><td className="px-3 py-2">Profit after tax</td><td className="px-3 py-2 text-right">{formatInr(pl.profitAfterTax)}</td>{pl.previous ? <td className="px-3 py-2 text-right">{formatInr(pl.previous.profitAfterTax)}</td> : null}</tr>
            </tbody>
          </table>
          {pl.grossMarginPercent !== null ? <p className="mt-3 text-xs text-slate-500">Gross margin on revenue from operations: {pl.grossMarginPercent}%</p> : null}
        </div>
      )}
    </Panel>
  );
}

type Sheet = { asOf: string; assets: Line[]; totalAssets: number; liabilities: Line[]; totalLiabilities: number; equity: { accounts: Line['accounts']; profitForPeriod: number; total: number }; totalEquityAndLiabilities: number; difference: number; previous: Omit<Sheet, 'previous'> | null };

/** Balance sheet at a date; profit not yet closed to retained earnings is shown inside equity. */
export function BalanceSheetModule() {
  const [asOf, setAsOf] = useState(todayIso());
  const [compare, setCompare] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const data = useResource(async () => (await api.get('/finance-hub/statements/balance-sheet', { params: { asOf, compare: compare ? 'previous-year' : undefined } })).data as Sheet, `bs-${asOf}-${compare}`);
  const toggle = (key: string) => setOpen((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const sheet = data.data;
  const prev = sheet?.previous;
  return (
    <Panel title="Balance sheet" description="Assets, equity and liabilities at a date. A non-zero difference means the books do not balance (check opening balances and the Suspense account)." actions={sheet ? <Button icon={<Printer className="h-4 w-4" />} onClick={() => printArea('bs-table', `Balance sheet as at ${formatDate(asOf)}`)}>Print</Button> : null}>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
        <Field label="As at"><input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={inputClass} /></Field>
        <label className="flex items-center gap-2 pb-3 text-[13px]"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} className="h-4 w-4 accent-amber-500" />Compare with last year end</label>
      </div>
      {data.loading ? <LoadingState /> : data.error || !sheet ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : (
        <div className="p-3">
          {sheet.difference ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">Assets differ from equity + liabilities by {formatInr(sheet.difference)}.</p> : <Badge tone="green">Balanced</Badge>}
          <table id="bs-table" className="mt-3 w-full max-w-3xl text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2" /><th className="px-3 py-2 text-right">As at {formatDate(sheet.asOf)}</th>{prev ? <th className="px-3 py-2 text-right">As at {formatDate(prev.asOf)}</th> : null}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><td className="px-3 py-2" colSpan={prev ? 3 : 2}>Equity and liabilities</td></tr>
              <tr><td className="px-3 py-2">Capital and reserves</td><td className="px-3 py-2 text-right">{formatInr(sheet.equity.total - sheet.equity.profitForPeriod)}</td>{prev ? <td className="px-3 py-2 text-right text-slate-500">{formatInr(prev.equity.total - prev.equity.profitForPeriod)}</td> : null}</tr>
              <tr><td className="px-3 py-2">Profit not yet transferred to reserves</td><td className="px-3 py-2 text-right">{formatInr(sheet.equity.profitForPeriod)}</td>{prev ? <td className="px-3 py-2 text-right text-slate-500">{formatInr(prev.equity.profitForPeriod)}</td> : null}</tr>
              <StatementRows lines={sheet.liabilities} previous={prev?.liabilities} open={open} toggle={toggle} />
              <tr className="font-semibold"><td className="px-3 py-2">Total equity and liabilities</td><td className="px-3 py-2 text-right">{formatInr(sheet.totalEquityAndLiabilities)}</td>{prev ? <td className="px-3 py-2 text-right text-slate-500">{formatInr(prev.totalEquityAndLiabilities)}</td> : null}</tr>
              <tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><td className="px-3 py-2" colSpan={prev ? 3 : 2}>Assets</td></tr>
              <StatementRows lines={sheet.assets} previous={prev?.assets} open={open} toggle={toggle} />
              <tr className="font-semibold"><td className="px-3 py-2">Total assets</td><td className="px-3 py-2 text-right">{formatInr(sheet.totalAssets)}</td>{prev ? <td className="px-3 py-2 text-right text-slate-500">{formatInr(prev.totalAssets)}</td> : null}</tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

type CashFlow = { from: string; to: string; sections: Array<{ category: 'OPERATING' | 'INVESTING' | 'FINANCING'; lines: Array<{ line: string; inflow: number; outflow: number; net: number }>; net: number }>; net: number; opening: number; closing: number; difference: number };
const CATEGORY_LABEL = { OPERATING: 'Operating activities', INVESTING: 'Investing activities', FINANCING: 'Financing activities' } as const;

/** Cash flow statement (direct method) for cash and bank balances. */
export function CashFlowStatementModule() {
  const [range, setRange] = useState({ from: fyStart(), to: todayIso() });
  const data = useResource(async () => (await api.get('/finance-hub/statements/cash-flow', { params: range })).data as CashFlow, `cf-${range.from}-${range.to}`);
  const flow = data.data;
  return (
    <Panel title="Cash flow statement" description="Direct method: every receipt and payment of cash and bank, grouped by what it was for. Opening + net flow = closing cash.">
      <RangeBar range={range} onChange={setRange} />
      {data.loading ? <LoadingState /> : data.error || !flow ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : (
        <div className="p-3">
          <table className="w-full max-w-3xl text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2" /><th className="px-3 py-2 text-right">In</th><th className="px-3 py-2 text-right">Out</th><th className="px-3 py-2 text-right">Net</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="font-semibold"><td className="px-3 py-2">Opening cash and bank</td><td /><td /><td className="px-3 py-2 text-right">{formatInr(flow.opening)}</td></tr>
              {flow.sections.map((section) => (
                <Fragment key={section.category}>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><td className="px-3 py-2" colSpan={4}>{CATEGORY_LABEL[section.category]}</td></tr>
                  {section.lines.map((line) => <tr key={line.line}><td className="px-3 py-2 pl-8">{line.line}</td><td className="px-3 py-2 text-right">{line.inflow ? formatInr(line.inflow) : ''}</td><td className="px-3 py-2 text-right">{line.outflow ? formatInr(line.outflow) : ''}</td><td className="px-3 py-2 text-right">{formatInr(line.net)}</td></tr>)}
                  <tr className="font-semibold"><td className="px-3 py-2">Net cash from {CATEGORY_LABEL[section.category].toLowerCase()}</td><td /><td /><td className="px-3 py-2 text-right">{formatInr(section.net)}</td></tr>
                </Fragment>
              ))}
              <tr className="font-semibold"><td className="px-3 py-2">Closing cash and bank</td><td /><td /><td className="px-3 py-2 text-right">{formatInr(flow.closing)}</td></tr>
            </tbody>
          </table>
          {flow.difference ? <p className="mt-3 text-[13px] text-red-700">Unexplained difference {formatInr(flow.difference)}.</p> : null}
        </div>
      )}
    </Panel>
  );
}

type Pivot = { months: string[]; rows: Array<{ key: string; label: string; months: Record<string, number>; total: number }>; total: number; measure: string; by: string };

const PivotTable = ({ pivot, name }: { pivot: Pivot; name: string }) => (
  <>
    <div className="flex justify-end px-3 pt-3"><Button icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`${name}.csv`, ['Row', ...pivot.months, 'Total'], pivot.rows.map((row) => [row.label, ...pivot.months.map((month) => row.months[month] ?? 0), row.total]))}>CSV</Button></div>
    {!pivot.rows.length ? <EmptyState title="Nothing in this period" /> : (
      <div className="overflow-x-auto p-3">
        <table className="w-full text-left text-xs">
          <thead className={tableHeadClass}><tr><th className="px-3 py-2">{pivot.by === 'party' || pivot.measure === 'PURCHASE' ? 'Party' : pivot.by === 'vehicle' ? 'Vehicle' : 'Ledger'}</th>{pivot.months.map((month) => <th key={month} className="whitespace-nowrap px-3 py-2 text-right">{month}</th>)}<th className="px-3 py-2 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {pivot.rows.map((row) => <tr key={row.key}><td className="max-w-[240px] truncate px-3 py-1.5" title={row.label}>{row.label}</td>{pivot.months.map((month) => <td key={month} className="whitespace-nowrap px-3 py-1.5 text-right">{row.months[month] ? formatInr(row.months[month]) : ''}</td>)}<td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold">{formatInr(row.total)}</td></tr>)}
            <tr className="font-semibold"><td className="px-3 py-2">Total</td>{pivot.months.map((month) => <td key={month} className="whitespace-nowrap px-3 py-2 text-right">{formatInr(pivot.rows.reduce((sum, row) => sum + (row.months[month] ?? 0), 0))}</td>)}<td className="whitespace-nowrap px-3 py-2 text-right">{formatInr(pivot.total)}</td></tr>
          </tbody>
        </table>
      </div>
    )}
  </>
);

type RevenueTab = 'income-ledger' | 'income-party' | 'income-vehicle' | 'purchase-party';

/** Revenue by ledger / customer / vehicle and purchases by supplier, month by month. */
export function RevenuePurchaseModule() {
  const [tab, setTab] = useState<RevenueTab>('income-ledger');
  const [range, setRange] = useState({ from: fyStart(), to: todayIso() });
  const params = tab === 'purchase-party' ? { measure: 'PURCHASE', by: 'party' } : { measure: 'INCOME', by: tab === 'income-party' ? 'party' : tab === 'income-vehicle' ? 'vehicle' : 'account' };
  const data = useResource(async () => (await api.get('/finance-hub/statements/pivot', { params: { ...params, ...range } })).data as Pivot, `pivot-${tab}-${range.from}-${range.to}`);
  return (
    <Panel title="Revenue & purchase reports" description="Month-by-month comparison from posted entries.">
      <Tabs<RevenueTab> tabs={[{ key: 'income-ledger', label: 'Revenue by ledger' }, { key: 'income-party', label: 'Revenue by customer' }, { key: 'income-vehicle', label: 'Revenue by vehicle' }, { key: 'purchase-party', label: 'Purchases by supplier' }]} active={tab} onChange={setTab} />
      <RangeBar range={range} onChange={setRange} />
      {data.loading ? <LoadingState /> : data.error || !data.data ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : <PivotTable pivot={data.data} name={`${tab}-${range.from}-${range.to}`} />}
    </Panel>
  );
}

export type Month = { month: string; revenue: number; otherIncome: number; cogs: number; expenses: number; profit: number; cashIn: number; cashOut: number };

const MoneyTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) =>
  active && payload?.length ? (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-900">{label}</p>
      {payload.map((item) => <p key={item.name} className="flex items-center gap-2 text-slate-700"><span className="inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}: {formatInr(item.value)}</p>)}
    </div>
  ) : null;

/** Two-series monthly bar chart (legend + tooltip; the table below carries the exact numbers). */
export const MonthBars = ({ data, series }: { data: Array<Record<string, number | string>>; series: Array<{ key: string; name: string; color: string }> }) => (
  <div className="h-64 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: '#f1f5f9' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        {series.map((item) => <Bar key={item.key} dataKey={item.key} name={item.name} fill={item.color} radius={[4, 4, 0, 0]} maxBarSize={22} />)}
      </BarChart>
    </ResponsiveContainer>
  </div>
);

/** Margin trend (revenue, cost of sales, expenses, profit) and expense mix by ledger. */
export function ExpenseMarginModule() {
  const [range, setRange] = useState({ from: fyStart(), to: todayIso() });
  const trend = useResource(async () => (await api.get('/finance-hub/statements/trend', { params: range })).data as { months: Month[] }, `trend-${range.from}-${range.to}`);
  const pivot = useResource(async () => (await api.get('/finance-hub/statements/pivot', { params: { measure: 'EXPENSE', by: 'account', ...range } })).data as Pivot, `expense-pivot-${range.from}-${range.to}`);
  const months = trend.data?.months ?? [];
  return (
    <Panel title="Expense & margin analysis" description="Gross margin (revenue − cost of vehicles sold) and net margin after expenses, month by month, with the expense mix.">
      <RangeBar range={range} onChange={setRange} />
      {trend.loading ? <LoadingState /> : trend.error ? <ErrorBanner message={trend.error} schemaMissing={trend.schemaMissing} /> : (
        <div className="p-3">
          <MonthBars data={months.map((month) => ({ month: month.month, income: month.revenue + month.otherIncome, costs: month.cogs + month.expenses }))} series={[{ key: 'income', name: 'Income', color: SERIES.blue }, { key: 'costs', name: 'Cost of sales + expenses', color: SERIES.orange }]} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={tableHeadClass}><tr><th className="px-3 py-2 text-left">Month</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Cost of sales</th><th className="px-3 py-2 text-right">Gross margin</th><th className="px-3 py-2 text-right">Expenses</th><th className="px-3 py-2 text-right">Net profit</th><th className="px-3 py-2 text-right">Net margin</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {months.map((month) => {
                  const income = month.revenue + month.otherIncome;
                  return <tr key={month.month}><td className="px-3 py-1.5">{month.month}</td><td className="px-3 py-1.5 text-right">{formatInr(month.revenue)}</td><td className="px-3 py-1.5 text-right">{formatInr(month.cogs)}</td><td className="px-3 py-1.5 text-right">{month.revenue ? `${Math.round(((month.revenue - month.cogs) / month.revenue) * 100)}%` : '—'}</td><td className="px-3 py-1.5 text-right">{formatInr(month.expenses)}</td><td className={`px-3 py-1.5 text-right font-semibold ${month.profit < 0 ? 'text-red-700' : ''}`}>{formatInr(month.profit)}</td><td className="px-3 py-1.5 text-right">{income ? `${Math.round((month.profit / income) * 100)}%` : '—'}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="border-t border-slate-100"><p className="px-3 pt-3 text-[13px] font-semibold">Expenses by ledger</p>{pivot.loading ? <LoadingState /> : pivot.data ? <PivotTable pivot={pivot.data} name={`expenses-${range.from}-${range.to}`} /> : null}</div>
    </Panel>
  );
}

type BankCash = { rows: Array<{ id: string; code: string; name: string; kind: string; opening: number; receipts: number; payments: number; closing: number; entries: number }>; totals: { opening: number; receipts: number; payments: number; closing: number } };

/** Opening, receipts, payments and closing for each bank, cash, wallet and gateway account. */
export function BankCashReportModule() {
  const href = useFinanceHref();
  const [range, setRange] = useState({ from: fyStart(), to: todayIso() });
  const data = useResource(async () => (await api.get('/finance-hub/statements/bank-cash', { params: range })).data as BankCash, `bank-cash-${range.from}-${range.to}`);
  return (
    <Panel title="Bank & cash reports" description="Movement of every bank, cash, wallet and gateway account. Open Bank Reconciliation to match the bank statement." actions={<Link href={href('bank-reconciliation')} className="text-[13px] font-semibold text-blue-700 hover:underline">Bank reconciliation →</Link>}>
      <RangeBar range={range} onChange={setRange} />
      {data.loading ? <LoadingState /> : data.error || !data.data ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : (
        <div className="overflow-x-auto p-3">
          <table className="w-full text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Opening</th><th className="px-3 py-2 text-right">Receipts</th><th className="px-3 py-2 text-right">Payments</th><th className="px-3 py-2 text-right">Closing</th><th className="px-3 py-2 text-right">Entries</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.data.rows.map((row) => <tr key={row.id}><td className="px-3 py-2"><span className="font-mono text-xs text-slate-500">{row.code}</span> {row.name}</td><td className="px-3 py-2 text-xs">{enumLabel(row.kind)}</td><td className="px-3 py-2 text-right">{formatInr(row.opening)}</td><td className="px-3 py-2 text-right">{formatInr(row.receipts)}</td><td className="px-3 py-2 text-right">{formatInr(row.payments)}</td><td className={`px-3 py-2 text-right font-semibold ${row.closing < 0 ? 'text-red-700' : ''}`}>{formatInr(row.closing)}</td><td className="px-3 py-2 text-right text-xs">{row.entries}</td></tr>)}
              <tr className="font-semibold"><td className="px-3 py-2" colSpan={2}>Total</td><td className="px-3 py-2 text-right">{formatInr(data.data.totals.opening)}</td><td className="px-3 py-2 text-right">{formatInr(data.data.totals.receipts)}</td><td className="px-3 py-2 text-right">{formatInr(data.data.totals.payments)}</td><td className="px-3 py-2 text-right">{formatInr(data.data.totals.closing)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

type TaxReport = { months: Array<{ month: string; outputTax: number; inputTax: number; rcm: number; gstPaid: number; tdsDeducted: number; tdsDeposited: number; tdsByOthers: number; tcs: number }>; challans: Array<{ taxType: string; count: number; total: number }> };

/** GST, TDS and TCS by month with taxes paid. */
export function TaxReportsModule() {
  const [range, setRange] = useState({ from: fyStart(), to: todayIso() });
  const data = useResource(async () => (await api.get('/finance-hub/statements/tax', { params: range })).data as TaxReport, `tax-report-${range.from}-${range.to}`);
  const rows = data.data?.months ?? [];
  return (
    <Panel title="Tax reports" description="Output and input GST, reverse charge, TDS deducted / deposited and TCS by month, from the tax ledgers." actions={rows.length ? <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`tax-report-${range.from}-${range.to}.csv`, ['Month', 'Output GST', 'Input GST', 'RCM', 'GST paid', 'TDS deducted', 'TDS deposited', 'TDS by others', 'TCS'], rows.map((row) => [row.month, row.outputTax, row.inputTax, row.rcm, row.gstPaid, row.tdsDeducted, row.tdsDeposited, row.tdsByOthers, row.tcs]))}>CSV</Button> : null}>
      <RangeBar range={range} onChange={setRange} />
      {data.loading ? <LoadingState /> : data.error || !data.data ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : (
        <div className="overflow-x-auto p-3">
          <table className="w-full text-xs">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2 text-left">Month</th><th className="px-3 py-2 text-right">Output GST</th><th className="px-3 py-2 text-right">Input GST</th><th className="px-3 py-2 text-right">Net GST</th><th className="px-3 py-2 text-right">RCM</th><th className="px-3 py-2 text-right">GST paid</th><th className="px-3 py-2 text-right">TDS deducted</th><th className="px-3 py-2 text-right">TDS deposited</th><th className="px-3 py-2 text-right">TDS by others</th><th className="px-3 py-2 text-right">TCS</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.month}><td className="px-3 py-1.5">{row.month}</td><td className="px-3 py-1.5 text-right">{formatInr(row.outputTax)}</td><td className="px-3 py-1.5 text-right">{formatInr(row.inputTax)}</td><td className="px-3 py-1.5 text-right font-semibold">{formatInr(row.outputTax - row.inputTax)}</td><td className="px-3 py-1.5 text-right">{formatInr(row.rcm)}</td><td className="px-3 py-1.5 text-right">{formatInr(row.gstPaid)}</td><td className="px-3 py-1.5 text-right">{formatInr(row.tdsDeducted)}</td><td className="px-3 py-1.5 text-right">{formatInr(row.tdsDeposited)}</td><td className="px-3 py-1.5 text-right">{formatInr(row.tdsByOthers)}</td><td className="px-3 py-1.5 text-right">{formatInr(row.tcs)}</td></tr>)}</tbody>
          </table>
          {data.data.challans.length ? <p className="mt-3 text-[13px]">Challans paid: {data.data.challans.map((row) => `${enumLabel(row.taxType)} ${row.count} × ${formatInr(row.total)}`).join(' · ')}</p> : null}
        </div>
      )}
    </Panel>
  );
}

type Overview = { asOf: string; fy: { start: string; label: string }; kpis: { revenue: number; totalIncome: number; expenses: number; grossProfit: number; netProfit: number; cashAndBank: number; receivables: number; payables: number; gstPayable: number; postedLast30Days: number }; trend: Month[]; topDebtors: Array<{ partyId: string; name: string; balance: number }> };
type Alert = { key: string; label: string; count: number; severity: 'high' | 'medium' | 'low'; module: string };
const severityTone = { high: 'red', medium: 'amber', low: 'slate' } as const;

const AlertList = ({ alerts }: { alerts: Alert[] }) => {
  const href = useFinanceHref();
  return !alerts.length ? <p className="p-3 text-[13px] text-emerald-700">Nothing needs attention.</p> : (
    <ul className="divide-y divide-slate-100">
      {alerts.map((alert) => <li key={alert.key}><Link href={href(alert.module)} className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-amber-50/40"><AlertTriangle className={`h-4 w-4 ${alert.severity === 'high' ? 'text-red-600' : alert.severity === 'medium' ? 'text-amber-600' : 'text-slate-400'}`} /><span className="flex-1">{alert.label}</span><Badge tone={severityTone[alert.severity]}>{alert.count}</Badge></Link></li>)}
    </ul>
  );
};

/** Financial-year snapshot: profit, cash, dues, GST, 12-month trend and what needs attention. */
export function FinancialOverviewModule() {
  const overview = useResource(async () => (await api.get('/finance-hub/dashboard/overview')).data as Overview, 'finance-overview');
  const alerts = useResource(async () => (await api.get('/finance-hub/dashboard/alerts')).data as { alerts: Alert[] }, 'finance-alerts');
  const data = overview.data;
  return (
    <Panel title="Financial overview" description={data ? `FY ${data.fy.label} to ${formatDate(data.asOf)}, from posted entries.` : 'From posted entries.'}>
      {overview.loading ? <LoadingState /> : overview.error || !data ? <ErrorBanner message={overview.error || 'Could not load.'} schemaMissing={overview.schemaMissing} /> : (
        <>
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
            {([['Revenue', data.kpis.revenue], ['Expenses', data.kpis.expenses], ['Net profit', data.kpis.netProfit], ['Cash & bank', data.kpis.cashAndBank], ['Receivables', data.kpis.receivables], ['Payables', data.kpis.payables], ['GST payable', data.kpis.gstPayable], ['Gross profit', data.kpis.grossProfit]] as Array<[string, number]>).map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className={`text-[15px] font-semibold ${value < 0 ? 'text-red-700' : 'text-slate-900'}`}>{formatInr(value)}</p></div>)}
          </div>
          <div className="grid gap-3 p-3 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-[13px] font-semibold">Income vs costs, last 12 months</p>
              <MonthBars data={data.trend.map((month) => ({ month: month.month, income: month.revenue + month.otherIncome, costs: month.cogs + month.expenses }))} series={[{ key: 'income', name: 'Income', color: SERIES.blue }, { key: 'costs', name: 'Cost of sales + expenses', color: SERIES.orange }]} />
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200"><p className="px-3 pt-3 text-[13px] font-semibold">Needs attention</p>{alerts.loading ? <LoadingState /> : <AlertList alerts={alerts.data?.alerts ?? []} />}</div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-[13px] font-semibold">Largest receivables</p>
                {data.topDebtors.length ? <ul className="space-y-1 text-[13px]">{data.topDebtors.map((row) => <li key={row.partyId} className="flex justify-between gap-3"><span className="truncate">{row.name}</span><span className="font-semibold">{formatInr(row.balance)}</span></li>)}</ul> : <p className="text-[13px] text-slate-500">None.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

type Schedule = { id: string; side: 'RECEIVABLE' | 'PAYABLE'; party: { name: string }; dueDate: string; amount: number; overdue: boolean };

/** Cash position: balances by account, monthly cash in / out and planned collections / payments. */
export function CashFlowOverviewModule() {
  const href = useFinanceHref();
  const today = todayIso();
  const yearAgo = `${Number(today.slice(0, 4)) - 1}-${today.slice(5, 7)}-01`;
  const balances = useResource(async () => (await api.get('/finance-hub/statements/bank-cash', { params: { from: fyStart(), to: today } })).data as BankCash, 'cash-overview-balances');
  const trend = useResource(async () => (await api.get('/finance-hub/statements/trend', { params: { from: yearAgo, to: today } })).data as { months: Month[] }, 'cash-overview-trend');
  const schedules = useResource(async () => {
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    return (await api.get('/finance-hub/receivables/schedules', { params: { status: 'PLANNED', to: in30 } })).data.schedules as Schedule[];
  }, 'cash-overview-schedules');
  const plannedIn = (schedules.data ?? []).filter((item) => item.side === 'RECEIVABLE').reduce((sum, item) => sum + item.amount, 0);
  const plannedOut = (schedules.data ?? []).filter((item) => item.side === 'PAYABLE').reduce((sum, item) => sum + item.amount, 0);
  const cash = (balances.data?.rows ?? []).filter((row) => row.kind === 'BANK' || row.kind === 'CASH' || row.kind === 'PETTY_CASH');
  const total = cash.reduce((sum, row) => sum + row.closing, 0);
  return (
    <Panel title="Cash flow overview" description="Cash and bank today, money in and out each month, and what is scheduled for the next 30 days." actions={<Link href={href('cash-flow-statement')} className="text-[13px] font-semibold text-blue-700 hover:underline">Cash flow statement →</Link>}>
      <div className="grid gap-3 p-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-900 p-3 text-white"><p className="text-[11px] uppercase tracking-wide text-slate-300">Cash & bank now</p><p className="text-[15px] font-semibold">{formatInr(total)}</p></div>
        <div className="rounded-lg bg-emerald-50 p-3"><p className="text-[11px] uppercase tracking-wide text-emerald-700">Expected in (30 days)</p><p className="text-[15px] font-semibold">{formatInr(plannedIn)}</p></div>
        <div className="rounded-lg bg-amber-50 p-3"><p className="text-[11px] uppercase tracking-wide text-amber-700">Planned out (30 days)</p><p className="text-[15px] font-semibold">{formatInr(plannedOut)}</p></div>
      </div>
      <div className="grid gap-3 p-3 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-[13px] font-semibold">Cash in vs cash out by month</p>
          {trend.loading ? <LoadingState /> : <MonthBars data={(trend.data?.months ?? []).map((month) => ({ month: month.month, cashIn: month.cashIn, cashOut: month.cashOut }))} series={[{ key: 'cashIn', name: 'Cash in', color: SERIES.aqua }, { key: 'cashOut', name: 'Cash out', color: SERIES.orange }]} />}
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-[13px] font-semibold">Balances</p>
            {balances.loading ? <LoadingState /> : <ul className="space-y-1 text-[13px]">{cash.map((row) => <li key={row.id} className="flex justify-between gap-3"><span className="truncate">{row.name}</span><span className={`font-semibold ${row.closing < 0 ? 'text-red-700' : ''}`}>{formatInr(row.closing)}</span></li>)}</ul>}
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-[13px] font-semibold">Next 30 days</p>
            {schedules.error ? <p className="text-[13px] text-slate-500">Schedules not available.</p> : !(schedules.data ?? []).length ? <p className="text-[13px] text-slate-500">Nothing scheduled. <Link href={href('payment-schedules')} className="text-blue-700 hover:underline">Add schedules</Link></p> : (
              <ul className="space-y-1 text-[13px]">{(schedules.data ?? []).slice(0, 8).map((item) => <li key={item.id} className="flex justify-between gap-3"><span className="truncate">{formatDate(item.dueDate)} · {item.party.name}</span><span className={`font-semibold ${item.side === 'RECEIVABLE' ? 'text-emerald-700' : 'text-amber-700'}`}>{item.side === 'RECEIVABLE' ? '+' : '−'}{formatInr(item.amount)}</span></li>)}</ul>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** Alerts feed above the pending-approval vouchers. */
export function AlertsPanel() {
  const alerts = useResource(async () => (await api.get('/finance-hub/dashboard/alerts')).data as { alerts: Alert[] }, 'alerts-panel');
  return (
    <Panel title="Alerts" description="Everything that needs someone's attention, with the screen to fix it.">
      {alerts.loading ? <LoadingState /> : alerts.error ? <ErrorBanner message={alerts.error} schemaMissing={alerts.schemaMissing} /> : <AlertList alerts={alerts.data?.alerts ?? []} />}
    </Panel>
  );
}
