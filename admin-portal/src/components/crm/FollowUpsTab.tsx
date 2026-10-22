'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, List, MessageCircle, Phone, RotateCcw } from 'lucide-react';
import api from '@/lib/api';
import { Button, EmptyState, Field, inputClass, LoadingState, Modal, ModalFooter, Panel } from '@/components/financeWorkspace/ui';
import { CompleteFollowUpModal, RescheduleModal } from './CrmModals';
import {
  CrmErrorBanner,
  crmError,
  fmtDateTime,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  OUTCOME_LABELS,
  phoneLinks,
  relative,
  compactSelectClass,
  StatusBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type FollowUp,
} from './crmShared';

type Summary = { overdue: number; today: number; upcoming: number; doneToday: number; missed: number };
type FollowUpList = { total: number; items: FollowUp[] };

const BUCKETS = [
  { key: 'overdue', label: 'Overdue', count: (s: Summary) => s.overdue, tone: 'text-red-600' },
  { key: 'today', label: 'Today', count: (s: Summary) => s.today, tone: 'text-amber-600' },
  { key: 'upcoming', label: 'Upcoming', count: (s: Summary) => s.upcoming, tone: 'text-slate-700' },
  { key: 'missed', label: 'Missed', count: (s: Summary) => s.missed, tone: 'text-red-700' },
  { key: 'done', label: 'Done', count: (s: Summary) => s.doneToday, tone: 'text-emerald-600' },
] as const;

