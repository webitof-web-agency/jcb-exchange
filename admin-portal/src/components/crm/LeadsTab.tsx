'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { Download, Plus, Search, Tag, UserPlus } from 'lucide-react';
import api from '@/lib/api';
import { Button, cellClass, EmptyState, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, tableHeadClass } from '@/components/financeWorkspace/ui';
import { AssignModal } from './CrmModals';
import LeadForm from './LeadForm';
import {
  chipClass,
  CrmErrorBanner,
  crmError,
  fmtDate,
  fmtDateTime,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  PriorityBadge,
  relative,
  selectClass,
  StatusBadge,
  TemperatureBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type LeadRow,
} from './crmShared';

type LeadList = { page: number; pageSize: number; total: number; items: LeadRow[]; statusCounts: Record<string, number> };

const FILTER_KEYS = ['view', 'status', 'leadType', 'source', 'ownerId', 'temperature', 'priority', 'followUp', 'sla', 'recipient', 'tag', 'sort'] as const;
type Filters = Record<(typeof FILTER_KEYS)[number] | 'q', string>;

export const requirementSummary = (lead: Pick<LeadRow, 'listingTitleSnapshot' | 'budgetMax' | 'budgetMin' | 'requirementCity' | 'message'>) =>
  lead.listingTitleSnapshot
  || [lead.budgetMax ? `Budget ${fmtInr(lead.budgetMax)}` : null, lead.requirementCity].filter(Boolean).join(' · ')
  || lead.message?.slice(0, 70)
  || '—';

export default function LeadsTab() {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const router = useRouter();
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => {
    const initial = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) || ''])) as Filters;
    return { ...initial, view: initial.view || (initial.followUp || initial.status ? '' : 'open'), q: params.get('q') || '' };
  });
  const [search, setSearch] = useState(filters.q);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [tagging, setTagging] = useState(false);
  const query = useMemo(() => ({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: 25 }), [filters, page]);
  const leads = useCrmResource(() => getJson<LeadList>('/crm/leads', query), JSON.stringify(query));
  const access = meta?.access;

  const set = (key: keyof Filters, value: string) => { setFilters((f) => ({ ...f, [key]: f[key] === value ? '' : value })); setPage(1); setSelected([]); };
  const items = leads.data?.items || [];
  const totalPages = Math.max(1, Math.ceil((leads.data?.total || 0) / 25));
  const allSelected = items.length > 0 && items.every((l) => selected.includes(l.id));
  const [now] = useState(() => Date.now());

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
    <Panel
      title="Leads"
      description="Every enquiry in one place — website, Prime, dealer callbacks, walk-ins, calls, imports and APIs."
      actions={(
        <>
          {access?.canExport ? <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Export</Button> : null}
          {access?.canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New lead</Button> : null}
        </>
      )}
    >
      <div className="space-y-3 border-b border-slate-100 p-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setFilters((f) => ({ ...f, q: search })); setPage(1); }}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, mobile, machine, city, notes…" className={`${inputClass} pl-9`} />
          </div>
          <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))} className={`${selectClass} sm:w-48`}>
            <option value="">Newest first</option>
            <option value="followup">Next follow-up</option>
            <option value="score">Highest score</option>
            <option value="activity">Recent activity</option>
            <option value="oldest">Oldest first</option>
          </select>
        </form>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[['open', 'Open'], ['closed', 'Closed'], ['', 'All']].map(([v, l]) => <button key={l} type="button" className={chipClass(filters.view === v && !filters.status)} onClick={() => { setFilters((f) => ({ ...f, view: v as string, status: '' })); setPage(1); }}>{l}</button>)}
          <span className="mx-1 w-px bg-slate-200" />
          {(meta?.enums.statuses || []).map((s) => (
            <button key={s} type="button" className={chipClass(filters.status === s)} onClick={() => set('status', s)}>
              {label(s)}{leads.data?.statusCounts[s] ? <span className="ml-1 opacity-60">{leads.data.statusCounts[s]}</span> : null}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <select value={filters.followUp} onChange={(e) => setFilters((f) => ({ ...f, followUp: e.target.value }))} className={selectClass}>
            <option value="">Any follow-up</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="upcoming">Upcoming</option>
            <option value="none">No follow-up planned</option>
          </select>
          {!access?.isPartner ? (
            <select value={filters.ownerId} onChange={(e) => setFilters((f) => ({ ...f, ownerId: e.target.value }))} className={selectClass}>
              <option value="">Any owner</option>
              <option value="me">Mine</option>
              {access?.canAssign ? <option value="none">Unassigned</option> : null}
              {access?.canSeeAll ? meta?.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : null}
            </select>
          ) : null}
          <select value={filters.leadType} onChange={(e) => setFilters((f) => ({ ...f, leadType: e.target.value }))} className={selectClass}>
            <option value="">Any type</option>
            {(meta?.enums.leadTypes || []).map((t) => <option key={t} value={t}>{LEAD_TYPE_LABELS[t] || label(t)}</option>)}
          </select>
          <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} className={selectClass}>
            <option value="">Any source</option>
            {(meta?.config.sources || []).map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          <select value={filters.temperature} onChange={(e) => setFilters((f) => ({ ...f, temperature: e.target.value }))} className={selectClass}>
            <option value="">Hot / warm / cold</option>
            {(meta?.enums.temperatures || []).map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} className={selectClass}>
            <option value="">Any priority</option>
            {(meta?.enums.priorities || []).map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </select>
        </div>
      </div>

      {selected.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-slate-800">{selected.length} selected</span>
          {access?.canAssign ? <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setAssigning(true)}>Assign</Button> : null}
          <Button icon={<Tag className="h-4 w-4" />} onClick={() => setTagging(true)}>Tag / priority</Button>
          <Button variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      ) : null}

      {leads.loading && !leads.data ? <LoadingState /> : leads.error ? <CrmErrorBanner message={leads.error} schemaMissing={leads.schemaMissing} /> : !items.length ? (
        <EmptyState title="No leads match" description="Change the filters, or add a lead from a call or walk-in." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className="w-10 px-4 py-3"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : items.map((l) => l.id))} aria-label="Select all" className="accent-amber-500" /></th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Enquiry</th>
                <th className="px-4 py-3">Status</th>
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
                      <p className="max-w-[260px] truncate text-xs text-slate-500">{requirementSummary(lead)}</p>
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
            <span>{leads.data?.total} leads</span>
            <div className="flex gap-2">
              <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="self-center">Page {page} / {totalPages}</span>
              <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}

      {creating ? <LeadForm onClose={() => setCreating(false)} onCreated={(id) => router.push(leadHref(base, id))} /> : null}
      {assigning ? <AssignModal leadIds={selected} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); setSelected([]); leads.reload(); }} /> : null}
      {tagging ? <BulkTagModal ids={selected} onClose={() => setTagging(false)} onDone={() => { setTagging(false); setSelected([]); leads.reload(); }} /> : null}
    </Panel>
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
