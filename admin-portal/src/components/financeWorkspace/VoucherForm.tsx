'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, enumLabel, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { fromPaise, isCashBank, optionalChoices, toPaise, todayIso, type LedgerLookups } from './ledgerLookups';
import { Badge, Button, Field, inputClass, Modal, ModalFooter, selectButtonClass } from './ui';

export const MANUAL_TYPES = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'ADJUSTMENT'] as const;
export type ManualType = (typeof MANUAL_TYPES)[number];
const PAYMENT_METHODS = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE', 'CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'];

export type VoucherLineValue = { accountId: string; partyId: string | null; sellAccountId: string | null; costCentreId: string | null; debit: number; credit: number; narration: string | null };
export type EditableVoucher = {
  id?: string; type: ManualType; date: string; narration: string; reference: string | null; paymentMethod: string | null; lines: VoucherLineValue[];
};

type Row = { key: string; accountId: string; partyId: string; sellAccountId: string; costCentreId: string; debit: string; credit: string; amount: string; narration: string };

let rowSeed = 0;
const newRow = (values: Partial<Row> = {}): Row => {
  rowSeed += 1;
  return { key: `row-${rowSeed}`, accountId: '', partyId: '', sellAccountId: '', costCentreId: '', debit: '', credit: '', amount: '', narration: '', ...values };
};
const rowFromLine = (line: VoucherLineValue, amountSide?: 'debit' | 'credit'): Row => newRow({
  accountId: line.accountId, partyId: line.partyId ?? '', sellAccountId: line.sellAccountId ?? '', costCentreId: line.costCentreId ?? '',
  debit: line.debit ? String(line.debit) : '', credit: line.credit ? String(line.credit) : '', narration: line.narration ?? '',
  amount: amountSide ? String(line[amountSide] || '') : '',
});

type Mode = 'simple' | 'grid';

/** Splits a payment/receipt/contra into its single bank side and the other lines, or null. */
const decompose = (voucher: EditableVoucher, lookups: LedgerLookups) => {
  const bankSide = voucher.type === 'PAYMENT' ? 'credit' : 'debit';
  const otherSide = bankSide === 'credit' ? 'debit' : 'credit';
  if (voucher.type === 'CONTRA') {
    const from = voucher.lines.filter((line) => line.credit > 0);
    const to = voucher.lines.filter((line) => line.debit > 0);
    return from.length === 1 && to.length === 1 ? { counter: from[0]!.accountId, rows: [rowFromLine(to[0]!, 'debit')] } : null;
  }
  const bankLines = voucher.lines.filter((line) => line[bankSide] > 0 && isCashBank(lookups.accountsById.get(line.accountId)));
  const others = voucher.lines.filter((line) => !bankLines.includes(line));
  if (bankLines.length !== 1 || others.some((line) => line[bankSide] > 0)) return null;
  return { counter: bankLines[0]!.accountId, rows: others.map((line) => rowFromLine(line, otherSide)) };
};

