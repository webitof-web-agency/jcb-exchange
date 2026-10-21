'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorMessage, enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { todayIso } from './ledgerLookups';
import { Badge, Button, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter } from './ui';
import { useResource } from './useResource';
import type { EditableVoucher, ManualType } from './VoucherForm';

export type VoucherStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'POSTED' | 'REJECTED' | 'REVERSED';
export const statusTone: Record<VoucherStatus, 'slate' | 'amber' | 'green' | 'red' | 'violet'> = {
  DRAFT: 'slate', PENDING_APPROVAL: 'amber', POSTED: 'green', REJECTED: 'red', REVERSED: 'violet',
};

type Detail = {
  id: string; number: string | null; type: string; date: string; status: VoucherStatus; narration: string; reference: string | null; paymentMethod: string | null;
  totalAmount: number; sourceType: string | null; sourceId: string | null; rejectReason: string | null; reversalReason: string | null; createdById: string | null;
  period: { label: string; status: string }; reversalOf: { id: string; number: string | null } | null; reversal: { id: string; number: string | null } | null;
  lines: Array<{ id: string; accountId: string; partyId: string | null; sellAccountId: string | null; costCentreId: string | null; debit: number; credit: number; narration: string | null; account: { code: string; name: string }; party: { name: string } | null; costCentre: { name: string } | null; vehicleLabel: string | null }>;
  activity: Array<{ id: string; action: string; at: string; reason: string | null; actor: string | null }>;
};

const MANUAL = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'ADJUSTMENT'];

