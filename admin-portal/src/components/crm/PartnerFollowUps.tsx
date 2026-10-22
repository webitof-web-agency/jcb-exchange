'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlarmClock, CalendarPlus } from 'lucide-react';
import { Button, EmptyState, LoadingState, Panel } from '@/components/financeWorkspace/ui';
import { CompleteFollowUpModal, RescheduleModal, ScheduleFollowUpModal } from './CrmModals';
import { FollowUpRow } from './FollowUpRow';
import { CrmMetaProvider, fmtDateTime, getJson, label, leadHref, relative, useCrmResource, type FollowUp } from './crmShared';

type LeadFollowUps = { lead: { id: string; status: string; leadType: string; priority: string; temperature: string; listingTitleSnapshot: string | null; customer: FollowUp['contact']; followUps: FollowUp[] } };

function LeadPanel({ leadId }: { leadId: string }) {
  const [now] = useState(() => Date.now());
  const data = useCrmResource(() => getJson<LeadFollowUps>(`/crm/leads/${leadId}`), `partner-lead-${leadId}`);
  const [scheduling, setScheduling] = useState(false);
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const done = () => { setScheduling(false); setCompleting(null); setRescheduling(null); data.reload(); };
  if (data.loading && !data.data) return <Panel title="Follow-ups"><LoadingState /></Panel>;
  // The CRM is optional for partners: hide the panel if it is not available.
  if (data.error || !data.data) return null;
  const { lead } = data.data;
  const open = lead.status !== 'WON' && lead.status !== 'LOST';
  const pending = lead.followUps.filter((f) => f.status === 'PENDING' || f.status === 'MISSED').sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const doneList = lead.followUps.filter((f) => f.status === 'DONE').slice(0, 5);
  const withLead = (f: FollowUp): FollowUp => ({ ...f, contact: lead.customer, lead: { id: lead.id, status: lead.status, leadType: lead.leadType, priority: lead.priority, temperature: lead.temperature, listingTitleSnapshot: lead.listingTitleSnapshot } });
  return (
    <Panel title="Follow-ups" description="Plan the next call or visit; you get a reminder before it is due." actions={open ? <Button variant="primary" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setScheduling(true)}>Schedule</Button> : undefined}>
      {pending.length ? <div className="divide-y divide-slate-100">{pending.map((f) => <FollowUpRow key={f.id} followUp={withLead(f)} now={now} onComplete={() => setCompleting(f)} onReschedule={() => setRescheduling(f)} />)}</div>
        : open ? <EmptyState title="No follow-up planned" description="Schedule the next step so this customer is not forgotten." /> : null}
      {doneList.length ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="mb-1 text-[11px] font-bold uppercase text-slate-400">Recently done</p>
          <ul className="space-y-1 text-xs text-slate-600">{doneList.map((f) => <li key={f.id}>{fmtDateTime(f.completedAt)} · {label(f.type)} · {label(f.outcome)}{f.outcomeNotes ? ` — ${f.outcomeNotes}` : ''}</li>)}</ul>
        </div>
      ) : null}
      {scheduling ? <ScheduleFollowUpModal leadId={lead.id} onClose={() => setScheduling(false)} onDone={done} /> : null}
      {completing ? <CompleteFollowUpModal followUp={withLead(completing)} leadStatus={lead.status} onClose={() => setCompleting(null)} onDone={done} /> : null}
      {rescheduling ? <RescheduleModal followUp={rescheduling} onClose={() => setRescheduling(null)} onDone={done} /> : null}
    </Panel>
  );
}

/** Follow-up panel for a partner's lead detail page. */
export function PartnerLeadFollowUps({ leadId }: { leadId: string }) {
  return <CrmMetaProvider><LeadPanel leadId={leadId} /></CrmMetaProvider>;
}

/** "Due today / overdue" strip on the partner leads list. */
export function PartnerFollowUpStrip() {
  const [now] = useState(() => Date.now());
  const overdue = useCrmResource(() => getJson<{ total: number; items: FollowUp[] }>('/crm/followups', { bucket: 'overdue', pageSize: 5 }), 'partner-overdue');
  const today = useCrmResource(() => getJson<{ total: number; items: FollowUp[] }>('/crm/followups', { bucket: 'today', pageSize: 5 }), 'partner-today');
  const items = [...(overdue.data?.items || []), ...(today.data?.items || [])];
  if (!items.length) return null;
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><AlarmClock className="h-4 w-4 text-amber-600" />Follow-ups due · {overdue.data?.total || 0} overdue · {today.data?.total || 0} today</p>
      <ul className="space-y-1.5">
        {items.map((f) => {
          const late = new Date(f.dueAt).getTime() < now;
          return (
            <li key={f.id}>
              <Link href={f.lead ? leadHref('/partner', f.lead.id) : '/partner/leads'} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm hover:shadow-sm">
                <span className="font-semibold text-slate-800">{label(f.type)} · {f.contact?.name || f.contact?.mobile}{f.lead?.listingTitleSnapshot ? <span className="font-normal text-slate-500"> — {f.lead.listingTitleSnapshot}</span> : null}</span>
                <span className={`text-xs font-semibold ${late ? 'text-red-600' : 'text-amber-700'}`}>{relative(f.dueAt, now)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
