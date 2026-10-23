'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns,
  ExternalLink,
  Flame,
  GripVertical,
  Kanban,
  Maximize2,
  MessageCircle,
  Minimize2,
  Phone,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Tractor,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { LoadingState } from '@/components/financeWorkspace/ui';
import { StatusChangeModal } from './CrmModals';
import LeadForm from './LeadForm';
import {
  compactSelectClass,
  CrmErrorBanner,
  CrmPageFrame,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  phoneLinks,
  relative,
  requirementSummary,
  TemperatureBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type LeadRow,
} from './crmShared';

type Board = {
  columns: Array<{ status: string; count: number; expectedValue: number; cards: LeadRow[] }>;
};

const COLUMN_THEMES: Record<
  string,
  { border: string; bg: string; dot: string; text: string; headerBg: string; badgeCls: string }
> = {
  NEW: {
    border: 'border-t-blue-500',
    bg: 'bg-blue-50/20',
    dot: 'bg-blue-500',
    text: 'text-blue-700',
    headerBg: 'bg-blue-50/40',
    badgeCls: 'bg-blue-100 text-blue-800',
  },
  CONTACTED: {
    border: 'border-t-slate-500',
    bg: 'bg-slate-50/20',
    dot: 'bg-slate-500',
    text: 'text-slate-700',
    headerBg: 'bg-slate-50/40',
    badgeCls: 'bg-slate-100 text-slate-800',
  },
  QUALIFIED: {
    border: 'border-t-purple-500',
    bg: 'bg-purple-50/20',
    dot: 'bg-purple-500',
    text: 'text-purple-700',
    headerBg: 'bg-purple-50/40',
    badgeCls: 'bg-purple-100 text-purple-800',
  },
  INTERESTED: {
    border: 'border-t-indigo-500',
    bg: 'bg-indigo-50/20',
    dot: 'bg-indigo-500',
    text: 'text-indigo-700',
    headerBg: 'bg-indigo-50/40',
    badgeCls: 'bg-indigo-100 text-indigo-800',
  },
  INSPECTION_SCHEDULED: {
    border: 'border-t-amber-500',
    bg: 'bg-amber-50/20',
    dot: 'bg-amber-500',
    text: 'text-amber-800',
    headerBg: 'bg-amber-50/40',
    badgeCls: 'bg-amber-100 text-amber-900',
  },
  NEGOTIATION: {
    border: 'border-t-orange-500',
    bg: 'bg-orange-50/20',
    dot: 'bg-orange-500',
    text: 'text-orange-800',
    headerBg: 'bg-orange-50/40',
    badgeCls: 'bg-orange-100 text-orange-900',
  },
  ON_HOLD: {
    border: 'border-t-zinc-400',
    bg: 'bg-zinc-50/20',
    dot: 'bg-zinc-400',
    text: 'text-zinc-700',
    headerBg: 'bg-zinc-50/40',
    badgeCls: 'bg-zinc-100 text-zinc-800',
  },
  WON: {
    border: 'border-t-emerald-500',
    bg: 'bg-emerald-50/20',
    dot: 'bg-emerald-500',
    text: 'text-emerald-800',
    headerBg: 'bg-emerald-50/40',
    badgeCls: 'bg-emerald-100 text-emerald-900',
  },
  LOST: {
    border: 'border-t-rose-500',
    bg: 'bg-rose-50/20',
    dot: 'bg-rose-500',
    text: 'text-rose-700',
    headerBg: 'bg-rose-50/40',
    badgeCls: 'bg-rose-100 text-rose-900',
  },
};

const STAGE_FLOW: Record<string, { prev?: string; next?: string }> = {
  NEW: { next: 'CONTACTED' },
  CONTACTED: { prev: 'NEW', next: 'QUALIFIED' },
  QUALIFIED: { prev: 'CONTACTED', next: 'INTERESTED' },
  INTERESTED: { prev: 'QUALIFIED', next: 'INSPECTION_SCHEDULED' },
  INSPECTION_SCHEDULED: { prev: 'INTERESTED', next: 'NEGOTIATION' },
  NEGOTIATION: { prev: 'INSPECTION_SCHEDULED', next: 'WON' },
  ON_HOLD: { next: 'NEGOTIATION' },
  WON: { prev: 'NEGOTIATION' },
  LOST: { prev: 'NEGOTIATION' },
};

