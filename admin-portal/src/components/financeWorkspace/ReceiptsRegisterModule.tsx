'use client';

import { FormEvent, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, Search } from 'lucide-react';
import api from '@/lib/api';
import { enumLabel, formatDate, formatInr, useUrlFilters } from '@/lib/financeWorkspaceClient';
import { Badge, Button, DatePresets, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Panel, tableHeadClass } from './ui';
import { exportAllPages } from './exportRows';
import { useResource } from './useResource';

type Row = { key: string; source: string; sourceId: string; date: string; party: string | null; mobile: string | null; against: string; method: string; reference: string | null; amount: number; voucher: { id: string; number: string | null; status: string } | null };
type Response = { total: number; amount: number; unposted: number; bySource: Record<string, { count: number; amount: number }>; page: number; pageSize: number; rows: Row[] };

const SOURCES: Array<[string, string]> = [['', 'All sources'], ['SELL_ACCOUNT', 'Sold Vehicles'], ['LISTING_PAYMENT', 'Listing payments'], ['CUSTOMER_PRIME', 'Customer Prime']];
const sourceLabel = Object.fromEntries(SOURCES.filter(([key]) => key));

/** Money received from customers across Sold Vehicles, listing payments and Customer Prime. */
export default function ReceiptsRegisterModule() {
  const [applied, setApplied] = useUrlFilters({ q: '', from: '', to: '', source: '', page: '1' });
  const { page: pageParam, ...criteria } = applied;
  const [filters, setFilters] = useState(criteria);
  const page = Math.max(Number(pageParam) || 1, 1);
  const setPage = (next: number) => setApplied({ ...applied, page: String(next) });
  const params = (pageNo: number, pageSize: number) => ({ ...Object.fromEntries(Object.entries(criteria).filter(([, value]) => value)), page: pageNo, pageSize });
  const data = useResource(
    async () => (await api.get('/finance-hub/receipts-register', { params: params(page, 50) })).data as Response,
    `receipts-${JSON.stringify(criteria)}-${page}`,
  );
  const totalPages = data.data ? Math.max(Math.ceil(data.data.total / data.data.pageSize), 1) : 1;
  const run = (next: typeof filters) => { setFilters(next); setApplied({ ...next, page: '1' }); };
  const apply = (event: FormEvent) => { event.preventDefault(); run(filters); };
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    await exportAllPages<Row>(
      async (pageNo, pageSize) => { const result = (await api.get('/finance-hub/receipts-register', { params: params(pageNo, pageSize) })).data as Response; return { rows: result.rows, total: result.total }; },
      [
        { header: 'Date', value: (row) => formatDate(row.date) },
        { header: 'Customer', value: (row) => row.party ?? '' },
        { header: 'Mobile', value: (row) => row.mobile ?? '' },
        { header: 'Against', value: (row) => row.against },
        { header: 'Source', value: (row) => sourceLabel[row.source] ?? row.source },
        { header: 'Method', value: (row) => enumLabel(row.method) },
        { header: 'Reference', value: (row) => row.reference ?? '' },
        { header: 'Amount', value: (row) => row.amount },
        { header: 'Voucher', value: (row) => (!row.voucher ? 'Not posted' : row.voucher.status === 'POSTED' ? row.voucher.number ?? '' : 'Draft') },
      ],
      'customer-receipts',
    );
    setExporting(false);
  };

  return (
    <Panel title="Customer receipts" description="Every receipt recorded in the existing flows, with whether it is in the books. Add new Sold Vehicle receipts on the Sold Vehicle record; other receipts as receipt vouchers." actions={<Button icon={<FileSpreadsheet />} busy={exporting} onClick={() => void exportCsv()}>Export CSV</Button>}>
      <form onSubmit={apply} className="grid gap-3 border-b border-slate-100 p-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
        <Field label="Search"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Customer, mobile, vehicle or reference…" className={`${inputClass} pl-9`} /></div></Field>
        <Field label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} /></Field>
        <Field label="Source"><select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })} className={inputClass}>{SOURCES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Button type="submit" variant="primary">Show</Button>
        <div className="md:col-span-5"><DatePresets from={filters.from} to={filters.to} onSelect={(range) => run({ ...filters, ...range })} /></div>
      </form>
      {data.loading ? <LoadingState /> : data.error ? <ErrorBanner message={data.error} schemaMissing={data.schemaMissing} /> : !data.data?.rows.length ? <EmptyState title="No receipts found" /> : (
        <>
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Receipts</p><p className="text-[15px] font-semibold text-slate-900">{data.data.total}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Amount</p><p className="text-[15px] font-semibold text-slate-900">{formatInr(data.data.amount)}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Not posted yet</p><p className="text-[15px] font-semibold text-amber-700">{data.data.unposted}</p></div>
            {Object.entries(data.data.bySource).map(([source, value]) => <div key={source} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{sourceLabel[source] ?? source}</p><p className="text-[13px] font-semibold text-slate-900">{value.count} · {formatInr(value.amount)}</p></div>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Against</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">In books</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.rows.map((row) => (
                  <tr key={row.key}>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(row.date)}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.party ?? '—'}<span className="block text-xs font-normal text-slate-500">{row.mobile ?? ''}</span></td>
                    <td className="max-w-[240px] truncate px-3 py-2 text-xs" title={row.against}>{row.against}</td>
                    <td className="px-3 py-2 text-xs">{sourceLabel[row.source] ?? row.source}</td>
                    <td className="px-3 py-2 text-xs">{enumLabel(row.method)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.reference ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatInr(row.amount)}</td>
                    <td className="px-3 py-2">{!row.voucher ? <Badge tone="amber">Not posted</Badge> : row.voucher.status === 'POSTED' ? <Badge tone="green">{row.voucher.number}</Badge> : <Badge>Draft</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span>{data.data.total} receipts</span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>
              Page {page} of {totalPages}
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />}>Next</Button>
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}
