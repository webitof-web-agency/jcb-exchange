'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import GeneralLedgerModule from './GeneralLedgerModule';
import { optionalChoices, todayIso, useLedgerLookups, type LedgerLookups } from './ledgerLookups';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, Tabs, tableHeadClass } from './ui';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

type Bank = {
  id: string; displayName: string; type: string; bankName: string | null; accountNumber: string | null; parentBankAccountId: string | null; vanPrefix: string | null; aliases: string[];
  ledger: { id: string; code: string; name: string }; bookBalance: number; statementBalance: number | null; statementDate: string | null; statementRows: number; unreconciled: number;
};
type Recon = { id: string; status: 'MATCHED' | 'IGNORED'; method: string; note: string | null; voucherLineId: string | null };
type StatementRow = { id: string; date: string; amount: number; balance: number | null; narration: string; reference: string | null; name: string; recon: Recon | null; bank?: { id: string; displayName: string } };
type BookLine = { id: string; voucherId: string; voucherNumber: string | null; voucherType: string; date: string; amount: number; narration: string; reference: string | null; party: string | null; recon: Recon | null };
type ReconResponse = { bank: { id: string; displayName: string; aliases: string[]; ledger: { id: string; code: string; name: string } }; from: string; to: string; statement: StatementRow[]; book: BookLine[] };
type Brs = { asOf: string; statementBalanceDate: string | null; bookBalance: number; depositsNotCredited: number; paymentsNotPresented: number; bankCreditsNotInBooks: number; bankDebitsNotInBooks: number; expectedStatement: number; statementBalance: number | null; difference: number | null; bookOnly: BookLine[]; statementOnly: StatementRow[] };

const useBanks = (version = 0) => useResource(async () => (await api.get('/finance-hub/banking/overview')).data.banks as Bank[], `banking-overview-${version}`);
const signed = (amount: number) => <span className={amount < 0 ? 'text-red-700' : 'text-emerald-700'}>{amount < 0 ? '−' : '+'}{formatInr(Math.abs(amount))}</span>;
const fyStart = () => {
  const today = todayIso();
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0);
  return `${year}-04-01`;
};

/** Book a voucher for a statement row that is not in the books (bank charges, interest, an unrecorded receipt). */
function BookFromStatement({ row, lookups, onClose, onSaved }: { row: StatementRow; lookups: LedgerLookups; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ counterAccountId: '', partyId: '', narration: row.narration });
  const [busy, setBusy] = useState(false);
  const counter = lookups.accountsById.get(form.counterAccountId);
  const options = lookups.accounts.filter((account) => account.isActive && account.allowManualPosting).map(lookups.accountOption);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/banking/recon/create-voucher', { financeTransactionId: row.id, ...form, partyId: form.partyId || null })).data as { status: string; number: string | null };
      toast.success(result.status === 'POSTED' ? `Posted ${result.number} and matched.` : result.status === 'PENDING_APPROVAL' ? 'Voucher sent for approval and matched.' : 'Draft voucher created and matched.');
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not book the entry.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Book this statement entry" subtitle={`${formatDate(row.date)} · ${row.amount > 0 ? 'Money in' : 'Money out'} ${formatInr(Math.abs(row.amount))}`} onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={submit} className="p-5 sm:p-7">
        <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{row.narration}{row.reference ? ` · ${row.reference}` : ''}</p>
        <div className="grid gap-4">
          <Field label={row.amount > 0 ? 'Received for (ledger) *' : 'Paid for (ledger) *'}><SearchableSelect options={options} value={form.counterAccountId} onChange={(option) => setForm({ ...form, counterAccountId: String(option.id) })} placeholder="e.g. Bank Charges, Interest Income, Sundry Debtors" /></Field>
          {counter?.requiresParty ? <Field label="Party *"><SearchableSelect options={optionalChoices(lookups.partyOptions, form.partyId)} value={form.partyId} onChange={(option) => setForm({ ...form, partyId: String(option.id) })} placeholder="Required" /></Field> : null}
          <Field label="Narration"><input value={form.narration} onChange={(event) => setForm({ ...form, narration: event.target.value })} className={inputClass} maxLength={1000} /></Field>
        </div>
        <ModalFooter>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!form.counterAccountId || Boolean(counter?.requiresParty && !form.partyId)}>Book &amp; match</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Pick the book entry a statement row belongs to. */
