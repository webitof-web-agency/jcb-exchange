'use client';

import { FormEvent, useState } from 'react';
import { Download, MessageCircle, Printer } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, enumLabel, formatDate, formatInr } from '@/lib/financeWorkspaceClient';
import { optionalChoices, todayIso, type PickerOption } from './ledgerLookups';
import { Button, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, tableHeadClass } from './ui';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

export type DueSide = 'RECEIVABLE' | 'PAYABLE';
export const BUCKETS = ['NOT_DUE', 'D0_30', 'D31_60', 'D61_90', 'D90_PLUS'] as const;
export type Bucket = (typeof BUCKETS)[number];
export const bucketLabel: Record<Bucket, string> = { NOT_DUE: 'Not due', D0_30: '1–30 days', D31_60: '31–60 days', D61_90: '61–90 days', D90_PLUS: '90+ days' };

export type PartyRef = { id: string; code: string; name: string; mobile?: string | null };

/** Dr-positive balance shown with its side: Dr = the party owes us, Cr = we owe the party. */
export const drCrAmount = (value: number) => (value === 0 ? formatInr(0) : `${formatInr(Math.abs(value))} ${value > 0 ? 'Dr' : 'Cr'}`);

/** wa.me link; the message is typed by the user in WhatsApp (nothing is sent automatically). */
export const whatsappLink = (mobile: string | null | undefined, text: string) => {
  const digits = (mobile ?? '').replace(/\D/g, '');
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};

export const reminderText = (partyName: string, amount: number, side: DueSide) =>
  side === 'RECEIVABLE'
    ? `Dear ${partyName}, a friendly reminder that ${formatInr(amount)} is outstanding on your account with JCB Exchange. Please arrange the payment at the earliest. Thank you.`
    : `Dear ${partyName}, ${formatInr(amount)} is due to you from JCB Exchange. We will share the payment details shortly.`;

type Statement = {
  party: { id: string; code: string; name: string; mobile: string | null; email: string | null; gstin: string | null; pan: string | null; address: string | null };
  company: { legalName: string; tradeName: string | null; address: string | null; city: string | null; state: string | null; pinCode: string | null; pan: string | null; email: string | null; phone: string | null } | null;
  from: string; to: string; truncated: boolean; opening: number; closing: number; totalDebit: number; totalCredit: number;
  rows: Array<{ id: string; date: string; voucherId: string; voucherNumber: string | null; voucherType: string; narration: string; lineNarration: string | null; partyName: string | null; debit: number; credit: number; balance: number }>;
};

