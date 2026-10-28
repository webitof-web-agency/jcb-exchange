'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { useDues } from './DuesModule';
import { optionalChoices, todayIso, useLedgerLookups } from './ledgerLookups';
import { FollowUpModal, PartyStatementView, ScheduleModal, usePartyOptions, whatsappLink, type DueSide, type PartyRef, type Schedule } from './receivablesShared';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, selectButtonClass, tableHeadClass, Tabs } from './ui';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

/** Party statement: pick a party and period; print / PDF, CSV or share on WhatsApp. */
export function PartyStatementsModule() {
  const parties = usePartyOptions();
  const [partyId, setPartyId] = useState('');
  const [range, setRange] = useState({ from: '', to: todayIso() });
  return (
    <Panel title="Party statements" description="Opening balance, every entry and closing balance across the party's ledgers (receivable, payable, advances, deposits). Dr = due from the party.">
      <div className="grid gap-3 border-b border-slate-100 p-3 md:grid-cols-[1fr_180px_180px]">
        <Field label="Party"><SearchableSelect buttonClassName={selectButtonClass} options={optionalChoices(parties.data ?? [], partyId)} value={partyId} onChange={(option) => setPartyId(String(option.id))} placeholder="Choose party" /></Field>
        <Field label="From" hint="Blank: start of the financial year."><input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To"><input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} className={inputClass} /></Field>
      </div>
      {partyId ? <PartyStatementView partyId={partyId} from={range.from} to={range.to} /> : <EmptyState title="Choose a party" description="Statements include automatic entries (Sold Vehicles, listings, Prime, deposits) once they are posted." />}
    </Panel>
  );
}

type AdvanceRow = { party: PartyRef; account: { id: string; code: string; name: string; systemKey: string }; direction: 'HELD' | 'PAID'; balance: number };

