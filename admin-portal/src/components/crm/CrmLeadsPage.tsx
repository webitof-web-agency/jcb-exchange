'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { Download, Plus, Search, Tag, UserPlus, X } from 'lucide-react';
import api from '@/lib/api';
import { Button, cellClass, EmptyState, Field, inputClass, LoadingState, Modal, ModalFooter, tableHeadClass } from '@/components/financeWorkspace/ui';
import { AssignModal } from './CrmModals';
import LeadForm from './LeadForm';
import {
  compactSelectClass,
  CrmErrorBanner,
  crmError,
  CrmPageFrame,
  fmtDate,
  fmtDateTime,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  PageHeader,
  PriorityBadge,
  relative,
  requirementSummary,
  selectClass,
  StatusBadge,
  TemperatureBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type LeadRow,
} from './crmShared';

type LeadList = { page: number; pageSize: number; total: number; items: LeadRow[]; statusCounts: Record<string, number> };

const FILTER_KEYS = ['view', 'status', 'leadType', 'source', 'ownerId', 'temperature', 'priority', 'followUp', 'sla', 'recipient', 'tag', 'sort', 'q'] as const;
type Filters = Record<(typeof FILTER_KEYS)[number], string>;
const PAGE_SIZE = 50;

const emptyFilters = (): Filters => Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])) as Filters;

// Saved views: one click sets a filter combination.
const VIEWS: Array<{ key: string; label: string; filters: Partial<Filters>; needs?: 'assign' }> = [
  { key: 'open', label: 'Open', filters: { view: 'open' } },
  { key: 'overdue', label: 'Follow-up overdue', filters: { followUp: 'overdue' } },
  { key: 'today', label: 'Due today', filters: { followUp: 'today' } },
  { key: 'none', label: 'No next step', filters: { followUp: 'none' } },
  { key: 'unassigned', label: 'Unassigned', filters: { view: 'open', ownerId: 'none' }, needs: 'assign' },
  { key: 'hot', label: 'Hot', filters: { view: 'open', temperature: 'HOT' } },
  { key: 'sla', label: 'SLA missed', filters: { sla: 'breached' } },
  { key: 'closed', label: 'Closed', filters: { view: 'closed' } },
  { key: 'all', label: 'All', filters: {} },
];

const sameFilters = (a: Filters, b: Partial<Filters>) => FILTER_KEYS.filter((k) => k !== 'sort' && k !== 'q').every((key) => (a[key] || '') === (b[key] || ''));