const escapeHtml = (value: string | null | undefined) => (value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const printStatement = (statement: Statement) => {
  const company = statement.company;
  const rows = statement.rows.map((row) => `<tr><td>${formatDate(row.date)}</td><td>${escapeHtml(row.voucherNumber)}</td><td>${escapeHtml(row.narration)}${row.partyName ? ` <small>(${escapeHtml(row.partyName)})</small>` : ''}</td><td class="n">${row.debit ? formatInr(row.debit) : ''}</td><td class="n">${row.credit ? formatInr(row.credit) : ''}</td><td class="n">${drCrAmount(row.balance)}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Statement ${escapeHtml(statement.party.name)}</title>
<style>body{font:12px system-ui,sans-serif;color:#0f172a;margin:24px}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left;vertical-align:top}th{background:#f8fafc;font-size:11px;text-transform:uppercase}.n{text-align:right;white-space:nowrap}.head{display:flex;justify-content:space-between;gap:24px}.muted{color:#64748b}tfoot td{font-weight:700}</style></head><body>
<div class="head"><div><h1>${escapeHtml(company?.tradeName || company?.legalName || 'Statement of account')}</h1><div class="muted">${escapeHtml([company?.address, company?.city, company?.state, company?.pinCode].filter(Boolean).join(', '))}</div>${company?.pan ? `<div class="muted">PAN ${escapeHtml(company.pan)}</div>` : ''}</div>
<div style="text-align:right"><strong>Statement of account</strong><div>${formatDate(statement.from)} – ${formatDate(statement.to)}</div></div></div>
<p><strong>${escapeHtml(statement.party.name)}</strong> (${escapeHtml(statement.party.code)})<br>${escapeHtml(statement.party.address)}${statement.party.gstin ? `<br>GSTIN ${escapeHtml(statement.party.gstin)}` : ''}</p>
<table><thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr></thead>
<tbody><tr><td>${formatDate(statement.from)}</td><td></td><td>Opening balance</td><td></td><td></td><td class="n">${drCrAmount(statement.opening)}</td></tr>${rows}</tbody>
<tfoot><tr><td></td><td></td><td>Closing balance</td><td class="n">${formatInr(statement.totalDebit)}</td><td class="n">${formatInr(statement.totalCredit)}</td><td class="n">${drCrAmount(statement.closing)}</td></tr></tfoot></table>
<p class="muted">Dr: amount due from you · Cr: amount due to you. Computer-generated statement.</p></body></html>`;
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) { toast.error('Allow pop-ups to print the statement.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
};

const downloadCsv = (statement: Statement) => {
  const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = [
    ['Date', 'Voucher', 'Particulars', 'Reference', 'Debit', 'Credit', 'Balance (Dr+)'].map(cell).join(','),
    [statement.from, '', 'Opening balance', '', '', '', statement.opening].map(cell).join(','),
    ...statement.rows.map((row) => [row.date, row.voucherNumber ?? '', row.narration, row.partyName ?? '', row.debit || '', row.credit || '', row.balance].map(cell).join(',')),
    [statement.to, '', 'Closing balance', '', statement.totalDebit, statement.totalCredit, statement.closing].map(cell).join(','),
  ];
  const url = URL.createObjectURL(new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `statement-${statement.party.code}-${statement.from}-${statement.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

/** Statement of one party across every party ledger, with print/PDF, CSV and WhatsApp share. */
export function PartyStatementView({ partyId, from, to }: { partyId: string; from: string; to: string }) {
  const statement = useResource(async () => (await api.get(`/finance-hub/parties/${partyId}/statement`, { params: { from: from || undefined, to: to || undefined } })).data as Statement, `statement-${partyId}-${from}-${to}`);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  if (statement.loading) return <LoadingState />;
  if (statement.error || !statement.data) return <ErrorBanner message={statement.error || 'Could not load the statement.'} schemaMissing={statement.schemaMissing} />;
  const data = statement.data;
  const share = `Statement ${formatDate(data.from)} – ${formatDate(data.to)} for ${data.party.name}: closing balance ${drCrAmount(data.closing)} (Dr: due from you, Cr: due to you).`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="text-sm text-slate-600">Opening <strong>{drCrAmount(data.opening)}</strong> · Debits {formatInr(data.totalDebit)} · Credits {formatInr(data.totalCredit)} · Closing <strong>{drCrAmount(data.closing)}</strong></span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => printStatement(data)}>Print / PDF</Button>
          <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(data)}>CSV</Button>
          {data.party.mobile ? <a href={whatsappLink(data.party.mobile, share)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"><MessageCircle className="h-4 w-4" />WhatsApp</a> : null}
        </span>
      </div>
      {data.truncated ? <p className="px-4 pb-2 text-xs text-amber-700">Showing the first 5,000 entries; narrow the dates.</p> : null}
      {!data.rows.length ? <EmptyState title="No entries in this period" description={`Opening and closing balance ${drCrAmount(data.opening)}.`} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Voucher</th><th className="px-4 py-2">Particulars</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-4 py-2 text-right">Balance</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50/60 text-xs text-slate-500"><td className="px-4 py-2">{formatDate(data.from)}</td><td /><td className="px-4 py-2">Opening balance</td><td /><td /><td className="px-4 py-2 text-right font-semibold">{drCrAmount(data.opening)}</td></tr>
              {data.rows.map((row) => (
                <tr key={row.id} onClick={() => setOpenVoucher(row.voucherId)} className="cursor-pointer hover:bg-amber-50/40">
                  <td className="whitespace-nowrap px-4 py-2">{formatDate(row.date)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{row.voucherNumber}<span className="block font-sans text-[11px] text-slate-400">{enumLabel(row.voucherType)}</span></td>
                  <td className="max-w-[360px] px-4 py-2 text-xs"><span className="block truncate" title={row.narration}>{row.narration}</span><span className="block truncate text-slate-400">{row.lineNarration}{row.partyName ? ` · Ref ${row.partyName}` : ''}</span></td>
                  <td className="px-4 py-2 text-right">{row.debit ? formatInr(row.debit) : ''}</td>
                  <td className="px-4 py-2 text-right">{row.credit ? formatInr(row.credit) : ''}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-semibold">{drCrAmount(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={statement.reload} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </div>
  );
}

export function PartyStatementModal({ party, onClose }: { party: PartyRef; onClose: () => void }) {
  const [range, setRange] = useState({ from: '', to: todayIso() });
  return (
    <Modal title={`Statement: ${party.name}`} subtitle="All party ledgers (receivable, payable, advances, deposits). Dr = due from the party." onClose={onClose} wide>
      <div className="grid gap-3 border-b border-slate-100 px-4 py-3 sm:grid-cols-[180px_180px_1fr]">
        <Field label="From" hint="Blank: start of the financial year."><input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To"><input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} className={inputClass} /></Field>
      </div>
      <PartyStatementView partyId={party.id} from={range.from} to={range.to} />
    </Modal>
  );
}

const FOLLOW_UP_KINDS = ['CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'VISIT', 'NOTE'] as const;

/** Log a call / message / visit with an optional promise to pay and the next action date. */
export function FollowUpModal({ party, parties, side, amount, onClose, onSaved }: { party?: PartyRef | null; parties?: PickerOption[]; side: DueSide; amount?: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ partyId: party?.id ?? '', kind: 'CALL', notes: '', promisedDate: '', promisedAmount: '', nextActionDate: '', done: false });
  const [busy, setBusy] = useState(false);
  const message = party ? reminderText(party.name, amount ?? 0, side) : '';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post('/finance-hub/receivables/follow-ups', { ...form, side, promisedAmount: form.promisedAmount || null, promisedDate: form.promisedDate || null, nextActionDate: form.nextActionDate || null, status: form.done ? 'DONE' : 'OPEN' });
      toast.success('Follow-up saved.');
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the follow-up.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={party ? `Follow-up: ${party.name}` : 'New follow-up'} subtitle={amount ? `Outstanding ${formatInr(amount)}` : undefined} onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="grid gap-4 md:grid-cols-2">
          {!party ? <Field label="Party *" wide><SearchableSelect options={optionalChoices(parties ?? [], form.partyId)} value={form.partyId} onChange={(option) => setForm({ ...form, partyId: String(option.id) })} placeholder="Choose party" /></Field> : null}
          <Field label="Type">
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className={inputClass}>
              {FOLLOW_UP_KINDS.map((kind) => <option key={kind} value={kind}>{enumLabel(kind)}</option>)}
            </select>
          </Field>
          <Field label="Next action on"><input type="date" value={form.nextActionDate} onChange={(event) => setForm({ ...form, nextActionDate: event.target.value })} className={inputClass} /></Field>
          <Field label="What was discussed / sent *" wide><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={`${inputClass} min-h-[84px]`} maxLength={2000} required /></Field>
          <Field label="Promised to pay on"><input type="date" value={form.promisedDate} onChange={(event) => setForm({ ...form, promisedDate: event.target.value })} className={inputClass} /></Field>
          <Field label="Promised amount"><input type="number" min={0} step="0.01" value={form.promisedAmount} onChange={(event) => setForm({ ...form, promisedAmount: event.target.value })} className={inputClass} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-600 md:col-span-2"><input type="checkbox" checked={form.done} onChange={(event) => setForm({ ...form, done: event.target.checked })} className="h-4 w-4 accent-amber-500" />Nothing more to do (log only)</label>
        </div>
        {party?.mobile && form.kind === 'WHATSAPP' ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
            <p className="text-xs text-emerald-800">{message}</p>
            <a href={whatsappLink(party.mobile, message)} target="_blank" rel="noreferrer" onClick={() => { if (!form.notes) setForm((previous) => ({ ...previous, notes: 'WhatsApp reminder sent' })); }} className="mt-2 inline-flex items-center gap-2 font-semibold text-emerald-700 hover:underline"><MessageCircle className="h-4 w-4" />Open WhatsApp with this message</a>
          </div>
        ) : null}
        <ModalFooter>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!form.partyId || !form.notes.trim()}>Save follow-up</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export type Schedule = { id: string; side: DueSide; partyId: string; party: PartyRef; dueDate: string; amount: number; reference: string | null; sellAccountId: string | null; notes: string | null; status: 'PLANNED' | 'DONE' | 'CANCELLED'; voucherNumber: string | null; overdue: boolean };

export function ScheduleModal({ initial, party, side, parties, onClose, onSaved }: { initial?: Schedule | null; party?: PartyRef | null; side: DueSide; parties?: PickerOption[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    side: initial?.side ?? side, partyId: initial?.partyId ?? party?.id ?? '', dueDate: initial?.dueDate ?? todayIso(), amount: initial ? String(initial.amount) : '',
    reference: initial?.reference ?? '', notes: initial?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (initial) await api.put(`/finance-hub/receivables/schedules/${initial.id}`, form);
      else await api.post('/finance-hub/receivables/schedules', form);
      toast.success('Schedule saved.');
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the schedule.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={initial ? 'Edit scheduled payment' : 'Schedule a collection or payment'} subtitle="Planning only: money is recorded with a receipt or payment voucher." onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Direction">
            <select value={form.side} onChange={(event) => setForm({ ...form, side: event.target.value as DueSide })} className={inputClass}>
              <option value="RECEIVABLE">Money in (collect)</option>
              <option value="PAYABLE">Money out (pay)</option>
            </select>
          </Field>
          {party ? <Field label="Party"><input value={party.name} className={inputClass} disabled /></Field> : (
            <Field label="Party *"><SearchableSelect options={optionalChoices(parties ?? [], form.partyId)} value={form.partyId} onChange={(option) => setForm({ ...form, partyId: String(option.id) })} placeholder="Choose party" /></Field>
          )}
          <Field label="Due date *"><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className={inputClass} required /></Field>
          <Field label="Amount *"><input type="number" min={0} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={inputClass} required /></Field>
          <Field label="Reference"><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} className={inputClass} maxLength={80} placeholder="Invoice, cheque no., instalment…" /></Field>
          <Field label="Notes"><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} maxLength={1000} /></Field>
        </div>
        <ModalFooter>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!form.partyId || !(Number(form.amount) > 0)}>Save</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export const usePartyOptions = () => useResource(
  async () => [{ id: '', name: '—' }, ...((await api.get('/finance-hub/parties', { params: { pageSize: 500 } })).data.parties as Array<{ id: string; code: string; name: string }>).map((item) => ({ id: item.id, name: `${item.code} · ${item.name}` }))] as PickerOption[],
  'receivables-party-options',
);
