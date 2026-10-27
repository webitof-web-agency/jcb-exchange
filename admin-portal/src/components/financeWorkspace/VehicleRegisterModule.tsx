'use client';

import { FormEvent, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { downloadAuthedFile } from '@/lib/authedDownload';
import { downloadTableFile } from '@/lib/tabularExport';
import { enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { Badge, Button, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, Panel, tableHeadClass, Toggle } from './ui';
import { useResource } from './useResource';
import VehicleDetail, { vehicleStatusTone } from './VehicleDetail';

export type RegisterView = 'purchases' | 'sales' | 'profit' | 'stock' | 'exchange' | 'costs' | 'costsheet' | 'invoices';

type Row = {
  id: string; label: string; recordNumber: string; vehicleNumber: string | null; brandName: string | null; vehicleModel: string | null; vehicleType: string | null;
  sellerName: string | null; purchaserName: string | null; sourceType: string | null; purchaseType: string; saleType: string; purchaseExchangeVehicle: string | null; saleExchangeVehicle: string | null;
  dealStatus: string; invoiceNumber: string | null; invoiceGeneratedAt: string | null; storedNetProfit: number;
  purchaseDate: string | null; saleDate: string | null; status: string; daysInStock: number | null; purchase: number; costs: Array<{ head: string; label: string; amount: number }>;
  costTotal: number; landedCost: number; sale: number; gstAmount: number; taxType: string; saleExGst: number; margin: number; profit: number; profitPercent: number | null;
  purchaseExchangeValue: number; saleExchangeValue: number; sellerPaid: number; sellerBalance: number; sellerPaymentStatus: string; purchaserReceived: number; purchaserBalance: number; purchaserPaymentStatus: string;
  books: { hasEntries: boolean; stock: number; exchangeClearing: number; exchangeStock: number; costClearing: number; profit: number; difference: number | null };
};
type Register = { asOn: string; total: number; page: number; pageSize: number; rows: Row[]; totals: Record<'count' | 'purchase' | 'costTotal' | 'landedCost' | 'sale' | 'gstAmount' | 'profit' | 'stockValue' | 'inStock' | 'sold' | 'sellerBalance' | 'purchaserBalance', number> };

type Column = { header: string; cell: (row: Row) => ReactNode; value: (row: Row) => string | number | null; align?: 'right' };

const money = (value: number) => (value ? formatInr(value) : '—');
const bucket = (days: number | null) => (days === null ? '—' : days <= 30 ? '0–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : '90+');
const costOf = (row: Row, head: string) => row.costs.find((cost) => cost.head === head)?.amount ?? 0;

const vehicleCell: Column = { header: 'Vehicle', cell: (row) => <><span className="font-semibold text-slate-900">{row.recordNumber}</span><span className="block text-xs text-slate-500">{[row.vehicleNumber, row.brandName, row.vehicleModel].filter(Boolean).join(' · ')}</span></>, value: (row) => row.label };
const statusCell: Column = { header: 'Status', cell: (row) => <Badge tone={vehicleStatusTone[row.status as keyof typeof vehicleStatusTone] ?? 'slate'}>{enumLabel(row.status)}</Badge>, value: (row) => row.status };
const booksCell: Column = { header: 'Books', cell: (row) => !row.books.hasEntries ? <Badge tone="amber">Not posted</Badge> : row.books.difference === null ? <Badge>Partly</Badge> : row.books.difference === 0 ? <Badge tone="green">Matches</Badge> : <Badge tone="red">{formatInr(row.books.difference)}</Badge>, value: (row) => (row.books.hasEntries ? row.books.difference ?? 'partial' : 'not posted') };

const VIEWS: Record<RegisterView, { title: string; description: string; status: string; dateBasis: 'purchase' | 'sale'; extra?: Record<string, string>; columns: Column[]; kpis: (totals: Register['totals']) => Array<[string, string]> }> = {
  purchases: {
    title: 'Vehicle purchases',
    description: 'Every Sold Vehicle record from the purchase side: what was paid for the vehicle, costs added, landed cost and what is still owed to the seller.',
    status: 'booked',
    dateBasis: 'purchase',
    columns: [
      { header: 'Bought on', cell: (row) => formatDate(row.purchaseDate), value: (row) => row.purchaseDate },
      vehicleCell,
      { header: 'Seller', cell: (row) => <>{row.sellerName ?? '—'}{row.sourceType ? <span className="block text-[11px] text-slate-400">{enumLabel(row.sourceType)}</span> : null}</>, value: (row) => row.sellerName },
      { header: 'Purchase', cell: (row) => <>{formatInr(row.purchase)}{row.purchaseExchangeValue ? <span className="block text-[11px] text-slate-400">{formatInr(row.purchaseExchangeValue)} by exchange</span> : null}</>, value: (row) => row.purchase, align: 'right' },
      { header: 'Costs', cell: (row) => money(row.costTotal), value: (row) => row.costTotal, align: 'right' },
      { header: 'Landed cost', cell: (row) => <span className="font-semibold">{formatInr(row.landedCost)}</span>, value: (row) => row.landedCost, align: 'right' },
      { header: 'Paid to seller', cell: (row) => money(row.sellerPaid), value: (row) => row.sellerPaid, align: 'right' },
      { header: 'Seller balance', cell: (row) => <span className={row.sellerBalance ? 'font-semibold text-amber-700' : ''}>{money(row.sellerBalance)}</span>, value: (row) => row.sellerBalance, align: 'right' },
      statusCell,
      booksCell,
    ],
    kpis: (totals) => [['Vehicles', String(totals.count)], ['Purchase value', formatInr(totals.purchase)], ['Costs', formatInr(totals.costTotal)], ['Landed cost', formatInr(totals.landedCost)], ['Owed to sellers', formatInr(totals.sellerBalance)]],
  },
  sales: {
    title: 'Vehicle sales',
    description: 'Sold vehicles (invoice generated or deal done) with GST on margin and what the purchaser still owes.',
    status: 'sold',
    dateBasis: 'sale',
    columns: [
      { header: 'Sold on', cell: (row) => formatDate(row.saleDate), value: (row) => row.saleDate },
      { header: 'Invoice', cell: (row) => <span className="font-mono text-xs">{row.invoiceNumber ?? '—'}</span>, value: (row) => row.invoiceNumber },
      vehicleCell,
      { header: 'Purchaser', cell: (row) => row.purchaserName ?? '—', value: (row) => row.purchaserName },
      { header: 'Sale', cell: (row) => formatInr(row.sale), value: (row) => row.sale, align: 'right' },
      { header: 'GST', cell: (row) => <>{money(row.gstAmount)}<span className="block text-[11px] text-slate-400">{row.taxType}</span></>, value: (row) => row.gstAmount, align: 'right' },
      { header: 'Received', cell: (row) => money(row.purchaserReceived), value: (row) => row.purchaserReceived, align: 'right' },
      { header: 'Balance', cell: (row) => <span className={row.purchaserBalance ? 'font-semibold text-amber-700' : ''}>{money(row.purchaserBalance)}</span>, value: (row) => row.purchaserBalance, align: 'right' },
      { header: 'Profit', cell: (row) => <span className={row.profit < 0 ? 'text-red-600' : 'text-emerald-700'}>{formatInr(row.profit)}</span>, value: (row) => row.profit, align: 'right' },
      booksCell,
    ],
    kpis: (totals) => [['Vehicles sold', String(totals.sold)], ['Sales', formatInr(totals.sale)], ['GST on margin', formatInr(totals.gstAmount)], ['Net profit', formatInr(totals.profit)], ['Due from purchasers', formatInr(totals.purchaserBalance)]],
  },
  profit: {
    title: 'Vehicle profit & margin',
    description: 'Net profit per vehicle = sale − purchase − costs − GST on margin, exactly as Sold Vehicles calculates it, next to what the books show.',
    status: 'sold',
    dateBasis: 'sale',
    columns: [
      { header: 'Sold on', cell: (row) => formatDate(row.saleDate), value: (row) => row.saleDate },
      vehicleCell,
      { header: 'Sale', cell: (row) => formatInr(row.sale), value: (row) => row.sale, align: 'right' },
      { header: 'Landed cost', cell: (row) => formatInr(row.landedCost), value: (row) => row.landedCost, align: 'right' },
      { header: 'Margin', cell: (row) => formatInr(row.margin), value: (row) => row.margin, align: 'right' },
      { header: 'GST', cell: (row) => money(row.gstAmount), value: (row) => row.gstAmount, align: 'right' },
      { header: 'Net profit', cell: (row) => <span className={`font-semibold ${row.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatInr(row.profit)}</span>, value: (row) => row.profit, align: 'right' },
      { header: '%', cell: (row) => (row.profitPercent === null ? '—' : `${row.profitPercent}%`), value: (row) => row.profitPercent, align: 'right' },
      { header: 'Days to sell', cell: (row) => row.daysInStock ?? '—', value: (row) => row.daysInStock, align: 'right' },
      { header: 'Books profit', cell: (row) => (row.books.hasEntries ? formatInr(row.books.profit) : '—'), value: (row) => row.books.profit, align: 'right' },
      booksCell,
    ],
    kpis: (totals) => [['Vehicles', String(totals.sold)], ['Sales', formatInr(totals.sale)], ['Net profit', formatInr(totals.profit)], ['Average per vehicle', formatInr(totals.sold ? totals.profit / totals.sold : 0)], ['Margin %', totals.sale ? `${((totals.profit / totals.sale) * 100).toFixed(1)}%` : '—']],
  },
  stock: {
    title: 'Stock valuation',
    description: 'Vehicles bought but not yet sold on the chosen date, valued at landed cost (purchase + costs).',
    status: 'in_stock',
    dateBasis: 'purchase',
    columns: [
      vehicleCell,
      { header: 'In stock since', cell: (row) => formatDate(row.purchaseDate), value: (row) => row.purchaseDate },
      { header: 'Age (days)', cell: (row) => row.daysInStock ?? '—', value: (row) => row.daysInStock, align: 'right' },
      { header: 'Bucket', cell: (row) => <Badge tone={(row.daysInStock ?? 0) > 90 ? 'red' : (row.daysInStock ?? 0) > 60 ? 'amber' : 'slate'}>{bucket(row.daysInStock)}</Badge>, value: (row) => bucket(row.daysInStock) },
      { header: 'Purchase', cell: (row) => formatInr(row.purchase), value: (row) => row.purchase, align: 'right' },
      { header: 'Costs', cell: (row) => money(row.costTotal), value: (row) => row.costTotal, align: 'right' },
      { header: 'Book value', cell: (row) => <span className="font-semibold">{formatInr(row.landedCost)}</span>, value: (row) => row.landedCost, align: 'right' },
      { header: 'Stock in books', cell: (row) => (row.books.hasEntries ? formatInr(row.books.stock) : '—'), value: (row) => row.books.stock, align: 'right' },
      { header: 'Deal', cell: (row) => <span className="text-xs">{enumLabel(row.dealStatus)}</span>, value: (row) => row.dealStatus },
    ],
    kpis: (totals) => [['Units in stock', String(totals.inStock)], ['Stock value', formatInr(totals.stockValue)], ['Average value', formatInr(totals.inStock ? totals.stockValue / totals.inStock : 0)]],
  },
  exchange: {
    title: 'Exchange transactions',
    description: 'Deals where a vehicle was handed over (purchase by exchange) or taken in (sale by exchange). Clearing balances should come to zero once the exchanged vehicle has its own Sold Vehicle record.',
    status: 'all',
    dateBasis: 'purchase',
    extra: { exchange: 'true' },
    columns: [
      vehicleCell,
      { header: 'Handed to seller', cell: (row) => (row.purchaseType === 'EXCHANGE' ? <>{formatInr(row.purchaseExchangeValue)}<span className="block text-[11px] text-slate-400">{row.purchaseExchangeVehicle ?? ''}</span></> : '—'), value: (row) => row.purchaseExchangeValue, align: 'right' },
      { header: 'Taken from purchaser', cell: (row) => (row.saleType === 'EXCHANGE' ? <>{formatInr(row.saleExchangeValue)}<span className="block text-[11px] text-slate-400">{row.saleExchangeVehicle ?? ''}</span></> : '—'), value: (row) => row.saleExchangeValue, align: 'right' },
      { header: 'Exchange clearing (books)', cell: (row) => money(row.books.exchangeClearing), value: (row) => row.books.exchangeClearing, align: 'right' },
      { header: 'Exchange stock (books)', cell: (row) => money(row.books.exchangeStock), value: (row) => row.books.exchangeStock, align: 'right' },
      statusCell,
    ],
    kpis: (totals) => [['Deals with exchange', String(totals.count)]],
  },
  costs: {
    title: 'Additional purchase costs',
    description: 'Transport, paperwork, RTO and other costs entered on Sold Vehicle records. “Unpaid in books” is the clearing balance not yet matched to an actual expense payment.',
    status: 'booked',
    dateBasis: 'purchase',
    columns: [
      vehicleCell,
      { header: 'Bought on', cell: (row) => formatDate(row.purchaseDate), value: (row) => row.purchaseDate },
      { header: 'Transport', cell: (row) => money(costOf(row, 'transport')), value: (row) => costOf(row, 'transport'), align: 'right' },
      { header: 'Paperwork', cell: (row) => money(costOf(row, 'paperwork')), value: (row) => costOf(row, 'paperwork'), align: 'right' },
      { header: 'RTO work', cell: (row) => money(costOf(row, 'rtoWork')), value: (row) => costOf(row, 'rtoWork'), align: 'right' },
      { header: 'Other', cell: (row) => money(costOf(row, 'other')), value: (row) => costOf(row, 'other'), align: 'right' },
      { header: 'Total', cell: (row) => <span className="font-semibold">{money(row.costTotal)}</span>, value: (row) => row.costTotal, align: 'right' },
      { header: 'Unpaid in books', cell: (row) => money(Math.abs(row.books.costClearing)), value: (row) => Math.abs(row.books.costClearing), align: 'right' },
    ],
    kpis: (totals) => [['Vehicles', String(totals.count)], ['Total costs', formatInr(totals.costTotal)], ['Average per vehicle', formatInr(totals.count ? totals.costTotal / totals.count : 0)]],
  },
  costsheet: {
    title: 'Vehicle cost sheet',
    description: 'Purchase plus every cost on the vehicle, against its sale. Open a row for the full cost build-up and book entries.',
    status: 'booked',
    dateBasis: 'purchase',
    columns: [
      vehicleCell,
      { header: 'Purchase', cell: (row) => formatInr(row.purchase), value: (row) => row.purchase, align: 'right' },
      { header: 'Costs', cell: (row) => money(row.costTotal), value: (row) => row.costTotal, align: 'right' },
      { header: 'Landed cost', cell: (row) => <span className="font-semibold">{formatInr(row.landedCost)}</span>, value: (row) => row.landedCost, align: 'right' },
      { header: 'Sale', cell: (row) => money(row.status === 'SOLD' ? row.sale : 0), value: (row) => (row.status === 'SOLD' ? row.sale : 0), align: 'right' },
      { header: 'Margin', cell: (row) => (row.status === 'SOLD' ? formatInr(row.margin) : '—'), value: (row) => row.margin, align: 'right' },
      { header: 'Net profit', cell: (row) => (row.status === 'SOLD' ? formatInr(row.profit) : '—'), value: (row) => row.profit, align: 'right' },
      statusCell,
    ],
    kpis: (totals) => [['Vehicles', String(totals.count)], ['Landed cost', formatInr(totals.landedCost)], ['Sales', formatInr(totals.sale)], ['Net profit', formatInr(totals.profit)]],
  },
  invoices: {
    title: 'Vehicle sale invoices',
    description: 'Invoices generated from Sold Vehicles (numbering, PDF and WhatsApp delivery stay in the existing flow).',
    status: 'all',
    dateBasis: 'sale',
    extra: { invoiced: 'true' },
    columns: [
      { header: 'Invoice', cell: (row) => <span className="font-mono text-xs font-semibold">{row.invoiceNumber}</span>, value: (row) => row.invoiceNumber },
      { header: 'Date', cell: (row) => formatDate(row.invoiceGeneratedAt), value: (row) => row.invoiceGeneratedAt?.slice(0, 10) ?? null },
      vehicleCell,
      { header: 'Purchaser', cell: (row) => row.purchaserName ?? '—', value: (row) => row.purchaserName },
      { header: 'Amount', cell: (row) => formatInr(row.sale), value: (row) => row.sale, align: 'right' },
      { header: 'GST on margin', cell: (row) => <>{money(row.gstAmount)}<span className="block text-[11px] text-slate-400">{row.taxType}</span></>, value: (row) => row.gstAmount, align: 'right' },
      { header: 'Balance due', cell: (row) => money(row.purchaserBalance), value: (row) => row.purchaserBalance, align: 'right' },
      booksCell,
    ],
    kpis: (totals) => [['Invoices', String(totals.count)], ['Invoiced value', formatInr(totals.sale)], ['GST', formatInr(totals.gstAmount)]],
  },
};

const SOURCE_TYPES = ['PARTNER', 'AGENT', 'DIRECT_CUSTOMER', 'JCB_EXCHANGE'];

export default function VehicleRegisterModule({ view, title }: { view: RegisterView; title?: string }) {
  const config = VIEWS[view];
  const canExport = useFinanceWorkspaceAccess().can(['fh.export', 'fh.reports.export']);
  const [filters, setFilters] = useState({ q: '', from: '', to: '', asOn: '', sourceType: '', status: config.status, includeDrafts: false });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const params = useMemo(() => ({
    ...config.extra,
    status: applied.status,
    dateBasis: config.dateBasis,
    q: applied.q || undefined,
    from: applied.from || undefined,
    to: applied.to || undefined,
    asOn: applied.asOn || undefined,
    sourceType: applied.sourceType || undefined,
    includeDrafts: applied.includeDrafts ? 'true' : undefined,
    page,
    pageSize: 100,
  }), [applied, config, page]);
  const register = useResource(async () => (await api.get('/finance-hub/vehicle-finance/register', { params })).data as Register, `register-${view}-${JSON.stringify(params)}`);
  const totalPages = register.data ? Math.max(Math.ceil(register.data.total / register.data.pageSize), 1) : 1;

  const apply = (event: FormEvent) => { event.preventDefault(); setPage(1); setApplied(filters); };

  const exportFile = (format: 'csv' | 'xls') => {
    if (!register.data) return;
    downloadTableFile({ fileName: `${view}-${register.data.asOn}`, format, rows: register.data.rows, columns: config.columns.map((column) => ({ header: column.header, value: column.value })) });
  };

  const downloadInvoice = async (row: Row) => {
    try {
      await downloadAuthedFile(`/recruitment/admin/sell-accounts/${encodeURIComponent(row.id)}/invoice`, `${row.invoiceNumber}.pdf`);
    } catch {
      toast.error('Could not download the invoice. Downloading needs access to Sold Vehicles.');
    }
  };

  return (
    <Panel
      title={title ?? config.title}
      description={config.description}
      actions={canExport && register.data?.rows.length ? <><Button icon={<Download className="h-4 w-4" />} onClick={() => exportFile('xls')}>Excel</Button><Button onClick={() => exportFile('csv')}>CSV</Button></> : null}
    >
      <form onSubmit={apply} className="grid gap-3 border-b border-slate-100 p-3 md:grid-cols-[2fr_repeat(4,minmax(0,1fr))_auto] md:items-end">
        <Field label="Search">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Record, vehicle no., chassis, seller, purchaser, invoice…" className={`${inputClass} pl-9`} /></div>
        </Field>
        {view === 'stock' ? (
          <Field label="As on"><input type="date" value={filters.asOn} onChange={(event) => setFilters({ ...filters, asOn: event.target.value })} className={inputClass} /></Field>
        ) : (
          <>
            <Field label={config.dateBasis === 'sale' ? 'Sold from' : 'Bought from'}><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} /></Field>
            <Field label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} /></Field>
          </>
        )}
        <Field label="Bought from">
          <select value={filters.sourceType} onChange={(event) => setFilters({ ...filters, sourceType: event.target.value })} className={inputClass}>
            <option value="">All sources</option>
            {SOURCE_TYPES.map((type) => <option key={type} value={type}>{enumLabel(type)}</option>)}
          </select>
        </Field>
        {view === 'purchases' || view === 'costsheet' || view === 'exchange' ? (
          <Field label="Status">
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={inputClass}>
              <option value="booked">All saved</option><option value="in_stock">In stock</option><option value="sold">Sold</option><option value="all">Including drafts</option>
            </select>
          </Field>
        ) : <div />}
        <Button type="submit" variant="primary">Show</Button>
        <div className="md:col-span-6"><Toggle checked={filters.includeDrafts} onChange={(value) => setFilters({ ...filters, includeDrafts: value })} label="Include automatic drafts in book figures (shadow mode)" /></div>
      </form>

      {register.loading ? <LoadingState /> : register.error ? <ErrorBanner message={register.error} schemaMissing={register.schemaMissing} /> : !register.data?.rows.length ? (
        <EmptyState title="No vehicles match" description="Records come from Sold Vehicles (Daily Operations → Sold Vehicles)." />
      ) : (
        <>
          <div className="grid gap-3 p-3 sm:grid-cols-3 lg:grid-cols-5">
            {config.kpis(register.data.totals).map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="text-[15px] font-semibold text-slate-900">{value}</p></div>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-[13px]">
              <thead className={tableHeadClass}><tr>{config.columns.map((column) => <th key={column.header} className={`px-3 py-2 ${column.align === 'right' ? 'text-right' : ''}`}>{column.header}</th>)}{view === 'invoices' ? <th className="px-3 py-2" /> : null}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {register.data.rows.map((row) => (
                  <tr key={row.id} onClick={() => setOpenId(row.id)} className="cursor-pointer hover:bg-amber-50/40">
                    {config.columns.map((column) => <td key={column.header} className={`px-3 py-2 align-top ${column.align === 'right' ? 'text-right' : ''}`}>{column.cell(row)}</td>)}
                    {view === 'invoices' ? <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}><Button variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={() => void downloadInvoice(row)}>PDF</Button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span>{register.data.total} vehicles{view === 'stock' ? ` · as on ${formatDate(register.data.asOn)}` : ''}</span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>
              Page {page} of {totalPages}
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />}>Next</Button>
            </span>
          </div>
        </>
      )}

      {openId ? (
        <Modal title={register.data?.rows.find((row) => row.id === openId)?.label ?? 'Vehicle'} onClose={() => setOpenId(null)} wide>
          <VehicleDetail vehicleId={openId} includeDrafts={applied.includeDrafts} />
        </Modal>
      ) : null}
    </Panel>
  );
}