export function FollowUpRow({ followUp, now, onComplete, onReschedule, showOwner }: { followUp: FollowUp; now: number; onComplete?: () => void; onReschedule?: () => void; showOwner?: boolean }) {
  const { base } = useCrmBase();
  const open = followUp.status === 'PENDING' || followUp.status === 'MISSED';
  const overdue = open && new Date(followUp.dueAt).getTime() < now;
  const links = phoneLinks(followUp.contact?.mobile, followUp.contact?.whatsappNumber);
  // Container query: the row also sits in narrow side columns (partner lead page).
  return (
    <div className="@container">
      <div className={`flex flex-col gap-3 px-4 py-3 @xl:flex-row @xl:items-center ${followUp.status === 'MISSED' ? 'bg-red-50/40' : ''}`}>
        <div className="shrink-0 @xl:w-36">
          <p className={`text-sm font-semibold ${overdue ? 'text-red-600' : 'text-slate-800'}`}>{fmtDateTime(followUp.dueAt)}</p>
          <p className={`text-xs ${overdue ? 'text-red-500' : 'text-slate-400'}`}>{open ? relative(followUp.dueAt, now) : label(followUp.status)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            <span className="mr-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">{label(followUp.type)}</span>
            {followUp.contact?.name || followUp.contact?.mobile || 'Customer'}
            {followUp.title ? <span className="font-normal text-slate-500"> — {followUp.title}</span> : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {followUp.lead ? <Link href={leadHref(base, followUp.lead.id)} className="font-semibold text-slate-700 hover:underline">{LEAD_TYPE_LABELS[followUp.lead.leadType] || followUp.lead.leadType}{followUp.lead.listingTitleSnapshot ? ` · ${followUp.lead.listingTitleSnapshot}` : ''}</Link> : 'Contact follow-up'}
            {followUp.notes ? ` · ${followUp.notes}` : ''}
            {followUp.outcome ? ` · ${OUTCOME_LABELS[followUp.outcome] || followUp.outcome}${followUp.outcomeNotes ? `: ${followUp.outcomeNotes}` : ''}` : ''}
            {followUp.rescheduleCount ? ` · moved ${followUp.rescheduleCount}×` : ''}
          </p>
          {showOwner ? <p className="text-[11px] text-slate-400">{followUp.owner?.name || 'Unassigned'}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {followUp.lead ? <StatusBadge status={followUp.lead.status} /> : null}
          {links.tel ? <a href={links.tel} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Call" aria-label="Call"><Phone className="h-4 w-4" /></a> : null}
          {links.wa ? <a href={links.wa} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-2 text-emerald-600 hover:bg-emerald-50" title="WhatsApp chat" aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /></a> : null}
          {open && onReschedule ? <button type="button" onClick={onReschedule} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Reschedule" aria-label="Reschedule"><RotateCcw className="h-4 w-4" /></button> : null}
          {open && onComplete ? <button type="button" onClick={onComplete} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"><CheckCircle2 className="h-4 w-4" />Done</button> : null}
        </div>
      </div>
    </div>
  );
}

export default function FollowUpsTab() {
  const { meta } = useCrmMeta();
  const access = meta?.access;
  const [bucket, setBucket] = useState<string>('today');
  const [ownerId, setOwnerId] = useState(access?.canSeeAll ? '' : 'me');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [bulkMove, setBulkMove] = useState(false);
  const [now] = useState(() => Date.now());
  const summary = useCrmResource(() => getJson<Summary>('/crm/followups/summary', { ownerId }), `sum-${ownerId}`);
  const list = useCrmResource(() => getJson<FollowUpList>('/crm/followups', { bucket, ownerId, pageSize: 200 }), `list-${bucket}-${ownerId}`);
  const reload = () => { summary.reload(); list.reload(); };
  const open = (list.data?.items || []).filter((f) => f.status === 'PENDING' || f.status === 'MISSED');

  return (
    <Panel
      title="Follow-ups"
      description="Your call list. Every open lead should have a next step; missed ones escalate to managers."
      actions={(
        <div className="flex flex-wrap gap-2">
          {!access?.isPartner && access?.canSeeAll ? (
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={`${compactSelectClass} w-44`}>
              <option value="">Everyone</option>
              <option value="me">Mine</option>
              <option value="none">Unassigned</option>
              {meta?.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : null}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button type="button" onClick={() => setView('list')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${view === 'list' ? 'bg-white shadow-sm' : 'text-slate-500'}`}><List className="h-3.5 w-3.5" />List</button>
            <button type="button" onClick={() => setView('calendar')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${view === 'calendar' ? 'bg-white shadow-sm' : 'text-slate-500'}`}><CalendarDays className="h-3.5 w-3.5" />Calendar</button>
          </div>
        </div>
      )}
    >
      {view === 'calendar' ? <CalendarView ownerId={ownerId} now={now} onPick={setCompleting} /> : (
        <>
          <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4 sm:grid-cols-5">
            {BUCKETS.map((b) => (
              <button key={b.key} type="button" onClick={() => setBucket(b.key)} className={`rounded-xl border p-3 text-left transition ${bucket === b.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <p className={`text-2xl font-bold ${bucket === b.key ? 'text-white' : b.tone}`}>{summary.data ? b.count(summary.data) : '–'}</p>
                <p className={`text-xs font-semibold ${bucket === b.key ? 'text-slate-200' : 'text-slate-500'}`}>{b.key === 'done' ? 'Done today' : b.label}</p>
              </button>
            ))}
          </div>
          {open.length > 1 ? (
            <div className="flex justify-end border-b border-slate-100 px-4 py-2"><Button onClick={() => setBulkMove(true)} icon={<RotateCcw className="h-4 w-4" />}>Move all {open.length} to another day</Button></div>
          ) : null}
          {list.loading && !list.data ? <LoadingState /> : list.error ? <CrmErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.items.length ? (
            <EmptyState title={bucket === 'overdue' ? 'Nothing overdue 🎉' : 'No follow-ups here'} description={bucket === 'today' ? 'Check Upcoming, or open a lead and schedule its next step.' : undefined} />
          ) : (
            <div className="divide-y divide-slate-100">
              {list.data.items.map((f) => <FollowUpRow key={f.id} followUp={f} now={now} showOwner={ownerId !== 'me'} onComplete={() => setCompleting(f)} onReschedule={() => setRescheduling(f)} />)}
            </div>
          )}
        </>
      )}
      {completing ? <CompleteFollowUpModal followUp={completing} leadStatus={completing.lead?.status ?? null} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); reload(); }} /> : null}
      {rescheduling ? <RescheduleModal followUp={rescheduling} onClose={() => setRescheduling(null)} onDone={() => { setRescheduling(null); reload(); }} /> : null}
      {bulkMove ? <BulkMoveModal ids={open.map((f) => f.id)} onClose={() => setBulkMove(false)} onDone={() => { setBulkMove(false); reload(); }} /> : null}
    </Panel>
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
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
        <p className="text-sm font-bold text-slate-900">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
        <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
      </div>
      {data.error ? <CrmErrorBanner message={data.error} schemaMissing={data.schemaMissing} /> : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="bg-slate-50 px-2 py-1.5 text-[11px] font-bold uppercase text-slate-500">{d}</div>)}
            {days.map((d) => {
              const items = byDay.get(d.toDateString()) || [];
              const inMonth = d.getMonth() === month.getMonth();
              return (
                <div key={d.toISOString()} className={`min-h-24 bg-white p-1.5 ${inMonth ? '' : 'bg-slate-50/70'}`}>
                  <p className={`mb-1 text-[11px] font-bold ${d.toDateString() === today ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-950' : inMonth ? 'text-slate-600' : 'text-slate-300'}`}>{d.getDate()}</p>
                  <div className="space-y-1">
                    {items.slice(0, 4).map((f) => (
                      <button key={f.id} type="button" onClick={() => (f.status === 'PENDING' || f.status === 'MISSED') && onPick(f)} className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-semibold ${f.status === 'DONE' ? 'bg-emerald-50 text-emerald-700 line-through' : f.status === 'MISSED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`} title={`${label(f.type)} · ${f.contact?.name || ''}`}>
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
    </div>
  );
}
