'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import {
  AlarmClock,
  AlertCircle,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  List,
  MessageCircle,
  Phone,
  PhoneCall,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Tractor,
  User,
  X,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import {
  Button,
  EmptyState,
  Field,
  inputClass,
  LoadingState,
  Modal,
  ModalFooter,
  tableHeadClass,
} from '@/components/financeWorkspace/ui';
import { CompleteFollowUpModal, RescheduleModal, ScheduleFollowUpModal } from './CrmModals';
import {
  compactSelectClass,
  CrmErrorBanner,
  crmError,
  CrmPageFrame,
  fmtDateTime,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  OUTCOME_LABELS,
  phoneLinks,
  relative,
  StatusBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type FollowUp,
} from './crmShared';

type Summary = {
  overdue: number;
  today: number;
  upcoming: number;
  doneToday: number;
  missed: number;
};

type FollowUpList = {
  total: number;
  items: FollowUp[];
};

const BUCKETS = [
  {
    key: 'overdue',
    label: 'Overdue Calls',
    count: (s: Summary) => s.overdue,
    tone: 'text-rose-600',
    bg: 'bg-rose-50',
    activeBg: 'bg-rose-600',
    badge: 'bg-rose-100 text-rose-800',
    icon: AlarmClock,
  },
  {
    key: 'today',
    label: 'Due Today',
    count: (s: Summary) => s.today,
    tone: 'text-amber-600',
    bg: 'bg-amber-50',
    activeBg: 'bg-slate-900',
    badge: 'bg-amber-100 text-amber-900',
    icon: Clock,
  },
  {
    key: 'upcoming',
    label: 'Upcoming Agenda',
    count: (s: Summary) => s.upcoming,
    tone: 'text-blue-700',
    bg: 'bg-blue-50',
    activeBg: 'bg-blue-600',
    badge: 'bg-blue-100 text-blue-800',
    icon: CalendarRange,
  },
  {
    key: 'missed',
    label: 'Missed Calls',
    count: (s: Summary) => s.missed,
    tone: 'text-rose-700',
    bg: 'bg-rose-50/70',
    activeBg: 'bg-rose-700',
    badge: 'bg-rose-100 text-rose-800',
    icon: XCircle,
  },
  {
    key: 'done',
    label: 'Completed Today',
    count: (s: Summary) => s.doneToday,
    tone: 'text-emerald-700',
    bg: 'bg-emerald-50',
    activeBg: 'bg-emerald-600',
    badge: 'bg-emerald-100 text-emerald-800',
    icon: CheckCircle2,
  },
] as const;

