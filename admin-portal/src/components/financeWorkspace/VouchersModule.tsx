'use client';

import { FormEvent, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import api from '@/lib/api';
import { enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { useLedgerLookups } from './ledgerLookups';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, inputClass, LoadingState, Panel, ReadOnlyNotice, tableHeadClass } from './ui';
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
  const [filters, setFilters] = useState({ from: '', to: '', status: '', q: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const statusParam = fixedStatuses?.join(',') || applied.status;
  const list = useResource(
    async () => (await api.get('/finance-hub/vouchers', { params: { types: types?.join(','), status: statusParam || undefined, from: applied.from || undefined, to: applied.to || undefined, q: applied.q || undefined, page, pageSize: 25 } })).data as ListResponse,
    `vouchers-${types?.join(',')}-${statusParam}-${applied.from}-${applied.to}-${applied.q}-${page}-${version}`,
  );
  const [form, setForm] = useState<{ initial: EditableVoucher | null; type: ManualType } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = () => setVersion((value) => value + 1);
  const totalPages = list.data ? Math.max(Math.ceil(list.data.total / list.data.pageSize), 1) : 1;

  const search = (event: FormEvent) => { event.preventDefault(); setPage(1); setApplied(filters); };

  return (
    <Panel
      title={title}
      description={description}
      actions={canCreate ? (
        <>
          {createTypes.map((type) => <Button key={type} variant={type === createTypes[0] ? 'primary' : 'secondary'} icon={<Plus className="h-4 w-4" />} disabled={!lookups.installed} onClick={() => setForm({ initial: null, type })}>New {enumLabel(type).toLowerCase()}</Button>)}
        </>
      ) : null}
    >
      {!lookups.loading && !lookups.installed && !lookups.error ? <ReadOnlyNotice>Install the chart of accounts and create a financial year before entering vouchers.</ReadOnlyNotice> : null}
      <form onSubmit={search} className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_160px_160px_180px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Number, narration, reference or party…" className={`${inputClass} pl-9`} />
        </div>
        <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} aria-label="From date" />
        <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} aria-label="To date" />
        {fixedStatuses ? <div /> : (
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={inputClass} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{enumLabel(status)}</option>)}
          </select>
        )}
        <Button type="submit">Apply</Button>
      </form>

      {list.data?.summary.length ? (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {list.data.summary.map((item) => <span key={item.status} className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600"><Badge tone={statusTone[item.status]}>{enumLabel(item.status)}</Badge> {item.count} · {formatInr(item.amount)}</span>)}
        </div>
      ) : null}

      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.vouchers.length ? (
        <EmptyState title="No vouchers found" description={canCreate ? 'Create a voucher with the button above. It stays a draft until posted.' : 'Nothing matches these filters.'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Number</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Party</th><th className="px-4 py-2.5">Narration</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.vouchers.map((voucher) => (
                  <tr key={voucher.id} onClick={() => setOpenId(voucher.id)} className="cursor-pointer hover:bg-amber-50/40">
                    <td className={`${cellClass} whitespace-nowrap`}>{formatDate(voucher.date)}</td>
                    <td className={`${cellClass} font-mono text-xs font-bold text-slate-900`}>{voucher.number ?? <span className="font-sans font-normal text-slate-400">Draft</span>}</td>
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
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>{list.data.total} vouchers</span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>
              Page {page} of {totalPages}
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />}>Next</Button>
            </span>
          </div>
        </>
      )}

      {form && !lookups.loading ? (
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
