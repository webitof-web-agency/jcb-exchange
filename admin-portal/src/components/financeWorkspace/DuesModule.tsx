'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { CalendarClock, ChevronDown, ChevronRight, FileText, MessageSquare } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { todayIso } from './ledgerLookups';
import { bucketLabel, BUCKETS, FollowUpModal, PartyStatementModal, ScheduleModal, type Bucket, type DueSide, type PartyRef } from './receivablesShared';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Panel, Tabs, tableHeadClass } from './ui';
import { useResource } from './useResource';

type DueItem = { id: string; date: string; dueDate: string; ref: string; voucherNumber: string | null; narration: string; account: string; original: number; open: number; daysOverdue: number; bucket: Bucket };
type DueParty = {
  party: PartyRef & { types: string[]; creditDays: number | null; creditLimit: number | null };
  outstanding: number; unapplied: number; net: number; buckets: Record<Bucket, number>; oldestDays: number;
  accounts: Array<{ id: string; code: string; name: string; outstanding: number; unapplied: number; net: number }>;
  items: DueItem[];
};
type DuesResponse = { side: DueSide; asOf: string; totals: { outstanding: number; unapplied: number; buckets: Record<Bucket, number>; parties: number }; parties: DueParty[] };

const bucketTone: Record<Bucket, 'slate' | 'green' | 'amber' | 'red' | 'violet'> = { NOT_DUE: 'green', D0_30: 'slate', D31_60: 'amber', D61_90: 'red', D90_PLUS: 'red' };

export const useDues = (side: DueSide, asOf: string, items: boolean, version: number) =>
  useResource(async () => (await api.get('/finance-hub/receivables/dues', { params: { side, asOf, items: items ? undefined : 'false' } })).data as DuesResponse, `dues-${side}-${asOf}-${items}-${version}`);

const IconAction = ({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label} className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-slate-900">{children}</button>
);

const BucketCards = ({ totals }: { totals: DuesResponse['totals'] }) => (
  <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
    <div className="rounded-xl bg-slate-900 p-3 text-white"><p className="text-[11px] uppercase tracking-wide text-slate-300">Outstanding</p><p className="text-base font-bold">{formatInr(totals.outstanding)}</p><p className="text-[11px] text-slate-400">{totals.parties} parties</p></div>
    {BUCKETS.map((bucket) => <div key={bucket} className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{bucketLabel[bucket]}</p><p className={`text-base font-bold ${bucket === 'D61_90' || bucket === 'D90_PLUS' ? 'text-red-700' : 'text-slate-900'}`}>{formatInr(totals.buckets[bucket])}</p></div>)}
  </div>
);

