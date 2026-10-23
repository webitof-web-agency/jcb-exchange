'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  CalendarClock,
  ChevronRight,
  GripVertical,
  Kanban,
  MessageCircle,
  Phone,
  Sparkles,
} from 'lucide-react';
import { LoadingState } from '@/components/financeWorkspace/ui';
import { StatusChangeModal } from './CrmModals';
import {
  compactSelectClass,
  CrmErrorBanner,
  CrmPageFrame,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  PageHeader,
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

const COLUMN_THEMES: Record<string, { border: string; bg: string; dot: string }> = {
  NEW: { border: 'border-t-blue-500', bg: 'bg-blue-50/20', dot: 'bg-blue-500' },
  CONTACTED: { border: 'border-t-slate-400', bg: 'bg-slate-50/20', dot: 'bg-slate-500' },
  QUALIFIED: { border: 'border-t-purple-500', bg: 'bg-purple-50/20', dot: 'bg-purple-500' },
  INTERESTED: { border: 'border-t-indigo-500', bg: 'bg-indigo-50/20', dot: 'bg-indigo-500' },
  INSPECTION_SCHEDULED: { border: 'border-t-amber-500', bg: 'bg-amber-50/20', dot: 'bg-amber-500' },
  NEGOTIATION: { border: 'border-t-orange-500', bg: 'bg-orange-50/20', dot: 'bg-orange-500' },
  ON_HOLD: { border: 'border-t-zinc-400', bg: 'bg-zinc-50/20', dot: 'bg-zinc-400' },
  WON: { border: 'border-t-emerald-500', bg: 'bg-emerald-50/20', dot: 'bg-emerald-500' },
  LOST: { border: 'border-t-rose-500', bg: 'bg-rose-50/20', dot: 'bg-rose-500' },
};

function Pipeline() {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const [ownerId, setOwnerId] = useState('');
  const [leadType, setLeadType] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [dragging, setDragging] = useState<LeadRow | null>(null);
  const [move, setMove] = useState<{ lead: LeadRow; to: string } | null>(null);
  const [now] = useState(() => Date.now());
  const query = { ...(ownerId ? { ownerId } : {}), ...(leadType ? { leadType } : {}) };
  const board = useCrmResource(() => getJson<Board>('/crm/leads/board', query), JSON.stringify(query));
  const columns = (board.data?.columns || []).filter(
    (c) => showClosed || (c.status !== 'WON' && c.status !== 'LOST'),
  );
  const openValue = (board.data?.columns || [])
    .filter((c) => c.status !== 'WON' && c.status !== 'LOST')
    .reduce((sum, c) => sum + c.expectedValue, 0);
  const totalCards = columns.reduce((sum, c) => sum + c.count, 0);

  return (
    <>
      <PageHeader
        title="CRM Deal Pipeline & Stage Funnel"
        badgeText={openValue ? `Pipeline Value: ${fmtInr(openValue)}` : `${totalCards} Active Leads`}
        description="Interactive visual kanban board. Drag and drop deal cards to advance stages across qualification, inspection, negotiation and closing."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!meta?.access.isPartner ? (
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={`${compactSelectClass} w-36`}
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
              className={`${compactSelectClass} w-36`}
              aria-label="Lead type"
            >
              <option value="">All Lead Types</option>
              {(meta?.enums.leadTypes || []).map((t) => (
                <option key={t} value={t}>
                  {LEAD_TYPE_LABELS[t] || label(t)}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(e) => setShowClosed(e.target.checked)}
                className="accent-amber-500 rounded"
              />
              <span>Show Won / Lost</span>
            </label>
          </div>
        }
      />

      {board.loading && !board.data ? (
        <LoadingState label="Loading pipeline board…" />
      ) : board.error ? (
        <CrmErrorBanner message={board.error} schemaMissing={board.schemaMissing} />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
          {columns.map((column) => {
            const theme = COLUMN_THEMES[column.status] || {
              border: 'border-t-slate-400',
              bg: 'bg-slate-50/20',
              dot: 'bg-slate-400',
            };
            const isDropTarget = dragging && dragging.status !== column.status;

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
                className={`flex min-w-[280px] max-w-[280px] flex-1 flex-col rounded-2xl border border-slate-200/90 bg-slate-50/50 shadow-2xs transition-all duration-200 ${
                  theme.border
                } border-t-4 ${isDropTarget ? 'ring-2 ring-amber-400 bg-amber-50/40 shadow-md' : ''}`}
              >
                {/* COLUMN HEADER */}
                <div className="flex items-center justify-between px-3.5 pt-3 pb-2.5 border-b border-slate-200/70 bg-white/80 rounded-t-xl">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`h-2 w-2 rounded-full ${theme.dot}`} />
                    <p className="text-xs font-bold text-slate-900 truncate tracking-tight">
                      {label(column.status)}
                    </p>
                    <span className="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 px-1.5 py-0.2 text-[10px] font-bold">
                      {column.count}
                    </span>
                  </div>
                  {column.expectedValue ? (
                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded-md">
                      {fmtInr(column.expectedValue)}
                    </span>
                  ) : null}
                </div>

                {/* CARD CONTAINER */}
                <div className="flex h-[calc(100vh-16rem)] min-h-[460px] flex-col gap-2.5 overflow-y-auto p-2.5 custom-scrollbar">
                  {column.cards.map((lead) => {
                    const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now;
                    const links = phoneLinks(lead.customer.mobile, lead.customer.whatsappNumber);

                    return (
                      <div
                        key={lead.id}
                        draggable={Boolean(meta?.access.canManage)}
                        onDragStart={() => setDragging(lead)}
                        onDragEnd={() => setDragging(null)}
                        className={`group relative rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs transition-all duration-150 hover:border-amber-400 hover:shadow-sm ${
                          dragging?.id === lead.id ? 'opacity-40 scale-95' : ''
                        }`}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing" />
                          <div className="min-w-0 flex-1">
                            <Link
                              href={leadHref(base, lead.id)}
                              className="block truncate text-xs font-bold text-slate-900 hover:text-amber-600 transition-colors"
                            >
                              {lead.customer.name || lead.customer.mobile || 'Unnamed Customer'}
                            </Link>
                            <p className="truncate text-[11px] text-slate-500 font-medium">
                              <span className="font-semibold text-slate-700">
                                {LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}
                              </span>
                              {lead.listingTitleSnapshot ? ` · ${lead.listingTitleSnapshot}` : ''}
                            </p>
                          </div>
                        </div>

                        {/* VALUE & TEMPERATURE */}
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                          <TemperatureBadge temperature={lead.temperature} />
                          {lead.expectedValue ? (
                            <span className="text-[11px] font-bold text-emerald-700">
                              {fmtInr(lead.expectedValue)}
                            </span>
                          ) : null}
                        </div>

                        {/* NEXT FOLLOW-UP & OWNER */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                          <span
                            className={`inline-flex items-center gap-1 font-semibold ${
                              overdue
                                ? 'text-rose-600'
                                : lead.nextFollowUpAt
                                ? 'text-slate-500'
                                : 'text-amber-700 font-bold'
                            }`}
                          >
                            <CalendarClock className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {lead.nextFollowUpAt
                                ? relative(lead.nextFollowUpAt, now)
                                : lead.status === 'WON' || lead.status === 'LOST'
                                ? 'Closed'
                                : 'No step'}
                            </span>
                          </span>

                          <div className="flex items-center gap-1">
                            {links.wa ? (
                              <a
                                href={links.wa}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-600 hover:text-emerald-700 p-0.5"
                                title="WhatsApp"
                              >
                                <MessageCircle className="h-3 w-3" />
                              </a>
                            ) : null}
                            {links.tel ? (
                              <a
                                href={links.tel}
                                className="text-slate-500 hover:text-slate-800 p-0.5"
                                title="Call"
                              >
                                <Phone className="h-3 w-3" />
                              </a>
                            ) : null}
                            {!meta?.access.isPartner && lead.owner ? (
                              <span className="truncate max-w-[80px] font-bold text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                                {lead.owner.name}
                              </span>
                            ) : null}
                          </div>
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

                  {!column.count ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-xs">
                      <Kanban className="h-6 w-6 text-slate-300 mb-1" />
                      <span>No deals in stage</span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {move ? (
        <StatusChangeModal
          leadId={move.lead.id}
          currentStatus={move.lead.status}
          initialStatus={move.to}
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