function FollowUps() {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const params = useSearchParams();
  const access = meta?.access;

  const requested = BUCKETS.some((b) => b.key === params.get('bucket'))
    ? (params.get('bucket') as string)
    : null;
  const [picked, setPicked] = useState<string | null>(requested);
  const [ownerId, setOwnerId] = useState(access?.canSeeAll ? '' : 'me');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'calendar'>('list');

  // Modals state
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [bulkMove, setBulkMove] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const summary = useCrmResource(
    () => getJson<Summary>('/crm/followups/summary', { ownerId }),
    `sum-${ownerId}`
  );

  // Without a choice, default to Overdue if items exist, otherwise Today
  const bucket = picked ?? (summary.data?.overdue ? 'overdue' : 'today');

  const queryParams = {
    bucket,
    ownerId,
    ...(typeFilter ? { type: typeFilter } : {}),
    pageSize: 200,
  };

  const list = useCrmResource(
    () => getJson<FollowUpList>('/crm/followups', queryParams),
    `list-${bucket}-${ownerId}-${typeFilter}`
  );

  const reload = () => {
    summary.reload();
    list.reload();
  };

  const openItems = (list.data?.items || []).filter(
    (f) => f.status === 'PENDING' || f.status === 'MISSED'
  );

  const activeBucket = BUCKETS.find((b) => b.key === bucket);

  const copyPhone = (id: string, mobile?: string | null) => {
    if (!mobile) return;
    navigator.clipboard.writeText(mobile);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Client-side search filtering across items
  const filteredItems = useMemo(() => {
    const items = list.data?.items || [];
    if (!search.trim()) return items;
    const term = search.toLowerCase().trim();
    return items.filter((f) => {
      const cust = (f.contact?.name || '') + ' ' + (f.contact?.mobile || '') + ' ' + (f.contact?.whatsappNumber || '');
      const machine = f.lead?.listingTitleSnapshot || '';
      const agenda = (f.title || '') + ' ' + (f.notes || '') + ' ' + (f.outcomeNotes || '');
      const owner = f.owner?.name || '';
      const type = f.type || '';
      return (
        cust.toLowerCase().includes(term) ||
        machine.toLowerCase().includes(term) ||
        agenda.toLowerCase().includes(term) ||
        owner.toLowerCase().includes(term) ||
        type.toLowerCase().includes(term)
      );
    });
  }, [list.data?.items, search]);

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
        {/* ROW 1: SAVED VIEW TABS (BUCKETS) + VIEW ACTIONS */}
        <div className="flex items-center justify-between border-b border-slate-100 px-3 pt-2 sm:px-4">
          {/* Scrollable Tabs */}
          <div className="flex flex-1 items-center gap-1.5 overflow-x-auto custom-scrollbar pr-2">
            {BUCKETS.map((b) => {
              const Icon = b.icon;
              const on = view === 'list' && bucket === b.key;
              const count = summary.data ? b.count(summary.data) : undefined;

              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => {
                    setPicked(b.key);
                    setView('list');
                  }}
                  className={`shrink-0 inline-flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-bold transition-all duration-150 ${
                    on
                      ? 'border-amber-500 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${on ? 'text-amber-500' : b.tone}`} />
                  <span>{b.label}</span>
                  {count !== undefined ? (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-black transition-colors ${
                        on
                          ? b.key === 'overdue' || b.key === 'missed'
                            ? 'bg-rose-600 text-white'
                            : b.key === 'done'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-900 text-white'
                          : b.key === 'overdue' || b.key === 'missed'
                          ? count > 0
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-500'
                          : b.key === 'done'
                          ? 'bg-emerald-100 text-emerald-800'
                          : b.key === 'today'
                          ? count > 0
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-slate-100 text-slate-500'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Right Toolbar Actions */}
          <div className="flex shrink-0 items-center gap-1.5 pb-2 pl-2">
            {/* View Mode Switcher */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setView('list')}
                title="Table Queue View"
                className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-all ${
                  view === 'list'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Call Queue</span>
              </button>
              <button
                type="button"
                onClick={() => setView('calendar')}
                title="Calendar Grid View"
                className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-all ${
                  view === 'calendar'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Calendar</span>
              </button>
            </div>

            {/* Bulk Reschedule Action */}
            {view === 'list' && openItems.length > 1 ? (
              <button
                type="button"
                onClick={() => setBulkMove(true)}
                title={`Batch Reschedule ${openItems.length} open calls`}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
              >
                <RotateCcw className="h-3.5 w-3.5 text-amber-700" />
                <span className="hidden md:inline">Reschedule ({openItems.length})</span>
              </button>
            ) : null}

            {/* Schedule Follow-Up Button */}
            {access?.canManage ? (
              <button
                type="button"
                onClick={() => setScheduling(true)}
                title="Schedule New Follow-up"
                className="flex h-8 items-center gap-1 rounded-xl bg-amber-400 px-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-300 transition shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span className="hidden sm:inline">Schedule</span>
              </button>
            ) : null}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={reload}
              title="Refresh queue"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
            >
              <RotateCw className={`h-3.5 w-3.5 ${list.loading || summary.loading ? 'animate-spin text-amber-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* ROW 2: OPERATIONAL SEARCH & FILTERS TOOLBAR */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-2.5 sm:px-4 sm:py-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-[340px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer, mobile, machine, notes…"
                className="w-full rounded-xl border border-slate-200/90 bg-white py-1.5 pl-9 pr-8 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                aria-label="Search follow-ups"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {/* Executive Filter */}
            {!access?.isPartner && access?.canSeeAll ? (
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={`${compactSelectClass} w-36`}
                aria-label="Executive Filter"
              >
                <option value="">All Team Members</option>
                <option value="me">Assigned to Me</option>
                <option value="none">Unassigned Queue</option>
                {meta?.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : null}

            {/* Follow-up Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`${compactSelectClass} w-32`}
              aria-label="Activity Type Filter"
            >
              <option value="">All Activity Types</option>
              {(meta?.enums.followUpTypes || ['CALL', 'WHATSAPP', 'VISIT', 'INSPECTION', 'MEETING', 'PAYMENT']).map(
                (t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                )
              )}
            </select>

            {/* Reset Filters Chip */}
            {search || typeFilter || (ownerId && ownerId !== (access?.canSeeAll ? '' : 'me')) ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setTypeFilter('');
                  setOwnerId(access?.canSeeAll ? '' : 'me');
                }}
                className="inline-flex items-center gap-1 rounded-md bg-amber-100 text-amber-900 px-2 py-1 text-xs font-bold hover:bg-amber-200 transition"
              >
                <X className="h-3 w-3" />
                <span>Reset</span>
              </button>
            ) : null}
          </div>

          <div className="text-xs font-bold text-slate-600">
            <span>{filteredItems.length}</span>{' '}
            <span className="font-medium text-slate-500">
              {filteredItems.length === 1 ? 'Appointment' : 'Appointments'}
            </span>
          </div>
        </div>

        {/* MAIN BODY: HIGH-DENSITY QUEUE TABLE OR INTERACTIVE CALENDAR */}
        {view === 'calendar' ? (
          <CalendarView
            ownerId={ownerId}
            now={now}
            onPick={(f) => setCompleting(f)}
          />
        ) : list.loading && !list.data ? (
          <div className="p-8">
            <LoadingState label="Loading queue items…" />
          </div>
        ) : list.error ? (
          <div className="p-4">
            <CrmErrorBanner message={list.error} schemaMissing={list.schemaMissing} />
          </div>
        ) : !filteredItems.length ? (
          <div className="p-8">
            <EmptyState
              title={
                search
                  ? `No follow-ups match "${search}"`
                  : bucket === 'overdue'
                  ? 'No overdue follow-up calls!'
                  : bucket === 'today'
                  ? 'All scheduled calls for today are cleared!'
                  : 'No follow-up appointments in this queue'
              }
              description={
                search
                  ? 'Try clearing the search input or changing filter parameters.'
                  : bucket === 'today'
                  ? 'Check Upcoming Agenda or schedule new follow-ups from your leads.'
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-3.5 py-2.5 font-bold">TIME & SLA</th>
                  <th className="px-3.5 py-2.5 font-bold">CUSTOMER & CONTACT</th>
                  <th className="px-3.5 py-2.5 font-bold">MACHINE / ENQUIRY</th>
                  <th className="px-3.5 py-2.5 font-bold">AGENDA & ACTIVITY</th>
                  <th className="px-3.5 py-2.5 font-bold">EXECUTIVE</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">QUICK ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((f) => {
                  const open = f.status === 'PENDING' || f.status === 'MISSED';
                  const overdue = open && new Date(f.dueAt).getTime() < now;
                  const isToday =
                    open &&
                    !overdue &&
                    new Date(f.dueAt).toDateString() === new Date(now).toDateString();
                  const links = phoneLinks(f.contact?.mobile, f.contact?.whatsappNumber);

                  return (
                    <tr
                      key={f.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        f.status === 'MISSED'
                          ? 'bg-rose-50/35'
                          : overdue
                          ? 'bg-rose-50/20'
                          : ''
                      }`}
                    >
                      {/* 1. TIME & SLA */}
                      <td className="px-3.5 py-2.5 align-middle">
                        <p
                          className={`font-black text-xs ${
                            overdue
                              ? 'text-rose-600'
                              : isToday
                              ? 'text-amber-800'
                              : 'text-slate-900'
                          }`}
                        >
                          {fmtDateTime(f.dueAt)}
                        </p>
                        <span
                          className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[10px] font-bold ${
                            overdue
                              ? 'bg-rose-100 text-rose-800'
                              : isToday
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {overdue ? (
                            <AlertCircle className="h-2.5 w-2.5 text-rose-600" />
                          ) : isToday ? (
                            <Clock className="h-2.5 w-2.5 text-amber-600" />
                          ) : (
                            <CalendarClock className="h-2.5 w-2.5 text-slate-500" />
                          )}
                          <span>
                            {open ? relative(f.dueAt, now) : label(f.status)}
                          </span>
                        </span>
                      </td>

                      {/* 2. CUSTOMER & FAST CONTACT */}
                      <td className="px-3.5 py-2.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">
                            {f.contact?.name || f.contact?.mobile || 'Customer'}
                          </span>
                          {f.contact?.city ? (
                            <span className="text-[10px] text-slate-400 font-medium">
                              ({f.contact.city})
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 flex items-center gap-1.5 text-slate-500">
                          {f.contact?.mobile ? (
                            <span className="font-mono text-[11px] font-medium text-slate-700">
                              {f.contact.mobile}
                            </span>
                          ) : null}

                          {f.contact?.mobile ? (
                            <button
                              type="button"
                              onClick={() => copyPhone(f.id, f.contact!.mobile)}
                              title="Copy mobile number"
                              className="p-0.5 text-slate-400 hover:text-slate-700 transition"
                            >
                              {copiedId === f.id ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          ) : null}

                          {links.tel ? (
                            <a
                              href={links.tel}
                              title="Call customer"
                              className="flex h-5 w-5 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition"
                            >
                              <Phone className="h-3 w-3" />
                            </a>
                          ) : null}

                          {links.wa ? (
                            <a
                              href={links.wa}
                              target="_blank"
                              rel="noreferrer"
                              title="Open WhatsApp"
                              className="flex h-5 w-5 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                            >
                              <MessageCircle className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>
                      </td>

                      {/* 3. MACHINE / ENQUIRY */}
                      <td className="px-3.5 py-2.5 align-middle">
                        {f.lead ? (
                          <div className="space-y-0.5 max-w-[240px]">
                            <Link
                              href={leadHref(base, f.lead.id)}
                              className="inline-flex items-center gap-1 font-bold text-slate-800 hover:text-amber-600 transition truncate max-w-full"
                              title={f.lead.listingTitleSnapshot || 'Lead details'}
                            >
                              <Tractor className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">
                                {f.lead.listingTitleSnapshot ||
                                  LEAD_TYPE_LABELS[f.lead.leadType] ||
                                  f.lead.leadType}
                              </span>
                            </Link>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={f.lead.status} />
                              <span className="text-[10px] text-slate-400 font-medium">
                                {LEAD_TYPE_LABELS[f.lead.leadType] || label(f.lead.leadType)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Direct Contact Activity</span>
                        )}
                      </td>

                      {/* 4. AGENDA & ACTIVITY */}
                      <td className="px-3.5 py-2.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 uppercase tracking-tight">
                            {label(f.type)}
                          </span>
                          {f.title ? (
                            <span className="font-semibold text-slate-900 truncate max-w-[200px]" title={f.title}>
                              {f.title}
                            </span>
                          ) : null}
                          {f.rescheduleCount ? (
                            <span className="rounded bg-amber-50 text-amber-800 text-[10px] font-bold px-1 py-0.2">
                              Moved {f.rescheduleCount}×
                            </span>
                          ) : null}
                        </div>

                        {f.notes ? (
                          <p className="mt-0.5 text-[11px] text-slate-500 truncate max-w-[240px]" title={f.notes}>
                            {f.notes}
                          </p>
                        ) : null}

                        {f.outcome ? (
                          <div className="mt-1 flex items-center gap-1 text-[11px]">
                            <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
                              {OUTCOME_LABELS[f.outcome] || f.outcome}
                            </span>
                            {f.outcomeNotes ? (
                              <span className="text-slate-500 truncate max-w-[180px]" title={f.outcomeNotes}>
                                {f.outcomeNotes}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </td>

                      {/* 5. EXECUTIVE */}
                      <td className="px-3.5 py-2.5 align-middle">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                          <User className="h-3 w-3 text-slate-400" />
                          <span className="truncate max-w-[90px]">
                            {f.owner?.name || 'Unassigned'}
                          </span>
                        </span>
                      </td>

                      {/* 6. QUICK ACTIONS */}
                      <td className="px-3.5 py-2.5 align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {open ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setRescheduling(f)}
                                title="Reschedule Appointment"
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition shadow-2xs"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setCompleting(f)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-xs font-bold text-white hover:bg-slate-800 transition shadow-2xs"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Done</span>
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Cleared</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* MODAL: COMPLETE FOLLOW-UP (CALL OUTCOME + NEXT STEP) */}
      {completing ? (
        <CompleteFollowUpModal
          followUp={completing}
          leadStatus={completing.lead?.status ?? null}
          onClose={() => setCompleting(null)}
          onDone={() => {
            setCompleting(null);
            reload();
          }}
        />
      ) : null}

      {/* MODAL: RESCHEDULE SINGLE FOLLOW-UP */}
      {rescheduling ? (
        <RescheduleModal
          followUp={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={() => {
            setRescheduling(null);
            reload();
          }}
        />
      ) : null}

      {/* MODAL: SCHEDULE NEW FOLLOW-UP */}
      {scheduling ? (
        <ScheduleFollowUpModal
          onClose={() => setScheduling(false)}
          onDone={() => {
            setScheduling(false);
            reload();
          }}
        />
      ) : null}

      {/* MODAL: BATCH RESCHEDULE OPEN FOLLOW-UPS */}
      {bulkMove ? (
        <BulkMoveModal
          ids={openItems.map((f) => f.id)}
          onClose={() => setBulkMove(false)}
          onDone={() => {
            setBulkMove(false);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function BulkMoveModal({
  ids,
  onClose,
  onDone,
}: {
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const result = (
        await api.post('/crm/followups/bulk-reschedule', {
          ids,
          date: new Date(`${date}T12:00:00`).toISOString(),
          reason,
        })
      ).data as { moved: number };
      toast.success(`${result.moved} follow-ups rescheduled.`);
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not reschedule follow-ups.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Batch Reschedule ${ids.length} Follow-ups`}
      subtitle="Each follow-up will maintain its scheduled time of day on the new date."
      onClose={onClose}
    >
      <div className="space-y-4 p-5 sm:p-6">
        <Field label="Target Reschedule Date *">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Operational Reason *">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            placeholder="e.g. Public Holiday, Team Review Meeting, System Maintenance"
          />
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!date || !reason.trim()}
            onClick={save}
          >
            Confirm Move
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function CalendarView({
  ownerId,
  now,
  onPick,
}: {
  ownerId: string;
  now: number;
  onPick: (followUp: FollowUp) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const range = useMemo(() => {
    const start = new Date(month);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday start
    const end = new Date(start);
    end.setDate(end.getDate() + 42);
    return { start, end };
  }, [month]);

  const data = useCrmResource(
    () =>
      getJson<FollowUpList>('/crm/followups', {
        bucket: 'range',
        from: range.start.toISOString(),
        to: range.end.toISOString(),
        ownerId,
        pageSize: 200,
      }),
    `cal-${range.start.toISOString()}-${ownerId}`
  );

  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(range.start);
    d.setDate(d.getDate() + i);
    return d;
  });

  const byDay = new Map<string, FollowUp[]>();
  for (const f of data.data?.items || []) {
    const key = new Date(f.dueAt).toDateString();
    byDay.set(key, [...(byDay.get(key) || []), f]);
  }
  const today = new Date(now).toDateString();

  return (
    <div className="p-3">
      {/* Calendar Header with Month Stepper */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-extrabold text-slate-900">
          {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition shadow-2xs"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-slate-600" />
          </button>
          <button
            type="button"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition shadow-2xs"
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
          </button>
        </div>
      </div>

      {data.error ? (
        <CrmErrorBanner message={data.error} schemaMissing={data.schemaMissing} />
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div
                key={d}
                className="bg-slate-50 px-2 py-1.5 text-[11px] font-bold uppercase text-slate-600 text-center"
              >
                {d}
              </div>
            ))}
            {days.map((d) => {
              const items = byDay.get(d.toDateString()) || [];
              const inMonth = d.getMonth() === month.getMonth();
              const isToday = d.toDateString() === today;

              return (
                <div
                  key={d.toISOString()}
                  className={`min-h-24 bg-white p-1.5 transition-colors ${
                    inMonth ? '' : 'bg-slate-50/60'
                  }`}
                >
                  <p
                    className={`mb-1 text-[11px] font-bold ${
                      isToday
                        ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-950 font-black'
                        : inMonth
                        ? 'text-slate-800'
                        : 'text-slate-300'
                    }`}
                  >
                    {d.getDate()}
                  </p>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() =>
                          (f.status === 'PENDING' || f.status === 'MISSED') && onPick(f)
                        }
                        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-bold transition-all ${
                          f.status === 'DONE'
                            ? 'bg-emerald-50 text-emerald-700 line-through'
                            : f.status === 'MISSED'
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                        }`}
                        title={`${label(f.type)} · ${f.contact?.name || ''}`}
                      >
                        {new Date(f.dueAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        {label(f.type)} {f.contact?.name || ''}
                      </button>
                    ))}
                    {items.length > 3 ? (
                      <p className="px-1 text-[10px] font-bold text-slate-400">
                        +{items.length - 3} more
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CrmFollowUpsPage() {
  return (
    <CrmPageFrame>
      <FollowUps />
    </CrmPageFrame>
  );
}
