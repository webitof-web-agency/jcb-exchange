'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import {
  Download,
  Kanban,
  List,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Tag,
  UserPlus,
  X,
  SlidersHorizontal,
  Clock,
} from 'lucide-react';
import api from '@/lib/api';
import { Button, cellClass, EmptyState, Field, inputClass, Modal, ModalFooter, tableHeadClass } from '@/components/financeWorkspace/ui';
import { AssignModal } from './CrmModals';
import LeadForm from './LeadForm';
import CrmPipelineStageManager from './CrmPipelineStageManager';
import { CrmPipelineBoard } from './CrmPipelinePage';
import {
  CrmErrorBanner,
  CrmSelect,
  CrmLoadingState,
  crmError,
  CrmPageFrame,
  EnquiryChannelBadge,
  fmtDateTime,
  fmtInr,
  getJson,
  isTerminalStatus,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  leadWhatsAppMessage,
  phoneLinks,
  PriorityBadge,
  relative,
  requirementSummary,
  StatusBadge,
  TemperatureBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type LeadRow,
} from './crmShared';
import { LEAD_SAVED_VIEWS } from './leadViews';

type LeadList = { page: number; pageSize: number; total: number; items: LeadRow[]; statusCounts: Record<string, number>; viewCounts?: Record<string, number> };

const FILTER_KEYS = ['view', 'status', 'leadType', 'source', 'ownerId', 'temperature', 'priority', 'followUp', 'sla', 'recipient', 'tag', 'sort', 'q'] as const;
type Filters = Record<(typeof FILTER_KEYS)[number], string>;
const PAGE_SIZE = 50;

const emptyFilters = (): Filters => Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])) as Filters;

const sameFilters = (a: Filters, b: Partial<Filters>) =>
  FILTER_KEYS.filter((k) => k !== 'sort' && k !== 'q').every((key) => (a[key] || '') === (b[key] || ''));

