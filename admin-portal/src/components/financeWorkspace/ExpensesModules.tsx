'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { isCashBank, optionalChoices, todayIso, useLedgerLookups } from './ledgerLookups';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, Tabs, tableHeadClass } from './ui';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

const fyStart = () => {
  const today = todayIso();
  return `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
};
const thisMonth = () => todayIso().slice(0, 7);

/** Ledgers of one nature (plus kinds) for pickers. */
const useAccountOptions = (filter: (account: { kind: string; isActive: boolean; allowManualPosting: boolean }, nature: string | undefined) => boolean) => {
  const lookups = useLedgerLookups();
  return { lookups, options: useMemo(() => lookups.accounts.filter((account) => filter(account, lookups.natureOf(account))).map(lookups.accountOption), [filter, lookups]) };
};
const expenseFilter = (account: { isActive: boolean; allowManualPosting: boolean }, nature: string | undefined) => account.isActive && account.allowManualPosting && nature === 'EXPENSE';

type RegisterRow = { id: string; date: string; voucherId: string; voucherNumber: string | null; voucherType: string; source: string | null; narration: string; reference: string | null; account: string; party: string | null; costCentre: string | null; amount: number };
type Register = { from: string; to: string; total: number; page: number; pageSize: number; grandTotal: number; ledgers: Array<{ accountId: string; code: string; name: string; amount: number }>; rows: RegisterRow[] };

/** Every expense in the books (manual, bills, automatic, depreciation) with totals by ledger. */
export function ExpenseRegisterModule() {
  const pathname = usePathname();
  const prefix = pathname.startsWith('/superadmin') ? '/superadmin' : pathname.startsWith('/admin') ? '/admin' : '/employee';
  const { options } = useAccountOptions(expenseFilter);
  const [filters, setFilters] = useState({ from: fyStart(), to: todayIso(), accountId: '', q: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const register = useResource(async () => (await api.get('/finance-hub/expenses/register', { params: { ...applied, accountId: applied.accountId || undefined, q: applied.q || undefined, page, pageSize: 50 } })).data as Register, `expense-register-${JSON.stringify(applied)}-${page}`);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const pages = register.data ? Math.max(Math.ceil(register.data.total / register.data.pageSize), 1) : 1;
  return (
    <Panel title="Expense register" description="All posted expenses from the books: purchase bills, payment vouchers, automatic entries, depreciation and Expenses-page entries once their posting is switched on." actions={<Link href={`${prefix}/finance/expenses`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Open Expenses page</Link>}>
      <form onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(filters); }} className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[150px_150px_1.4fr_1fr_auto] md:items-end">
        <Field label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} /></Field>
        <Field label="Ledger"><SearchableSelect options={[{ id: '', name: 'All expense ledgers' }, ...options]} value={filters.accountId} onChange={(option) => setFilters({ ...filters, accountId: String(option.id) })} placeholder="All expense ledgers" /></Field>
        <Field label="Search"><input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} className={inputClass} placeholder="Narration, voucher, reference" /></Field>
        <Button type="submit">Apply</Button>
      </form>
      {register.loading ? <LoadingState /> : register.error || !register.data ? <ErrorBanner message={register.error || 'Could not load.'} schemaMissing={register.schemaMissing} /> : (
        <>
          <div className="flex flex-wrap gap-2 p-4">
            <span className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">Total {formatInr(register.data.grandTotal)}</span>
            {register.data.ledgers.slice(0, 10).map((ledger) => <button key={ledger.accountId} type="button" onClick={() => { const next = { ...filters, accountId: ledger.accountId }; setFilters(next); setApplied(next); setPage(1); }} className="rounded-xl bg-slate-50 px-3 py-2 text-left text-xs hover:bg-amber-50"><span className="font-mono text-slate-500">{ledger.code}</span> {ledger.name}<span className="block font-semibold text-slate-900">{formatInr(ledger.amount)}</span></button>)}
          </div>
          {!register.data.rows.length ? <EmptyState title="No expenses in this period" /> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Voucher</th><th className="px-4 py-2.5">Ledger</th><th className="px-4 py-2.5">Narration</th><th className="px-4 py-2.5">Party / centre</th><th className="px-4 py-2.5 text-right">Amount</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {register.data.rows.map((row) => (
                      <tr key={row.id} onClick={() => setOpenVoucher(row.voucherId)} className="cursor-pointer hover:bg-amber-50/40">
                        <td className={`${cellClass} whitespace-nowrap`}>{formatDate(row.date)}</td>
                        <td className={`${cellClass} font-mono text-xs`}>{row.voucherNumber}<span className="block font-sans text-[11px] text-slate-400">{row.source ? enumLabel(row.source) : enumLabel(row.voucherType)}</span></td>
                        <td className={`${cellClass} text-xs`}>{row.account}</td>
                        <td className={`${cellClass} max-w-[360px] truncate text-xs`} title={row.narration}>{row.narration}</td>
                        <td className={`${cellClass} text-xs`}>{row.party ?? '—'}{row.costCentre ? <span className="block text-slate-400">{row.costCentre}</span> : null}</td>
                        <td className={`${cellClass} text-right font-semibold ${row.amount < 0 ? 'text-emerald-700' : ''}`}>{formatInr(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                <span>{register.data.total} entries</span>
                <span className="flex items-center gap-2"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>Page {page} of {pages}<Button variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />}>Next</Button></span>
              </div>
            </>
          )}
        </>
      )}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={register.reload} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}

type Recurring = {
  id: string; name: string; mode: 'BILL' | 'ACCRUAL'; partyId: string | null; accountId: string; amount: number; gstRate: number; frequency: string; dayOfMonth: number; startDate: string; endDate: string | null;
  nextRunDate: string; isActive: boolean; notes: string | null; due: boolean; account: { code: string; name: string } | null; party: { name: string } | null; runs: Array<{ id: string; periodKey: string; runDate: string; documentId: string | null; voucherId: string | null }>;
};
const FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'];

/** Repeating expenses that create a draft journal (accrual) or a draft purchase bill each period. */
export function RecurringExpensesModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.expenses.manage']);
  const { lookups, options } = useAccountOptions(expenseFilter);
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/expenses/recurring')).data.items as Recurring[], `recurring-${version}`);
  const [form, setForm] = useState<(Partial<Recurring> & { amountText: string; gstText: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => setVersion((value) => value + 1);
  const due = (list.data ?? []).filter((item) => item.due).length;

  const generate = async () => {
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/expenses/recurring/generate', {})).data as { created: Array<{ name: string; date: string; kind: string }>; failed: Array<{ name: string; error: string }> };
      if (result.failed.length) toast.warning(`${result.created.length} drafts created; ${result.failed.length} failed: ${result.failed[0]!.error}`);
      else toast.success(result.created.length ? `${result.created.length} drafts created. Review and post them in Day Book / Purchase Bills.` : 'Nothing due.');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not generate.'));
    } finally {
      setBusy(false);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const body = { name: form.name, mode: form.mode, partyId: form.partyId || null, accountId: form.accountId, amount: form.amountText, gstRate: form.gstText || '0', frequency: form.frequency, dayOfMonth: form.dayOfMonth, startDate: form.startDate, endDate: form.endDate || null, isActive: form.isActive, notes: form.notes || null };
      if (form.id) await api.put(`/finance-hub/expenses/recurring/${form.id}`, body);
      else await api.post('/finance-hub/expenses/recurring', body);
      toast.success('Saved.');
      setForm(null);
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      title="Recurring expenses"
      description="Rent, AMC, subscriptions… Each due period creates a draft for review: an accrual journal (expense → Expenses Payable) or a draft purchase bill from the supplier. Nothing is posted automatically."
      actions={canManage ? (
        <>
          <Button icon={<RefreshCw className="h-4 w-4" />} busy={busy && !form} onClick={() => void generate()}>Create due drafts{due ? ` (${due})` : ''}</Button>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ mode: 'ACCRUAL', frequency: 'MONTHLY', dayOfMonth: 1, startDate: todayIso(), isActive: true, amountText: '', gstText: '18' })}>Add recurring</Button>
        </>
      ) : null}
    >
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="No recurring expenses" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Creates</th><th className="px-4 py-2.5">Ledger</th><th className="px-4 py-2.5">Every</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Next</th><th className="px-4 py-2.5">Last runs</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((item) => (
                <tr key={item.id} className={item.isActive ? '' : 'opacity-60'}>
                  <td className={`${cellClass} font-semibold`}>{item.name}{item.party ? <span className="block text-xs font-normal text-slate-500">{item.party.name}</span> : null}</td>
                  <td className={cellClass}><Badge tone={item.mode === 'BILL' ? 'violet' : 'blue'}>{item.mode === 'BILL' ? 'Draft bill' : 'Draft accrual'}</Badge></td>
                  <td className={`${cellClass} text-xs`}>{item.account ? `${item.account.code} · ${item.account.name}` : '—'}</td>
                  <td className={`${cellClass} text-xs`}>{enumLabel(item.frequency)} on day {item.dayOfMonth}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{formatInr(item.amount)}{item.gstRate ? <span className="block text-[11px] font-normal text-slate-500">+ {item.gstRate}% GST</span> : null}</td>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(item.nextRunDate)}{item.due ? <span className="block text-[11px] font-semibold text-amber-700">Due</span> : null}</td>
                  <td className={`${cellClass} text-xs`}>{item.runs.slice(0, 3).map((run) => formatDate(run.runDate)).join(', ') || '—'}</td>
                  <td className={`${cellClass} text-right`}>{canManage ? <Button variant="ghost" onClick={() => setForm({ ...item, amountText: String(item.amount), gstText: String(item.gstRate) })}>Edit</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? (
        <Modal title={form.id ? 'Edit recurring expense' : 'Add recurring expense'} onClose={() => { if (!busy) setForm(null); }}>
          <form onSubmit={save} className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name *" wide><input value={form.name ?? ''} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} maxLength={160} required /></Field>
              <Field label="Each period creates">
                <select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as Recurring['mode'] })} className={inputClass}><option value="ACCRUAL">Draft accrual journal</option><option value="BILL">Draft purchase bill</option></select>
              </Field>
              <Field label={form.mode === 'BILL' ? 'Supplier *' : 'Supplier (optional)'}><SearchableSelect options={optionalChoices(lookups.partyOptions, form.partyId ?? '')} value={form.partyId ?? ''} onChange={(option) => setForm({ ...form, partyId: String(option.id) })} placeholder="—" /></Field>
              <Field label="Expense ledger *" wide><SearchableSelect options={options} value={form.accountId ?? ''} onChange={(option) => setForm({ ...form, accountId: String(option.id) })} placeholder="Choose ledger" /></Field>
              <Field label={form.mode === 'BILL' ? 'Taxable amount *' : 'Amount *'}><input type="number" min={0} step="0.01" value={form.amountText} onChange={(event) => setForm({ ...form, amountText: event.target.value })} className={inputClass} required /></Field>
              {form.mode === 'BILL' ? <Field label="GST %"><input type="number" min={0} max={28} step="0.25" value={form.gstText} onChange={(event) => setForm({ ...form, gstText: event.target.value })} className={inputClass} /></Field> : <div />}
              <Field label="Every"><select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })} className={inputClass}>{FREQUENCIES.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}</select></Field>
              <Field label="On day of month"><input type="number" min={1} max={31} value={form.dayOfMonth ?? 1} onChange={(event) => setForm({ ...form, dayOfMonth: Number(event.target.value) })} className={inputClass} /></Field>
              <Field label="Start *"><input type="date" value={form.startDate ?? ''} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className={inputClass} required /></Field>
              <Field label="End (optional)"><input type="date" value={form.endDate ?? ''} onChange={(event) => setForm({ ...form, endDate: event.target.value })} className={inputClass} /></Field>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.isActive ?? true} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 accent-amber-500" />Active</label>
            </div>
            <ModalFooter>
              <Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="primary" busy={busy} disabled={!form.name || !form.accountId || !(Number(form.amountText) > 0) || (form.mode === 'BILL' && !form.partyId)}>Save</Button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}

type Claim = { id: string; date: string; amount: number; description: string; receiptUrl: string | null; status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID'; rejectReason: string | null; party: { name: string } | null; account: { code: string; name: string } | null; approvalVoucherNumber: string | null; paymentVoucherNumber: string | null; createdBy: string | null; approvedBy: string | null };
const claimTone = { SUBMITTED: 'amber', APPROVED: 'blue', REJECTED: 'red', PAID: 'green' } as const;

/** Employee claims: submit, approve (books the expense), pay. */
export function ReimbursementsModule() {
  const access = useFinanceWorkspaceAccess();
  const canSubmit = access.can(['fh.expenses.manage']);
  const canApprove = access.can(['fh.approve']);
  const canPay = access.can(['fh.books.post']);
  const { lookups, options } = useAccountOptions(expenseFilter);
  const [status, setStatus] = useState('');
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/expenses/reimbursements', { params: { status: status || undefined } })).data.items as Claim[], `claims-${status}-${version}`);
  const [form, setForm] = useState<{ partyId: string; date: string; accountId: string; amount: string; description: string; receiptUrl: string } | null>(null);
  const [paying, setPaying] = useState<Claim | null>(null);
  const [payForm, setPayForm] = useState({ bankAccountId: '', date: todayIso(), reference: '' });
  const [busy, setBusy] = useState(false);
  const banks = lookups.accounts.filter((account) => account.isActive && isCashBank(account)).map(lookups.accountOption);
  const employees = lookups.partyOptions;
  const refresh = () => setVersion((value) => value + 1);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      refresh();
      return true;
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const totals = (list.data ?? []).reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + item.amount }), {} as Record<string, number>);
  return (
    <Panel title="Employee reimbursements" description="Claims for expenses paid by staff. Approval (by someone else) books the expense against Reimbursements Payable; payment clears it." actions={canSubmit ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ partyId: '', date: todayIso(), accountId: '', amount: '', description: '', receiptUrl: '' })}>New claim</Button> : null}>
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-5">
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass} aria-label="Status"><option value="">All claims</option>{(['SUBMITTED', 'APPROVED', 'PAID', 'REJECTED'] as const).map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}</select>
        {(['SUBMITTED', 'APPROVED', 'PAID', 'REJECTED'] as const).map((item) => <div key={item} className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-slate-500">{enumLabel(item)}</p><p className="text-sm font-bold">{formatInr(totals[item] ?? 0)}</p></div>)}
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="No claims" description="Employees must be parties of type Employee (Party Ledgers)." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Expense</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((item) => (
                <tr key={item.id}>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(item.date)}</td>
                  <td className={`${cellClass} text-xs font-semibold`}>{item.party?.name}<span className="block font-normal text-slate-400">by {item.createdBy ?? '—'}</span></td>
                  <td className={`${cellClass} max-w-[320px] text-xs`}>{item.description}<span className="block text-slate-400">{item.account ? `${item.account.code} · ${item.account.name}` : ''}{item.receiptUrl ? <> · <a href={item.receiptUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">receipt</a></> : null}</span></td>
                  <td className={`${cellClass} text-right font-semibold`}>{formatInr(item.amount)}</td>
                  <td className={cellClass}><Badge tone={claimTone[item.status]}>{enumLabel(item.status)}</Badge><span className="block font-mono text-[11px] text-slate-500">{[item.approvalVoucherNumber, item.paymentVoucherNumber].filter(Boolean).join(' · ')}</span>{item.rejectReason ? <span className="block text-[11px] text-red-600">{item.rejectReason}</span> : null}</td>
                  <td className={`${cellClass} whitespace-nowrap text-right`}>
                    {item.status === 'SUBMITTED' && canApprove ? <><Button variant="ghost" busy={busy} onClick={() => void run(() => api.post(`/finance-hub/expenses/reimbursements/${item.id}/approve`), 'Approved and booked.')}>Approve</Button><Button variant="ghost" onClick={() => { const reason = window.prompt('Reason for rejecting:'); if (reason?.trim()) void run(() => api.post(`/finance-hub/expenses/reimbursements/${item.id}/reject`, { reason }), 'Rejected.'); }}>Reject</Button></> : null}
                    {item.status === 'APPROVED' && canPay ? <Button variant="primary" onClick={() => { setPaying(item); setPayForm({ bankAccountId: banks[0]?.id ?? '', date: todayIso(), reference: '' }); }}>Pay</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? (
        <Modal title="New reimbursement claim" onClose={() => { if (!busy) setForm(null); }}>
          <form onSubmit={(event) => { event.preventDefault(); void run(() => api.post('/finance-hub/expenses/reimbursements', form), 'Claim submitted for approval.').then((ok) => { if (ok) setForm(null); }); }} className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Employee *" wide><SearchableSelect options={optionalChoices(employees, form.partyId)} value={form.partyId} onChange={(option) => setForm({ ...form, partyId: String(option.id) })} placeholder="Party of type Employee" /></Field>
              <Field label="Expense date *"><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} required /></Field>
              <Field label="Amount *"><input type="number" min={0} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={inputClass} required /></Field>
              <Field label="Expense ledger *" wide><SearchableSelect options={options} value={form.accountId} onChange={(option) => setForm({ ...form, accountId: String(option.id) })} placeholder="e.g. Travelling, Staff Welfare" /></Field>
              <Field label="Description *" wide><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} maxLength={1000} required /></Field>
              <Field label="Receipt link" wide hint="Upload the bill to Drive / document vault and paste the link."><input value={form.receiptUrl} onChange={(event) => setForm({ ...form, receiptUrl: event.target.value })} className={inputClass} maxLength={500} placeholder="https://" /></Field>
            </div>
            <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!form.partyId || !form.accountId || !(Number(form.amount) > 0) || !form.description.trim()}>Submit</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
      {paying ? (
        <Modal title={`Pay ${paying.party?.name}`} subtitle={formatInr(paying.amount)} onClose={() => { if (!busy) setPaying(null); }}>
          <div className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Paid from *" wide><SearchableSelect options={banks} value={payForm.bankAccountId} onChange={(option) => setPayForm({ ...payForm, bankAccountId: String(option.id) })} placeholder="Bank / cash" /></Field>
              <Field label="Date"><input type="date" value={payForm.date} onChange={(event) => setPayForm({ ...payForm, date: event.target.value })} className={inputClass} /></Field>
              <Field label="Reference / UTR"><input value={payForm.reference} onChange={(event) => setPayForm({ ...payForm, reference: event.target.value })} className={inputClass} maxLength={80} /></Field>
            </div>
            <ModalFooter><Button onClick={() => setPaying(null)} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} disabled={!payForm.bankAccountId} onClick={() => void run(() => api.post(`/finance-hub/expenses/reimbursements/${paying.id}/pay`, payForm), 'Paid.').then((ok) => { if (ok) setPaying(null); })}>Pay</Button></ModalFooter>
          </div>
        </Modal>
      ) : null}
    </Panel>
  );
}

type Asset = {
  id: string; code: string; name: string; category: string | null; assetAccountId: string; account: string; purchaseDate: string; putToUseDate: string; cost: number; salvageValue: number; method: 'SLM' | 'WDV';
  usefulLifeMonths: number | null; wdvRatePercent: number | null; openingAccumulated: number; location: string | null; custodian: string | null; serialNumber: string | null; status: 'ACTIVE' | 'DISPOSED';
  disposedAt: string | null; disposalAmount: number | null; disposalVoucherId: string | null; notes: string | null; accumulated: number; bookValue: number;
};
type AssetForm = { id?: string; code: string; name: string; category: string; assetAccountId: string; purchaseDate: string; putToUseDate: string; cost: string; salvageValue: string; method: 'SLM' | 'WDV'; usefulLifeMonths: string; wdvRatePercent: string; openingAccumulated: string; location: string; custodian: string; serialNumber: string; notes: string };
const emptyAsset = (): AssetForm => ({ code: '', name: '', category: '', assetAccountId: '', purchaseDate: todayIso(), putToUseDate: todayIso(), cost: '', salvageValue: '', method: 'WDV', usefulLifeMonths: '', wdvRatePercent: '', openingAccumulated: '', location: '', custodian: '', serialNumber: '', notes: '' });

/** Fixed asset register with book value, schedule and disposal. */
export function FixedAssetsModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.expenses.manage']);
  const canPost = access.can(['fh.books.post']);
  const lookups = useLedgerLookups();
  const assetLedgers = lookups.accounts.filter((account) => account.kind === 'FIXED_ASSET' && account.isActive).map(lookups.accountOption);
  const receiving = lookups.accounts.filter((account) => account.isActive && (isCashBank(account) || account.requiresParty)).map(lookups.accountOption);
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/assets')).data.assets as Asset[], `assets-${version}`);
  const [form, setForm] = useState<AssetForm | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Asset | null>(null);
  const schedule = useResource(async () => (scheduleFor ? (await api.get(`/finance-hub/assets/${scheduleFor.id}/schedule`)).data as { accumulated: number; history: Array<{ month: string; charge: number }>; projection: Array<{ month: string; opening: number; charge: number; closing: number }> } : null), `asset-schedule-${scheduleFor?.id}-${version}`);
  const [disposing, setDisposing] = useState<Asset | null>(null);
  const [disposal, setDisposal] = useState({ date: todayIso(), amount: '', receivingAccountId: '', partyId: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const refresh = () => setVersion((value) => value + 1);
  const rows = list.data ?? [];
  const active = rows.filter((row) => row.status === 'ACTIVE');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const { id, ...body } = form;
      const payload = { ...body, usefulLifeMonths: body.usefulLifeMonths || null, wdvRatePercent: body.wdvRatePercent || null, salvageValue: body.salvageValue || null, openingAccumulated: body.openingAccumulated || null };
      if (id) await api.put(`/finance-hub/assets/${id}`, payload);
      else await api.post('/finance-hub/assets', payload);
      toast.success('Asset saved.');
      setForm(null);
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the asset.'));
    } finally {
      setBusy(false);
    }
  };
  const dispose = async () => {
    if (!disposing) return;
    setBusy(true);
    try {
      const result = (await api.post(`/finance-hub/assets/${disposing.id}/dispose`, { ...disposal, amount: disposal.amount || '0', receivingAccountId: disposal.receivingAccountId || null, partyId: disposal.partyId || null })).data as { number: string; profit: number };
      toast.success(`Disposed (${result.number}); ${result.profit >= 0 ? 'profit' : 'loss'} ${formatInr(Math.abs(result.profit))}.`);
      setDisposing(null);
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not dispose the asset.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Fixed assets" description="Register of computers, furniture, vehicles and equipment. The purchase is booked by its bill; the register holds the depreciation basis. Accumulated depreciation = before the books + posted monthly runs." actions={canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!assetLedgers.length} onClick={() => setForm(emptyAsset())}>Add asset</Button> : null}>
      <div className="grid gap-3 p-4 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Active assets</p><p className="text-base font-bold">{active.length}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Cost</p><p className="text-base font-bold">{formatInr(active.reduce((sum, row) => sum + row.cost, 0))}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Accumulated depreciation</p><p className="text-base font-bold">{formatInr(active.reduce((sum, row) => sum + row.accumulated, 0))}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Book value</p><p className="text-base font-bold">{formatInr(active.reduce((sum, row) => sum + row.bookValue, 0))}</p></div>
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !rows.length ? <EmptyState title="No assets registered" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Asset</th><th className="px-4 py-2.5">Ledger</th><th className="px-4 py-2.5">In use from</th><th className="px-4 py-2.5">Method</th><th className="px-4 py-2.5 text-right">Cost</th><th className="px-4 py-2.5 text-right">Depreciation</th><th className="px-4 py-2.5 text-right">Book value</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className={row.status === 'ACTIVE' ? '' : 'opacity-60'}>
                  <td className={cellClass}><span className="font-semibold">{row.name}</span><span className="block font-mono text-[11px] text-slate-400">{row.code}{row.location ? ` · ${row.location}` : ''}{row.custodian ? ` · ${row.custodian}` : ''}</span></td>
                  <td className={`${cellClass} text-xs`}>{row.account}</td>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(row.putToUseDate)}</td>
                  <td className={`${cellClass} text-xs`}>{row.method === 'SLM' ? `Straight line, ${row.usefulLifeMonths} months` : `WDV ${row.wdvRatePercent}% p.a.`}</td>
                  <td className={`${cellClass} text-right`}>{formatInr(row.cost)}</td>
                  <td className={`${cellClass} text-right`}>{formatInr(row.accumulated)}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{row.status === 'DISPOSED' ? <Badge>Disposed {formatDate(row.disposedAt)}</Badge> : formatInr(row.bookValue)}</td>
                  <td className={`${cellClass} whitespace-nowrap text-right`}>
                    <Button variant="ghost" onClick={() => setScheduleFor(row)}>Schedule</Button>
                    {row.status === 'ACTIVE' && canManage ? <Button variant="ghost" onClick={() => setForm({ id: row.id, code: row.code, name: row.name, category: row.category ?? '', assetAccountId: row.assetAccountId, purchaseDate: row.purchaseDate, putToUseDate: row.putToUseDate, cost: String(row.cost), salvageValue: String(row.salvageValue || ''), method: row.method, usefulLifeMonths: String(row.usefulLifeMonths ?? ''), wdvRatePercent: String(row.wdvRatePercent ?? ''), openingAccumulated: String(row.openingAccumulated || ''), location: row.location ?? '', custodian: row.custodian ?? '', serialNumber: row.serialNumber ?? '', notes: row.notes ?? '' })}>Edit</Button> : null}
                    {row.status === 'ACTIVE' && canPost ? <Button variant="ghost" onClick={() => { setDisposing(row); setDisposal({ date: todayIso(), amount: '', receivingAccountId: '', partyId: '', reason: '' }); }}>Dispose</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? (
        <Modal title={form.id ? `Edit ${form.code}` : 'Add fixed asset'} subtitle="Companies Act WDV/SLM rates: computers 63.16% WDV / 3 years; furniture 25.89% / 10 years; vehicles 25.89%–31.23% / 8–10 years (check with your CA)." onClose={() => { if (!busy) setForm(null); }} wide>
          <form onSubmit={save} className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Asset code *"><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} className={inputClass} maxLength={30} required /></Field>
              <Field label="Name *" wide><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} maxLength={160} required /></Field>
              <Field label="Category"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass} maxLength={80} /></Field>
              <Field label="Asset ledger *" wide><SearchableSelect options={assetLedgers} value={form.assetAccountId} onChange={(option) => setForm({ ...form, assetAccountId: String(option.id) })} placeholder="Fixed asset ledger" /></Field>
              <Field label="Purchase date *"><input type="date" value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} className={inputClass} required /></Field>
              <Field label="Put to use on"><input type="date" value={form.putToUseDate} onChange={(event) => setForm({ ...form, putToUseDate: event.target.value })} className={inputClass} /></Field>
              <Field label="Cost *"><input type="number" min={0} step="0.01" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} className={inputClass} required /></Field>
              <Field label="Salvage value"><input type="number" min={0} step="0.01" value={form.salvageValue} onChange={(event) => setForm({ ...form, salvageValue: event.target.value })} className={inputClass} /></Field>
              <Field label="Method"><select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value as 'SLM' | 'WDV' })} className={inputClass}><option value="WDV">Written-down value</option><option value="SLM">Straight line</option></select></Field>
              {form.method === 'SLM' ? <Field label="Useful life (months) *"><input type="number" min={1} max={1200} value={form.usefulLifeMonths} onChange={(event) => setForm({ ...form, usefulLifeMonths: event.target.value })} className={inputClass} /></Field> : <Field label="WDV rate % p.a. *"><input type="number" min={0} max={100} step="0.01" value={form.wdvRatePercent} onChange={(event) => setForm({ ...form, wdvRatePercent: event.target.value })} className={inputClass} /></Field>}
              <Field label="Depreciation before the books" hint="For assets bought before this software."><input type="number" min={0} step="0.01" value={form.openingAccumulated} onChange={(event) => setForm({ ...form, openingAccumulated: event.target.value })} className={inputClass} /></Field>
              <Field label="Serial number"><input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} className={inputClass} maxLength={80} /></Field>
              <Field label="Location"><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className={inputClass} maxLength={120} /></Field>
              <Field label="Custodian"><input value={form.custodian} onChange={(event) => setForm({ ...form, custodian: event.target.value })} className={inputClass} maxLength={120} /></Field>
              <Field label="Notes" wide><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} maxLength={1000} /></Field>
            </div>
            <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!form.code || !form.name || !form.assetAccountId || !(Number(form.cost) > 0)}>Save asset</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
      {scheduleFor ? (
        <Modal title={`Depreciation: ${scheduleFor.code} ${scheduleFor.name}`} subtitle={`Accumulated ${formatInr(schedule.data?.accumulated ?? scheduleFor.accumulated)}`} onClose={() => setScheduleFor(null)} wide>
          {schedule.loading ? <LoadingState /> : schedule.error || !schedule.data ? <ErrorBanner message={schedule.error || 'Could not load.'} /> : (
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Posted</p>{schedule.data.history.length ? <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">{schedule.data.history.map((row) => <tr key={row.month}><td className="py-1">{row.month}</td><td className="py-1 text-right">{formatInr(row.charge)}</td></tr>)}</tbody></table> : <p className="text-sm text-slate-500">No runs yet.</p>}</div>
              <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Projection</p><table className="w-full text-sm"><thead className="text-[11px] text-slate-500"><tr><th className="py-1 text-left">Month</th><th className="py-1 text-right">Charge</th><th className="py-1 text-right">Closing</th></tr></thead><tbody className="divide-y divide-slate-100">{schedule.data.projection.map((row) => <tr key={row.month}><td className="py-1">{row.month}</td><td className="py-1 text-right">{formatInr(row.charge)}</td><td className="py-1 text-right">{formatInr(row.closing)}</td></tr>)}</tbody></table></div>
            </div>
          )}
        </Modal>
      ) : null}
      {disposing ? (
        <Modal title={`Dispose ${disposing.code} ${disposing.name}`} subtitle={`Book value ${formatInr(disposing.bookValue)} (run depreciation up to the disposal month first)`} onClose={() => { if (!busy) setDisposing(null); }}>
          <div className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date *"><input type="date" value={disposal.date} onChange={(event) => setDisposal({ ...disposal, date: event.target.value })} className={inputClass} /></Field>
              <Field label="Sale proceeds" hint="0 for scrap / discard."><input type="number" min={0} step="0.01" value={disposal.amount} onChange={(event) => setDisposal({ ...disposal, amount: event.target.value })} className={inputClass} /></Field>
              {Number(disposal.amount) > 0 ? <Field label="Received into / receivable from *" wide><SearchableSelect options={receiving} value={disposal.receivingAccountId} onChange={(option) => setDisposal({ ...disposal, receivingAccountId: String(option.id) })} placeholder="Bank, cash or Sundry Debtors" /></Field> : null}
              {lookups.accountsById.get(disposal.receivingAccountId)?.requiresParty ? <Field label="Buyer *" wide><SearchableSelect options={optionalChoices(lookups.partyOptions, disposal.partyId)} value={disposal.partyId} onChange={(option) => setDisposal({ ...disposal, partyId: String(option.id) })} placeholder="Required" /></Field> : null}
              <Field label="Reason" wide><input value={disposal.reason} onChange={(event) => setDisposal({ ...disposal, reason: event.target.value })} className={inputClass} maxLength={500} /></Field>
            </div>
            {Number(disposal.amount) >= 0 ? <p className="mt-3 text-sm">{(Number(disposal.amount) || 0) - disposing.bookValue >= 0 ? 'Profit' : 'Loss'} on disposal: <strong>{formatInr(Math.abs((Number(disposal.amount) || 0) - disposing.bookValue))}</strong></p> : null}
            <ModalFooter><Button onClick={() => setDisposing(null)} disabled={busy}>Cancel</Button><Button variant="danger" busy={busy} disabled={Number(disposal.amount) > 0 && !disposal.receivingAccountId} onClick={() => void dispose()}>Dispose &amp; post</Button></ModalFooter>
          </div>
        </Modal>
      ) : null}
    </Panel>
  );
}

type RunView = { month: string; preview: Array<{ refId: string; label: string; amount: number }>; alreadyRun: boolean; runs: Array<{ id: string; periodKey: string; runDate: string; total: number; lines: Array<{ refId: string; amount: number }>; status: 'POSTED' | 'REVERSED'; voucherId: string; voucherNumber: string | null }> };

/** Month-end run (depreciation or prepaid amortisation): preview, post, reverse the latest. */
export function PeriodicRunPanel({ kind }: { kind: 'depreciation' | 'prepaid' }) {
  const access = useFinanceWorkspaceAccess();
  const canPost = access.can(['fh.books.post']);
  const [month, setMonth] = useState(thisMonth());
  const [version, setVersion] = useState(0);
  const view = useResource(async () => (await api.get(`/finance-hub/assets/runs/${kind}`, { params: { month } })).data as RunView, `runs-${kind}-${month}-${version}`);
  const [busy, setBusy] = useState(false);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const label = kind === 'depreciation' ? 'depreciation' : 'prepaid amortisation';
  const total = (view.data?.preview ?? []).reduce((sum, line) => sum + line.amount, 0);
  const act = async (action: () => Promise<{ data: { number?: string } }>, success: string) => {
    setBusy(true);
    try {
      const result = await action();
      toast.success(result.data.number ? `${success} ${result.data.number}.` : success);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title={kind === 'depreciation' ? 'Depreciation' : 'Prepaid amortisation'} description={kind === 'depreciation' ? 'Run once a month after the month ends: Dr Depreciation, Cr Accumulated Depreciation, asset by asset. Only the latest run can be reversed.' : 'Run once a month: moves this month’s share from Prepaid Expenses to the expense ledger.'}>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <Field label="Month"><input type="month" value={month} max={thisMonth()} onChange={(event) => setMonth(event.target.value)} className={inputClass} /></Field>
        {canPost ? <Button variant="primary" busy={busy} disabled={!view.data || view.data.alreadyRun || !view.data.preview.length} onClick={() => void act(() => api.post(`/finance-hub/assets/runs/${kind}`, { month }), `Posted ${label} for ${month}:`)}>Post {formatInr(total)} for {month}</Button> : null}
        {view.data?.alreadyRun ? <Badge tone="green">Already posted for {month}</Badge> : null}
      </div>
      {!canPost ? <ReadOnlyNotice>Posting runs needs “Post Vouchers”.</ReadOnlyNotice> : null}
      {view.loading ? <LoadingState /> : view.error || !view.data ? <ErrorBanner message={view.error || 'Could not load.'} schemaMissing={view.schemaMissing} /> : (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{view.data.alreadyRun ? 'Posted for' : 'Would post for'} {month}</p>
            {!view.data.preview.length ? <p className="text-sm text-slate-500">Nothing for this month.</p> : (
              <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">{view.data.preview.map((line) => <tr key={line.refId}><td className="py-1.5">{line.label}</td><td className="py-1.5 text-right">{formatInr(line.amount)}</td></tr>)}<tr className="font-bold"><td className="py-1.5">Total</td><td className="py-1.5 text-right">{formatInr(total)}</td></tr></tbody></table>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Runs</p>
            {!view.data.runs.length ? <p className="text-sm text-slate-500">None yet.</p> : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {view.data.runs.map((run, index) => (
                    <tr key={run.id} className={run.status === 'REVERSED' ? 'opacity-50' : ''}>
                      <td className="py-1.5">{run.periodKey}</td>
                      <td className="py-1.5"><button type="button" onClick={() => setOpenVoucher(run.voucherId)} className="font-mono text-xs text-blue-700 hover:underline">{run.voucherNumber}</button></td>
                      <td className="py-1.5 text-right">{formatInr(run.total)}</td>
                      <td className="py-1.5 text-right">{run.status === 'REVERSED' ? <Badge>Reversed</Badge> : canPost && index === view.data!.runs.findIndex((item) => item.status === 'POSTED') ? <Button variant="ghost" busy={busy} onClick={() => { const reason = window.prompt('Reason for reversing this run:'); if (reason?.trim()) void act(() => api.post(`/finance-hub/assets/runs/${kind}/${run.id}/reverse`, { reason }), 'Run reversed.'); }}>Reverse</Button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={() => setVersion((value) => value + 1)} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}

type Prepaid = { id: string; name: string; startDate: string; months: number; totalAmount: number; amortised: number; balance: number; expenseAccount: string; prepaidAccount: string; reference: string | null };
type PrepaidTab = 'items' | 'run';

/** Prepaid items (insurance, annual subscriptions) and their monthly amortisation run. */
export function PrepaidExpensesModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.expenses.manage']);
  const { options } = useAccountOptions(expenseFilter);
  const [tab, setTab] = useState<PrepaidTab>('items');
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/assets/prepaid')).data.items as Prepaid[], `prepaid-${version}`);
  const [form, setForm] = useState<{ name: string; expenseAccountId: string; totalAmount: string; startDate: string; months: string; reference: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      await api.post('/finance-hub/assets/prepaid', form);
      toast.success('Prepaid item added. Book the payment against Prepaid Expenses (1250).');
      setForm(null);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Panel><Tabs<PrepaidTab> tabs={[{ key: 'items', label: 'Prepaid items' }, { key: 'run', label: 'Monthly amortisation' }]} active={tab} onChange={setTab} /></Panel>
      {tab === 'run' ? <PeriodicRunPanel kind="prepaid" /> : (
        <Panel title="Prepaid expenses" description="Paid in advance (insurance, annual licences): book the payment to Prepaid Expenses, register it here, and the monthly run moves each month’s share to the expense." actions={canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ name: '', expenseAccountId: '', totalAmount: '', startDate: todayIso(), months: '12', reference: '' })}>Add prepaid item</Button> : null}>
          {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="No prepaid items" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5">Expense ledger</th><th className="px-4 py-2.5">From</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5 text-right">Expensed</th><th className="px-4 py-2.5 text-right">Balance</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.map((item) => (
                    <tr key={item.id}>
                      <td className={`${cellClass} font-semibold`}>{item.name}{item.reference ? <span className="block text-xs font-normal text-slate-500">{item.reference}</span> : null}</td>
                      <td className={`${cellClass} text-xs`}>{item.expenseAccount}</td>
                      <td className={`${cellClass} text-xs`}>{formatDate(item.startDate)} · {item.months} months</td>
                      <td className={`${cellClass} text-right`}>{formatInr(item.totalAmount)}</td>
                      <td className={`${cellClass} text-right`}>{formatInr(item.amortised)}</td>
                      <td className={`${cellClass} text-right font-semibold`}>{formatInr(item.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {form ? (
            <Modal title="Add prepaid item" onClose={() => { if (!busy) setForm(null); }}>
              <form onSubmit={save} className="p-5 sm:p-7">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Name *" wide><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} maxLength={160} required /></Field>
                  <Field label="Expense ledger *" wide><SearchableSelect options={options} value={form.expenseAccountId} onChange={(option) => setForm({ ...form, expenseAccountId: String(option.id) })} placeholder="e.g. Insurance" /></Field>
                  <Field label="Total amount *"><input type="number" min={0} step="0.01" value={form.totalAmount} onChange={(event) => setForm({ ...form, totalAmount: event.target.value })} className={inputClass} required /></Field>
                  <Field label="Months *"><input type="number" min={1} max={120} value={form.months} onChange={(event) => setForm({ ...form, months: event.target.value })} className={inputClass} required /></Field>
                  <Field label="Starts *"><input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className={inputClass} required /></Field>
                  <Field label="Reference"><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} className={inputClass} maxLength={80} placeholder="Policy / invoice no." /></Field>
                </div>
                <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!form.name || !form.expenseAccountId || !(Number(form.totalAmount) > 0)}>Save</Button></ModalFooter>
              </form>
            </Modal>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
