'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { AlarmClock, CalendarDays, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Clock, List, RotateCcw, XCircle } from 'lucide-react';
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
  { key: 'overdue', label: 'Overdue', count: (s: Summary) => s.overdue, tone: 'text-red-600', icon: AlarmClock },
  { key: 'today', label: 'Due today', count: (s: Summary) => s.today, tone: 'text-amber-600', icon: Clock },
  { key: 'upcoming', label: 'Upcoming', count: (s: Summary) => s.upcoming, tone: 'text-slate-700', icon: CalendarRange },
  { key: 'missed', label: 'Missed', count: (s: Summary) => s.missed, tone: 'text-red-700', icon: XCircle },
  { key: 'done', label: 'Done today', count: (s: Summary) => s.doneToday, tone: 'text-emerald-600', icon: CheckCircle2 },
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
  const list = useCrmResource(() => getJson<FollowUpList>('/crm/followups', { bucket, ownerId, pageSize: 200 }), `list-${bucket}-${ownerId}`);
  const reload = () => { summary.reload(); list.reload(); };
  const open = (list.data?.items || []).filter((f) => f.status === 'PENDING' || f.status === 'MISSED');
  const active = BUCKETS.find((b) => b.key === bucket);

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Your call list. Every open lead needs a next step; missed ones are flagged and escalated to managers."
        actions={(
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
            <button type="button" onClick={() => setView('list')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><List className="h-4 w-4" />List</button>
            <button type="button" onClick={() => setView('calendar')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${view === 'calendar' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><CalendarDays className="h-4 w-4" />Calendar</button>
          </div>
        )}
      />

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          {!access?.isPartner && access?.canSeeAll ? (
            <Field label="Whose follow-ups">
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={selectClass}>
                <option value="">Everyone</option>
                <option value="me">Mine</option>
                <option value="none">Unassigned</option>
                {meta?.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          ) : null}
          <nav className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Follow-up buckets">
            {BUCKETS.map((b) => {
              const Icon = b.icon;
              const on = view === 'list' && bucket === b.key;
              return (
                <button key={b.key} type="button" onClick={() => { setPicked(b.key); setView('list'); }} className={`flex w-full items-center justify-between gap-3 border-l-4 px-4 py-3 text-left transition ${on ? 'border-amber-500 bg-amber-50' : 'border-transparent hover:bg-slate-50'}`}>
                  <span className={`flex items-center gap-2.5 text-sm font-semibold ${on ? 'text-slate-900' : 'text-slate-600'}`}><Icon className={`h-4 w-4 ${b.tone}`} />{b.label}</span>
                  <span className={`text-lg font-bold ${b.tone}`}>{summary.data ? b.count(summary.data) : '–'}</span>
                </button>
              );
            })}
          </nav>
          {view === 'list' && open.length > 1 ? (
            <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => setBulkMove(true)}>Move these {open.length} to another day</Button>
          ) : null}
        </aside>

        {view === 'calendar' ? <CalendarView ownerId={ownerId} now={now} onPick={setCompleting} /> : (
          <Panel title={active?.label || 'Follow-ups'} description={list.data ? `${list.data.total} ${list.data.total === 1 ? 'follow-up' : 'follow-ups'}` : undefined}>
            {list.loading && !list.data ? <LoadingState /> : list.error ? <CrmErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.items.length ? (
              <EmptyState title={bucket === 'overdue' ? 'Nothing overdue' : 'No follow-ups here'} description={bucket === 'today' ? 'Check Upcoming, or open a lead and schedule its next step.' : undefined} />
            ) : (
              <div className="divide-y divide-slate-100">
                {list.data.items.map((f) => <FollowUpRow key={f.id} followUp={f} now={now} showOwner={ownerId !== 'me'} onComplete={() => setCompleting(f)} onReschedule={() => setRescheduling(f)} />)}
              </div>
            )}
          </Panel>
        )}
      </div>

      {completing ? <CompleteFollowUpModal followUp={completing} leadStatus={completing.lead?.status ?? null} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); reload(); }} /> : null}
      {rescheduling ? <RescheduleModal followUp={rescheduling} onClose={() => setRescheduling(null)} onDone={() => { setRescheduling(null); reload(); }} /> : null}
      {bulkMove ? <BulkMoveModal ids={open.map((f) => f.id)} onClose={() => setBulkMove(false)} onDone={() => { setBulkMove(false); reload(); }} /> : null}
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
      const result = (await api.post('/crm/followups/bulk-reschedule', { ids, date: new Date(`${date}T12:00:00`).toISOString(), reason })).data as { moved: number };
      toast.success(`${result.moved} follow-ups moved.`);
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not move the follow-ups.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Move ${ids.length} follow-ups`} subtitle="Each keeps its time of day." onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <Field label="New date *"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
        <Field label="Reason *"><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. On leave" /></Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!date || !reason.trim()} onClick={save}>Move</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function CalendarView({ ownerId, now, onPick }: { ownerId: string; now: number; onPick: (followUp: FollowUp) => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const range = useMemo(() => {
    const start = new Date(month);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday grid start
    const end = new Date(start);
    end.setDate(end.getDate() + 42);
    return { start, end };
  }, [month]);
  const data = useCrmResource(
    () => getJson<FollowUpList>('/crm/followups', { bucket: 'range', from: range.start.toISOString(), to: range.end.toISOString(), ownerId, pageSize: 200 }),
    `cal-${range.start.toISOString()}-${ownerId}`,
  );
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(range.start); d.setDate(d.getDate() + i); return d; });
  const byDay = new Map<string, FollowUp[]>();
  for (const f of data.data?.items || []) {
    const key = new Date(f.dueAt).toDateString();
    byDay.set(key, [...(byDay.get(key) || []), f]);
  }
  const today = new Date(now).toDateString();
  return (
    <Panel
      title={month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      description="Click an open follow-up to complete it."
      actions={(
        <div className="flex gap-1">
          <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    >
      {data.error ? <CrmErrorBanner message={data.error} schemaMissing={data.schemaMissing} /> : (
        <div className="overflow-x-auto p-4">
          <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="bg-slate-50 px-2 py-1.5 text-[11px] font-bold uppercase text-slate-500">{d}</div>)}
            {days.map((d) => {
              const items = byDay.get(d.toDateString()) || [];
              const inMonth = d.getMonth() === month.getMonth();
              return (
                <div key={d.toISOString()} className={`min-h-28 bg-white p-1.5 ${inMonth ? '' : 'bg-slate-50/70'}`}>
                  <p className={`mb-1 text-[11px] font-bold ${d.toDateString() === today ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-950' : inMonth ? 'text-slate-600' : 'text-slate-300'}`}>{d.getDate()}</p>
                  <div className="space-y-1">
                    {items.slice(0, 4).map((f) => (
                      <button key={f.id} type="button" onClick={() => (f.status === 'PENDING' || f.status === 'MISSED') && onPick(f)} className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold ${f.status === 'DONE' ? 'bg-emerald-50 text-emerald-700 line-through' : f.status === 'MISSED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`} title={`${label(f.type)} · ${f.contact?.name || ''}`}>
                        {new Date(f.dueAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} {label(f.type)} {f.contact?.name || ''}
                      </button>
                    ))}
                    {items.length > 4 ? <p className="px-1 text-[10px] text-slate-400">+{items.length - 4} more</p> : null}
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
  return <CrmPageFrame><FollowUps /></CrmPageFrame>;
}
