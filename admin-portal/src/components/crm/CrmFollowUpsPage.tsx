'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import {
  AlarmClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  PhoneCall,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { Button, EmptyState, Field, inputClass, LoadingState, Modal, ModalFooter, Panel } from '@/components/financeWorkspace/ui';
import { CompleteFollowUpModal, RescheduleModal } from './CrmModals';
import { FollowUpRow } from './FollowUpRow';
import {
  CrmErrorBanner,
  crmError,
  CrmPageFrame,
  getJson,
  label,
  PageHeader,
  selectClass,
  useCrmMeta,
  useCrmResource,
  type FollowUp,
} from './crmShared';

type Summary = { overdue: number; today: number; upcoming: number; doneToday: number; missed: number };
type FollowUpList = { total: number; items: FollowUp[] };

const BUCKETS = [
  { key: 'overdue', label: 'Overdue Calls', count: (s: Summary) => s.overdue, tone: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200', icon: AlarmClock },
  { key: 'today', label: 'Due Today', count: (s: Summary) => s.today, tone: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: Clock },
  { key: 'upcoming', label: 'Upcoming Agenda', count: (s: Summary) => s.upcoming, tone: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: CalendarRange },
  { key: 'missed', label: 'Missed Follow-ups', count: (s: Summary) => s.missed, tone: 'text-rose-700', bg: 'bg-rose-50/70', border: 'border-rose-200', icon: XCircle },
  { key: 'done', label: 'Completed Today', count: (s: Summary) => s.doneToday, tone: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
] as const;

function FollowUps() {
  const { meta } = useCrmMeta();
  const params = useSearchParams();
  const access = meta?.access;
  const requested = BUCKETS.some((b) => b.key === params.get('bucket')) ? (params.get('bucket') as string) : null;
  const [picked, setPicked] = useState<string | null>(requested);
  const [ownerId, setOwnerId] = useState(access?.canSeeAll ? '' : 'me');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [bulkMove, setBulkMove] = useState(false);
  const [now] = useState(() => Date.now());
  const summary = useCrmResource(() => getJson<Summary>('/crm/followups/summary', { ownerId }), `sum-${ownerId}`);
  // Without a choice, open Overdue when something is overdue, else Today.
  const bucket = picked ?? (summary.data?.overdue ? 'overdue' : 'today');
  const list = useCrmResource(
    () => getJson<FollowUpList>('/crm/followups', { bucket, ownerId, pageSize: 200 }),
    `list-${bucket}-${ownerId}`,
  );
  const reload = () => {
    summary.reload();
    list.reload();
  };
  const open = (list.data?.items || []).filter((f) => f.status === 'PENDING' || f.status === 'MISSED');
  const active = BUCKETS.find((b) => b.key === bucket);

  return (
    <>
      <PageHeader
        title="Follow-ups & Tele-Calling Desk"
        badgeText={summary.data ? `${summary.data.today} Due Today · ${summary.data.overdue} Overdue` : undefined}
        description="Daily operational call queue. Keep every lead progressing; complete interactions with call outcomes or reschedule next appointments."
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200/90 bg-white p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setView('list')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  view === 'list' ? 'bg-slate-950 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Call List
              </button>
              <button
                type="button"
                onClick={() => setView('calendar')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  view === 'calendar' ? 'bg-slate-950 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Calendar
              </button>
            </div>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* SIDEBAR ASIDE: EXECUTIVE FILTER & BUCKET SELECTOR */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          {!access?.isPartner && access?.canSeeAll ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-2xs">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Executive Filter
              </label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={selectClass}
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
            </div>
          ) : null}

          {/* BUCKET LIST */}
          <nav className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs" aria-label="Follow-up buckets">
            <div className="p-2 space-y-1">
              {BUCKETS.map((b) => {
                const Icon = b.icon;
                const on = view === 'list' && bucket === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => {
                      setPicked(b.key);
                      setView('list');
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-all ${
                      on
                        ? 'bg-slate-900 text-white shadow-2xs font-bold'
                        : 'hover:bg-slate-50 text-slate-700 font-semibold'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 text-xs truncate">
                      <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-amber-400' : b.tone}`} />
                      <span>{b.label}</span>
                    </span>
                    <span
                      className={`inline-flex items-center justify-center rounded-lg px-2 py-0.5 text-xs font-bold ${
                        on ? 'bg-white/20 text-white' : `${b.bg} ${b.tone}`
                      }`}
                    >
                      {summary.data ? b.count(summary.data) : '–'}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          {view === 'list' && open.length > 1 ? (
            <button
              type="button"
              onClick={() => setBulkMove(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50/80 hover:bg-amber-100/80 p-2.5 text-xs font-bold text-amber-900 transition-colors shadow-2xs"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-700" />
              <span>Reschedule {open.length} Pending Calls</span>
            </button>
          ) : null}
        </aside>

        {/* MAIN VIEW: CALENDAR OR HIGH-DENSITY CALL LIST */}
        {view === 'calendar' ? (
          <CalendarView ownerId={ownerId} now={now} onPick={setCompleting} />
        ) : (
          <Panel
            title={active?.label || 'Follow-ups'}
            description={list.data ? `${list.data.total} total appointments scheduled in this queue.` : undefined}
          >
            {list.loading && !list.data ? (
              <LoadingState label="Loading queue items…" />
            ) : list.error ? (
              <CrmErrorBanner message={list.error} schemaMissing={list.schemaMissing} />
            ) : !list.data?.items.length ? (
              <EmptyState
                title={bucket === 'overdue' ? 'No overdue follow-ups!' : 'No follow-up calls in this queue'}
                description={
                  bucket === 'today'
                    ? 'Check Upcoming appointments or open a lead and schedule the next follow-up.'
                    : undefined
                }
              />
            ) : (
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto custom-scrollbar">
                {list.data.items.map((f) => (
                  <FollowUpRow
                    key={f.id}
                    followUp={f}
                    now={now}
                    showOwner={ownerId !== 'me'}
                    onComplete={() => setCompleting(f)}
                    onReschedule={() => setRescheduling(f)}
                  />
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>

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

      {bulkMove ? (
        <BulkMoveModal
          ids={open.map((f) => f.id)}
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

function BulkMoveModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
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
    <Modal title={`Batch Reschedule ${ids.length} Follow-ups`} subtitle="Each follow-up will maintain its scheduled time of day on the new date." onClose={onClose}>
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
            placeholder="e.g. Public Holiday, Team Meeting, Customer Requested Weekend"
          />
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!date || !reason.trim()} onClick={save}>
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
    `cal-${range.start.toISOString()}-${ownerId}`,
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
    <Panel
      title={month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      description="Interactive appointment grid. Click any pending follow-up to register outcome or close."
      actions={
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4 text-slate-600" />
          </button>
          <button
            type="button"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4 text-slate-600" />
          </button>
        </div>
      }
    >
      {data.error ? (
        <CrmErrorBanner message={data.error} schemaMissing={data.schemaMissing} />
      ) : (
        <div className="overflow-x-auto p-3">
          <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="bg-slate-50 px-2 py-1.5 text-[11px] font-bold uppercase text-slate-600 text-center">
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
                  className={`min-h-28 bg-white p-1.5 transition-colors ${inMonth ? '' : 'bg-slate-50/60'}`}
                >
                  <p
                    className={`mb-1 text-[11px] font-bold ${
                      isToday
                        ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-950 font-bold'
                        : inMonth
                        ? 'text-slate-700'
                        : 'text-slate-300'
                    }`}
                  >
                    {d.getDate()}
                  </p>
                  <div className="space-y-1">
                    {items.slice(0, 4).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => (f.status === 'PENDING' || f.status === 'MISSED') && onPick(f)}
                        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-bold transition-all ${
                          f.status === 'DONE'
                            ? 'bg-emerald-50 text-emerald-700 line-through'
                            : f.status === 'MISSED'
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                        }`}
                        title={`${label(f.type)} · ${f.contact?.name || ''}`}
                      >
                        {new Date(f.dueAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{' '}
                        {label(f.type)} {f.contact?.name || ''}
                      </button>
                    ))}
                    {items.length > 4 ? (
                      <p className="px-1 text-[10px] font-bold text-slate-400">+{items.length - 4} more</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function CrmFollowUpsPage() {
  return (
    <CrmPageFrame>
      <FollowUps />
    </CrmPageFrame>
  );
}