function MatchPicker({ row, book, onClose, onSaved }: { row: StatementRow; book: BookLine[]; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const candidates = book.filter((line) => !line.recon && Math.sign(line.amount) === Math.sign(row.amount)).sort((a, b) => Math.abs(Math.abs(a.amount) - Math.abs(row.amount)) - Math.abs(Math.abs(b.amount) - Math.abs(row.amount)) || Math.abs(new Date(a.date).getTime() - new Date(row.date).getTime()) - Math.abs(new Date(b.date).getTime() - new Date(row.date).getTime()));
  const choose = async (line: BookLine) => {
    setBusy(line.id);
    try {
      await api.post('/finance-hub/banking/recon/match', { financeTransactionId: row.id, voucherLineId: line.id });
      toast.success('Matched.');
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not match.'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal title="Match with a book entry" subtitle={`${formatDate(row.date)} · ${row.narration}`} onClose={onClose} wide>
      {!candidates.length ? <EmptyState title="No unmatched book entry in the same direction" description="Book a voucher for it instead." /> : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Voucher</th><th className="px-4 py-2">Narration</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.slice(0, 100).map((line) => {
                const exact = Math.abs(line.amount - row.amount) < 0.005;
                return (
                  <tr key={line.id} className={exact ? 'bg-emerald-50/50' : ''}>
                    <td className="px-4 py-2">{formatDate(line.date)}</td>
                    <td className="px-4 py-2 font-mono text-xs">{line.voucherNumber}</td>
                    <td className="max-w-[360px] truncate px-4 py-2 text-xs" title={line.narration}>{line.narration}{line.party ? ` · ${line.party}` : ''}</td>
                    <td className="px-4 py-2 text-right">{signed(line.amount)}</td>
                    <td className="px-4 py-2 text-right"><Button variant={exact ? 'primary' : 'secondary'} busy={busy === line.id} disabled={!exact} title={exact ? undefined : 'Amounts must be equal; post the difference first'} onClick={() => void choose(line)}>Match</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

const reconBadge = (recon: Recon | null) =>
  !recon ? <Badge tone="amber">Unmatched</Badge> : recon.status === 'IGNORED' ? <Badge>Ignored</Badge> : <Badge tone="green">{recon.method === 'CREATED' ? 'Booked' : recon.method.startsWith('AUTO') ? 'Auto-matched' : 'Matched'}</Badge>;

type ReconTab = 'statement' | 'book' | 'brs';

/** Bank reconciliation for one account: statement rows vs book entries, auto-match and the BRS. */
export function BankReconModule({ types, title = 'Bank reconciliation', description }: { types?: string[]; title?: string; description?: string }) {
  const access = useFinanceWorkspaceAccess();
  const canReconcile = access.can(['fh.banking.reconcile']);
  const canBook = access.can(['fh.books.manage']);
  const lookups = useLedgerLookups();
  const [version, setVersion] = useState(0);
  const banks = useBanks(version);
  const list = (banks.data ?? []).filter((bank) => !types || types.includes(bank.type) || (types.includes('VIRTUAL') && (banks.data ?? []).some((child) => child.parentBankAccountId === bank.id)));
  const [bankId, setBankId] = useState('');
  const selected = list.find((bank) => bank.id === bankId) ?? list[0];
  const [range, setRange] = useState({ from: fyStart(), to: todayIso() });
  const [filter, setFilter] = useState<'unmatched' | 'all'>('unmatched');
  const [tab, setTab] = useState<ReconTab>('statement');
  const [asOf, setAsOf] = useState(todayIso());
  const recon = useResource(async () => (selected ? (await api.get(`/finance-hub/banking/${selected.id}/reconciliation`, { params: range })).data as ReconResponse : null), `recon-${selected?.id}-${range.from}-${range.to}-${version}`);
  const brs = useResource(async () => (selected && tab === 'brs' ? (await api.get(`/finance-hub/banking/${selected.id}/brs`, { params: { asOf } })).data as Brs : null), `brs-${selected?.id}-${asOf}-${tab}-${version}`);
  const [matching, setMatching] = useState<StatementRow | null>(null);
  const [booking, setBooking] = useState<StatementRow | null>(null);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => setVersion((value) => value + 1);

  const run = async (action: () => Promise<{ data: unknown }>, success: (data: never) => string) => {
    setBusy(true);
    try {
      const result = await action();
      toast.success(success(result.data as never));
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  };
  const ignore = (row: StatementRow) => {
    const note = window.prompt('Why does this row need no book entry?');
    if (note?.trim()) void run(() => api.post('/finance-hub/banking/recon/ignore', { financeTransactionId: row.id, note }), () => 'Marked as reconciled without an entry.');
  };

  const statement = (recon.data?.statement ?? []).filter((row) => filter === 'all' || !row.recon);
  const book = (recon.data?.book ?? []).filter((line) => filter === 'all' || !line.recon);

  if (banks.loading) return <Panel title={title}><LoadingState /></Panel>;
  if (banks.error) return <Panel title={title}><ErrorBanner message={banks.error} schemaMissing={banks.schemaMissing} /></Panel>;
  if (!list.length) return <Panel title={title} description={description}><EmptyState title="No bank account yet" description="Add bank accounts (with their statement aliases) under Banking & Cash → Bank Accounts." /></Panel>;

  return (
    <Panel
      title={title}
      description={description ?? 'Match the imported bank statement with the books. Statement rows come from the Expenses-page import, picked up by each bank account’s statement aliases.'}
      actions={canReconcile && selected ? <Button variant="primary" icon={<RefreshCw className="h-4 w-4" />} busy={busy} onClick={() => void run(() => api.post(`/finance-hub/banking/${selected.id}/auto-match`, range), (data: { matched: number }) => `${data.matched} rows matched automatically.`)}>Auto-match</Button> : null}
    >
      <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1.5fr_160px_160px_160px]">
        <Field label="Bank account">
          <select value={selected?.id ?? ''} onChange={(event) => setBankId(event.target.value)} className={inputClass}>
            {list.map((bank) => <option key={bank.id} value={bank.id}>{bank.displayName}{bank.accountNumber ? ` (${bank.accountNumber})` : ''}{bank.type === 'VIRTUAL' ? ' · virtual' : ''}</option>)}
          </select>
        </Field>
        <Field label="From"><input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To"><input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} className={inputClass} /></Field>
        <Field label="Show">
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className={inputClass}><option value="unmatched">Unmatched only</option><option value="all">Everything</option></select>
        </Field>
      </div>
      {selected ? (
        <div className="grid gap-3 p-4 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Balance in books</p><p className="text-base font-bold">{formatInr(selected.bookBalance)}</p><p className="text-[11px] text-slate-400">{selected.ledger.code} · {selected.ledger.name}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Last statement balance</p><p className="text-base font-bold">{formatInr(selected.statementBalance)}</p><p className="text-[11px] text-slate-400">{selected.statementDate ? formatDate(selected.statementDate) : 'No import yet'}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Statement rows</p><p className="text-base font-bold">{selected.statementRows}</p><p className="text-[11px] text-slate-400">Aliases: {selected.aliases.join(', ') || 'none — add one in Bank Accounts'}</p></div>
          <div className={`rounded-xl p-3 ${selected.unreconciled ? 'bg-amber-50' : 'bg-emerald-50'}`}><p className="text-[11px] uppercase tracking-wide text-slate-500">To reconcile</p><p className="text-base font-bold">{selected.unreconciled}</p></div>
        </div>
      ) : null}
      {!canReconcile ? <ReadOnlyNotice>Matching needs “Reconcile Bank”; booking vouchers needs “Manage Books”.</ReadOnlyNotice> : null}
      <Tabs<ReconTab> tabs={[{ key: 'statement', label: `Statement (${statement.length})` }, { key: 'book', label: `Book entries (${book.length})` }, { key: 'brs', label: 'Reconciliation statement' }]} active={tab} onChange={setTab} />

      {tab === 'brs' ? (
        <div className="p-4">
          <div className="mb-3 max-w-[200px]"><Field label="As of"><input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={inputClass} /></Field></div>
          {brs.loading ? <LoadingState /> : brs.error || !brs.data ? <ErrorBanner message={brs.error || 'Could not load.'} /> : (
            <div className="max-w-xl space-y-1 text-sm">
              <div className="flex justify-between font-semibold"><span>Balance as per books</span><span>{formatInr(brs.data.bookBalance)}</span></div>
              <div className="flex justify-between"><span>Less: deposits in books, not yet in the bank</span><span>{formatInr(brs.data.depositsNotCredited)}</span></div>
              <div className="flex justify-between"><span>Add: payments in books, not yet presented</span><span>{formatInr(brs.data.paymentsNotPresented)}</span></div>
              <div className="flex justify-between"><span>Add: bank credits not in books</span><span>{formatInr(brs.data.bankCreditsNotInBooks)}</span></div>
              <div className="flex justify-between"><span>Less: bank debits not in books</span><span>{formatInr(brs.data.bankDebitsNotInBooks)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-bold"><span>Expected bank balance</span><span>{formatInr(brs.data.expectedStatement)}</span></div>
              <div className="flex justify-between"><span>Balance as per statement{brs.data.statementBalanceDate ? ` (${formatDate(brs.data.statementBalanceDate)})` : ''}</span><span>{formatInr(brs.data.statementBalance)}</span></div>
              <div className={`flex justify-between rounded-lg px-2 py-1 font-bold ${brs.data.difference ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}><span>Unexplained difference</span><span>{brs.data.difference === null ? 'No statement balance' : formatInr(brs.data.difference)}</span></div>
              <p className="pt-2 text-xs text-slate-500">Ignored statement rows count as reconciled but are not in the books, so they show up in the difference until booked.</p>
            </div>
          )}
        </div>
      ) : recon.loading ? <LoadingState /> : recon.error ? <ErrorBanner message={recon.error} schemaMissing={recon.schemaMissing} /> : tab === 'statement' ? (
        !statement.length ? <EmptyState title={filter === 'unmatched' ? 'Everything in this period is reconciled' : 'No statement rows'} description="Import statements on the Expenses page; rows appear here when the account name matches a statement alias." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Narration</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5 text-right">Balance</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {statement.map((row) => (
                  <tr key={row.id}>
                    <td className={`${cellClass} whitespace-nowrap`}>{formatDate(row.date)}</td>
                    <td className={`${cellClass} max-w-[380px] text-xs`}><span className="block truncate" title={row.narration}>{row.narration}</span>{row.reference ? <span className="font-mono text-slate-400">{row.reference}</span> : null}</td>
                    <td className={`${cellClass} text-right font-semibold`}>{signed(row.amount)}</td>
                    <td className={`${cellClass} text-right text-xs`}>{row.balance !== null ? formatInr(row.balance) : '—'}</td>
                    <td className={cellClass}>{reconBadge(row.recon)}{row.recon?.note ? <span className="block text-[11px] text-slate-500">{row.recon.note}</span> : null}</td>
                    <td className={`${cellClass} whitespace-nowrap text-right`}>
                      {!row.recon && canReconcile ? <Button variant="ghost" onClick={() => setMatching(row)}>Match</Button> : null}
                      {!row.recon && canBook ? <Button variant="ghost" onClick={() => setBooking(row)}>Book</Button> : null}
                      {!row.recon && canReconcile ? <Button variant="ghost" onClick={() => ignore(row)}>Ignore</Button> : null}
                      {row.recon && canReconcile ? <Button variant="ghost" busy={busy} onClick={() => void run(() => api.delete(`/finance-hub/banking/recon/${row.recon!.id}`), () => 'Match removed.')}>Unmatch</Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : !book.length ? <EmptyState title="No book entries" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Voucher</th><th className="px-4 py-2.5">Narration</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {book.map((line) => (
                <tr key={line.id} onClick={() => setOpenVoucher(line.voucherId)} className="cursor-pointer hover:bg-amber-50/40">
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(line.date)}</td>
                  <td className={`${cellClass} font-mono text-xs`}>{line.voucherNumber}<span className="block font-sans text-[11px] text-slate-400">{enumLabel(line.voucherType)}</span></td>
                  <td className={`${cellClass} max-w-[400px] truncate text-xs`} title={line.narration}>{line.narration}{line.party ? ` · ${line.party}` : ''}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{signed(line.amount)}</td>
                  <td className={cellClass}>{line.recon ? <Badge tone="green">Matched</Badge> : <Badge tone="amber">{line.amount > 0 ? 'Not yet in bank' : 'Not yet presented'}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {matching && recon.data ? <MatchPicker row={matching} book={recon.data.book} onClose={() => setMatching(null)} onSaved={() => { setMatching(null); refresh(); }} /> : null}
      {booking && !lookups.loading ? <BookFromStatement row={booking} lookups={lookups} onClose={() => setBooking(null)} onSaved={() => { setBooking(null); refresh(); }} /> : null}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={refresh} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}

/** Statement rows across all bank accounts that are not yet reconciled. */
export function UnmatchedModule() {
  const access = useFinanceWorkspaceAccess();
  const canReconcile = access.can(['fh.banking.reconcile']);
  const canBook = access.can(['fh.books.manage']);
  const lookups = useLedgerLookups();
  const [version, setVersion] = useState(0);
  const [range, setRange] = useState({ from: fyStart(), to: todayIso() });
  const list = useResource(async () => (await api.get('/finance-hub/banking/unmatched', { params: range })).data as { rows: StatementRow[]; total: number; unmappedAccounts: Array<{ accountName: string; rows: number }> }, `unmatched-${range.from}-${range.to}-${version}`);
  const [booking, setBooking] = useState<StatementRow | null>(null);
  const refresh = () => setVersion((value) => value + 1);
  const ignore = async (row: StatementRow) => {
    const note = window.prompt('Why does this row need no book entry?');
    if (!note?.trim()) return;
    try {
      await api.post('/finance-hub/banking/recon/ignore', { financeTransactionId: row.id, note });
      toast.success('Marked as reconciled.');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update.'));
    }
  };
  return (
    <Panel title="Unmatched transactions" description="Bank statement rows with no matching book entry. Match them on Bank Reconciliation, book a voucher here, or mark them as needing none.">
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[160px_160px]">
        <Field label="From"><input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To"><input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} className={inputClass} /></Field>
      </div>
      {list.data?.unmappedAccounts.length ? (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Imported statement accounts not linked to any bank account: {list.data.unmappedAccounts.map((item) => `${item.accountName} (${item.rows})`).join(', ')}. Add the name as a statement alias in Banking & Cash → Bank Accounts.
        </div>
      ) : null}
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.rows.length ? <EmptyState title="Nothing unmatched" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Bank</th><th className="px-4 py-2.5">Narration</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.rows.map((row) => (
                <tr key={row.id}>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(row.date)}</td>
                  <td className={`${cellClass} text-xs`}>{row.bank?.displayName}</td>
                  <td className={`${cellClass} max-w-[420px] text-xs`}><span className="block truncate" title={row.narration}>{row.narration}</span>{row.reference ? <span className="font-mono text-slate-400">{row.reference}</span> : null}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{signed(row.amount)}</td>
                  <td className={`${cellClass} whitespace-nowrap text-right`}>
                    {canBook ? <Button variant="ghost" onClick={() => setBooking(row)}>Book</Button> : null}
                    {canReconcile ? <Button variant="ghost" onClick={() => void ignore(row)}>Ignore</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data.total > list.data.rows.length ? <p className="px-4 py-2 text-xs text-slate-500">Showing {list.data.rows.length} of {list.data.total}; narrow the dates.</p> : null}
        </div>
      )}
      {booking && !lookups.loading ? <BookFromStatement row={booking} lookups={lookups} onClose={() => setBooking(null)} onSaved={() => { setBooking(null); refresh(); }} /> : null}
    </Panel>
  );
}

type Batch = { id: string; fileName: string; bankName: string | null; accountName: string | null; statementFrom: string | null; statementTo: string | null; openingBalance: number | null; closingBalance: number | null; totalRows: number; importedRows: number; duplicateRows: number; failedRows: number; createdAt: string; bank: { id: string; displayName: string } | null };

/** Statement uploads stay on the Expenses page; this shows each batch and the bank account it feeds. */
export function StatementImportsModule() {
  const pathname = usePathname();
  const prefix = pathname.startsWith('/superadmin') ? '/superadmin' : pathname.startsWith('/admin') ? '/admin' : '/employee';
  const batches = useResource(async () => (await api.get('/finance-hub/banking/imports')).data.batches as Batch[], 'statement-imports');
  return (
    <Panel
      title="Bank statement upload"
      description="Upload CSV / XLS statements on the existing Expenses & Transactions page (duplicate rows are skipped there). Each batch feeds reconciliation of the bank account whose statement alias matches its account name."
      actions={<Link href={`${prefix}/finance/expenses`} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300"><Upload className="h-4 w-4" />Upload a statement</Link>}
    >
      {batches.loading ? <LoadingState /> : batches.error ? <ErrorBanner message={batches.error} schemaMissing={batches.schemaMissing} /> : !batches.data?.length ? <EmptyState title="No statements imported yet" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Imported</th><th className="px-4 py-2.5">File</th><th className="px-4 py-2.5">Account name</th><th className="px-4 py-2.5">Period</th><th className="px-4 py-2.5 text-right">Rows</th><th className="px-4 py-2.5 text-right">Closing</th><th className="px-4 py-2.5">Bank account</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {batches.data.map((batch) => (
                <tr key={batch.id}>
                  <td className={`${cellClass} whitespace-nowrap text-xs`}>{formatDate(batch.createdAt)}</td>
                  <td className={`${cellClass} text-xs`}>{batch.fileName}</td>
                  <td className={`${cellClass} text-xs`}>{batch.accountName ?? '—'}</td>
                  <td className={`${cellClass} text-xs`}>{batch.statementFrom ? `${formatDate(batch.statementFrom)} – ${formatDate(batch.statementTo)}` : '—'}</td>
                  <td className={`${cellClass} text-right text-xs`}>{batch.importedRows} new{batch.duplicateRows ? ` · ${batch.duplicateRows} duplicate` : ''}{batch.failedRows ? ` · ${batch.failedRows} failed` : ''}</td>
                  <td className={`${cellClass} text-right`}>{formatInr(batch.closingBalance)}</td>
                  <td className={cellClass}>{batch.bank ? <Badge tone="green">{batch.bank.displayName}</Badge> : <Badge tone="amber">Not linked: add alias</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

const NOTES = ['500', '200', '100', '50', '20', '10', '5', '2', '1'];
type CashCount = { id: string; accountId: string; date: string; denominations: Record<string, number>; countedAmount: number; bookBalance: number; difference: number; note: string | null; countedBy: string | null };
type CashTab = 'book' | 'counts';

/** Cash book (ledger of cash / petty cash accounts) and physical cash counts. */
export function CashBookModule() {
  const [tab, setTab] = useState<CashTab>('book');
  return (
    <div className="space-y-4">
      <Panel><Tabs<CashTab> tabs={[{ key: 'book', label: 'Cash book' }, { key: 'counts', label: 'Cash counts' }]} active={tab} onChange={setTab} /></Panel>
      {tab === 'book' ? <GeneralLedgerModule accountKinds={['CASH', 'PETTY_CASH']} title="Cash book & petty cash" description="Every cash receipt and payment with the running balance. Petty cash top-ups are contra vouchers from the bank." /> : <CashCounts />}
    </div>
  );
}

function CashCounts() {
  const access = useFinanceWorkspaceAccess();
  const canCount = access.can(['fh.banking.manage', 'fh.banking.reconcile']);
  const lookups = useLedgerLookups();
  const cashAccounts = lookups.accounts.filter((account) => account.kind === 'CASH' || account.kind === 'PETTY_CASH');
  const [version, setVersion] = useState(0);
  const counts = useResource(async () => (await api.get('/finance-hub/banking/cash-counts')).data.counts as CashCount[], `cash-counts-${version}`);
  const [form, setForm] = useState<{ accountId: string; date: string; note: string; pieces: Record<string, string>; coins: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const counted = form ? NOTES.reduce((sum, note) => sum + Number(note) * (Number.parseInt(form.pieces[note] || '0', 10) || 0), 0) + (Number(form.coins) || 0) : 0;
  const nameOf = (id: string) => cashAccounts.find((account) => account.id === id)?.name ?? '—';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/banking/cash-counts', { accountId: form.accountId, date: form.date, note: form.note || null, denominations: { ...form.pieces, coins: form.coins || '0' } })).data as { difference: number };
      toast[result.difference === 0 ? 'success' : 'warning'](result.difference === 0 ? 'Count matches the books.' : `Count differs from the books by ${formatInr(result.difference)}.`);
      setForm(null);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the count.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Cash counts" description="Physical cash verification against the book balance on the count date. A difference needs a voucher (shortage / excess) after review." actions={canCount ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!cashAccounts.length} onClick={() => setForm({ accountId: cashAccounts[0]?.id ?? '', date: todayIso(), note: '', pieces: {}, coins: '' })}>Count cash</Button> : null}>
      {counts.loading ? <LoadingState /> : counts.error ? <ErrorBanner message={counts.error} schemaMissing={counts.schemaMissing} /> : !counts.data?.length ? <EmptyState title="No cash counts yet" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Ledger</th><th className="px-4 py-2.5 text-right">Counted</th><th className="px-4 py-2.5 text-right">Books</th><th className="px-4 py-2.5 text-right">Difference</th><th className="px-4 py-2.5">By</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {counts.data.map((count) => (
                <tr key={count.id}>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(count.date)}</td>
                  <td className={`${cellClass} text-xs`}>{nameOf(count.accountId)}{count.note ? <span className="block text-slate-500">{count.note}</span> : null}</td>
                  <td className={`${cellClass} text-right`}>{formatInr(count.countedAmount)}<span className="block text-[11px] text-slate-400">{Object.entries(count.denominations).map(([note, pieces]) => (note === 'coins' ? `coins ${pieces}` : `${note}×${pieces}`)).join(', ')}</span></td>
                  <td className={`${cellClass} text-right`}>{formatInr(count.bookBalance)}</td>
                  <td className={`${cellClass} text-right font-semibold ${count.difference ? 'text-red-700' : 'text-emerald-700'}`}>{formatInr(count.difference)}</td>
                  <td className={`${cellClass} text-xs`}>{count.countedBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? (
        <Modal title="Count cash" subtitle="Enter the number of notes of each value." onClose={() => { if (!busy) setForm(null); }}>
          <form onSubmit={submit} className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Cash ledger"><select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })} className={inputClass}>{cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
              <Field label="Date"><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} /></Field>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {NOTES.map((note) => <Field key={note} label={`₹${note} ×`}><input type="number" min={0} step={1} value={form.pieces[note] ?? ''} onChange={(event) => setForm({ ...form, pieces: { ...form.pieces, [note]: event.target.value } })} className={inputClass} /></Field>)}
              <Field label="Coins (₹)"><input type="number" min={0} step="0.01" value={form.coins} onChange={(event) => setForm({ ...form, coins: event.target.value })} className={inputClass} /></Field>
            </div>
            <div className="mt-4"><Field label="Note"><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={inputClass} maxLength={1000} /></Field></div>
            <p className="mt-4 text-right text-base font-bold">Counted {formatInr(counted)}</p>
            <ModalFooter>
              <Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="primary" busy={busy} disabled={!form.accountId}>Save count</Button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}

type Gateway = { id: string; code: string; name: string; collected: number; settled: number; pending: number };
type GatewaySettlement = { id: string; number: string | null; date: string; narration: string; reference: string | null; totalAmount: number };
type SettlementRow = { date: string; utr: string; gross: string; fee: string; gst: string };

const parseCsv = (text: string) => {
  const rows = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { cells.push(current.trim()); current = ''; }
      else current += char;
    }
    cells.push(current.trim());
    return cells;
  });
  const header = (rows.shift() ?? []).map((cell) => cell.toLowerCase());
  const col = (...names: string[]) => header.findIndex((cell) => names.some((name) => cell.includes(name)));
  const index = { date: col('date', 'settled'), utr: col('utr', 'settlement id', 'reference'), gross: col('gross', 'amount'), fee: col('fee', 'commission'), gst: col('gst', 'tax') };
  const toIso = (value: string) => {
    const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    return match ? `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}` : value.slice(0, 10);
  };
  return rows.map((cells): SettlementRow => ({ date: toIso(cells[index.date] ?? ''), utr: cells[index.utr] ?? '', gross: (cells[index.gross] ?? '').replace(/,/g, ''), fee: index.fee >= 0 ? (cells[index.fee] ?? '').replace(/,/g, '') : '0', gst: index.gst >= 0 ? (cells[index.gst] ?? '').replace(/,/g, '') : '0' })).filter((row) => row.utr && Number(row.gross) > 0);
};

/** Gateway clearing balances (collected vs settled) and settlement entry with fee and GST. */
export function GatewayModule() {
  const access = useFinanceWorkspaceAccess();
  const canPost = access.can(['fh.books.post']);
  const lookups = useLedgerLookups();
  const [version, setVersion] = useState(0);
  const overview = useResource(async () => (await api.get('/finance-hub/banking/gateways')).data as { gateways: Gateway[]; settlements: GatewaySettlement[] }, `gateways-${version}`);
  const banks = useMemo(() => lookups.accounts.filter((account) => account.kind === 'BANK' && account.isActive), [lookups]);
  const [form, setForm] = useState<{ gatewayAccountId: string; bankAccountId: string; gstSplit: 'IGST' | 'CGST_SGST'; rows: SettlementRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);

  const open = () => setForm({ gatewayAccountId: overview.data?.gateways[0]?.id ?? '', bankAccountId: banks[0]?.id ?? '', gstSplit: 'IGST', rows: [{ date: todayIso(), utr: '', gross: '', fee: '', gst: '' }] });
  const setRow = (index: number, patch: Partial<SettlementRow>) => form && setForm({ ...form, rows: form.rows.map((row, at) => (at === index ? { ...row, ...patch } : row)) });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/banking/gateway-settlements', { rows: form.rows.map((row) => ({ ...row, gatewayAccountId: form.gatewayAccountId, bankAccountId: form.bankAccountId, gstSplit: form.gstSplit })) })).data as { posted: number; failed: number; results: Array<{ row: number; error?: string }> };
      if (result.failed) toast.warning(`${result.posted} posted, ${result.failed} failed: ${result.results.filter((item) => item.error).slice(0, 3).map((item) => item.error).join(' · ')}`);
      else toast.success(`${result.posted} settlement(s) posted.`);
      if (!result.failed) setForm(null);
      else setForm({ ...form, rows: form.rows.filter((_, at) => result.results.find((item) => item.row === at + 1)?.error) });
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not post the settlements.'));
    } finally {
      setBusy(false);
    }
  };
  const loadFile = async (file: File | undefined) => {
    if (!file || !form) return;
    const rows = parseCsv(await file.text());
    if (!rows.length) { toast.error('No rows found. The CSV needs columns like Date, UTR / Settlement ID, Gross, Fee, GST.'); return; }
    setForm({ ...form, rows });
    toast.info(`${rows.length} rows loaded; review and post.`);
  };

  return (
    <Panel title="UPI / gateway settlement" description="Online collections first land in a gateway clearing ledger; the settlement moves the net amount to the bank and books the fee and GST. Pending = collected but not yet settled." actions={canPost ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!overview.data?.gateways.length || !banks.length} onClick={open}>Record settlement</Button> : null}>
      {overview.loading ? <LoadingState /> : overview.error ? <ErrorBanner message={overview.error} schemaMissing={overview.schemaMissing} /> : (
        <>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {overview.data!.gateways.map((gateway) => (
              <div key={gateway.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold">{gateway.name}</p>
                <p className="text-[11px] text-slate-500">Collected {formatInr(gateway.collected)} · Settled {formatInr(gateway.settled)}</p>
                <p className={`mt-1 text-base font-bold ${gateway.pending ? 'text-amber-700' : 'text-emerald-700'}`}>Pending {formatInr(gateway.pending)}</p>
              </div>
            ))}
          </div>
          {!overview.data!.settlements.length ? <EmptyState title="No settlements yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Voucher</th><th className="px-4 py-2.5">UTR</th><th className="px-4 py-2.5">Details</th><th className="px-4 py-2.5 text-right">Gross</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.data!.settlements.map((voucher) => (
                    <tr key={voucher.id} onClick={() => setOpenVoucher(voucher.id)} className="cursor-pointer hover:bg-amber-50/40">
                      <td className={`${cellClass} whitespace-nowrap`}>{formatDate(voucher.date)}</td>
                      <td className={`${cellClass} font-mono text-xs`}>{voucher.number}</td>
                      <td className={`${cellClass} font-mono text-xs`}>{voucher.reference}</td>
                      <td className={`${cellClass} max-w-[380px] truncate text-xs`} title={voucher.narration}>{voucher.narration}</td>
                      <td className={`${cellClass} text-right font-semibold`}>{formatInr(voucher.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {form ? (
        <Modal title="Record gateway settlement" subtitle="Net to bank = gross − fee − GST on fee. Each UTR can be posted once." onClose={() => { if (!busy) setForm(null); }} wide>
          <form onSubmit={submit} className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Gateway ledger"><select value={form.gatewayAccountId} onChange={(event) => setForm({ ...form, gatewayAccountId: event.target.value })} className={inputClass}>{overview.data?.gateways.map((gateway) => <option key={gateway.id} value={gateway.id}>{gateway.name}</option>)}</select></Field>
              <Field label="Settled into"><select value={form.bankAccountId} onChange={(event) => setForm({ ...form, bankAccountId: event.target.value })} className={inputClass}>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.code} · {bank.name}</option>)}</select></Field>
              <Field label="GST on fee"><select value={form.gstSplit} onChange={(event) => setForm({ ...form, gstSplit: event.target.value as 'IGST' | 'CGST_SGST' })} className={inputClass}><option value="IGST">IGST (other state)</option><option value="CGST_SGST">CGST + SGST</option></select></Field>
              <Field label="Settlement report (CSV)"><input type="file" accept=".csv,text/csv" onChange={(event) => void loadFile(event.target.files?.[0])} className="block w-full text-xs" /></Field>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">UTR / settlement id</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Fee</th><th className="px-3 py-2 text-right">GST on fee</th><th className="px-3 py-2 text-right">Net to bank</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {form.rows.map((row, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2"><input type="date" value={row.date} onChange={(event) => setRow(index, { date: event.target.value })} className={`${inputClass} py-2`} /></td>
                      <td className="px-3 py-2"><input value={row.utr} onChange={(event) => setRow(index, { utr: event.target.value.toUpperCase() })} className={`${inputClass} py-2`} maxLength={60} /></td>
                      <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={row.gross} onChange={(event) => setRow(index, { gross: event.target.value })} className={`${inputClass} py-2 text-right`} /></td>
                      <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={row.fee} onChange={(event) => setRow(index, { fee: event.target.value })} className={`${inputClass} py-2 text-right`} /></td>
                      <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={row.gst} onChange={(event) => setRow(index, { gst: event.target.value })} className={`${inputClass} py-2 text-right`} /></td>
                      <td className="px-3 py-2 text-right font-semibold">{formatInr((Number(row.gross) || 0) - (Number(row.fee) || 0) - (Number(row.gst) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-100 bg-slate-50 px-3 py-2"><Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, rows: [...form.rows, { date: todayIso(), utr: '', gross: '', fee: '', gst: '' }] })}>Add row</Button></div>
            </div>
            <ModalFooter>
              <Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="primary" busy={busy} disabled={!form.gatewayAccountId || !form.bankAccountId || !form.rows.some((row) => row.utr && Number(row.gross) > 0)}>Post {form.rows.length} settlement(s)</Button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={() => setVersion((value) => value + 1)} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}