/** Money held for parties (customer advances, partner deposits) and money paid ahead (seller / employee advances). */
export function AdvancesModule() {
  const [asOf, setAsOf] = useState(todayIso());
  const advances = useResource(async () => (await api.get('/finance-hub/receivables/advances', { params: { asOf } })).data as { held: number; paid: number; rows: AdvanceRow[] }, `advances-${asOf}`);
  const [statementFor, setStatementFor] = useState<PartyRef | null>(null);
  return (
    <Panel title="Party advances & deposits" description="Customer advances and partner security deposits we hold, and advances we paid to sellers and employees. Adjusted when the sale / purchase / salary is booked.">
      <div className="grid gap-3 border-b border-slate-100 p-3 sm:grid-cols-[180px_1fr_1fr]">
        <Field label="As of"><input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={inputClass} /></Field>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">We hold (advances & deposits received)</p><p className="text-[15px] font-semibold">{formatInr(advances.data?.held ?? 0)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">We paid ahead</p><p className="text-[15px] font-semibold">{formatInr(advances.data?.paid ?? 0)}</p></div>
      </div>
      {advances.loading ? <LoadingState /> : advances.error ? <ErrorBanner message={advances.error} schemaMissing={advances.schemaMissing} /> : !advances.data?.rows.length ? <EmptyState title="No open advances or deposits" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Party</th><th className="px-3 py-2">Ledger</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {advances.data.rows.map((row) => (
                <tr key={`${row.party.id}-${row.account.id}`}>
                  <td className={cellClass}><span className="font-semibold">{row.party.name}</span><span className="block font-mono text-[11px] text-slate-400">{row.party.code}</span></td>
                  <td className={`${cellClass} text-xs`}>{row.account.code} · {row.account.name}</td>
                  <td className={cellClass}><Badge tone={row.direction === 'HELD' ? 'violet' : 'amber'}>{row.direction === 'HELD' ? 'We hold' : 'We paid'}</Badge></td>
                  <td className={`${cellClass} text-right font-semibold ${row.balance < 0 ? 'text-red-700' : ''}`}>{formatInr(row.balance)}{row.balance < 0 ? <span className="block text-[11px] font-normal">over-adjusted</span> : null}</td>
                  <td className={`${cellClass} text-right`}><Button variant="ghost" onClick={() => setStatementFor(row.party)}>Statement</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {statementFor ? <Modal title={`Statement: ${statementFor.name}`} onClose={() => setStatementFor(null)} wide><PartyStatementView partyId={statementFor.id} from="" to={asOf} /></Modal> : null}
    </Panel>
  );
}

const scheduleTone = { PLANNED: 'blue', DONE: 'green', CANCELLED: 'slate' } as const;

/** Planned collections and payments with due dates; mark done with the voucher number. */
export function SchedulesModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.arap.manage']);
  const parties = usePartyOptions();
  const [filters, setFilters] = useState({ status: 'PLANNED', side: '', from: '', to: '' });
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/receivables/schedules', { params: { status: filters.status || undefined, side: filters.side || undefined, from: filters.from || undefined, to: filters.to || undefined } })).data.schedules as Schedule[], `schedules-${JSON.stringify(filters)}-${version}`);
  const [form, setForm] = useState<{ initial: Schedule | null } | null>(null);
  const refresh = () => setVersion((value) => value + 1);
  const rows = useMemo(() => list.data ?? [], [list.data]);
  const totals = useMemo(() => ({
    inflow: rows.filter((row) => row.side === 'RECEIVABLE' && row.status === 'PLANNED').reduce((sum, row) => sum + row.amount, 0),
    outflow: rows.filter((row) => row.side === 'PAYABLE' && row.status === 'PLANNED').reduce((sum, row) => sum + row.amount, 0),
    overdue: rows.filter((row) => row.overdue).length,
  }), [rows]);

  const act = async (row: Schedule, action: 'DONE' | 'CANCEL') => {
    const value = window.prompt(action === 'DONE' ? 'Receipt / payment voucher number (optional):' : 'Reason for cancelling:');
    if (value === null) return;
    try {
      await api.put(`/finance-hub/receivables/schedules/${row.id}`, action === 'DONE' ? { action, voucherNumber: value } : { action, reason: value });
      toast.success(action === 'DONE' ? 'Marked done.' : 'Cancelled.');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update the schedule.'));
    }
  };

  return (
    <Panel title="Payment schedules" description="Expected collections and planned payments by due date. Planning only: record the money with a receipt or payment voucher, then mark the item done." actions={canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ initial: null })}>Schedule</Button> : null}>
      <div className="grid gap-3 border-b border-slate-100 p-3 md:grid-cols-4">
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={inputClass} aria-label="Status"><option value="">All statuses</option><option value="PLANNED">Planned</option><option value="DONE">Done</option><option value="CANCELLED">Cancelled</option></select>
        <select value={filters.side} onChange={(event) => setFilters({ ...filters, side: event.target.value })} className={inputClass} aria-label="Direction"><option value="">In and out</option><option value="RECEIVABLE">Money in</option><option value="PAYABLE">Money out</option></select>
        <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} aria-label="From" />
        <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} aria-label="To" />
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-3">
        <div className="rounded-lg bg-emerald-50 p-3"><p className="text-[11px] uppercase tracking-wide text-emerald-700">Expected in</p><p className="text-[15px] font-semibold">{formatInr(totals.inflow)}</p></div>
        <div className="rounded-lg bg-amber-50 p-3"><p className="text-[11px] uppercase tracking-wide text-amber-700">Planned out</p><p className="text-[15px] font-semibold">{formatInr(totals.outflow)}</p></div>
        <div className="rounded-lg bg-red-50 p-3"><p className="text-[11px] uppercase tracking-wide text-red-700">Overdue items</p><p className="text-[15px] font-semibold">{totals.overdue}</p></div>
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !rows.length ? <EmptyState title="Nothing scheduled" description="Add expected collections (e.g. promised instalments) and planned payments." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Due</th><th className="px-3 py-2">Direction</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className={row.overdue ? 'bg-red-50/40' : ''}>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(row.dueDate)}{row.overdue ? <span className="block text-[11px] font-semibold text-red-700">Overdue</span> : null}</td>
                  <td className={cellClass}><Badge tone={row.side === 'RECEIVABLE' ? 'green' : 'amber'}>{row.side === 'RECEIVABLE' ? 'In' : 'Out'}</Badge></td>
                  <td className={`${cellClass} text-xs`}><span className="font-semibold">{row.party.name}</span>{row.notes ? <span className="block text-slate-500">{row.notes}</span> : null}</td>
                  <td className={`${cellClass} text-xs`}>{row.reference ?? '—'}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{formatInr(row.amount)}</td>
                  <td className={cellClass}><Badge tone={scheduleTone[row.status]}>{enumLabel(row.status)}</Badge>{row.voucherNumber ? <span className="block font-mono text-[11px]">{row.voucherNumber}</span> : null}</td>
                  <td className={`${cellClass} whitespace-nowrap text-right`}>
                    {row.status === 'PLANNED' && canManage ? (
                      <>
                        <Button variant="ghost" onClick={() => void act(row, 'DONE')}>Done</Button>
                        <Button variant="ghost" onClick={() => setForm({ initial: row })}>Edit</Button>
                        <Button variant="ghost" onClick={() => void act(row, 'CANCEL')}>Cancel</Button>
                      </>
                    ) : null}
                    {row.status === 'PLANNED' && row.side === 'RECEIVABLE' && row.party.mobile ? <a href={whatsappLink(row.party.mobile, `Dear ${row.party.name}, a reminder that ${formatInr(row.amount)} is due on ${formatDate(row.dueDate)}${row.reference ? ` (${row.reference})` : ''}. Thank you, JCB Exchange.`)} target="_blank" rel="noreferrer" className="ml-1 text-xs font-semibold text-emerald-700 hover:underline">WhatsApp</a> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? <ScheduleModal initial={form.initial} side={form.initial?.side ?? 'RECEIVABLE'} parties={parties.data ?? []} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} /> : null}
    </Panel>
  );
}

