'use client';

import Link from 'next/link';
import { CheckCircle2, MessageCircle, Phone, RotateCcw } from 'lucide-react';
import { fmtDateTime, label, LEAD_TYPE_LABELS, leadHref, OUTCOME_LABELS, phoneLinks, relative, StatusBadge, useCrmBase, type FollowUp } from './crmShared';

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
