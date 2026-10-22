'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import {
  Download,
  Filter,
  Flame,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Tag,
  UserPlus,
  Users,
  X,
  AlertCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';
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
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  PageHeader,
  phoneLinks,
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
const VIEWS: Array<{ key: string; label: string; filters: Partial<Filters>; needs?: 'assign'; icon?: typeof Flame }> = [
  { key: 'open', label: 'Open Leads', filters: { view: 'open' } },
  { key: 'today', label: 'Due Today', filters: { followUp: 'today' } },
  { key: 'overdue', label: 'Overdue Follow-up', filters: { followUp: 'overdue' } },
  { key: 'hot', label: 'Hot Leads', filters: { view: 'open', temperature: 'HOT' } },
  { key: 'none', label: 'No Next Step', filters: { followUp: 'none' } },
  { key: 'unassigned', label: 'Unassigned', filters: { view: 'open', ownerId: 'none' }, needs: 'assign' },
  { key: 'sla', label: 'SLA Breached', filters: { sla: 'breached' } },
  { key: 'closed', label: 'Closed Deals', filters: { view: 'closed' } },
  { key: 'all', label: 'All Records', filters: {} },
];

const sameFilters = (a: Filters, b: Partial<Filters>) =>
  FILTER_KEYS.filter((k) => k !== 'sort' && k !== 'q').every((key) => (a[key] || '') === (b[key] || ''));

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
  const query = useMemo(
    () => ({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: PAGE_SIZE }),
    [filters, page],
  );
  const leads = useCrmResource(() => getJson<LeadList>('/crm/leads', query), JSON.stringify(query));
  const access = meta?.access;

  const apply = (next: Filters) => {
    setFilters(next);
    setPage(1);
    setSelected([]);
  };
  const set = (key: keyof Filters, value: string) => apply({ ...filters, [key]: value });
  const items = leads.data?.items || [];
  const total = leads.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allSelected = items.length > 0 && items.every((l) => selected.includes(l.id));
  const activeView = VIEWS.find((v) => sameFilters(filters, v.filters))?.key;
  const hasExtraFilters = Boolean(
    filters.status ||
      filters.leadType ||
      filters.source ||
      filters.priority ||
      filters.tag ||
      filters.recipient ||
      (filters.ownerId && activeView !== 'unassigned') ||
      (filters.temperature && activeView !== 'hot'),
  );

  const exportCsv = async () => {
    try {
      const response = await api.get('/crm/leads/export.csv', {
        params: { ...query, page: undefined, pageSize: undefined },
        responseType: 'blob',
      });
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
        title="Leads & Inquiries Management"
        badgeText={`${total} Total Inquiries`}
        description="Unified buyer & seller inquiries from marketplace listings, Prime, dealer callbacks, walk-ins, phone inquiries, and CSV imports."
        actions={
          <>
            {access?.canExport ? (
              <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>
                Export CSV
              </Button>
            ) : null}
            {access?.canManage ? (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                Create New Lead
              </Button>
            ) : null}
          </>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
        {/* 1. SAVED VIEWS TABS */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 pt-3 custom-scrollbar">
          {VIEWS.filter((v) => v.needs !== 'assign' || access?.canAssign).map((v) => {
            const on = activeView === v.key;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => apply({ ...emptyFilters(), sort: filters.sort, q: filters.q, ...v.filters })}
                className={`shrink-0 border-b-2 px-3 pb-2.5 text-xs font-bold transition-all duration-150 ${
                  on
                    ? 'border-amber-500 text-slate-900 shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {/* 2. COMPACT FILTER TOOLBAR */}
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3.5 sm:p-4 md:grid-cols-3 xl:grid-cols-[minmax(220px,2fr)_repeat(6,minmax(0,1fr))]">
          <form
            className="relative col-span-2 md:col-span-3 xl:col-span-1"
            onSubmit={(e) => {
              e.preventDefault();
              set('q', search);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, mobile, machine, city, notes…"
              className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 py-1.5 pl-9 pr-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
              aria-label="Search leads"
            />
          </form>

          <select
            value={filters.status}
            onChange={(e) => set('status', e.target.value)}
            className={`${compactSelectClass} w-full`}
            aria-label="Status"
          >
            <option value="">Any Status</option>
            {(meta?.enums.statuses || []).map((s) => (
              <option key={s} value={s}>
                {label(s)}
                {leads.data?.statusCounts[s] ? ` (${leads.data.statusCounts[s]})` : ''}
              </option>
            ))}
          </select>

          {!access?.isPartner ? (
            <select
              value={filters.ownerId}
              onChange={(e) => set('ownerId', e.target.value)}
              className={`${compactSelectClass} w-full`}
              aria-label="Owner"
            >
              <option value="">All Executives</option>
              <option value="me">My Leads</option>
              {access?.canAssign ? <option value="none">Unassigned</option> : null}
              {access?.canSeeAll ? meta?.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : null}
            </select>
          ) : null}

          <select
            value={filters.leadType}
            onChange={(e) => set('leadType', e.target.value)}
            className={`${compactSelectClass} w-full`}
            aria-label="Lead type"
          >
            <option value="">All Lead Types</option>
            {(meta?.enums.leadTypes || []).map((t) => (
              <option key={t} value={t}>
                {LEAD_TYPE_LABELS[t] || label(t)}
              </option>
            ))}
          </select>

          <select
            value={filters.source}
            onChange={(e) => set('source', e.target.value)}
            className={`${compactSelectClass} w-full`}
            aria-label="Source"
          >
            <option value="">All Sources</option>
            {(meta?.config.sources || []).map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>

          <select
            value={filters.priority}
            onChange={(e) => set('priority', e.target.value)}
            className={`${compactSelectClass} w-full`}
            aria-label="Priority"
          >
            <option value="">All Priorities</option>
            {(meta?.enums.priorities || []).map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>

          <select
            value={filters.sort}
            onChange={(e) => set('sort', e.target.value)}
            className={`${compactSelectClass} w-full`}
            aria-label="Sort"
          >
            <option value="">Newest First</option>
            <option value="followup">Next Follow-up Due</option>
            <option value="score">Highest Intent Score</option>
            <option value="activity">Recent Activity</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>

        {/* 3. TOOLBAR METRICS & BULK ACTION BAR */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">
              {total} {total === 1 ? 'Lead' : 'Leads'}
            </span>
            {hasExtraFilters || filters.q ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  apply({ ...emptyFilters(), view: 'open' });
                }}
                className="inline-flex items-center gap-1 rounded-md bg-amber-100/70 text-amber-900 px-2 py-0.5 font-bold hover:bg-amber-200 transition-colors"
              >
                <X className="h-3 w-3" />
                Reset Filters
              </button>
            ) : null}
          </div>

          {selected.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 border border-amber-200/80 px-3 py-1">
              <span className="font-bold text-amber-900">{selected.length} Selected</span>
              {access?.canAssign ? (
                <button
                  type="button"
                  onClick={() => setAssigning(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-400 hover:bg-amber-300 px-2 py-1 text-[11px] font-bold text-slate-950 transition-colors"
                >
                  <UserPlus className="h-3 w-3" />
                  Assign
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setTagging(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Tag className="h-3 w-3" />
                Tag / Priority
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>

        {/* 4. HIGH-DENSITY LEADS TABLE */}
        {leads.loading && !leads.data ? (
          <LoadingState label="Loading leads data…" />
        ) : leads.error ? (
          <CrmErrorBanner message={leads.error} schemaMissing={leads.schemaMissing} />
        ) : !items.length ? (
          <EmptyState
            title="No leads match your active filters"
            description="Try choosing another filter tab or create a new lead to start tracking."
          />
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[1060px] text-left text-xs">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="w-10 px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? [] : items.map((l) => l.id))}
                      aria-label="Select all"
                      className="accent-amber-500 rounded"
                    />
                  </th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Customer & Contact</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Requirement / Vehicle</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Stage & SLA</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Intent & Heat</th>
                  {!access?.isPartner ? <th className="px-3.5 py-2.5 font-bold text-slate-700">Executive</th> : null}
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Next Follow-up</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Source</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700 text-right">Quick Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((lead) => {
                  const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now;
                  const open = lead.status !== 'WON' && lead.status !== 'LOST';
                  const links = phoneLinks(lead.customer.mobile, lead.customer.whatsappNumber);

                  return (
                    <tr
                      key={lead.id}
                      className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                      onClick={() => router.push(leadHref(base, lead.id))}
                    >
                      <td className={cellClass} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(lead.id)}
                          onChange={() =>
                            setSelected((s) => (s.includes(lead.id) ? s.filter((id) => id !== lead.id) : [...s, lead.id]))
                          }
                          aria-label="Select lead"
                          className="accent-amber-500 rounded"
                        />
                      </td>

                      <td className={cellClass}>
                        <p className="font-bold text-slate-900 text-xs hover:text-amber-600 transition-colors">
                          {lead.customer.name || 'Unnamed Customer'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {lead.customer.mobile || '—'}
                          {lead.customer.city ? ` · ${lead.customer.city}` : ''}
                        </p>
                      </td>

                      <td className={cellClass}>
                        <p className="font-bold text-slate-800 text-xs">
                          {LEAD_TYPE_LABELS[lead.leadType] || label(lead.leadType)}
                        </p>
                        <p className="max-w-[280px] truncate text-[11px] text-slate-500 font-medium">
                          {requirementSummary(lead)}
                        </p>
                      </td>

                      <td className={cellClass}>
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={lead.status} />
                          {lead.slaBreachedAt && !lead.firstResponseAt ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                              <span className="h-1 w-1 rounded-full bg-rose-500 animate-pulse" />
                              SLA Missed
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className={cellClass}>
                        <div className="flex flex-col items-start gap-1">
                          <TemperatureBadge temperature={lead.temperature} score={lead.score} />
                          <PriorityBadge priority={lead.priority} />
                        </div>
                      </td>

                      {!access?.isPartner ? (
                        <td className={cellClass}>
                          <span
                            className={`text-xs ${
                              lead.owner ? 'font-semibold text-slate-700' : 'font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80'
                            }`}
                          >
                            {lead.owner?.name || 'Unassigned'}
                          </span>
                        </td>
                      ) : null}

                      <td className={cellClass}>
                        {lead.nextFollowUpAt ? (
                          <>
                            <p className={`text-xs font-semibold ${overdue ? 'text-rose-600' : 'text-slate-800'}`}>
                              {fmtDateTime(lead.nextFollowUpAt)}
                            </p>
                            <p className={`text-[10px] font-medium ${overdue ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                              {relative(lead.nextFollowUpAt, now)}
                            </p>
                          </>
                        ) : open ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            <Clock className="h-2.5 w-2.5" />
                            Not Planned
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>

                      <td className={cellClass}>
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {label(lead.source)}
                        </span>
                        {lead.dealer.role === 'PARTNER' && !access?.isPartner ? (
                          <p className="text-[10px] text-slate-400 mt-0.5">via {lead.dealer.name}</p>
                        ) : null}
                      </td>

                      <td className={`${cellClass} text-right`} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {links.wa ? (
                            <a
                              href={links.wa}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          {links.tel ? (
                            <a
                              href={links.tel}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
                              title="Direct Phone Call"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* PAGINATION FOOTER */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 gap-2">
              <span className="font-medium">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} leads
              </span>
              <div className="flex items-center gap-2">
                <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="font-bold text-slate-700">
                  Page {page} of {totalPages}
                </span>
                <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {creating ? (
        <LeadForm onClose={() => setCreating(false)} onCreated={(id) => router.push(leadHref(base, id))} />
      ) : null}
      {assigning ? (
        <AssignModal
          leadIds={selected}
          onClose={() => setAssigning(false)}
          onDone={() => {
            setAssigning(false);
            setSelected([]);
            leads.reload();
          }}
        />
      ) : null}
      {tagging ? (
        <BulkTagModal
          ids={selected}
          onClose={() => setTagging(false)}
          onDone={() => {
            setTagging(false);
            setSelected([]);
            leads.reload();
          }}
        />
      ) : null}
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
      toast.success('Leads updated successfully.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not update leads.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Batch Update ${ids.length} Leads`} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-6">
        <Field label="Assign Tag">
          <input
            list="crm-tags"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className={inputClass}
            placeholder="Type or pick tag..."
          />
          <datalist id="crm-tags">
            {(meta?.config.tags || []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Set Priority Level">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass}>
            <option value="">Don&apos;t change priority</option>
            {(meta?.enums.priorities || []).map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!tag && !priority} onClick={save}>
            Apply Changes
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

export default function CrmLeadsPage() {
  return (
    <CrmPageFrame>
      <Leads />
    </CrmPageFrame>
  );
}