type FollowUp = { id: string; party: PartyRef; side: DueSide; kind: string; notes: string; promisedDate: string | null; promisedAmount: number | null; nextActionDate: string | null; status: 'OPEN' | 'DONE'; assignedTo: string | null; createdBy: string | null; createdAt: string; overdue: boolean };
type FollowTab = 'today' | 'open' | 'done';

/** Collection follow-ups: today's actions, open items and the history log. */
export function FollowUpsModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.arap.manage', 'fh.parties.manage']);
  const parties = usePartyOptions();
  const [tab, setTab] = useState<FollowTab>('today');
  const [version, setVersion] = useState(0);
  const params = tab === 'today' ? { status: 'OPEN', due: 'today' } : tab === 'open' ? { status: 'OPEN' } : { status: 'DONE' };
  const list = useResource(async () => (await api.get('/finance-hub/receivables/follow-ups', { params })).data.followUps as FollowUp[], `follow-ups-${tab}-${version}`);
  const receivables = useDues('RECEIVABLE', todayIso(), false, version);
  const [creating, setCreating] = useState<{ party: PartyRef | null; amount?: number } | null>(null);
  const refresh = () => setVersion((value) => value + 1);
  const outstandingOf = (partyId: string) => receivables.data?.parties.find((row) => row.party.id === partyId)?.outstanding ?? 0;

  const done = async (row: FollowUp) => {
    const outcome = window.prompt('Outcome (optional):');
    if (outcome === null) return;
    try {
      await api.post(`/finance-hub/receivables/follow-ups/${row.id}/done`, { outcome });
      toast.success('Marked done.');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update.'));
    }
  };

  const topOverdue = (receivables.data?.parties ?? []).filter((row) => row.buckets.D31_60 + row.buckets.D61_90 + row.buckets.D90_PLUS > 0).slice(0, 8);

  return (
    <Panel title="Follow-up & reminders" description="Calls, WhatsApp reminders and visits with promises to pay. WhatsApp opens with a ready message; nothing is sent automatically." actions={canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating({ party: null })}>Log follow-up</Button> : null}>
      {topOverdue.length ? (
        <div className="border-b border-slate-100 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Overdue more than 30 days</p>
          <div className="flex flex-wrap gap-2">
            {topOverdue.map((row) => (
              <button key={row.party.id} type="button" disabled={!canManage} onClick={() => setCreating({ party: row.party, amount: row.outstanding })} className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">{row.party.name} · {formatInr(row.outstanding)}</button>
            ))}
          </div>
        </div>
      ) : null}
      <Tabs<FollowTab> tabs={[{ key: 'today', label: 'Due today & overdue' }, { key: 'open', label: 'All open' }, { key: 'done', label: 'History' }]} active={tab} onChange={setTab} />
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="Nothing here" description={tab === 'today' ? 'No follow-ups due today.' : undefined} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Next action</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Notes</th><th className="px-3 py-2">Promise</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((row) => (
                <tr key={row.id} className={row.overdue ? 'bg-red-50/40' : ''}>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(row.nextActionDate)}{row.overdue ? <span className="block text-[11px] font-semibold text-red-700">Overdue</span> : null}</td>
                  <td className={`${cellClass} text-xs`}><span className="font-semibold">{row.party.name}</span><span className="block text-slate-400">{row.side === 'RECEIVABLE' ? 'Collection' : 'Payment'}</span></td>
                  <td className={cellClass}><Badge>{enumLabel(row.kind)}</Badge></td>
                  <td className={`${cellClass} max-w-[340px] whitespace-pre-line text-xs`}>{row.notes}</td>
                  <td className={`${cellClass} text-xs`}>{row.promisedAmount ? formatInr(row.promisedAmount) : '—'}{row.promisedDate ? <span className="block text-slate-500">by {formatDate(row.promisedDate)}</span> : null}</td>
                  <td className={`${cellClass} text-xs`}>{row.assignedTo ?? '—'}<span className="block text-slate-400">{formatDate(row.createdAt)}</span></td>
                  <td className={`${cellClass} whitespace-nowrap text-right`}>
                    {row.status === 'OPEN' && canManage ? <Button variant="ghost" onClick={() => void done(row)}>Done</Button> : null}
                    {canManage ? <Button variant="ghost" onClick={() => setCreating({ party: row.party, amount: outstandingOf(row.party.id) })}>Next</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating ? <FollowUpModal party={creating.party} parties={parties.data ?? []} side="RECEIVABLE" amount={creating.amount} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); refresh(); }} /> : null}
    </Panel>
  );
}

