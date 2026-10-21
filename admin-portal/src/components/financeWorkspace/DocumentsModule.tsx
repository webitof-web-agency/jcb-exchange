'use client';

import { FormEvent, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import api from '@/lib/api';
import { enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import DocumentDetail from './DocumentDetail';
import DocumentForm from './DocumentForm';
import { documentLabel, documentStatusTone, managePermission, reasonLabel, type DocumentStatus, type DocumentType, type FinDocument, type NoteReason } from './documentsShared';
import { useLedgerLookups } from './ledgerLookups';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, inputClass, LoadingState, Panel, ReadOnlyNotice, tableHeadClass } from './ui';
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
  const [filters, setFilters] = useState({ from: '', to: '', status: '', q: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const list = useResource(
    async () => (await api.get('/finance-hub/documents', { params: { types: types.join(','), reason, status: applied.status || undefined, from: applied.from || undefined, to: applied.to || undefined, q: applied.q || undefined, page, pageSize: 25 } })).data as ListResponse,
    `documents-${types.join(',')}-${reason}-${applied.status}-${applied.from}-${applied.to}-${applied.q}-${page}-${version}`,
  );
  const [form, setForm] = useState<{ initial: FinDocument | null; type: DocumentType } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const refresh = () => setVersion((value) => value + 1);
  const totalPages = list.data ? Math.max(Math.ceil(list.data.total / list.data.pageSize), 1) : 1;
  const search = (event: FormEvent) => { event.preventDefault(); setPage(1); setApplied(filters); };

  const body = (
    <>
      {!lookups.loading && !lookups.installed && !lookups.error ? <ReadOnlyNotice>Install the chart of accounts and create a financial year first.</ReadOnlyNotice> : null}
      <form onSubmit={search} className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_160px_160px_160px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Number, party, bill no. or original invoice…" className={`${inputClass} pl-9`} />
        </div>
        <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} aria-label="From date" />
        <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} aria-label="To date" />
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={inputClass} aria-label="Status">
          <option value="">All statuses</option>
          {(['DRAFT', 'POSTED', 'CANCELLED'] as const).map((status) => <option key={status} value={status}>{enumLabel(status)}</option>)}
        </select>
        <Button type="submit">Apply</Button>
      </form>

      {list.data?.summary.length ? (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {list.data.summary.map((item) => <span key={item.status} className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600"><Badge tone={documentStatusTone[item.status]}>{enumLabel(item.status)}</Badge> {item.count} · {formatInr(item.total)}</span>)}
        </div>
      ) : null}

      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.documents.length ? (
        <EmptyState title="Nothing here yet" description={creatable.length ? 'Use the button above. A document stays a draft until it is posted.' : 'Nothing matches these filters.'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Number</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Party</th><th className="px-4 py-2.5">Bill / reference</th><th className="px-4 py-2.5 text-right">Taxable</th><th className="px-4 py-2.5 text-right">GST</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.documents.map((document) => (
                  <tr key={document.id} onClick={() => setOpenId(document.id)} className="cursor-pointer hover:bg-amber-50/40">
                    <td className={`${cellClass} whitespace-nowrap`}>{formatDate(document.date)}</td>
                    <td className={`${cellClass} font-mono text-xs font-bold text-slate-900`}>{document.number ?? <span className="font-sans font-normal text-slate-400">Draft</span>}</td>
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
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>{list.data.total} documents</span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>
              Page {page} of {totalPages}
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />}>Next</Button>
            </span>
          </div>
        </>
      )}

      {form && !lookups.loading ? (
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

  const actions = creatable.length ? creatable.map((type, index) => (
    <Button key={type} variant={index === 0 ? 'primary' : 'secondary'} icon={<Plus className="h-4 w-4" />} disabled={!lookups.installed} onClick={() => setForm({ initial: null, type })}>New {documentLabel[type].toLowerCase()}</Button>
  )) : null;

  return embedded ? (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4"><p className="text-sm text-slate-500">{description}</p><div className="flex gap-2">{actions}</div></div>
      {body}
    </div>
  ) : <Panel title={title} description={description} actions={actions}>{body}</Panel>;
}