function Pipeline() {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const [ownerId, setOwnerId] = useState('');
  const [leadType, setLeadType] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState<LeadRow | null>(null);
  const [move, setMove] = useState<{ lead: LeadRow; to: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [now] = useState(() => Date.now());

  const query = {
    ...(ownerId ? { ownerId } : {}),
    ...(leadType ? { leadType } : {}),
    ...(priorityFilter ? { priority: priorityFilter } : {}),
  };

  const board = useCrmResource(() => getJson<Board>('/crm/leads/board', query), JSON.stringify(query));

  const rawColumns = board.data?.columns || [];

  const columns = rawColumns.filter(
    (c) => showClosed || (c.status !== 'WON' && c.status !== 'LOST'),
  );

  const openValue = rawColumns
    .filter((c) => c.status !== 'WON' && c.status !== 'LOST')
    .reduce((sum, c) => sum + c.expectedValue, 0);

  const wonValue = rawColumns
    .filter((c) => c.status === 'WON')
    .reduce((sum, c) => sum + c.expectedValue, 0);

  const totalCards = columns.reduce((sum, c) => sum + c.count, 0);

  const toggleCollapse = (status: string) => {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const toggleCollapseAll = () => {
    const allCollapsed = columns.every((c) => collapsed[c.status]);
    const next: Record<string, boolean> = {};
    columns.forEach((c) => {
      next[c.status] = !allCollapsed;
    });
    setCollapsed(next);
  };

  const searchFilter = (card: LeadRow) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase().trim();
    const customer = (card.customer.name || '') + ' ' + (card.customer.mobile || '') + ' ' + (card.customer.whatsappNumber || '');
    const listing = card.listingTitleSnapshot || '';
    const loc = (card.requirementCity || '') + ' ' + (card.requirementState || '');
    const notes = card.message || '';
    const tags = (card.tags || []).join(' ');
    const owner = card.owner?.name || '';
    return (
      customer.toLowerCase().includes(term) ||
      listing.toLowerCase().includes(term) ||
      loc.toLowerCase().includes(term) ||
      notes.toLowerCase().includes(term) ||
      tags.toLowerCase().includes(term) ||
      owner.toLowerCase().includes(term)
    );
  };

  return (
    <>
      <section className="flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        {/* COMPACT UNIFIED TOP TOOLBAR */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200/80 bg-white px-3.5 py-2.5">
          {/* Left: Live Pipeline Metrics & Quick Search */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span>{totalCards} Deals</span>
            </span>

            <span className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 shadow-2xs">
              <span className="text-emerald-600 font-black">₹</span>
              <span>{fmtInr(openValue)} Pipeline</span>
            </span>

            {wonValue > 0 ? (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-100/60 px-2.5 py-1 text-xs font-bold text-emerald-900 shadow-2xs">
                <span>🟢 {fmtInr(wonValue)} Won</span>
              </span>
            ) : null}

            {/* Instant Search in Pipeline */}
            <div className="relative min-w-[180px] max-w-[240px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deals, phone, machine…"
                className="w-full rounded-xl border border-slate-200/90 bg-slate-50/80 py-1 pl-8 pr-7 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                aria-label="Filter board"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Right: Compact Filter Controls & Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {!meta?.access.isPartner ? (
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={`${compactSelectClass} w-32`}
                aria-label="Owner"
              >
                <option value="">All Executives</option>
                <option value="me">My Deals</option>
                {meta?.access.canAssign ? <option value="none">Unassigned</option> : null}
                {meta?.access.canSeeAll ? meta.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : null}
              </select>
            ) : null}

            <select
              value={leadType}
              onChange={(e) => setLeadType(e.target.value)}
              className={`${compactSelectClass} w-32`}
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
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className={`${compactSelectClass} w-28`}
              aria-label="Priority"
            >
              <option value="">All Priorities</option>
              {(meta?.enums.priorities || []).map((p) => (
                <option key={p} value={p}>
                  {label(p)}
                </option>
              ))}
            </select>

            {/* Show Won / Lost Toggle Pill */}
            <button
              type="button"
              onClick={() => setShowClosed((prev) => !prev)}
              title="Toggle Won & Lost stages"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition shadow-2xs ${
                showClosed
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-400/20'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${showClosed ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span>Won & Lost</span>
            </button>

            {/* Collapse / Expand Columns Toggle */}
            <button
              type="button"
              onClick={toggleCollapseAll}
              title="Toggle collapse all columns"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
            >
              <Columns className="h-4 w-4" />
            </button>

            {/* Refresh Board */}
            <button
              type="button"
              onClick={() => board.reload()}
              title="Reload pipeline"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
            >
              <RotateCw className={`h-4 w-4 ${board.loading ? 'animate-spin text-amber-600' : ''}`} />
            </button>

            {/* Create Lead Action */}
            {meta?.access.canManage ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                title="Create New Lead / Deal"
                className="flex h-8 items-center gap-1.5 rounded-xl bg-amber-400 px-3 text-xs font-extrabold text-slate-950 hover:bg-amber-300 transition shadow-2xs"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                <span className="hidden sm:inline">Add Deal</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* KANBAN BOARD CONTAINER */}
        {board.loading && !board.data ? (
          <div className="p-8">
            <LoadingState label="Loading pipeline board…" />
          </div>
        ) : board.error ? (
          <div className="p-4">
            <CrmErrorBanner message={board.error} schemaMissing={board.schemaMissing} />
          </div>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto p-3 custom-scrollbar bg-slate-100/60 min-h-[580px] h-[calc(100vh-10.5rem)]">
            {columns.map((column) => {
              const theme = COLUMN_THEMES[column.status] || {
                border: 'border-t-slate-400',
                bg: 'bg-slate-50/20',
                dot: 'bg-slate-400',
                text: 'text-slate-700',
                headerBg: 'bg-slate-50/40',
                badgeCls: 'bg-slate-100 text-slate-800',
              };

              const isCollapsed = Boolean(collapsed[column.status]);
              const isDropTarget = dragging && dragging.status !== column.status;
              const filteredCards = column.cards.filter(searchFilter);

              // ─── COLLAPSED COLUMN VIEW ───
              if (isCollapsed) {
                return (
                  <div
                    key={column.status}
                    onClick={() => toggleCollapse(column.status)}
                    onDragOver={(e) => {
                      if (isDropTarget) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (isDropTarget) {
                        setMove({ lead: dragging, to: column.status });
                        setDragging(null);
                      }
                    }}
                    title={`Click to expand ${label(column.status)}`}
                    className={`flex min-w-[44px] max-w-[44px] flex-col items-center justify-between rounded-2xl border border-slate-200/90 bg-white py-3 shadow-2xs cursor-pointer hover:bg-slate-50 transition-all duration-150 ${
                      theme.border
                    } border-t-4 ${isDropTarget ? 'ring-2 ring-amber-400 bg-amber-50/60' : ''}`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-700">
                        {column.count}
                      </span>
                    </div>

                    {/* Vertical Stage Label */}
                    <div className="my-auto py-4 select-none [writing-mode:vertical-lr] rotate-180 text-xs font-bold text-slate-700 tracking-wider uppercase">
                      {label(column.status)}
                    </div>

                    <button
                      type="button"
                      title="Expand column"
                      className="p-1 rounded-lg hover:bg-slate-200/70 text-slate-500 transition"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              }

              // ─── EXPANDED COLUMN VIEW ───
              return (
                <div
                  key={column.status}
                  onDragOver={(e) => {
                    if (isDropTarget) e.preventDefault();
                  }}
                  onDrop={() => {
                    if (isDropTarget) {
                      setMove({ lead: dragging, to: column.status });
                      setDragging(null);
                    }
                  }}
                  className={`flex min-w-[285px] max-w-[285px] flex-1 flex-col rounded-2xl border border-slate-200/90 bg-slate-50/70 shadow-2xs transition-all duration-200 ${
                    theme.border
                  } border-t-4 ${
                    isDropTarget ? 'ring-2 ring-amber-400 bg-amber-50/40 shadow-md scale-[1.008]' : ''
                  }`}
                >
                  {/* COLUMN HEADER */}
                  <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-3 py-2.5 rounded-t-xl">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${theme.dot}`} />
                      <p className="text-xs font-bold text-slate-900 truncate tracking-tight">
                        {label(column.status)}
                      </p>
                      <span className="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 px-1.5 py-0.2 text-[10px] font-black">
                        {search ? `${filteredCards.length}/${column.count}` : column.count}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {column.expectedValue ? (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                          {fmtInr(column.expectedValue)}
                        </span>
                      ) : null}

                      {/* Column quick add deal */}
                      {meta?.access.canManage && column.status !== 'WON' && column.status !== 'LOST' ? (
                        <button
                          type="button"
                          onClick={() => setCreating(true)}
                          title={`Add deal in ${label(column.status)}`}
                          className="p-1 rounded-md text-slate-400 hover:text-amber-600 hover:bg-slate-100 transition"
                        >
                          <Plus className="h-3 w-3 stroke-[2.5]" />
                        </button>
                      ) : null}

                      {/* Collapse button */}
                      <button
                        type="button"
                        onClick={() => toggleCollapse(column.status)}
                        title="Collapse column"
                        className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                      >
                        <Minimize2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* DROP TARGET ACTIVE PLACEHOLDER */}
                  {isDropTarget ? (
                    <div className="m-2 rounded-xl border-2 border-dashed border-amber-400 bg-amber-100/50 p-2 text-center text-xs font-bold text-amber-900 animate-pulse transition">
                      Drop here to move to {label(column.status)}
                    </div>
                  ) : null}

                  {/* CARDS LIST CONTAINER */}
                  <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 custom-scrollbar">
                    {filteredCards.map((lead) => {
                      const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now;
                      const isToday =
                        lead.nextFollowUpAt &&
                        !overdue &&
                        new Date(lead.nextFollowUpAt).toDateString() === new Date(now).toDateString();
                      const links = phoneLinks(lead.customer.mobile, lead.customer.whatsappNumber);
                      const flow = STAGE_FLOW[lead.status] || {};
                      const hasAlternateFlow = lead.status === 'NEGOTIATION' || lead.status === 'INSPECTION_SCHEDULED';

                      return (
                        <div
                          key={lead.id}
                          draggable={Boolean(meta?.access.canManage)}
                          onDragStart={() => setDragging(lead)}
                          onDragEnd={() => setDragging(null)}
                          className={`group relative rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md ${
                            dragging?.id === lead.id ? 'opacity-40 scale-95 ring-2 ring-amber-400 rotate-1 shadow-lg' : ''
                          }`}
                        >
                          {/* TOP ROW: GRIP + CUSTOMER + TEMPERATURE */}
                          <div className="flex items-start gap-1.5">
                            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <Link
                                  href={leadHref(base, lead.id)}
                                  className="truncate text-xs font-bold text-slate-900 hover:text-amber-600 transition-colors"
                                  title={lead.customer.name || lead.customer.mobile || 'Lead Details'}
                                >
                                  {lead.customer.name || lead.customer.mobile || 'Unnamed Customer'}
                                </Link>

                                <div className="flex items-center gap-1 shrink-0">
                                  {lead.priority === 'URGENT' || lead.priority === 'HIGH' ? (
                                    <span
                                      className={`rounded px-1 py-0.2 text-[9px] font-black uppercase tracking-tight ${
                                        lead.priority === 'URGENT'
                                          ? 'bg-rose-100 text-rose-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {lead.priority}
                                    </span>
                                  ) : null}
                                  <TemperatureBadge temperature={lead.temperature} score={lead.score} />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* MIDDLE: MACHINE REQUIREMENT & LOCATION */}
                          <div className="mt-1.5 pl-5">
                            <p className="truncate text-[11px] font-medium text-slate-600 flex items-center gap-1">
                              <Tractor className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="truncate font-semibold text-slate-800">
                                {lead.listingTitleSnapshot || requirementSummary(lead)}
                              </span>
                            </p>

                            {(lead.requirementCity || lead.requirementState) ? (
                              <p className="truncate text-[10px] text-slate-400 pl-4 font-normal">
                                {[lead.requirementCity, lead.requirementState].filter(Boolean).join(', ')}
                              </p>
                            ) : null}
                          </div>

                          {/* VALUE & TYPE CHIPS */}
                          <div className="mt-1.5 pl-5 flex items-center justify-between gap-1.5">
                            {lead.expectedValue ? (
                              <span className="text-xs font-extrabold text-emerald-700">
                                {fmtInr(lead.expectedValue)}
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-400 italic">No budget set</span>
                            )}

                            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                              {LEAD_TYPE_LABELS[lead.leadType] || label(lead.leadType)}
                            </span>
                          </div>

                          {/* FOLLOW-UP STATUS ALERT BAR */}
                          <div className="mt-2 pl-5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                overdue
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200/90'
                                  : isToday
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200/90'
                                  : lead.nextFollowUpAt
                                  ? 'bg-slate-50 text-slate-600 border border-slate-200/80'
                                  : lead.status === 'WON' || lead.status === 'LOST'
                                  ? 'bg-slate-50 text-slate-500'
                                  : 'bg-amber-50 text-amber-900 border border-amber-200/70'
                              }`}
                            >
                              {overdue ? (
                                <AlertCircle className="h-2.5 w-2.5 text-rose-600 shrink-0" />
                              ) : isToday ? (
                                <Clock className="h-2.5 w-2.5 text-amber-600 shrink-0" />
                              ) : (
                                <CalendarClock className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                              )}
                              <span className="truncate">
                                {overdue
                                  ? `Overdue (${relative(lead.nextFollowUpAt, now)})`
                                  : isToday
                                  ? `Due Today`
                                  : lead.nextFollowUpAt
                                  ? relative(lead.nextFollowUpAt, now)
                                  : lead.status === 'WON' || lead.status === 'LOST'
                                  ? 'Deal Closed'
                                  : 'No Next Step'}
                              </span>
                            </span>
                          </div>

                          {/* BOTTOM ACTION BAR: CALL, WA, OWNER & STAGE STEPPERS */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs pl-5">
                            {/* Fast Contact & Staff Initials */}
                            <div className="flex items-center gap-1">
                              {links.wa ? (
                                <a
                                  href={links.wa}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Chat on WhatsApp"
                                  className="flex h-6 w-6 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition shadow-2xs"
                                >
                                  <MessageCircle className="h-3 w-3" />
                                </a>
                              ) : null}

                              {links.tel ? (
                                <a
                                  href={links.tel}
                                  title="Call Customer"
                                  className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
                                >
                                  <Phone className="h-3 w-3" />
                                </a>
                              ) : null}

                              {!meta?.access.isPartner && lead.owner ? (
                                <span
                                  className="truncate max-w-[70px] font-bold text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md"
                                  title={`Assigned to ${lead.owner.name}`}
                                >
                                  {lead.owner.name}
                                </span>
                              ) : null}
                            </div>

                            {/* FAST STAGE ADVANCE / RETREAT BUTTONS */}
                            {meta?.access.canManage ? (
                              <div className="flex items-center gap-1">
                                {flow.prev ? (
                                  <button
                                    type="button"
                                    onClick={() => setMove({ lead, to: flow.prev! })}
                                    title={`Move back to ${label(flow.prev)}`}
                                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100 transition shadow-2xs"
                                  >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}

                                {hasAlternateFlow ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setMove({ lead, to: 'WON' })}
                                      title="Close as Won 🟢"
                                      className="flex h-6 px-1.5 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
                                    >
                                      Won
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setMove({ lead, to: 'LOST' })}
                                      title="Close as Lost 🔴"
                                      className="flex h-6 px-1.5 items-center justify-center rounded-lg border border-rose-300 bg-rose-50 text-[10px] font-bold text-rose-800 hover:bg-rose-100 transition shadow-2xs"
                                    >
                                      Lost
                                    </button>
                                  </>
                                ) : flow.next ? (
                                  <button
                                    type="button"
                                    onClick={() => setMove({ lead, to: flow.next! })}
                                    title={`Advance to ${label(flow.next)}`}
                                    className="flex h-6 items-center gap-0.5 rounded-lg border border-amber-300 bg-amber-50 px-1.5 text-[10px] font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                                  >
                                    <span>{label(flow.next)}</span>
                                    <ChevronRight className="h-3 w-3" />
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}

                    {column.count > column.cards.length ? (
                      <Link
                        href={`${base}/leads?status=${column.status}`}
                        className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 py-2 text-center text-xs font-bold text-amber-800 hover:bg-amber-100/70 transition-colors"
                      >
                        +{column.count - column.cards.length} more in Leads
                      </Link>
                    ) : null}

                    {!filteredCards.length ? (
                      <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-xs text-center px-2">
                        <Kanban className="h-6 w-6 text-slate-300 mb-1" />
                        <span className="font-semibold text-slate-500">No deals in stage</span>
                        {search ? (
                          <span className="text-[10px] text-slate-400 mt-0.5">Matching &ldquo;{search}&rdquo;</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* CREATE LEAD MODAL */}
      {creating ? (
        <LeadForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            board.reload();
          }}
        />
      ) : null}

      {/* STATUS CHANGE / MOVE STAGE MODAL */}
      {move ? (
        <StatusChangeModal
          leadId={move.lead.id}
          currentStatus={move.lead.status}
          initialStatus={move.to}
          lead={move.lead}
          onClose={() => setMove(null)}
          onDone={() => {
            setMove(null);
            board.reload();
          }}
        />
      ) : null}
    </>
  );
}

export default function CrmPipelinePage() {
  return (
    <CrmPageFrame>
      <Pipeline />
    </CrmPageFrame>
  );
}
