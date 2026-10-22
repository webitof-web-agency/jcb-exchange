'use client';

import { useState } from 'react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorMessage, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { documentLabel, documentStatusTone, isPurchaseSide, managePermission, reasonLabel, stateName, type FinDocument } from './documentsShared';
import type { LedgerLookups } from './ledgerLookups';
import { todayIso } from './ledgerLookups';
import { Badge, Button, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, tableHeadClass } from './ui';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

export default function DocumentDetail({ documentId, lookups, onClose, onChanged, onEdit }: {
  documentId: string;
  lookups: LedgerLookups;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (document: FinDocument) => void;
}) {
  const access = useFinanceWorkspaceAccess();
  const detail = useResource(async () => (await api.get(`/finance-hub/documents/${documentId}`)).data as FinDocument, `document-${documentId}`);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<{ reason: string; date: string } | null>(null);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onChanged();
      detail.reload();
      return true;
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const document = detail.data;
  const canManage = document ? access.can([managePermission(document.docType)]) : false;
  const canPost = access.can(['fh.books.post']);
  const accountName = (id: string) => {
    const account = lookups.accountsById.get(id);
    return account ? `${account.code} · ${account.name}` : '—';
  };
  const vehicleName = (id: string | null) => (id ? lookups.vehicleOptions.find((option) => option.id === id)?.name ?? 'Vehicle' : '—');

  return (
    <Modal title={document ? `${documentLabel[document.docType]} ${document.number ?? '(draft)'}` : 'Document'} subtitle={document?.party.name} onClose={() => { if (!busy) onClose(); }} wide>
      {detail.loading ? <LoadingState /> : detail.error || !document ? <ErrorBanner message={detail.error || 'Not found.'} /> : (
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={documentStatusTone[document.status]}>{document.status === 'POSTED' ? 'Posted' : document.status === 'DRAFT' ? 'Draft' : 'Cancelled'}</Badge>
            {document.isReverseCharge ? <Badge tone="violet">Reverse charge</Badge> : null}
            {document.reason ? <Badge tone="amber">{reasonLabel[document.reason]}</Badge> : null}
            <span className="text-xs text-slate-500">{document.isIntraState ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)'}{document.placeOfSupply ? ` · Place of supply ${document.placeOfSupply} ${stateName(document.placeOfSupply) ?? ''}` : ''}</span>
            {document.voucher ? <button type="button" onClick={() => setOpenVoucher(document.voucher!.id)} className="ml-auto text-xs font-semibold text-blue-700 hover:underline">Voucher {document.voucher.number}{document.voucher.reversal ? ` · reversed by ${document.voucher.reversal.number}` : ''} →</button> : null}
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">Date</dt><dd className="font-semibold">{formatDate(document.date)}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{isPurchaseSide(document.docType) ? 'Supplier' : 'Customer'}</dt><dd className="font-semibold">{document.party.name}</dd>{document.party.gstin ? <dd className="font-mono text-xs text-slate-500">{document.party.gstin}</dd> : null}</div>
            <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{document.docType === 'PURCHASE_BILL' ? 'Supplier bill no.' : 'Party reference'}</dt><dd className="font-mono">{document.partyDocNumber ?? '—'}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{document.dueDate ? 'Due' : 'Against'}</dt><dd>{document.dueDate ? formatDate(document.dueDate) : document.against ? `${document.against.number} (${formatInr(document.against.total)})` : document.againstReference ?? '—'}</dd></div>
          </dl>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-3 py-2">Description</th><th className="px-3 py-2">Ledger</th><th className="px-3 py-2">HSN/SAC</th><th className="px-3 py-2 text-right">Qty × rate</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">GST</th><th className="px-3 py-2">Vehicle</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {document.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">{line.description}{isPurchaseSide(document.docType) && !line.itcEligible ? <span className="block text-[11px] text-amber-700">No ITC: GST added to cost</span> : null}</td>
                    <td className="px-3 py-2 text-xs">{accountName(line.accountId)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{line.hsnSac ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-xs">{line.quantity} × {formatInr(line.rate)}{line.discount ? ` − ${formatInr(line.discount)}` : ''}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatInr(line.taxableValue)}</td>
                    <td className="px-3 py-2 text-right text-xs">{line.gstRate}% · {formatInr((line.cgst ?? 0) + (line.sgst ?? 0) + (line.igst ?? 0))}</td>
                    <td className="px-3 py-2 text-xs">{vehicleName(line.sellAccountId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 ml-auto max-w-sm space-y-1 text-sm">
            <div className="flex justify-between"><span>Taxable value</span><span>{formatInr(document.subTotal)}</span></div>
            {document.cgst ? <div className="flex justify-between"><span>CGST</span><span>{formatInr(document.cgst)}</span></div> : null}
            {document.sgst ? <div className="flex justify-between"><span>SGST</span><span>{formatInr(document.sgst)}</span></div> : null}
            {document.igst ? <div className="flex justify-between"><span>IGST</span><span>{formatInr(document.igst)}</span></div> : null}
            {document.isReverseCharge ? <div className="flex justify-between text-xs text-violet-700"><span>GST under reverse charge (paid by us)</span><span>not in total</span></div> : null}
            {document.roundOff ? <div className="flex justify-between"><span>Round off</span><span>{formatInr(document.roundOff)}</span></div> : null}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><span>Total</span><span>{formatInr(document.total)}</span></div>
            {document.tdsAmount ? <div className="flex justify-between text-slate-600"><span>− TDS {document.tdsSection}</span><span>{formatInr(document.tdsAmount)}</span></div> : null}
            {document.tdsAmount ? <div className="flex justify-between font-semibold"><span>Payable to supplier</span><span>{formatInr(document.total - document.tdsAmount)}</span></div> : null}
          </div>
          {document.notes ? <p className="mt-3 text-sm text-slate-600">Notes: {document.notes}</p> : null}
          {document.cancelReason ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Cancelled: {document.cancelReason}</p> : null}

          {cancelling ? (
            <div className="mt-4 grid gap-3 rounded-xl border border-red-200 bg-red-50/40 p-4 md:grid-cols-[1fr_180px]">
              <Field label="Reason for cancelling *"><input value={cancelling.reason} onChange={(event) => setCancelling({ ...cancelling, reason: event.target.value })} className={inputClass} maxLength={500} autoFocus /></Field>
              <Field label="Reversal date"><input type="date" value={cancelling.date} onChange={(event) => setCancelling({ ...cancelling, date: event.target.value })} className={inputClass} /></Field>
            </div>
          ) : null}

          <ModalFooter>
            {document.status === 'DRAFT' && canManage ? (
              <>
                <Button variant="danger" busy={busy} onClick={() => { if (window.confirm('Delete this draft?')) void run(() => api.delete(`/finance-hub/documents/${document.id}`), 'Draft deleted.').then((ok) => { if (ok) onClose(); }); }}>Delete draft</Button>
                <Button onClick={() => onEdit(document)} disabled={busy}>Edit</Button>
              </>
            ) : null}
            {document.status === 'DRAFT' && canPost ? <Button variant="primary" busy={busy} onClick={() => void run(() => api.post(`/finance-hub/documents/${document.id}/post`), 'Posted to the books.')}>Post</Button> : null}
            {document.status === 'POSTED' && canPost ? (
              cancelling ? (
                <>
                  <Button onClick={() => setCancelling(null)} disabled={busy}>Keep</Button>
                  <Button variant="danger" busy={busy} disabled={!cancelling.reason.trim()} onClick={() => void run(() => api.post(`/finance-hub/documents/${document.id}/cancel`, cancelling), 'Cancelled; the voucher was reversed.').then((ok) => { if (ok) setCancelling(null); })}>Cancel document</Button>
                </>
              ) : <Button variant="danger" onClick={() => setCancelling({ reason: '', date: todayIso() })}>Cancel document…</Button>
            ) : null}
            <Button onClick={onClose} disabled={busy}>Close</Button>
          </ModalFooter>
        </div>
      )}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={detail.reload} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Modal>
  );
}
