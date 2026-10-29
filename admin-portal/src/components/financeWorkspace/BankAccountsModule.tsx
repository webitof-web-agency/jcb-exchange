'use client';

import { FormEvent, useState } from 'react';
import { Landmark, Plus, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorMessage, enumLabel, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { Badge, Button, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, Toggle } from './ui';
import { useResource } from './useResource';

type BankType = 'CURRENT' | 'SAVINGS' | 'OD' | 'CC' | 'VIRTUAL' | 'CASH' | 'PETTY_CASH' | 'WALLET' | 'GATEWAY';
type BankAccount = {
  id: string; type: BankType; displayName: string; bankName: string | null; branch: string | null; accountNumber: string | null; ifsc: string | null;
  holderName: string | null; parentBankAccountId: string | null; vanPrefix: string | null; statementAliases: string[]; overdraftLimit: number | null;
  isActive: boolean; account: { id: string; code: string; name: string; isActive: boolean };
};
type Suggestion = { alias: string; transactions: number };

const TYPES: BankType[] = ['CURRENT', 'SAVINGS', 'OD', 'CC', 'VIRTUAL', 'CASH', 'PETTY_CASH', 'WALLET', 'GATEWAY'];
const BANK_TYPES: BankType[] = ['CURRENT', 'SAVINGS', 'OD', 'CC', 'VIRTUAL'];

type Form = {
  id?: string; type: BankType; displayName: string; bankName: string; branch: string; accountNumber: string; ifsc: string; holderName: string;
  parentBankAccountId: string; vanPrefix: string; overdraftLimit: string; statementAliases: string[]; isActive: boolean;
};

const emptyForm: Form = { type: 'CURRENT', displayName: '', bankName: '', branch: '', accountNumber: '', ifsc: '', holderName: '', parentBankAccountId: '', vanPrefix: '', overdraftLimit: '', statementAliases: [], isActive: true };

export default function BankAccountsModule() {
  const canManage = useFinanceWorkspaceAccess().can(['fh.banking.manage']);
  const accounts = useResource(async () => (await api.get('/finance-hub/bank-accounts')).data.accounts as BankAccount[], 'bank-accounts');
  const [form, setForm] = useState<Form | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [aliasInput, setAliasInput] = useState('');
  const [busy, setBusy] = useState(false);
  const list = accounts.data ?? [];

  const openForm = (next: Form) => {
    setForm(next);
    setAliasInput('');
    if (canManage) {
      api.get('/finance-hub/bank-accounts/alias-suggestions')
        .then((response) => setSuggestions(response.data.suggestions as Suggestion[]))
        .catch(() => setSuggestions([]));
    }
  };

  const addAlias = (alias: string) => {
    const value = alias.trim().toUpperCase();
    if (!form || !value || form.statementAliases.includes(value)) return;
    setForm({ ...form, statementAliases: [...form.statementAliases, value] });
    setAliasInput('');
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const { id, ...payload } = form;
      const body = { ...payload, parentBankAccountId: payload.type === 'VIRTUAL' ? payload.parentBankAccountId || null : null, overdraftLimit: payload.overdraftLimit || null };
      if (id) await api.put(`/finance-hub/bank-accounts/${id}`, body);
      else await api.post('/finance-hub/bank-accounts', body);
      toast.success(id ? 'Bank account updated.' : 'Bank account added with its own ledger.');
      setForm(null);
      accounts.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the bank account.'));
    } finally {
      setBusy(false);
    }
  };

  if (accounts.loading) return <Panel><LoadingState /></Panel>;
  if (accounts.error) return <Panel><ErrorBanner message={accounts.error} schemaMissing={accounts.schemaMissing} /></Panel>;

  const isBank = form ? BANK_TYPES.includes(form.type) : false;

  return (
    <Panel
      title="Bank, cash & gateway accounts"
      description="Each account gets its own ledger under Cash & Bank. Statement aliases link the bank names used on the existing Expenses page to this account. Opening balances are entered in Accounting & Books → Opening Balances."
      actions={canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openForm(emptyForm)}>Add account</Button> : null}
    >
      {!canManage ? <ReadOnlyNotice>Account numbers are masked. Adding or editing needs “Manage Banking & Cash”.</ReadOnlyNotice> : null}
      {list.length ? (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((item) => (
            <div key={item.id} className={`rounded-lg border border-slate-200 p-3 ${item.isActive ? 'bg-white' : 'bg-slate-50 opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-amber-600" /><p className="font-semibold text-slate-900">{item.displayName}</p></div>
                <Badge tone={item.isActive ? 'green' : 'slate'}>{item.isActive ? enumLabel(item.type) : 'Inactive'}</Badge>
              </div>
              <dl className="mt-3 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between"><dt>Ledger</dt><dd className="font-mono">{item.account.code}</dd></div>
                {item.bankName ? <div className="flex justify-between"><dt>Bank</dt><dd>{item.bankName}{item.branch ? `, ${item.branch}` : ''}</dd></div> : null}
                {item.accountNumber ? <div className="flex justify-between"><dt>A/c no.</dt><dd className="font-mono">{item.accountNumber}</dd></div> : null}
                {item.ifsc ? <div className="flex justify-between"><dt>IFSC</dt><dd className="font-mono">{item.ifsc}</dd></div> : null}
                {item.type === 'VIRTUAL' ? <div className="flex justify-between"><dt>Parent</dt><dd>{list.find((parent) => parent.id === item.parentBankAccountId)?.displayName ?? '—'}</dd></div> : null}
              </dl>
              {item.statementAliases.length ? <div className="mt-3 flex flex-wrap gap-1">{item.statementAliases.map((alias) => <Badge key={alias} tone="blue">{alias}</Badge>)}</div> : null}
              {canManage ? <div className="mt-3 flex justify-end"><Button variant="ghost" onClick={() => openForm({ id: item.id, type: item.type, displayName: item.displayName, bankName: item.bankName ?? '', branch: item.branch ?? '', accountNumber: item.accountNumber ?? '', ifsc: item.ifsc ?? '', holderName: item.holderName ?? '', parentBankAccountId: item.parentBankAccountId ?? '', vanPrefix: item.vanPrefix ?? '', overdraftLimit: item.overdraftLimit === null ? '' : String(item.overdraftLimit), statementAliases: item.statementAliases, isActive: item.isActive })}>Edit</Button></div> : null}
            </div>
          ))}
        </div>
      ) : <EmptyState title="No bank accounts yet" description="Add your HDFC current account, any virtual accounts, petty cash boxes and payment gateways. Install the chart of accounts first." />}

      {form ? (
        <Modal title={form.id ? `Edit ${form.displayName}` : 'Add bank / cash account'} onClose={() => { if (!busy) setForm(null); }} wide>
          <form onSubmit={save} className="p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Type *">
                <select value={form.type} disabled={Boolean(form.id)} onChange={(event) => setForm({ ...form, type: event.target.value as BankType })} className={inputClass}>
                  {TYPES.map((type) => <option key={type} value={type}>{enumLabel(type)}</option>)}
                </select>
              </Field>
              <Field label="Account name *" hint="Also the ledger name, e.g. “HDFC Current A/c 6789”."><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className={inputClass} maxLength={100} required /></Field>
              <Field label="Bank name"><input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value.toUpperCase() })} className={`${inputClass} uppercase`} maxLength={100} /></Field>
              {isBank ? (
                <>
                  <Field label="Account number *" hint={form.id ? 'Leave as shown to keep it unchanged.' : undefined}><input value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value.replace(/\s/g, '').toUpperCase() })} className={`${inputClass} font-mono`} maxLength={34} required /></Field>
                  <Field label="IFSC"><input data-sanitize="ifsc" value={form.ifsc} onChange={(event) => setForm({ ...form, ifsc: event.target.value.toUpperCase() })} className={`${inputClass} font-mono uppercase`} maxLength={11} /></Field>
                  <Field label="Branch"><input value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} className={inputClass} maxLength={100} /></Field>
                  <Field label="Account holder"><input value={form.holderName} onChange={(event) => setForm({ ...form, holderName: event.target.value })} className={inputClass} maxLength={120} /></Field>
                </>
              ) : null}
              {form.type === 'VIRTUAL' ? (
                <>
                  <Field label="Parent bank account">
                    <select value={form.parentBankAccountId} onChange={(event) => setForm({ ...form, parentBankAccountId: event.target.value })} className={inputClass}>
                      <option value="">Select…</option>
                      {list.filter((item) => item.id !== form.id && BANK_TYPES.includes(item.type) && item.type !== 'VIRTUAL').map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
                    </select>
                  </Field>
                  <Field label="Virtual account prefix (VAN)"><input value={form.vanPrefix} onChange={(event) => setForm({ ...form, vanPrefix: event.target.value.toUpperCase() })} className={`${inputClass} font-mono`} maxLength={20} /></Field>
                </>
              ) : null}
              {form.type === 'OD' || form.type === 'CC' ? <Field label="Overdraft / CC limit"><input type="number" min={0} step="0.01" value={form.overdraftLimit} onChange={(event) => setForm({ ...form, overdraftLimit: event.target.value })} className={inputClass} /></Field> : null}
              {form.id ? <div className="flex items-end pb-2"><Toggle checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} label="Active" /></div> : null}
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 p-3">
              <p className="text-[13px] font-semibold text-slate-800">Statement aliases</p>
              <p className="mt-0.5 text-xs text-slate-500">Bank names typed on the existing Expenses & Transactions page that belong to this account. Used for reconciliation.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {form.statementAliases.map((alias) => (
                  <span key={alias} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    {alias}
                    <button type="button" onClick={() => setForm({ ...form, statementAliases: form.statementAliases.filter((item) => item !== alias) })} aria-label={`Remove ${alias}`}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={aliasInput} onChange={(event) => setAliasInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addAlias(aliasInput); } }} className={inputClass} placeholder="e.g. HDFC BANK" maxLength={100} />
                <Button onClick={() => addAlias(aliasInput)}>Add</Button>
              </div>
              {suggestions.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="text-xs text-slate-500">Found on Expenses page:</span>
                  {suggestions.filter((item) => !form.statementAliases.includes(item.alias)).map((item) => (
                    <button key={item.alias} type="button" onClick={() => addAlias(item.alias)} className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-600 hover:border-amber-400 hover:text-slate-900">+ {item.alias} ({item.transactions})</button>
                  ))}
                </div>
              ) : null}
            </div>
            <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Save</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}