function Leads() {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const router = useRouter();
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => {
    const initial = emptyFilters();
    for (const key of FILTER_KEYS) initial[key] = params.get(key) || '';
    if (!FILTER_KEYS.some((key) => key !== 'sort' && initial[key])) initial.view = 'open';
    return initial;
  });
  const [search, setSearch] = useState(filters.q);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [now] = useState(() => Date.now());
  const query = useMemo(() => ({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: PAGE_SIZE }), [filters, page]);
  const leads = useCrmResource(() => getJson<LeadList>('/crm/leads', query), JSON.stringify(query));
  const access = meta?.access;

  const apply = (next: Filters) => { setFilters(next); setPage(1); setSelected([]); };
  const set = (key: keyof Filters, value: string) => apply({ ...filters, [key]: value });
  const items = leads.data?.items || [];
  const total = leads.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allSelected = items.length > 0 && items.every((l) => selected.includes(l.id));
  const activeView = VIEWS.find((v) => sameFilters(filters, v.filters))?.key;
  const hasExtraFilters = Boolean(filters.status || filters.leadType || filters.source || filters.priority || filters.tag || filters.recipient || (filters.ownerId && activeView !== 'unassigned') || (filters.temperature && activeView !== 'hot'));

  const exportCsv = async () => {
    try {
      const response = await api.get('/crm/leads/export.csv', { params: { ...query, page: undefined, pageSize: undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(crmError(error, 'Export failed.'));
    }
  };

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every enquiry in one place — website, Prime, dealer callbacks, walk-ins, calls, imports and the lead API."
        actions={(
          <>
            {access?.canExport ? <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Export CSV</Button> : null}
            {access?.canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New lead</Button> : null}
          </>
        )}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Saved views */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 pt-3">
          {VIEWS.filter((v) => v.needs !== 'assign' || access?.canAssign).map((v) => {
            const on = activeView === v.key;
            return (
              <button key={v.key} type="button" onClick={() => apply({ ...emptyFilters(), sort: filters.sort, q: filters.q, ...v.filters })} className={`shrink-0 border-b-2 px-3 pb-2.5 text-sm font-semibold transition ${on ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {v.label}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4 md:grid-cols-3 xl:grid-cols-[minmax(240px,2fr)_repeat(6,minmax(0,1fr))]">
          <form className="relative col-span-2 md:col-span-3 xl:col-span-1" onSubmit={(e) => { e.preventDefault(); set('q', search); }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, mobile, machine, city, notes…" className={`${inputClass} py-2 pl-9`} aria-label="Search leads" />
          </form>
          <select value={filters.status} onChange={(e) => set('status', e.target.value)} className={`${compactSelectClass} w-full`} aria-label="Status">
            <option value="">Any status</option>
            {(meta?.enums.statuses || []).map((s) => <option key={s} value={s}>{label(s)}{leads.data?.statusCounts[s] ? ` (${leads.data.statusCounts[s]})` : ''}</option>)}
          </select>
          {!access?.isPartner ? (
            <select value={filters.ownerId} onChange={(e) => set('ownerId', e.target.value)} className={`${compactSelectClass} w-full`} aria-label="Owner">
              <option value="">Any owner</option>
              <option value="me">Mine</option>
              {access?.canAssign ? <option value="none">Unassigned</option> : null}
              {access?.canSeeAll ? meta?.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : null}
            </select>
          ) : null}
          <select value={filters.leadType} onChange={(e) => set('leadType', e.target.value)} className={`${compactSelectClass} w-full`} aria-label="Lead type">
            <option value="">Any type</option>
            {(meta?.enums.leadTypes || []).map((t) => <option key={t} value={t}>{LEAD_TYPE_LABELS[t] || label(t)}</option>)}
          </select>
          <select value={filters.source} onChange={(e) => set('source', e.target.value)} className={`${compactSelectClass} w-full`} aria-label="Source">
            <option value="">Any source</option>
            {(meta?.config.sources || []).map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => set('priority', e.target.value)} className={`${compactSelectClass} w-full`} aria-label="Priority">
            <option value="">Any priority</option>
            {(meta?.enums.priorities || []).map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </select>
          <select value={filters.sort} onChange={(e) => set('sort', e.target.value)} className={`${compactSelectClass} w-full`} aria-label="Sort">
            <option value="">Newest first</option>
            <option value="followup">Next follow-up</option>
            <option value="score">Highest score</option>
            <option value="activity">Recent activity</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
          <span className="font-semibold text-slate-700">{total} {total === 1 ? 'lead' : 'leads'}</span>
          {hasExtraFilters || filters.q ? <button type="button" onClick={() => { setSearch(''); apply({ ...emptyFilters(), view: 'open' }); }} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline"><X className="h-3.5 w-3.5" />Clear filters</button> : null}
          {selected.length ? (
            <div className="ml-auto flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-1.5">
              <span className="text-xs font-semibold text-slate-800">{selected.length} selected</span>
              {access?.canAssign ? <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setAssigning(true)}>Assign</Button> : null}
              <Button icon={<Tag className="h-4 w-4" />} onClick={() => setTagging(true)}>Tag / priority</Button>
              <Button variant="ghost" onClick={() => setSelected([])}>Clear</Button>
            </div>
          ) : null}
        </div>

        {leads.loading && !leads.data ? <LoadingState /> : leads.error ? <CrmErrorBanner message={leads.error} schemaMissing={leads.schemaMissing} /> : !items.length ? (
          <EmptyState title="No leads match" description="Try another view, or add a lead from a call or walk-in." />
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="w-10 px-4 py-3"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : items.map((l) => l.id))} aria-label="Select all" className="accent-amber-500" /></th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Enquiry</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Heat</th>
                  {!access?.isPartner ? <th className="px-4 py-3">Owner</th> : null}
                  <th className="px-4 py-3">Next follow-up</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((lead) => {
                  const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now;
                  const open = lead.status !== 'WON' && lead.status !== 'LOST';
                  return (
                    <tr key={lead.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(leadHref(base, lead.id))}>
                      <td className={cellClass} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(lead.id)} onChange={() => setSelected((s) => (s.includes(lead.id) ? s.filter((id) => id !== lead.id) : [...s, lead.id]))} aria-label="Select lead" className="accent-amber-500" />
                      </td>
                      <td className={cellClass}>
                        <p className="font-semibold text-slate-900">{lead.customer.name || 'Unnamed'}</p>
                        <p className="text-xs text-slate-500">{lead.customer.mobile || '—'}{lead.customer.city ? ` · ${lead.customer.city}` : ''}</p>
                      </td>
                      <td className={cellClass}>
                        <p className="font-medium text-slate-800">{LEAD_TYPE_LABELS[lead.leadType] || label(lead.leadType)}</p>
                        <p className="max-w-[300px] truncate text-xs text-slate-500">{requirementSummary(lead)}</p>
                      </td>
                      <td className={cellClass}>
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={lead.status} />
                          {lead.slaBreachedAt && !lead.firstResponseAt ? <span className="text-[10px] font-bold uppercase text-red-600">SLA missed</span> : null}
                        </div>
                      </td>
                      <td className={cellClass}><div className="flex flex-col items-start gap-1"><TemperatureBadge temperature={lead.temperature} score={lead.score} /><PriorityBadge priority={lead.priority} /></div></td>
                      {!access?.isPartner ? <td className={cellClass}><span className={lead.owner ? 'text-slate-700' : 'font-semibold text-amber-700'}>{lead.owner?.name || 'Unassigned'}</span></td> : null}
                      <td className={cellClass}>
                        {lead.nextFollowUpAt ? (
                          <><p className={overdue ? 'font-semibold text-red-600' : 'text-slate-700'}>{fmtDateTime(lead.nextFollowUpAt)}</p><p className={`text-xs ${overdue ? 'text-red-500' : 'text-slate-400'}`}>{relative(lead.nextFollowUpAt, now)}</p></>
                        ) : open ? <span className="text-xs font-semibold text-amber-700">Not planned</span> : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className={cellClass}><span className="text-xs text-slate-600">{label(lead.source)}</span>{lead.dealer.role === 'PARTNER' && !access?.isPartner ? <p className="text-[11px] text-slate-400">via {lead.dealer.name}</p> : null}</td>
                      <td className={cellClass}><span className="text-xs text-slate-500">{fmtDate(lead.createdAt)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <div className="flex items-center gap-2">
                <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span>Page {page} / {totalPages}</span>
                <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {creating ? <LeadForm onClose={() => setCreating(false)} onCreated={(id) => router.push(leadHref(base, id))} /> : null}
      {assigning ? <AssignModal leadIds={selected} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); setSelected([]); leads.reload(); }} /> : null}
      {tagging ? <BulkTagModal ids={selected} onClose={() => setTagging(false)} onDone={() => { setTagging(false); setSelected([]); leads.reload(); }} /> : null}
    </>
  );
}

function BulkTagModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const { meta } = useCrmMeta();
  const [tag, setTag] = useState('');
  const [priority, setPriority] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      if (tag) await api.post('/crm/leads/bulk', { ids, action: 'tag', tag });
      if (priority) await api.post('/crm/leads/bulk', { ids, action: 'priority', priority });
      toast.success('Leads updated.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not update the leads.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Update ${ids.length} leads`} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <Field label="Add tag">
          <input list="crm-tags" value={tag} onChange={(e) => setTag(e.target.value)} className={inputClass} />
          <datalist id="crm-tags">{(meta?.config.tags || []).map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Set priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass}>
            <option value="">Don&apos;t change</option>
            {(meta?.enums.priorities || []).map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </select>
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!tag && !priority} onClick={save}>Apply</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

export default function CrmLeadsPage() {
  return <CrmPageFrame><Leads /></CrmPageFrame>;
}