/** Customer dues or supplier/partner payables: party totals, ageing and open bills (oldest paid first). */
export default function DuesModule({ side }: { side: DueSide }) {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.arap.manage']);
  const [asOf, setAsOf] = useState(todayIso());
  const [bucket, setBucket] = useState<'' | Bucket>('');
  const [version, setVersion] = useState(0);
  const dues = useDues(side, asOf, true, version);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statementFor, setStatementFor] = useState<PartyRef | null>(null);
  const [followUpFor, setFollowUpFor] = useState<DueParty | null>(null);
  const [scheduleFor, setScheduleFor] = useState<DueParty | null>(null);
  const receivable = side === 'RECEIVABLE';
  const rows = (dues.data?.parties ?? []).filter((row) => !bucket || row.buckets[bucket] > 0);

  return (
    <Panel
      title={receivable ? 'Customer dues' : 'Supplier / partner payables'}
      description={receivable ? 'What customers and partners owe, from posted entries. Payments are applied to the oldest bill first; due date = bill date + party credit days (or the bill’s own due date).' : 'What we owe sellers, vendors, partners, brokers and consignors, from posted entries. Payments are applied to the oldest bill first.'}
    >
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[180px_200px]">
        <Field label="As of"><input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={inputClass} /></Field>
        <Field label="Age">
          <select value={bucket} onChange={(event) => setBucket(event.target.value as Bucket)} className={inputClass}>
            <option value="">All</option>
            {BUCKETS.map((item) => <option key={item} value={item}>{bucketLabel[item]}</option>)}
          </select>
        </Field>
      </div>
      {dues.data ? <BucketCards totals={dues.data.totals} /> : null}
      {dues.loading ? <LoadingState /> : dues.error ? <ErrorBanner message={dues.error} schemaMissing={dues.schemaMissing} /> : !rows.length ? (
        <EmptyState title={receivable ? 'Nothing receivable' : 'Nothing payable'} description="Only posted vouchers count. In shadow mode the automatic entries are drafts until posted." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5" /><th className="px-4 py-2.5">Party</th><th className="px-4 py-2.5 text-right">Outstanding</th>{BUCKETS.map((item) => <th key={item} className="px-4 py-2.5 text-right">{bucketLabel[item]}</th>)}<th className="px-4 py-2.5 text-right">{receivable ? 'Advance' : 'Paid ahead'}</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <Fragment key={row.party.id}>
                  <tr className="hover:bg-amber-50/30">
                    <td className="px-2 py-3"><button type="button" onClick={() => setExpanded(expanded === row.party.id ? null : row.party.id)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Show bills">{expanded === row.party.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>
                    <td className={cellClass}><span className="font-semibold text-slate-900">{row.party.name}</span><span className="block font-mono text-[11px] text-slate-400">{row.party.code}{row.party.creditDays ? ` · ${row.party.creditDays} days credit` : ''}{row.party.creditLimit && row.outstanding > row.party.creditLimit ? ' · over limit' : ''}</span></td>
                    <td className={`${cellClass} text-right font-bold`}>{formatInr(row.outstanding)}</td>
                    {BUCKETS.map((item) => <td key={item} className={`${cellClass} text-right ${row.buckets[item] && (item === 'D61_90' || item === 'D90_PLUS') ? 'font-semibold text-red-700' : ''}`}>{row.buckets[item] ? formatInr(row.buckets[item]) : '—'}</td>)}
                    <td className={`${cellClass} text-right text-xs`}>{row.unapplied ? formatInr(row.unapplied) : '—'}</td>
                    <td className={`${cellClass} whitespace-nowrap text-right`}>
                      <IconAction label="Statement" onClick={() => setStatementFor(row.party)}><FileText className="h-4 w-4" /></IconAction>
                      {canManage ? <IconAction label="Follow up" onClick={() => setFollowUpFor(row)}><MessageSquare className="h-4 w-4" /></IconAction> : null}
                      {canManage ? <IconAction label="Schedule" onClick={() => setScheduleFor(row)}><CalendarClock className="h-4 w-4" /></IconAction> : null}
                    </td>
                  </tr>
                  {expanded === row.party.id ? (
                    <tr className="bg-slate-50/60">
                      <td />
                      <td colSpan={BUCKETS.length + 4} className="px-4 py-3">
                        <table className="w-full text-left text-xs">
                          <thead className="text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="py-1">Date</th><th className="py-1">Bill / voucher</th><th className="py-1">Ledger</th><th className="py-1">Due</th><th className="py-1 text-right">Amount</th><th className="py-1 text-right">Open</th><th className="py-1">Age</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {row.items.map((item) => (
                              <tr key={item.id}>
                                <td className="py-1.5">{formatDate(item.date)}</td>
                                <td className="py-1.5 font-mono">{item.ref || item.voucherNumber}<span className="block max-w-[320px] truncate font-sans text-slate-400" title={item.narration}>{item.narration}</span></td>
                                <td className="py-1.5">{item.account}</td>
                                <td className="py-1.5">{formatDate(item.dueDate)}</td>
                                <td className="py-1.5 text-right">{formatInr(item.original)}</td>
                                <td className="py-1.5 text-right font-semibold">{formatInr(item.open)}</td>
                                <td className="py-1.5"><Badge tone={bucketTone[item.bucket]}>{item.daysOverdue > 0 ? `${item.daysOverdue} days overdue` : 'Not due'}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {statementFor ? <PartyStatementModal party={statementFor} onClose={() => setStatementFor(null)} /> : null}
      {followUpFor ? <FollowUpModal party={followUpFor.party} side={side} amount={followUpFor.outstanding} onClose={() => setFollowUpFor(null)} onSaved={() => setFollowUpFor(null)} /> : null}
      {scheduleFor ? <ScheduleModal party={scheduleFor.party} side={side} onClose={() => setScheduleFor(null)} onSaved={() => { setScheduleFor(null); setVersion((value) => value + 1); }} /> : null}
    </Panel>
  );
}

type AgingTab = DueSide;

/** Ageing buckets for receivables and payables as of a date. */
export function AgingModule() {
  const [tab, setTab] = useState<AgingTab>('RECEIVABLE');
  const [asOf, setAsOf] = useState(todayIso());
  const dues = useDues(tab, asOf, false, 0);
  const downloadCsv = () => {
    if (!dues.data) return;
    const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [['Party', 'Code', 'Outstanding', ...BUCKETS.map((bucket) => bucketLabel[bucket]), 'Unapplied'].map(cell).join(','), ...dues.data.parties.map((row) => [row.party.name, row.party.code, row.outstanding, ...BUCKETS.map((bucket) => row.buckets[bucket]), row.unapplied].map(cell).join(','))];
    const url = URL.createObjectURL(new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ageing-${tab.toLowerCase()}-${asOf}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Panel title="Due ageing" description="Open amounts by how long they are overdue. Not due = within credit days." actions={<Button onClick={downloadCsv} disabled={!dues.data?.parties.length}>Download CSV</Button>}>
      <Tabs<AgingTab> tabs={[{ key: 'RECEIVABLE', label: 'Receivables' }, { key: 'PAYABLE', label: 'Payables' }]} active={tab} onChange={setTab} />
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[180px]"><Field label="As of"><input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={inputClass} /></Field></div>
      {dues.data ? <BucketCards totals={dues.data.totals} /> : null}
      {dues.loading ? <LoadingState /> : dues.error ? <ErrorBanner message={dues.error} schemaMissing={dues.schemaMissing} /> : !dues.data?.parties.length ? <EmptyState title="Nothing open" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Party</th><th className="px-4 py-2.5 text-right">Outstanding</th>{BUCKETS.map((item) => <th key={item} className="px-4 py-2.5 text-right">{bucketLabel[item]}</th>)}<th className="px-4 py-2.5 text-right">Oldest</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {dues.data.parties.map((row) => (
                <tr key={row.party.id}>
                  <td className={cellClass}><span className="font-semibold">{row.party.name}</span><span className="block font-mono text-[11px] text-slate-400">{row.party.code}</span></td>
                  <td className={`${cellClass} text-right font-bold`}>{formatInr(row.outstanding)}</td>
                  {BUCKETS.map((item) => <td key={item} className={`${cellClass} text-right`}>{row.buckets[item] ? formatInr(row.buckets[item]) : '—'}</td>)}
                  <td className={`${cellClass} text-right text-xs`}>{row.oldestDays > 0 ? `${row.oldestDays} days` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