export default function VoucherDetail({ voucherId, onClose, onChanged, onEdit, onOpen }: {
  voucherId: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (voucher: EditableVoucher) => void;
  onOpen: (id: string) => void;
}) {
  const access = useFinanceWorkspaceAccess();
  const pathname = usePathname();
  const rolePrefix = pathname.startsWith('/superadmin') ? '/superadmin' : pathname.startsWith('/admin') ? '/admin' : '/employee';
  const detail = useResource(async () => (await api.get(`/finance-hub/vouchers/${voucherId}`)).data as Detail, `voucher-${voucherId}`);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<null | 'reject' | 'reverse' | 'delete'>(null);
  const [reason, setReason] = useState('');
  const [reverseDate, setReverseDate] = useState('');

  const run = async (label: string, request: () => Promise<{ data: { number?: string | null; status?: string } }>) => {
    setBusy(true);
    try {
      const result = (await request()).data;
      toast.success(result.number ? `${label}: ${result.number}` : label);
      setPrompt(null);
      setReason('');
      onChanged();
      detail.reload();
      return true;
    } catch (error) {
      toast.error(apiErrorMessage(error, `${label} failed.`));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitPrompt = async (event: FormEvent) => {
    event.preventDefault();
    if (prompt === 'reject') await run('Voucher rejected', () => api.post(`/finance-hub/vouchers/${voucherId}/reject`, { reason }));
    if (prompt === 'reverse') await run('Reversal posted', () => api.post(`/finance-hub/vouchers/${voucherId}/reverse`, { reason, date: reverseDate || null }));
    if (prompt === 'delete' && (await run('Draft deleted', () => api.delete(`/finance-hub/vouchers/${voucherId}`)))) onClose();
  };

  const voucher = detail.data;
  const manual = voucher ? !voucher.sourceType && MANUAL.includes(voucher.type) : false;
  const editable = Boolean(voucher && manual && (voucher.status === 'DRAFT' || voucher.status === 'REJECTED'));
  const totals = voucher ? voucher.lines.reduce((sum, line) => ({ debit: sum.debit + line.debit, credit: sum.credit + line.credit }), { debit: 0, credit: 0 }) : { debit: 0, credit: 0 };

  return (
    <Modal title={voucher ? `${enumLabel(voucher.type)} ${voucher.number ?? '(draft)'}` : 'Voucher'} subtitle={voucher ? `${formatDate(voucher.date)} · ${voucher.period.label}` : undefined} onClose={() => { if (!busy) onClose(); }} wide>
      {detail.loading ? <LoadingState /> : detail.error ? <ErrorBanner message={detail.error} /> : voucher ? (
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[voucher.status]}>{enumLabel(voucher.status)}</Badge>
            {voucher.sourceType ? <Badge tone="blue">Auto: {enumLabel(voucher.sourceType)}</Badge> : <Badge>Manual</Badge>}
            {voucher.sourceType === 'SELL_ACCOUNT' && voucher.sourceId ? <Link href={`${rolePrefix}/accounts/sell-accounts/${voucher.sourceId}`} className="text-xs font-semibold text-blue-700 hover:underline">Open Sold Vehicle</Link> : null}
            {voucher.paymentMethod ? <Badge>{enumLabel(voucher.paymentMethod)}</Badge> : null}
            {voucher.reference ? <span className="text-xs text-slate-500">Ref: <span className="font-mono">{voucher.reference}</span></span> : null}
            {voucher.reversalOf ? <button type="button" onClick={() => onOpen(voucher.reversalOf!.id)} className="text-xs font-semibold text-blue-700 hover:underline">Reversal of {voucher.reversalOf.number}</button> : null}
            {voucher.reversal ? <button type="button" onClick={() => onOpen(voucher.reversal!.id)} className="text-xs font-semibold text-violet-700 hover:underline">Reversed by {voucher.reversal.number}</button> : null}
          </div>
          <p className="mt-3 text-sm text-slate-800">{voucher.narration}</p>
          {voucher.rejectReason && voucher.status === 'REJECTED' ? <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">Rejected: {voucher.rejectReason}</p> : null}
          {voucher.reversalReason ? <p className="mt-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-700">Reversed: {voucher.reversalReason}</p> : null}

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Ledger</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Vehicle</th><th className="px-3 py-2">Cost centre</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {voucher.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2"><span className="font-mono text-xs text-slate-500">{line.account.code}</span> <span className="font-medium text-slate-900">{line.account.name}</span>{line.narration ? <span className="block text-xs text-slate-500">{line.narration}</span> : null}</td>
                    <td className="px-3 py-2 text-xs">{line.party?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{line.vehicleLabel ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{line.costCentre?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{line.debit ? formatInr(line.debit) : ''}</td>
                    <td className="px-3 py-2 text-right">{line.credit ? formatInr(line.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold text-slate-900"><tr><td className="px-3 py-2" colSpan={4}>Total</td><td className="px-3 py-2 text-right">{formatInr(totals.debit)}</td><td className="px-3 py-2 text-right">{formatInr(totals.credit)}</td></tr></tfoot>
            </table>
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Activity</p>
            <ol className="mt-2 space-y-1 text-xs text-slate-600">
              {voucher.activity.map((item) => <li key={item.id}><span className="font-semibold text-slate-800">{enumLabel(item.action)}</span> · {item.actor ?? 'System'} · {new Date(item.at).toLocaleString('en-IN')}{item.reason ? ` — ${item.reason}` : ''}</li>)}
            </ol>
          </div>

          <ModalFooter>
            <Button onClick={onClose} disabled={busy}>Close</Button>
            {editable && access.can(['fh.books.manage']) ? <Button variant="danger" disabled={busy} onClick={() => setPrompt('delete')}>Delete draft</Button> : null}
            {editable && access.can(['fh.books.manage']) ? <Button disabled={busy} onClick={() => onEdit({ id: voucher.id, type: voucher.type as ManualType, date: voucher.date, narration: voucher.narration, reference: voucher.reference, paymentMethod: voucher.paymentMethod, lines: voucher.lines })}>Edit</Button> : null}
            {voucher.status === 'DRAFT' && access.can(['fh.books.post']) ? <Button variant="primary" busy={busy} onClick={() => run('Voucher posted', () => api.post(`/finance-hub/vouchers/${voucherId}/post`))}>Post</Button> : null}
            {voucher.status === 'PENDING_APPROVAL' && access.can(['fh.approve']) ? <Button variant="danger" disabled={busy} onClick={() => setPrompt('reject')}>Reject</Button> : null}
            {voucher.status === 'PENDING_APPROVAL' && access.can(['fh.approve']) ? <Button variant="primary" busy={busy} onClick={() => run('Approved and posted', () => api.post(`/finance-hub/vouchers/${voucherId}/approve`))}>Approve &amp; post</Button> : null}
            {voucher.status === 'POSTED' && manual && !voucher.reversalOf && access.can(['fh.books.post']) ? <Button variant="danger" disabled={busy} onClick={() => { setReverseDate(''); setPrompt('reverse'); }}>Reverse</Button> : null}
          </ModalFooter>
        </div>
      ) : null}

      {prompt ? (
        <Modal title={prompt === 'reject' ? 'Reject voucher' : prompt === 'reverse' ? 'Reverse voucher' : 'Delete draft'} subtitle={prompt === 'reverse' ? 'Posts a mirror voucher with debit and credit swapped. Both stay in the books.' : prompt === 'delete' ? 'Drafts are not in the books; deleting is recorded in the audit trail.' : 'The maker can edit and resubmit it.'} onClose={() => { if (!busy) setPrompt(null); }}>
          <form onSubmit={submitPrompt} className="space-y-4 p-5 sm:p-7">
            {prompt !== 'delete' ? <Field label="Reason *"><textarea value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} min-h-20`} maxLength={500} required /></Field> : null}
            {prompt === 'reverse' ? <Field label="Reversal date" hint={`Blank = same date as the original (${voucher ? formatDate(voucher.date) : ''}). Use a date in an open month if that month is locked.`}><input type="date" value={reverseDate} min={voucher?.date} max={todayIso()} onChange={(event) => setReverseDate(event.target.value)} className={inputClass} /></Field> : null}
            <ModalFooter><Button onClick={() => setPrompt(null)} disabled={busy}>Cancel</Button><Button type="submit" variant={prompt === 'reject' ? 'danger' : 'primary'} busy={busy}>Confirm</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Modal>
  );
}