type WriteOff = { id: string; side: DueSide; kind: string; party: { code: string; name: string }; date: string; amount: number; reason: string; controlAccount: string; counterAccount: string; voucher: { id: string; number: string | null; status: string } | null };
const KINDS: Record<DueSide, Array<{ key: string; label: string; counterKey: string }>> = {
  RECEIVABLE: [{ key: 'DISCOUNT', label: 'Settlement discount', counterKey: 'DISCOUNT_ALLOWED' }, { key: 'WAIVER', label: 'Waiver', counterKey: 'DISCOUNT_ALLOWED' }, { key: 'WRITE_OFF', label: 'Bad debt write-off', counterKey: 'BAD_DEBTS' }],
  PAYABLE: [{ key: 'DISCOUNT', label: 'Discount received', counterKey: '4502' }, { key: 'WAIVER', label: 'Waived by party', counterKey: 'WRITE_BACK' }, { key: 'WRITE_BACK', label: 'Write-back (not payable)', counterKey: 'WRITE_BACK' }],
};
const voucherTone: Record<string, 'green' | 'amber' | 'slate' | 'red'> = { POSTED: 'green', PENDING_APPROVAL: 'amber', DRAFT: 'slate', REJECTED: 'red', REVERSED: 'red' };

/** Final settlement adjustments: discounts, waivers, bad-debt write-offs and write-backs (journal vouchers with approval). */
export function WriteOffsModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.arap.manage']);
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/receivables/write-offs')).data.writeOffs as WriteOff[], `write-offs-${version}`);
  const [creating, setCreating] = useState(false);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  return (
    <Panel title="Settlements & write-offs" description="Close small differences and bad debts. Each entry is a journal voucher; amounts above the approval limit wait for a checker. Partner / broker / consignor payouts are under Vehicle Finance → Partner Commission & Settlement." actions={canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New adjustment</Button> : null}>
      {!canManage ? <ReadOnlyNotice>Creating adjustments needs “Manage Receivables & Payables”.</ReadOnlyNotice> : null}
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="No adjustments yet" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2">Ledgers</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Voucher</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((row) => (
                <tr key={row.id}>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(row.date)}</td>
                  <td className={`${cellClass} text-xs font-semibold`}>{row.party.name}</td>
                  <td className={cellClass}><Badge tone={row.side === 'RECEIVABLE' ? 'red' : 'green'}>{enumLabel(row.kind)}</Badge></td>
                  <td className={`${cellClass} text-xs`}>{row.controlAccount}<span className="block text-slate-400">↔ {row.counterAccount}</span></td>
                  <td className={`${cellClass} max-w-[280px] text-xs`}>{row.reason}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{formatInr(row.amount)}</td>
                  <td className={cellClass}>{row.voucher ? <button type="button" onClick={() => setOpenVoucher(row.voucher!.id)} className="text-left"><Badge tone={voucherTone[row.voucher.status] ?? 'slate'}>{enumLabel(row.voucher.status)}</Badge><span className="block font-mono text-[11px] text-blue-700">{row.voucher.number ?? 'Open'}</span></button> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating ? <WriteOffForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setVersion((value) => value + 1); }} /> : null}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={() => setVersion((value) => value + 1)} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}

function WriteOffForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const lookups = useLedgerLookups();
  const [side, setSide] = useState<DueSide>('RECEIVABLE');
  const dues = useDues(side, todayIso(), false, 0);
  const [form, setForm] = useState({ partyId: '', controlAccountId: '', kind: 'DISCOUNT', counterAccountId: '', date: todayIso(), amount: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const row = dues.data?.parties.find((item) => item.party.id === form.partyId);
  const control = row?.accounts.find((account) => account.id === form.controlAccountId);
  const counterNature = side === 'RECEIVABLE' ? 'EXPENSE' : 'INCOME';
  const counterOptions = lookups.accounts.filter((account) => account.isActive && account.allowManualPosting && !account.requiresParty && lookups.natureOf(account) === counterNature).map(lookups.accountOption);
  const suggest = (kind: string, forSide = side) => {
    const key = KINDS[forSide].find((item) => item.key === kind)?.counterKey;
    return lookups.accounts.find((account) => account.systemKey === key || account.code === key)?.id ?? '';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/receivables/write-offs', { side, ...form })).data as { status: string; number: string | null };
      toast.success(result.status === 'POSTED' ? `Posted as ${result.number}.` : result.status === 'PENDING_APPROVAL' ? 'Sent for approval.' : 'Saved as a draft voucher for an accountant to post.');
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the adjustment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New settlement adjustment" subtitle="Creates a journal voucher between the party ledger and an expense / income ledger." onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={submit} className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Balance">
            <select value={side} onChange={(event) => { const next = event.target.value as DueSide; setSide(next); setForm({ ...form, partyId: '', controlAccountId: '', kind: 'DISCOUNT', counterAccountId: suggest('DISCOUNT', next) }); }} className={inputClass}>
              <option value="RECEIVABLE">Receivable (party owes us)</option>
              <option value="PAYABLE">Payable (we owe the party)</option>
            </select>
          </Field>
          <Field label="Kind">
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value, counterAccountId: suggest(event.target.value) })} className={inputClass}>
              {KINDS[side].map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Party *" wide>
            <SearchableSelect buttonClassName={selectButtonClass} options={(dues.data?.parties ?? []).map((item) => ({ id: item.party.id, name: `${item.party.name} · ${formatInr(item.net)}` }))} value={form.partyId} onChange={(option) => { const party = dues.data?.parties.find((item) => item.party.id === option.id); setForm({ ...form, partyId: String(option.id), controlAccountId: party?.accounts[0]?.id ?? '', counterAccountId: form.counterAccountId || suggest(form.kind) }); }} placeholder={dues.loading ? 'Loading…' : 'Parties with an open balance'} />
          </Field>
          <Field label="Party ledger *">
            <select value={form.controlAccountId} onChange={(event) => setForm({ ...form, controlAccountId: event.target.value })} className={inputClass} disabled={!row}>
              {(row?.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} ({formatInr(account.net)})</option>)}
            </select>
          </Field>
          <Field label={side === 'RECEIVABLE' ? 'Expense ledger *' : 'Income ledger *'}>
            <SearchableSelect buttonClassName={selectButtonClass} options={counterOptions} value={form.counterAccountId} onChange={(option) => setForm({ ...form, counterAccountId: String(option.id) })} placeholder="Choose ledger" />
          </Field>
          <Field label="Date *"><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} required /></Field>
          <Field label="Amount *" hint={control ? `Open: ${formatInr(control.net)}` : undefined}><input type="number" min={0} max={control?.net} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={inputClass} required /></Field>
          <Field label="Reason *" wide><input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={inputClass} maxLength={1000} required placeholder="e.g. final settlement agreed on call, customer untraceable" /></Field>
        </div>
        <ModalFooter>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!form.partyId || !form.controlAccountId || !form.counterAccountId || !(Number(form.amount) > 0) || !form.reason.trim()}>Save adjustment</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
