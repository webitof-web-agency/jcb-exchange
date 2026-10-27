'use client';

import { FormEvent, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, Plus, Search } from 'lucide-react';
import api from '@/lib/api';
import { enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess, useRequestedNew, useUrlFilters } from '@/lib/financeWorkspaceClient';
import { exportAllPages } from './exportRows';
import { useLedgerLookups } from './ledgerLookups';
import { Badge, Button, cellClass, DatePresets, EmptyState, ErrorBanner, inputClass, LoadingState, Panel, ReadOnlyNotice, tableHeadClass } from './ui';
import { useResource } from './useResource';
import VoucherDetail, { statusTone, type VoucherStatus } from './VoucherDetail';
import VoucherForm, { type EditableVoucher, type ManualType } from './VoucherForm';

type Row = { id: string; number: string | null; type: string; date: string; status: VoucherStatus; narration: string; reference: string | null; totalAmount: number; sourceType: string | null; party: { name: string } | null };
type ListResponse = { vouchers: Row[]; total: number; page: number; pageSize: number; summary: Array<{ status: VoucherStatus; count: number; amount: number }> };

const STATUSES: VoucherStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REJECTED', 'REVERSED'];

export default function VouchersModule({ title, description, types, createTypes, fixedStatuses }: {
  title: string;
  description: string;
  types?: string[];
  createTypes: readonly ManualType[];
  fixedStatuses?: VoucherStatus[];
}) {
  const access = useFinanceWorkspaceAccess();
  const canCreate = createTypes.length > 0 && access.can(['fh.books.manage']);
  const lookups = useLedgerLookups();
  const [applied, setApplied] = useUrlFilters({ from: '', to: '', status: '', q: '', page: '1' });
  const [filters, setFilters] = useState(applied);
  const page = Math.max(Number(applied.page) || 1, 1);
  const setPage = (next: number) => setApplied({ ...applied, page: String(next) });
  const apply = (next: typeof filters) => { setFilters(next); setApplied({ ...next, page: '1' }); };
  const [version, setVersion] = useState(0);
  const statusParam = fixedStatuses?.join(',') || applied.status;
  const params = (pageNo: number, pageSize: number) => ({ types: types?.join(','), status: statusParam || undefined, from: applied.from || undefined, to: applied.to || undefined, q: applied.q || undefined, page: pageNo, pageSize });
  const list = useResource(
    async () => (await api.get('/finance-hub/vouchers', { params: params(page, 25) })).data as ListResponse,
    `vouchers-${types?.join(',')}-${statusParam}-${applied.from}-${applied.to}-${applied.q}-${page}-${version}`,
  );
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    await exportAllPages<Row>(
      async (pageNo, pageSize) => { const data = (await api.get('/finance-hub/vouchers', { params: params(pageNo, pageSize) })).data as ListResponse; return { rows: data.vouchers, total: data.total }; },
      [
        { header: 'Date', value: (row) => formatDate(row.date) },
        { header: 'Number', value: (row) => row.number ?? 'Draft' },
        { header: 'Type', value: (row) => enumLabel(row.type) },
        { header: 'Party', value: (row) => row.party?.name ?? '' },
        { header: 'Narration', value: (row) => row.narration },
        { header: 'Reference', value: (row) => row.reference ?? '' },
        { header: 'Amount', value: (row) => row.totalAmount },
        { header: 'Status', value: (row) => enumLabel(row.status) },
        { header: 'Source', value: (row) => (row.sourceType ? 'Automatic' : 'Manual') },
      ],
      title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    );
    setExporting(false);
  };
  const requestedNew = useRequestedNew(canCreate ? createTypes : []);
  const [form, setForm] = useState<{ initial: EditableVoucher | null; type: ManualType } | null>(requestedNew ? { initial: null, type: requestedNew } : null);
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = () => setVersion((value) => value + 1);
  const totalPages = list.data ? Math.max(Math.ceil(list.data.total / list.data.pageSize), 1) : 1;

  const search = (event: FormEvent) => { event.preventDefault(); apply(filters); };

  return (
    <Panel
      title={title}
      description={description}
      actions={(
        <>
          <Button icon={<FileSpreadsheet />} busy={exporting} onClick={() => void exportCsv()}>Export CSV</Button>
          {canCreate ? createTypes.map((type) => <Button key={type} variant={type === createTypes[0] ? 'primary' : 'secondary'} icon={<Plus className="h-4 w-4" />} disabled={!lookups.installed} onClick={() => setForm({ initial: null, type })}>New {enumLabel(type).toLowerCase()}</Button>) : null}
        </>
      )}
    >
      {!lookups.loading && !lookups.installed && !lookups.error ? <ReadOnlyNotice>Install the chart of accounts and create a financial year before entering vouchers.</ReadOnlyNotice> : null}
      <form onSubmit={search} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Number, narration, reference or party…" className={`${inputClass} pl-8`} />
        </div>
        <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={`${inputClass} w-[136px]`} aria-label="From date" />
        <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={`${inputClass} w-[136px]`} aria-label="To date" />
        {fixedStatuses ? null : (
          <select value={filters.status} onChange={(event) => apply({ ...filters, status: event.target.value })} className={`${inputClass} w-40`} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{enumLabel(status)}</option>)}
          </select>
        )}
        <Button type="submit">Apply</Button>
        <DatePresets from={filters.from} to={filters.to} onSelect={(range) => apply({ ...filters, ...range })} />
      </form>

      {list.data?.summary.length ? (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {list.data.summary.map((item) => {
            const active = applied.status === item.status;
            return (
              <button key={item.status} type="button" disabled={Boolean(fixedStatuses)} onClick={() => apply({ ...filters, status: active ? '' : item.status })} title={fixedStatuses ? undefined : active ? 'Show all statuses' : `Show only ${enumLabel(item.status).toLowerCase()}`} className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] text-slate-600 transition enabled:hover:border-slate-300 ${active ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                <Badge tone={statusTone[item.status]}>{enumLabel(item.status)}</Badge>{item.count} · {formatInr(item.amount)}
              </button>
            );
          })}
        </div>
      ) : null}

      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.vouchers.length ? (
        <EmptyState title="No vouchers found" description={canCreate ? 'Create a voucher with the button above. It stays a draft until posted.' : 'Nothing matches these filters.'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Number</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Narration</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.vouchers.map((voucher) => (
                  <tr key={voucher.id} onClick={() => setOpenId(voucher.id)} className="cursor-pointer hover:bg-amber-50/40">
                    <td className={`${cellClass} whitespace-nowrap`}>{formatDate(voucher.date)}</td>
                    <td className={`${cellClass} font-mono text-xs font-semibold text-slate-900`}>{voucher.number ?? <span className="font-sans font-normal text-slate-400">Draft</span>}</td>
                    <td className={cellClass}>{enumLabel(voucher.type)}{voucher.sourceType ? <span className="block text-[11px] text-blue-600">Auto</span> : null}</td>
                    <td className={`${cellClass} text-xs`}>{voucher.party?.name ?? '—'}</td>
                    <td className={`${cellClass} max-w-[320px] truncate`} title={voucher.narration}>{voucher.narration}</td>
                    <td className={`${cellClass} text-right font-semibold`}>{formatInr(voucher.totalAmount)}</td>
                    <td className={cellClass}><Badge tone={statusTone[voucher.status]}>{enumLabel(voucher.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span>{list.data.total} vouchers</span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>
              Page {page} of {totalPages}
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />}>Next</Button>
            </span>
          </div>
        </>
      )}

      {form && !lookups.loading && (lookups.installed || form.initial) ? (
        <VoucherForm
          lookups={lookups}
          initial={form.initial}
          allowedTypes={form.initial ? [form.initial.type] : createTypes}
          defaultType={form.initial?.type ?? form.type}
          onClose={() => setForm(null)}
          onSaved={(id) => { setForm(null); refresh(); setOpenId(id); }}
        />
      ) : null}
      {openId && !form ? (
        <VoucherDetail
          key={openId}
          voucherId={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onOpen={setOpenId}
          onEdit={(voucher) => { setForm({ initial: voucher, type: voucher.type }); }}
        />
      ) : null}
    </Panel>
  );
}
