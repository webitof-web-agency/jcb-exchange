'use client';

import { FormEvent, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, Plus, Search } from 'lucide-react';
import api from '@/lib/api';
import { enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess, useRequestedNew, useUrlFilters } from '@/lib/financeWorkspaceClient';
import { exportAllPages } from './exportRows';
import DocumentDetail from './DocumentDetail';
import DocumentForm from './DocumentForm';
import { documentLabel, documentStatusTone, managePermission, reasonLabel, type DocumentStatus, type DocumentType, type FinDocument, type NoteReason } from './documentsShared';
import { useLedgerLookups } from './ledgerLookups';
import { Badge, Button, cellClass, DatePresets, EmptyState, ErrorBanner, inputClass, LoadingState, Panel, ReadOnlyNotice, tableHeadClass } from './ui';
import { useResource } from './useResource';

type Row = Omit<FinDocument, 'lines'>;
type ListResponse = { documents: Row[]; total: number; page: number; pageSize: number; summary: Array<{ status: DocumentStatus; count: number; total: number; taxable: number }> };

/** Register of bills, invoices or notes with create, post and cancel. */
export default function DocumentsModule({ title, description, types, createTypes, reason, embedded = false }: {
  title: string;
  description: string;
  types: DocumentType[];
  createTypes: DocumentType[];
  /** Only notes with this reason (e.g. returns); new notes default to it. */
  reason?: NoteReason;
  embedded?: boolean;
}) {
  const access = useFinanceWorkspaceAccess();
  const creatable = createTypes.filter((type) => access.can([managePermission(type)]));
  const lookups = useLedgerLookups();
  const [applied, setApplied] = useUrlFilters({ from: '', to: '', status: '', q: '', page: '1' });
  const [filters, setFilters] = useState(applied);
  const page = Math.max(Number(applied.page) || 1, 1);
  const setPage = (next: number) => setApplied({ ...applied, page: String(next) });
  const apply = (next: typeof filters) => { setFilters(next); setApplied({ ...next, page: '1' }); };
  const [version, setVersion] = useState(0);
  const params = (pageNo: number, pageSize: number) => ({ types: types.join(','), reason, status: applied.status || undefined, from: applied.from || undefined, to: applied.to || undefined, q: applied.q || undefined, page: pageNo, pageSize });
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    await exportAllPages<Row>(
      async (pageNo, pageSize) => { const data = (await api.get('/finance-hub/documents', { params: params(pageNo, pageSize) })).data as ListResponse; return { rows: data.documents, total: data.total }; },
      [
        { header: 'Date', value: (row) => formatDate(row.date) },
        { header: 'Number', value: (row) => row.number ?? 'Draft' },
        { header: 'Type', value: (row) => documentLabel[row.docType] },
        { header: 'Party', value: (row) => row.party?.name ?? '' },
        { header: 'Bill / reference', value: (row) => row.partyDocNumber ?? row.againstReference ?? '' },
        { header: 'Taxable', value: (row) => row.subTotal },
        { header: 'CGST', value: (row) => row.cgst },
        { header: 'SGST', value: (row) => row.sgst },
        { header: 'IGST', value: (row) => row.igst },
        { header: 'Total', value: (row) => row.total },
        { header: 'Reverse charge', value: (row) => (row.isReverseCharge ? 'Yes' : 'No') },
        { header: 'Status', value: (row) => enumLabel(row.status) },
      ],
      title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    );
    setExporting(false);
  };
  const list = useResource(
    async () => (await api.get('/finance-hub/documents', { params: params(page, 25) })).data as ListResponse,
    `documents-${types.join(',')}-${reason}-${applied.status}-${applied.from}-${applied.to}-${applied.q}-${page}-${version}`,
  );
  const requestedNew = useRequestedNew(creatable);
  const [form, setForm] = useState<{ initial: FinDocument | null; type: DocumentType } | null>(requestedNew ? { initial: null, type: requestedNew } : null);
  const [openId, setOpenId] = useState<string | null>(null);
  const refresh = () => setVersion((value) => value + 1);
  const totalPages = list.data ? Math.max(Math.ceil(list.data.total / list.data.pageSize), 1) : 1;
  const search = (event: FormEvent) => { event.preventDefault(); apply(filters); };

  const body = (
    <>
      {!lookups.loading && !lookups.installed && !lookups.error ? <ReadOnlyNotice>Install the chart of accounts and create a financial year first.</ReadOnlyNotice> : null}
      <form onSubmit={search} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Number, party, bill no. or original invoice…" className={`${inputClass} pl-8`} />
        </div>
        <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={`${inputClass} w-[136px]`} aria-label="From date" />
        <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={`${inputClass} w-[136px]`} aria-label="To date" />
        <select value={filters.status} onChange={(event) => apply({ ...filters, status: event.target.value })} className={`${inputClass} w-36`} aria-label="Status">
          <option value="">All statuses</option>
          {(['DRAFT', 'POSTED', 'CANCELLED'] as const).map((status) => <option key={status} value={status}>{enumLabel(status)}</option>)}
        </select>
        <Button type="submit">Apply</Button>
        <DatePresets from={filters.from} to={filters.to} onSelect={(range) => apply({ ...filters, ...range })} />
      </form>

      {list.data?.summary.length ? (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {list.data.summary.map((item) => {
            const active = applied.status === item.status;
            return (
              <button key={item.status} type="button" onClick={() => apply({ ...filters, status: active ? '' : item.status })} title={active ? 'Show all statuses' : `Show only ${enumLabel(item.status).toLowerCase()}`} className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] text-slate-600 transition hover:border-slate-300 ${active ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                <Badge tone={documentStatusTone[item.status]}>{enumLabel(item.status)}</Badge>{item.count} · {formatInr(item.total)}
              </button>
            );
          })}
        </div>
      ) : null}

      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.documents.length ? (
        <EmptyState title="Nothing here yet" description={creatable.length ? 'Use the button above. A document stays a draft until it is posted.' : 'Nothing matches these filters.'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Number</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Bill / reference</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">GST</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.documents.map((document) => (
                  <tr key={document.id} onClick={() => setOpenId(document.id)} className="cursor-pointer hover:bg-amber-50/40">
                    <td className={`${cellClass} whitespace-nowrap`}>{formatDate(document.date)}</td>
                    <td className={`${cellClass} font-mono text-xs font-semibold text-slate-900`}>{document.number ?? <span className="font-sans font-normal text-slate-400">Draft</span>}</td>
                    <td className={cellClass}>{documentLabel[document.docType]}{document.reason ? <span className="block text-[11px] text-slate-500">{reasonLabel[document.reason]}</span> : null}</td>
                    <td className={`${cellClass} text-xs`}>{document.party?.name ?? '—'}</td>
                    <td className={`${cellClass} font-mono text-xs`}>{document.partyDocNumber ?? document.againstReference ?? '—'}</td>
                    <td className={`${cellClass} text-right`}>{formatInr(document.subTotal)}</td>
                    <td className={`${cellClass} text-right text-xs`}>{formatInr(document.cgst + document.sgst + document.igst)}{document.isReverseCharge ? <span className="block text-[11px] text-violet-700">RCM</span> : null}</td>
                    <td className={`${cellClass} text-right font-semibold`}>{formatInr(document.total)}</td>
                    <td className={cellClass}><Badge tone={documentStatusTone[document.status]}>{enumLabel(document.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span>{list.data.total} documents</span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>
              Page {page} of {totalPages}
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />}>Next</Button>
            </span>
          </div>
        </>
      )}

      {form && !lookups.loading && (lookups.installed || form.initial) ? (
        <DocumentForm
          lookups={lookups}
          initial={form.initial}
          createTypes={creatable}
          defaultType={form.type}
          defaultReason={reason}
          onClose={() => setForm(null)}
          onSaved={(id) => { setForm(null); refresh(); setOpenId(id); }}
        />
      ) : null}
      {openId && !form ? <DocumentDetail key={`${openId}-${version}`} documentId={openId} lookups={lookups} onClose={() => setOpenId(null)} onChanged={refresh} onEdit={(document) => setForm({ initial: document, type: document.docType })} /> : null}
    </>
  );

  const actions = (
    <>
      <Button icon={<FileSpreadsheet />} busy={exporting} onClick={() => void exportCsv()}>Export CSV</Button>
      {creatable.map((type, index) => (
        <Button key={type} variant={index === 0 ? 'primary' : 'secondary'} icon={<Plus className="h-4 w-4" />} disabled={!lookups.installed} onClick={() => setForm({ initial: null, type })}>New {documentLabel[type].toLowerCase()}</Button>
      ))}
    </>
  );

  return embedded ? (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-3"><p className="text-[13px] text-slate-500">{description}</p><div className="flex gap-2">{actions}</div></div>
      {body}
    </div>
  ) : <Panel title={title} description={description} actions={actions}>{body}</Panel>;
}