export default function VoucherForm({ lookups, initial, allowedTypes, defaultType, onClose, onSaved }: {
  lookups: LedgerLookups;
  initial?: EditableVoucher | null;
  allowedTypes: readonly ManualType[];
  defaultType: ManualType;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const access = useFinanceWorkspaceAccess();
  const canPost = access.can(['fh.books.post']);
  const start = useMemo(() => {
    const type = initial?.type ?? defaultType;
    if (initial && (type === 'PAYMENT' || type === 'RECEIPT' || type === 'CONTRA')) {
      const split = decompose(initial, lookups);
      if (split) return { type, mode: 'simple' as Mode, counter: split.counter, rows: split.rows };
    }
    if (initial) return { type, mode: 'grid' as Mode, counter: '', rows: initial.lines.map((line) => rowFromLine(line)) };
    const simple = type === 'PAYMENT' || type === 'RECEIPT' || type === 'CONTRA';
    return { type, mode: (simple ? 'simple' : 'grid') as Mode, counter: '', rows: simple ? [newRow()] : [newRow(), newRow()] };
  }, [defaultType, initial, lookups]);

  const [type, setType] = useState<ManualType>(start.type);
  const [mode, setMode] = useState<Mode>(start.mode);
  const [counter, setCounter] = useState(start.counter);
  const [rows, setRows] = useState<Row[]>(start.rows);
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [narration, setNarration] = useState(initial?.narration ?? '');
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? '');
  const [busy, setBusy] = useState(false);

  const usable = lookups.accounts.filter((account) => account.isActive && account.allowManualPosting);
  const cashBankOptions = usable.filter((account) => isCashBank(account)).map(lookups.accountOption);
  const otherOptions = usable.filter((account) => !isCashBank(account)).map(lookups.accountOption);
  const gridOptions = usable.map(lookups.accountOption);
  const lineOptions = mode === 'grid' ? gridOptions : type === 'CONTRA' ? cashBankOptions : otherOptions;

  const counterLabel = type === 'PAYMENT' ? 'Paid from *' : type === 'RECEIPT' ? 'Received into *' : 'From account *';
  const amountLabel = type === 'PAYMENT' ? 'Paid for' : type === 'RECEIPT' ? 'Received for' : 'To account';

  const totals = useMemo(() => {
    if (mode === 'simple') {
      const amount = rows.reduce((sum, row) => sum + toPaise(row.amount), 0);
      return { debit: amount, credit: amount, difference: 0 };
    }
    const debit = rows.reduce((sum, row) => sum + toPaise(row.debit), 0);
    const credit = rows.reduce((sum, row) => sum + toPaise(row.credit), 0);
    return { debit, credit, difference: debit - credit };
  }, [mode, rows]);

  const changeType = (next: ManualType) => {
    setType(next);
    const simple = next === 'PAYMENT' || next === 'RECEIPT' || next === 'CONTRA';
    if (simple && mode === 'grid' && rows.every((row) => !row.accountId)) { setMode('simple'); setRows([newRow()]); }
    if (!simple && mode === 'simple') switchToGrid(next);
  };

  const switchToGrid = (forType: ManualType = type) => {
    const bankSide = forType === 'PAYMENT' || forType === 'CONTRA' ? 'credit' : 'debit';
    const total = fromPaise(rows.reduce((sum, row) => sum + toPaise(row.amount), 0));
    const others = rows.map((row) => ({ ...row, debit: bankSide === 'credit' ? row.amount : '', credit: bankSide === 'debit' ? row.amount : '' }));
    setRows([...others, ...(counter ? [newRow({ accountId: counter, [bankSide]: total })] : [])]);
    setMode('grid');
  };

  const update = (key: string, patch: Partial<Row>) => setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const buildLines = () => {
    const clean = (row: Row) => ({ accountId: row.accountId, partyId: row.partyId || null, sellAccountId: row.sellAccountId || null, costCentreId: row.costCentreId || null, narration: row.narration || null });
    if (mode === 'grid') return rows.filter((row) => row.accountId).map((row) => ({ ...clean(row), debit: row.debit || null, credit: row.credit || null }));
    const bankSide = type === 'PAYMENT' || type === 'CONTRA' ? 'credit' : 'debit';
    const otherSide = bankSide === 'credit' ? 'debit' : 'credit';
    const others = rows.filter((row) => row.accountId && toPaise(row.amount) > 0).map((row) => ({ ...clean(row), [otherSide]: row.amount, [bankSide]: null }));
    return [...others, { accountId: counter, partyId: null, sellAccountId: null, costCentreId: null, narration: null, [bankSide]: fromPaise(totals.debit), [otherSide]: null }];
  };

  const submit = async (post: boolean) => {
    setBusy(true);
    try {
      const payload = { type, date, narration, reference: reference || null, paymentMethod: paymentMethod || null, lines: buildLines() };
      const saved = initial?.id ? (await api.put(`/finance-hub/vouchers/${initial.id}`, payload)).data : (await api.post('/finance-hub/vouchers', payload)).data;
      if (post) {
        const result = (await api.post(`/finance-hub/vouchers/${saved.id}/post`)).data;
        toast.success(result.status === 'POSTED' ? `Posted as ${result.number}.` : 'Saved and sent for approval.');
      } else {
        toast.success('Draft saved.');
      }
      onSaved(saved.id);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the voucher.'));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => { event.preventDefault(); void submit(false); };
  const balanced = totals.difference === 0 && totals.debit > 0 && (mode === 'grid' || Boolean(counter));

  return (
    <Modal title={initial?.id ? 'Edit voucher' : 'New voucher'} subtitle="Draft first; posting gives it a number and puts it in the books. Posted vouchers are corrected by reversal, never edited." onClose={() => { if (!busy) onClose(); }} wide>
      <form onSubmit={onSubmit} className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Voucher type *">
            <select value={type} onChange={(event) => changeType(event.target.value as ManualType)} className={inputClass} disabled={allowedTypes.length === 1}>
              {allowedTypes.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}
            </select>
          </Field>
          <Field label="Date *"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} required /></Field>
          <Field label="Reference / UTR / cheque"><input value={reference} onChange={(event) => setReference(event.target.value.toUpperCase())} className={inputClass} maxLength={80} /></Field>
          {type === 'PAYMENT' || type === 'RECEIPT' || type === 'CONTRA' ? (
            <Field label="Mode">
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass}>
                <option value="">—</option>
                {PAYMENT_METHODS.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}
              </select>
            </Field>
          ) : <div />}
          <Field label="Narration *" wide><input value={narration} onChange={(event) => setNarration(event.target.value)} className={inputClass} maxLength={1000} required placeholder="What is this entry for?" /></Field>
          {mode === 'simple' ? (
            <Field label={counterLabel} wide>
              <SearchableSelect buttonClassName={selectButtonClass} options={cashBankOptions} value={counter} onChange={(option) => setCounter(String(option.id))} placeholder="Choose bank / cash account" />
            </Field>
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1000px] text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{mode === 'simple' ? amountLabel : 'Ledger'}</th>
                <th className="px-3 py-2">Party</th>
                <th className="px-3 py-2">Vehicle</th>
                <th className="px-3 py-2">Cost centre</th>
                {mode === 'simple' ? <th className="px-3 py-2 text-right">Amount</th> : <><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></>}
                <th className="px-3 py-2">Line note</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const account = lookups.accountsById.get(row.accountId);
                return (
                  <tr key={row.key}>
                    <td className="w-64 px-3 py-2"><SearchableSelect buttonClassName={selectButtonClass} options={lineOptions} value={row.accountId} onChange={(option) => update(row.key, { accountId: String(option.id) })} placeholder="Ledger" size="sm" /></td>
                    <td className="w-48 px-3 py-2"><SearchableSelect buttonClassName={selectButtonClass} options={optionalChoices(lookups.partyOptions, row.partyId)} value={row.partyId} highlighted={Boolean(account?.requiresParty && !row.partyId)} onChange={(option) => update(row.key, { partyId: String(option.id) })} placeholder={account?.requiresParty ? 'Required' : '—'} size="sm" /></td>
                    <td className="w-48 px-3 py-2"><SearchableSelect buttonClassName={selectButtonClass} options={optionalChoices(lookups.vehicleOptions, row.sellAccountId)} value={row.sellAccountId} highlighted={Boolean(account?.requiresVehicle && !row.sellAccountId)} onChange={(option) => update(row.key, { sellAccountId: String(option.id) })} placeholder={account?.requiresVehicle ? 'Required' : '—'} size="sm" /></td>
                    <td className="w-40 px-3 py-2"><SearchableSelect buttonClassName={selectButtonClass} options={optionalChoices(lookups.costCentreOptions, row.costCentreId)} value={row.costCentreId} highlighted={Boolean(account?.requiresCostCentre && !row.costCentreId)} onChange={(option) => update(row.key, { costCentreId: String(option.id) })} placeholder="—" size="sm" /></td>
                    {mode === 'simple' ? (
                      <td className="w-36 px-3 py-2"><input type="number" min={0} step="0.01" value={row.amount} onChange={(event) => update(row.key, { amount: event.target.value })} className={`${inputClass} py-2 text-right`} /></td>
                    ) : (
                      <>
                        <td className="w-32 px-3 py-2"><input type="number" min={0} step="0.01" value={row.debit} onChange={(event) => update(row.key, { debit: event.target.value, credit: event.target.value ? '' : row.credit })} className={`${inputClass} py-2 text-right`} /></td>
                        <td className="w-32 px-3 py-2"><input type="number" min={0} step="0.01" value={row.credit} onChange={(event) => update(row.key, { credit: event.target.value, debit: event.target.value ? '' : row.debit })} className={`${inputClass} py-2 text-right`} /></td>
                      </>
                    )}
                    <td className="w-44 px-3 py-2"><input value={row.narration} onChange={(event) => update(row.key, { narration: event.target.value })} className={`${inputClass} py-2`} maxLength={300} /></td>
                    <td className="px-3 py-2 text-right">{rows.length > 1 ? <button type="button" onClick={() => setRows(rows.filter((item) => item.key !== row.key))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[13px]">
            <div className="flex gap-2">
              {type !== 'CONTRA' || mode === 'grid' ? <Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setRows([...rows, newRow()])}>Add line</Button> : null}
              {mode === 'simple' ? <Button variant="ghost" onClick={() => switchToGrid()}>Switch to Dr/Cr grid</Button> : null}
            </div>
            <div className="flex items-center gap-3 font-semibold text-slate-800">
              {mode === 'simple' ? <span>Total {formatInr(totals.debit / 100)}</span> : <><span>Dr {formatInr(totals.debit / 100)}</span><span>Cr {formatInr(totals.credit / 100)}</span></>}
              {totals.difference === 0 ? <Badge tone="green">Balanced</Badge> : <Badge tone="red">Difference {formatInr(Math.abs(totals.difference) / 100)}</Badge>}
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" busy={busy} disabled={!balanced}>Save draft</Button>
          {canPost ? <Button variant="primary" busy={busy} disabled={!balanced} onClick={() => void submit(true)}>Save &amp; post</Button> : null}
        </ModalFooter>
      </form>
    </Modal>
  );
}
