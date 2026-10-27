'use client';

import { useState } from 'react';
import { Ban, CheckCircle2, Download, Loader2, RotateCcw, Undo2, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { downloadAuthedFile, readBlobErrorMessage } from '@/lib/authedDownload';
import {
  formatDisplayDate,
  formatInr,
  normalizeServerSellAccount,
  REFUND_REASON_LABELS,
  todayInput,
  type SellAccountApiRecord,
  type SellAccountPayment,
  type SellAccountRecord,
  type SellAccountRefund,
  type SellAccountRefundReason,
} from './soldVehicleModel';

// Refunds to the purchaser (request → approve by another user → mark paid) and cancelling the sale.
// Only a paid refund changes the customer balance and is posted to the accounts.

type Props = {
  record: SellAccountRecord;
  refundable: number;
  onRecordChange: (record: SellAccountRecord) => void;
  currentUserId?: string;
  isSuperAdmin: boolean;
  canRequest: boolean;
  canApprove: boolean;
  canCancelSale: boolean;
};

const STATUS_STYLE: Record<SellAccountRefund['status'], string> = {
  REQUESTED: 'border-amber-200 bg-amber-50 text-amber-800',
  APPROVED: 'border-blue-200 bg-blue-50 text-blue-800',
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  REJECTED: 'border-gray-300 bg-gray-100 text-gray-500',
};

const METHODS: Array<SellAccountPayment['method']> = ['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH', 'OTHER'];
const inputClass = 'h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs outline-none focus:border-blue-400';

const apiError = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error || fallback;
};

