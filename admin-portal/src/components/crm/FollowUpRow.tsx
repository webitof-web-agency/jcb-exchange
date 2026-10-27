'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  MessageCircle,
  Phone,
  RotateCcw,
  Tractor,
} from 'lucide-react';
import {
  fmtDateTime,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  OUTCOME_LABELS,
  leadWhatsAppMessage,
  phoneLinks,
  relative,
  StatusBadge,
  useCrmBase,
  type FollowUp,
} from './crmShared';

export function FollowUpRow({
  followUp,
  now,
  onComplete,
  onReschedule,
  showOwner,
}: {
  followUp: FollowUp;
  now: number;
  onComplete?: () => void;
  onReschedule?: () => void;
  showOwner?: boolean;
}) {
  const { base } = useCrmBase();
  const [copied, setCopied] = useState(false);
  const open = followUp.status === 'PENDING' || followUp.status === 'MISSED';
  const overdue = open && new Date(followUp.dueAt).getTime() < now;
  const isToday =
    open &&
    !overdue &&
    new Date(followUp.dueAt).toDateString() === new Date(now).toDateString();
  const links = phoneLinks(followUp.contact?.mobile, followUp.contact?.whatsappNumber, leadWhatsAppMessage(followUp.contact?.name, followUp.lead));

  const copyPhone = () => {
    if (!followUp.contact?.mobile) return;
    navigator.clipboard.writeText(followUp.contact.mobile);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="@container">
      <div
        className={`flex flex-col gap-3 px-3.5 py-2.5 transition-colors @xl:flex-row @xl:items-center hover:bg-slate-50/70 ${
          followUp.status === 'MISSED'
            ? 'bg-rose-50/40'
            : overdue
            ? 'bg-rose-50/20'
            : ''
        }`}
      >
        {/* TIME & SLA BADGE */}
        <div className="shrink-0 @xl:w-36">
          <p
            className={`text-xs font-extrabold ${
              overdue
                ? 'text-rose-600'
                : isToday
                ? 'text-amber-800'
                : 'text-slate-800'
            }`}
          >
            {fmtDateTime(followUp.dueAt)}
          </p>
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[10px] font-bold ${
              overdue
                ? 'bg-rose-100 text-rose-800'
                : isToday
                ? 'bg-amber-100 text-amber-900'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {overdue ? (
              <AlertCircle className="h-2.5 w-2.5" />
            ) : isToday ? (
              <Clock className="h-2.5 w-2.5" />
            ) : (
              <CalendarClock className="h-2.5 w-2.5" />
            )}
            <span>{open ? relative(followUp.dueAt, now) : label(followUp.status)}</span>
          </span>
        </div>

        {/* CUSTOMER, MACHINE & AGENDA DETAILS */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 uppercase tracking-tight">
              {label(followUp.type)}
            </span>
            <span className="text-xs font-bold text-slate-900">
              {followUp.contact?.name || followUp.contact?.mobile || 'Customer'}
            </span>
            {followUp.title ? (
              <span className="text-xs font-medium text-slate-600 truncate max-w-[200px]">
                — {followUp.title}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
            {followUp.lead ? (
              <Link
                href={leadHref(base, followUp.lead.id)}
                className="inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-amber-600 transition-colors"
              >
                <Tractor className="h-3 w-3 text-slate-400 shrink-0" />
                <span className="truncate max-w-[220px]">
                  {followUp.lead.listingTitleSnapshot ||
                    LEAD_TYPE_LABELS[followUp.lead.leadType] ||
                    followUp.lead.leadType}
                </span>
              </Link>
            ) : (
              <span className="text-slate-400">Direct Contact Follow-up</span>
            )}

            {followUp.notes ? (
              <span className="truncate max-w-[260px] text-slate-500">
                · {followUp.notes}
              </span>
            ) : null}

            {followUp.outcome ? (
              <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
                {OUTCOME_LABELS[followUp.outcome] || followUp.outcome}
                {followUp.outcomeNotes ? `: ${followUp.outcomeNotes}` : ''}
              </span>
            ) : null}

            {followUp.rescheduleCount ? (
              <span className="rounded bg-amber-50 text-amber-800 text-[10px] font-bold px-1 py-0.2">
                moved {followUp.rescheduleCount}×
              </span>
            ) : null}
          </div>

          {showOwner ? (
            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
              Assigned: {followUp.owner?.name || 'Unassigned'}
            </p>
          ) : null}
        </div>

        {/* ACTIONS & FAST CONTACT */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {followUp.lead ? <StatusBadge status={followUp.lead.status} /> : null}

          {followUp.contact?.mobile ? (
            <button
              type="button"
              onClick={copyPhone}
              title={`Copy phone: ${followUp.contact.mobile}`}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            </button>
          ) : null}

          {links.tel ? (
            <a
              href={links.tel}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
              title="Call Customer"
              aria-label="Call"
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          ) : null}

          {links.wa ? (
            <a
              href={links.wa}
              target="_blank"
              rel="noreferrer"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition shadow-2xs"
              title="Chat on WhatsApp"
              aria-label="WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          ) : null}

          {open && onReschedule ? (
            <button
              type="button"
              onClick={onReschedule}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
              title="Reschedule Appointment"
              aria-label="Reschedule"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {open && onComplete ? (
            <button
              type="button"
              onClick={onComplete}
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-xs font-bold text-white hover:bg-slate-800 transition shadow-2xs"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Done</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
