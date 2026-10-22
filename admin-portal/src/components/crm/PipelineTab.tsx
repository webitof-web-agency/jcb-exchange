'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarClock, GripVertical } from 'lucide-react';
import { LoadingState, Panel } from '@/components/financeWorkspace/ui';
import { StatusChangeModal } from './CrmModals';
import { requirementSummary } from './LeadsTab';
import {
  CrmErrorBanner,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  relative,
  compactSelectClass,
  TemperatureBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type LeadRow,
} from './crmShared';

type Board = { columns: Array<{ status: string; count: number; expectedValue: number; cards: LeadRow[] }> };

const COLUMN_ACCENT: Record<string, string> = {
  NEW: 'border-t-blue-500', CONTACTED: 'border-t-slate-400', QUALIFIED: 'border-t-violet-500', INTERESTED: 'border-t-violet-500',
  INSPECTION_SCHEDULED: 'border-t-amber-500', NEGOTIATION: 'border-t-amber-600', ON_HOLD: 'border-t-slate-300', WON: 'border-t-emerald-500', LOST: 'border-t-red-500',
};

export default function PipelineTab() {
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
  const columns = (board.data?.columns || []).filter((c) => showClosed || (c.status !== 'WON' && c.status !== 'LOST'));

  return (
    <Panel
      title="Pipeline"
      description="Drag a card to another stage. Lost needs a reason; open stages need a next follow-up."
      actions={(
        <div className="flex flex-wrap gap-2">
          {!meta?.access.isPartner ? (
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={`${compactSelectClass} w-40`}>
              <option value="">Everyone</option>
              <option value="me">Mine</option>
              {meta?.access.canAssign ? <option value="none">Unassigned</option> : null}
              {meta?.access.canSeeAll ? meta.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : null}
            </select>
          ) : null}
          <select value={leadType} onChange={(e) => setLeadType(e.target.value)} className={`${compactSelectClass} w-44`}>
            <option value="">All lead types</option>
            {(meta?.enums.leadTypes || []).map((t) => <option key={t} value={t}>{LEAD_TYPE_LABELS[t] || label(t)}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="accent-amber-500" />Show won / lost</label>
        </div>
      )}
    >
      {board.loading && !board.data ? <LoadingState /> : board.error ? <CrmErrorBanner message={board.error} schemaMissing={board.schemaMissing} /> : (
        <div className="flex gap-3 overflow-x-auto p-4">
          {columns.map((column) => (
            <div
              key={column.status}
              onDragOver={(e) => { if (dragging && dragging.status !== column.status) e.preventDefault(); }}
              onDrop={() => { if (dragging && dragging.status !== column.status) setMove({ lead: dragging, to: column.status }); setDragging(null); }}
              className={`flex w-72 shrink-0 flex-col rounded-2xl border border-t-4 border-slate-200 bg-slate-50 ${COLUMN_ACCENT[column.status] || ''} ${dragging && dragging.status !== column.status ? 'ring-2 ring-amber-300' : ''}`}
            >
              <div className="flex items-baseline justify-between px-3 pb-2 pt-3">
                <p className="text-sm font-bold text-slate-900">{label(column.status)} <span className="font-semibold text-slate-400">{column.count}</span></p>
                {column.expectedValue ? <p className="text-[11px] font-semibold text-slate-500">{fmtInr(column.expectedValue)}</p> : null}
              </div>
              <div className="flex max-h-[68vh] flex-col gap-2 overflow-y-auto px-2 pb-3">
                {column.cards.map((lead) => {
                  const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now;
                  return (
                    <div key={lead.id} draggable={Boolean(meta?.access.canManage)} onDragStart={() => setDragging(lead)} onDragEnd={() => setDragging(null)} className="group rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-amber-300">
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <Link href={leadHref(base, lead.id)} className="block truncate text-sm font-semibold text-slate-900 hover:underline">{lead.customer.name || lead.customer.mobile || 'Unnamed'}</Link>
                          <p className="truncate text-xs text-slate-500">{LEAD_TYPE_LABELS[lead.leadType] || lead.leadType} · {requirementSummary(lead)}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <TemperatureBadge temperature={lead.temperature} />
                        {lead.expectedValue ? <span className="text-[11px] font-semibold text-slate-600">{fmtInr(lead.expectedValue)}</span> : null}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className={`flex items-center gap-1 ${overdue ? 'font-semibold text-red-600' : lead.nextFollowUpAt ? 'text-slate-500' : 'font-semibold text-amber-700'}`}>
                          <CalendarClock className="h-3 w-3" />{lead.nextFollowUpAt ? relative(lead.nextFollowUpAt, now) : lead.status === 'WON' || lead.status === 'LOST' ? 'closed' : 'no follow-up'}
                        </span>
                        {!meta?.access.isPartner ? <span className="truncate text-slate-400">{lead.owner?.name || 'Unassigned'}</span> : null}
                      </div>
                    </div>
                  );
                })}
                {column.count > column.cards.length ? <p className="px-2 text-center text-[11px] text-slate-400">+{column.count - column.cards.length} more — use the Leads list</p> : null}
                {!column.count ? <p className="px-2 py-6 text-center text-xs text-slate-400">Empty</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {move ? <StatusChangeModal leadId={move.lead.id} currentStatus={move.lead.status} initialStatus={move.to} onClose={() => setMove(null)} onDone={() => { setMove(null); board.reload(); }} /> : null}
    </Panel>
  );
}