export default function SellAccountRefundsCard({ record, refundable, onRecordChange, currentUserId, isSuperAdmin, canRequest, canApprove, canCancelSale }: Props) {
  const base = `/recruitment/admin/sell-accounts/${encodeURIComponent(record.id)}`;
  const cancelled = Boolean(record.cancelledAt);
  const refunds = record.refunds || [];
  const [busy, setBusy] = useState<string | null>(null);
  const [requestForm, setRequestForm] = useState<{ reason: SellAccountRefundReason; amount: string; forfeitAmount: string; method: SellAccountPayment['method']; note: string } | null>(null);
  const [payForm, setPayForm] = useState<{ id: string; refundDate: string; method: SellAccountPayment['method']; reference: string; drawnOn: string } | null>(null);

  const run = async (key: string, action: () => Promise<{ data?: { record?: SellAccountApiRecord } }>, success: string) => {
    if (busy) return false;
    setBusy(key);
    try {
      const response = await action();
      if (response.data?.record) onRecordChange(normalizeServerSellAccount(response.data.record));
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(apiError(error, 'The request could not be completed.'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const cancelSale = async () => {
    const reason = window.prompt(
      `Cancel this sale?\n\n${record.invoiceNumber ? `Bill of Supply ${record.invoiceNumber} will be cancelled with a credit note and the vehicle goes back to stock in the accounts. ` : ''}Draft receipts are dropped. Money already received can then be refunded (a cancellation charge can be kept).\n\nReason:`,
    );
    if (reason === null) return;
    await run('cancel-sale', () => api.post(`${base}/cancel-sale`, { reason }), 'Sale cancelled.');
  };

  const openRequest = () => setRequestForm({
    reason: cancelled ? (record.invoiceNumber ? 'VEHICLE_RETURN' : 'DEAL_CANCELLED') : 'EXCESS_PAYMENT',
    amount: String(refundable || ''),
    forfeitAmount: '',
    method: 'BANK_TRANSFER',
    note: '',
  });

  const submitRequest = async () => {
    if (!requestForm) return;
    const done = await run('request', () => api.post(`${base}/refunds`, {
      ...requestForm,
      amount: Number(requestForm.amount || 0),
      forfeitAmount: Number(requestForm.forfeitAmount || 0),
    }), 'Refund requested. Another user must approve it.');
    if (done) setRequestForm(null);
  };

  const approve = (refund: SellAccountRefund) => {
    if (!window.confirm(`Approve the refund of ${formatInr(refund.amount)}${refund.forfeitAmount ? ` (keeping ${formatInr(refund.forfeitAmount)})` : ''}?`)) return;
    void run(`approve-${refund.id}`, () => api.post(`${base}/refunds/${refund.id}/approve`, {}), 'Refund approved.');
  };

  const reject = (refund: SellAccountRefund) => {
    const reason = window.prompt('Why is this refund rejected?');
    if (reason === null) return;
    void run(`reject-${refund.id}`, () => api.post(`${base}/refunds/${refund.id}/reject`, { reason }), 'Refund rejected.');
  };

  const submitPay = async () => {
    if (!payForm) return;
    const { id, ...body } = payForm;
    const done = await run(`pay-${id}`, () => api.post(`${base}/refunds/${id}/pay`, body), 'Refund recorded as paid and posted to the accounts.');
    if (done) setPayForm(null);
  };

  const download = async (path: string, name: string) => {
    try {
      await downloadAuthedFile(`${base}/${path}`, name);
    } catch (error) {
      toast.error(await readBlobErrorMessage(error, 'Unable to download the document.'));
    }
  };

  return (
    <div className="space-y-2.5">
      {cancelled ? (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <p className="font-bold text-gray-900">Sale cancelled on {formatDisplayDate(record.cancelledAt || '')}</p>
          {record.cancelReason ? <p className="mt-0.5">Reason: {record.cancelReason}</p> : null}
          {record.creditNoteNumber ? (
            <button type="button" onClick={() => void download('credit-note', `Credit-Note-${record.creditNoteNumber}.pdf`)} className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-bold text-gray-800 hover:bg-gray-100">
              <Download className="h-3 w-3" />Credit note {record.creditNoteNumber}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-600">Refundable now: <b className="tabular-nums text-gray-900">{formatInr(refundable)}</b></span>
        {canRequest && refundable > 0 && !requestForm ? (
          <button type="button" onClick={openRequest} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 hover:bg-blue-100">
            <Undo2 className="h-3.5 w-3.5" />Request refund
          </button>
        ) : null}
        {canCancelSale && !cancelled && !record.isLocked && !record.isDraft ? (
          <button type="button" disabled={busy !== null} onClick={() => void cancelSale()} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60">
            {busy === 'cancel-sale' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}Cancel sale
          </button>
        ) : null}
      </div>
      {!cancelled && refundable <= 0 ? (
        <p className="text-[11px] text-gray-500">Only money paid above the sale amount can be refunded on an active sale. Cancel the sale to refund the advance.</p>
      ) : null}

      {requestForm ? (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-blue-200 bg-blue-50/40 p-2.5 sm:grid-cols-4">
          <label className="col-span-2 text-[11px] font-semibold text-gray-600">Reason
            <select value={requestForm.reason} onChange={(event) => setRequestForm({ ...requestForm, reason: event.target.value as SellAccountRefundReason })} className={inputClass}>
              {(Object.keys(REFUND_REASON_LABELS) as SellAccountRefundReason[]).map((reason) => <option key={reason} value={reason}>{REFUND_REASON_LABELS[reason]}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-gray-600">Refund amount ₹
            <input type="number" min="0" step="0.01" value={requestForm.amount} onChange={(event) => setRequestForm({ ...requestForm, amount: event.target.value })} className={inputClass} />
          </label>
          <label className="text-[11px] font-semibold text-gray-600">Method
            <select value={requestForm.method} onChange={(event) => setRequestForm({ ...requestForm, method: event.target.value as SellAccountPayment['method'] })} className={inputClass}>
              {METHODS.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
            </select>
          </label>
          {cancelled ? (
            <label className="text-[11px] font-semibold text-gray-600">Cancellation charge kept ₹
              <input type="number" min="0" step="0.01" value={requestForm.forfeitAmount} onChange={(event) => setRequestForm({ ...requestForm, forfeitAmount: event.target.value })} className={inputClass} />
            </label>
          ) : null}
          <label className={`${cancelled ? 'col-span-1 sm:col-span-3' : 'col-span-2 sm:col-span-4'} text-[11px] font-semibold text-gray-600`}>Note
            <input type="text" value={requestForm.note} onChange={(event) => setRequestForm({ ...requestForm, note: event.target.value })} className={inputClass} />
          </label>
          <div className="col-span-2 flex justify-end gap-2 sm:col-span-4">
            <button type="button" onClick={() => setRequestForm(null)} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-700">Close</button>
            <button type="button" disabled={busy !== null} onClick={() => void submitRequest()} className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-60">
              {busy === 'request' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Request refund
            </button>
          </div>
        </div>
      ) : null}

      {refunds.length ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              <tr><th className="px-2.5 py-2">Status</th><th className="px-2.5 py-2">Reason</th><th className="px-2.5 py-2">Refund</th><th className="px-2.5 py-2">Kept</th><th className="px-2.5 py-2">Paid</th><th className="px-2.5 py-2 text-right" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {refunds.map((refund) => {
                const ownRequest = Boolean(currentUserId && refund.requestedById === currentUserId) && !isSuperAdmin;
                return (
                  <tr key={refund.id}>
                    <td className="px-2.5 py-1.5">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[refund.status]}`} title={refund.rejectReason || undefined}>{refund.status}</span>
                      {refund.refundNumber ? <span className="mt-0.5 block font-mono text-[10px] text-gray-500">{refund.refundNumber}</span> : null}
                    </td>
                    <td className="px-2.5 py-1.5 text-gray-700" title={refund.note || undefined}>{REFUND_REASON_LABELS[refund.reason] || refund.reason}</td>
                    <td className="px-2.5 py-1.5 font-bold tabular-nums">{formatInr(refund.amount)}</td>
                    <td className="px-2.5 py-1.5 tabular-nums text-gray-600">{refund.forfeitAmount ? formatInr(refund.forfeitAmount) : '—'}</td>
                    <td className="px-2.5 py-1.5 text-gray-600">{refund.refundDate ? `${formatDisplayDate(refund.refundDate)} · ${refund.method.replace('_', ' ')}${refund.reference ? ` · ${refund.reference}` : ''}` : '—'}</td>
                    <td className="px-2.5 py-1.5 text-right">
                      <span className="inline-flex items-center gap-1">
                        {canApprove && refund.status === 'REQUESTED' ? (
                          <button type="button" disabled={busy !== null || ownRequest} onClick={() => approve(refund)} title={ownRequest ? 'Another user must approve your request' : 'Approve'} className="rounded-md p-1 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Approve refund"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                        ) : null}
                        {canApprove && refund.status === 'APPROVED' ? (
                          <button type="button" disabled={busy !== null} onClick={() => setPayForm({ id: refund.id, refundDate: todayInput(), method: refund.method, reference: '', drawnOn: '' })} className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100" aria-label="Mark refund paid"><RotateCcw className="h-3 w-3" />Mark paid</button>
                        ) : null}
                        {canApprove && (refund.status === 'REQUESTED' || refund.status === 'APPROVED') ? (
                          <button type="button" disabled={busy !== null} onClick={() => reject(refund)} className="rounded-md p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-40" title="Reject" aria-label="Reject refund"><XCircle className="h-3.5 w-3.5" /></button>
                        ) : null}
                        {refund.status === 'PAID' ? (
                          <button type="button" onClick={() => void download(`refunds/${refund.id}/advice`, `Refund-${refund.refundNumber || refund.id}.pdf`)} className="rounded-md p-1 text-gray-600 hover:bg-gray-100" title="Download refund advice" aria-label="Download refund advice"><Download className="h-3.5 w-3.5" /></button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {payForm ? (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 sm:grid-cols-4">
          <label className="text-[11px] font-semibold text-gray-600">Refund date
            <input type="date" value={payForm.refundDate} max={todayInput()} onChange={(event) => setPayForm({ ...payForm, refundDate: event.target.value })} className={inputClass} />
          </label>
          <label className="text-[11px] font-semibold text-gray-600">Method
            <select value={payForm.method} onChange={(event) => setPayForm({ ...payForm, method: event.target.value as SellAccountPayment['method'] })} className={inputClass}>
              {METHODS.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-gray-600">UTR / cheque no.
            <input type="text" value={payForm.reference} onChange={(event) => setPayForm({ ...payForm, reference: event.target.value })} className={inputClass} />
          </label>
          <label className="text-[11px] font-semibold text-gray-600">Bank
            <input type="text" value={payForm.drawnOn} onChange={(event) => setPayForm({ ...payForm, drawnOn: event.target.value })} className={inputClass} />
          </label>
          <div className="col-span-2 flex justify-end gap-2 sm:col-span-4">
            <button type="button" onClick={() => setPayForm(null)} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-700">Close</button>
            <button type="button" disabled={busy !== null} onClick={() => void submitPay()} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-bold text-white disabled:opacity-60">
              {busy?.startsWith('pay-') ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Record refund paid
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