function Leads() {
  const { meta, reloadMeta } = useCrmMeta();
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
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => params.get('display') === 'kanban' ? 'kanban' : 'list');
  const [stageManagerOpen, setStageManagerOpen] = useState(false);
  const [kanbanRefreshToken, setKanbanRefreshToken] = useState(0);
  const [now] = useState(() => Date.now());
  const query = useMemo(
    () => ({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: PAGE_SIZE }),
    [filters, page],
  );
  const boardQuery = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    [filters],
  );
  const leads = useCrmResource(() => getJson<LeadList>('/crm/leads', query), JSON.stringify(query));
  const access = meta?.access;

  const apply = (next: Filters) => {
    setFilters(next);
    setPage(1);
    setSelected([]);
  };
  const set = (key: keyof Filters, value: string) => apply({ ...filters, [key]: value });
  const stageName = (status: string) => meta?.pipelineStages.find((stage) => stage.code === status)?.name || label(status);
  const refreshWorkspace = () => {
    leads.reload();
    setKanbanRefreshToken((value) => value + 1);
  };
  const items = leads.data?.items || [];
  const total = leads.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allSelected = items.length > 0 && items.every((l) => selected.includes(l.id));
  const activeView = LEAD_SAVED_VIEWS.find((v) => sameFilters(filters, v.filters))?.key;
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

  const renderSavedView = (v: (typeof LEAD_SAVED_VIEWS)[number]) => {
    const on = activeView === v.key;
    const count = leads.data?.viewCounts?.[v.key] ?? (
      v.key === 'won' ? leads.data?.statusCounts?.WON :
      v.key === 'lost' ? leads.data?.statusCounts?.LOST :
      undefined
    );

    return (
      <button
        key={v.key}
        type="button"
        onClick={() => apply({ ...emptyFilters(), sort: filters.sort, q: filters.q, ...v.filters })}
        className={`shrink-0 inline-flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-bold transition-all duration-150 ${
          on
            ? 'border-amber-500 text-slate-900 shadow-2xs'
            : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
        }`}
      >
        <span>{v.label}</span>
        {count !== undefined ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-black transition-colors ${
              on
                ? v.key === 'won'
                  ? 'bg-emerald-600 text-white'
                  : v.key === 'lost'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-900 text-white'
                : v.key === 'won'
                ? 'bg-emerald-100 text-emerald-800'
                : v.key === 'lost'
                ? 'bg-rose-100 text-rose-800'
                : v.key === 'hot'
                ? 'bg-amber-100 text-amber-900'
                : v.key === 'overdue' || v.key === 'sla'
                ? count > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-500'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {count}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
        {/* 1. SAVED VIEWS TABS + ICON ACTIONS */}
        <div className="flex items-center justify-between border-b border-slate-100 px-3 pt-2.5 sm:px-4">
          {/* Keep the unfiltered total visible while the other saved views scroll. */}
          <div className="flex min-w-0 flex-1 items-center pr-2">
            <div className="shrink-0 border-r border-slate-200 pr-1">
              {renderSavedView(LEAD_SAVED_VIEWS[0])}
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto custom-scrollbar">
              <div className="flex min-w-max items-center gap-1.5 pl-1">
                {LEAD_SAVED_VIEWS.slice(1).filter((v) => v.needs !== 'assign' || access?.canAssign).map(renderSavedView)}
              </div>
            </div>
          </div>

          {/* Right Icon Actions: Export CSV + Create New Lead */}
          <div className="flex shrink-0 items-center gap-1.5 pb-2 pl-2">
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Lead view">
              <button
                type="button"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                title="List view"
                className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-bold transition ${
                  viewMode === 'list' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'kanban'}
                onClick={() => setViewMode('kanban')}
                title="Kanban view"
                className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-bold transition ${
                  viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Kanban className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Kanban</span>
              </button>
            </div>
            {hasExtraFilters || filters.q ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  apply({ ...emptyFilters(), view: 'open' });
                }}
                title="Reset filters"
                className="inline-flex items-center gap-1 rounded-xl bg-amber-100/80 hover:bg-amber-200 text-amber-900 px-2 py-1 text-xs font-bold transition shadow-2xs mr-0.5"
              >
                <X className="h-3 w-3" />
                <span>Reset</span>
              </button>
            ) : null}
            {access?.canExport ? (
              <button
                type="button"
                onClick={exportCsv}
                title="Export CSV"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
              >
                <Download className="h-4 w-4" />
              </button>
            ) : null}
            {access?.canPipelineManage && !access.isPartner ? (
              <button
                type="button"
                onClick={() => setStageManagerOpen(true)}
                title="Manage pipeline stages"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-slate-900 transition shadow-2xs"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            ) : null}
            {access?.canManage ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                title="Create New Lead"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400 text-slate-950 hover:bg-amber-300 transition shadow-2xs font-extrabold"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
              </button>
            ) : null}
          </div>
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
              className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 py-1.5 pl-9 pr-8 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
              aria-label="Search leads"
            />
            {search ? (
              <button
                type="button"
                title="Clear search"
                onClick={() => {
                  setSearch('');
                  set('q', '');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </form>

          <CrmSelect
            options={[{ id: '', name: 'Any Status' }, ...(meta?.enums.statuses || []).map((s) => ({ id: s, name: `${stageName(s)}${leads.data?.statusCounts[s] ? ` (${leads.data.statusCounts[s]})` : ''}` }))]}
            value={filters.status}
            onChange={(next) => set('status', next)}
            searchable
            className="w-full"
          />

          {!access?.isPartner ? (
            <CrmSelect
              options={[
                { id: '', name: 'All Executives' },
                { id: 'me', name: 'My Leads' },
                ...(access?.canAssign ? [{ id: 'none', name: 'Unassigned' }] : []),
                ...(access?.canSeeAll ? (meta?.staff || []).map((s) => ({ id: s.id, name: s.name })) : []),
              ]}
              value={filters.ownerId}
              onChange={(next) => set('ownerId', next)}
              searchable
              className="w-full"
            />
          ) : null}

          <CrmSelect
            options={[{ id: '', name: 'All Lead Types' }, ...(meta?.enums.leadTypes || []).map((t) => ({ id: t, name: LEAD_TYPE_LABELS[t] || label(t) }))]}
            value={filters.leadType}
            onChange={(next) => set('leadType', next)}
            searchable
            className="w-full"
          />

          <CrmSelect
            options={[{ id: '', name: 'All Sources' }, ...(meta?.config.sources || []).map((s) => ({ id: s, name: label(s) }))]}
            value={filters.source}
            onChange={(next) => set('source', next)}
            searchable
            className="w-full"
          />

          <CrmSelect
            options={[{ id: '', name: 'All Priorities' }, ...(meta?.enums.priorities || []).map((p) => ({ id: p, name: label(p) }))]}
            value={filters.priority}
            onChange={(next) => set('priority', next)}
            className="w-full"
          />

          <CrmSelect
            options={[
              { id: '', name: 'Newest First' },
              { id: 'followup', name: 'Next Follow-up Due' },
              { id: 'score', name: 'Highest Intent Score' },
              { id: 'activity', name: 'Recent Activity' },
              { id: 'oldest', name: 'Oldest First' },
            ]}
            value={filters.sort}
            onChange={(next) => set('sort', next)}
            searchable={false}
            className="w-full"
          />
        </div>

        {/* 3. BULK ACTION BAR (Only shown when items are selected) */}
        {selected.length ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 bg-amber-50 px-4 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
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
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 ml-1"
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}

        {/* 4. LEADS LIST OR STAGE-BASED KANBAN */}
        {viewMode === 'kanban' ? (
          <CrmPipelineBoard
            embedded
            externalQuery={boardQuery}
            refreshToken={kanbanRefreshToken}
            onDataChanged={() => leads.reload()}
          />
        ) : leads.loading && !leads.data ? (
          <CrmLoadingState label="Loading leads data…" />
        ) : leads.error ? (
          <CrmErrorBanner message={leads.error} schemaMissing={leads.schemaMissing} />
        ) : !items.length ? (
          <EmptyState
            title="No leads match your active filters"
            description="Try choosing another filter tab or create a new lead to start tracking."
          />
        ) : (
          <div className="overflow-x-auto">
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
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Source & Channel</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700 text-right">Quick Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((lead) => {
                  const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now;
                  const open = !isTerminalStatus(lead.status, meta?.pipelineStages);
                  const links = phoneLinks(lead.customer.mobile, lead.customer.whatsappNumber, leadWhatsAppMessage(lead.customer.name, lead));

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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-slate-800 text-xs">
                            {LEAD_TYPE_LABELS[lead.leadType] || label(lead.leadType)}
                          </p>
                          {lead.listingPriceSnapshot || lead.expectedValue ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              {fmtInr(lead.listingPriceSnapshot || lead.expectedValue)}
                            </span>
                          ) : null}
                        </div>
                        <p className="max-w-[280px] truncate text-[11px] text-slate-500 font-medium">
                          {requirementSummary(lead)}
                        </p>
                      </td>

                      <td className={cellClass}>
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={lead.status} name={stageName(lead.status)} />
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
                        <div className="flex flex-col items-start gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <EnquiryChannelBadge enquiryType={lead.enquiryType} tags={lead.tags} />
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              {label(lead.source)}
                            </span>
                            {lead.tags?.includes('Machine Sold') && open ? (
                              <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" title="The enquired machine was sold to another customer">
                                Machine sold
                              </span>
                            ) : null}
                          </div>
                          {lead.dealer.role === 'PARTNER' && !access?.isPartner ? (
                            <p className="text-[10px] text-slate-400">via {lead.dealer.name}</p>
                          ) : null}
                          <p className="text-[10px] text-slate-400 font-medium">
                            {relative(lead.createdAt, now)}
                          </p>
                        </div>
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
        <LeadForm
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            if (viewMode === 'kanban') {
              setCreating(false);
              refreshWorkspace();
            } else {
              router.push(leadHref(base, id));
            }
          }}
        />
      ) : null}
      {stageManagerOpen ? (
        <CrmPipelineStageManager
          onChanged={() => {
            setStageManagerOpen(false);
            reloadMeta();
            refreshWorkspace();
          }}
        />
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
          <CrmSelect
            options={[{ id: '', name: "Don't change priority" }, ...(meta?.enums.priorities || []).map((p) => ({ id: p, name: label(p) }))]}
            value={priority}
            onChange={(next) => setPriority(next)}
            className="w-full"
          />
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
