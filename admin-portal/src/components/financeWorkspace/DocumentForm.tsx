'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { documentLabel, GST_STATES, isPurchaseSide, NOTE_REASONS, originalTypeFor, reasonLabel, type DocumentType, type FinDocument, type NoteReason } from './documentsShared';
import { isCashBank, optionalChoices, toPaise, todayIso, type LedgerLookups } from './ledgerLookups';
import { Button, Field, inputClass, Modal, ModalFooter, selectButtonClass, Toggle } from './ui';
import { useResource } from './useResource';

// GST 2.0 (Sept 2025) slabs 5 / 18 / 40; 12 and 28 kept for older documents.
const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

type Row = { key: string; description: string; accountId: string; hsnSac: string; quantity: string; rate: string; discount: string; gstRate: string; itcEligible: boolean; sellAccountId: string; costCentreId: string };

let rowSeed = 0;
const newRow = (values: Partial<Row> = {}): Row => {
  rowSeed += 1;
  return { key: `doc-row-${rowSeed}`, description: '', accountId: '', hsnSac: '', quantity: '1', rate: '', discount: '', gstRate: '18', itcEligible: true, sellAccountId: '', costCentreId: '', ...values };
};

const lineTaxable = (row: Row) => Math.max(Math.round((Number(row.quantity) || 0) * toPaise(row.rate)) - toPaise(row.discount), 0);

export default function DocumentForm({ lookups, initial, createTypes, defaultType, defaultReason, onClose, onSaved }: {
  lookups: LedgerLookups;
  initial?: FinDocument | null;
  createTypes: readonly DocumentType[];
  defaultType: DocumentType;
  defaultReason?: NoteReason;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const access = useFinanceWorkspaceAccess();
  const canPost = access.can(['fh.books.post']);
  const [docType, setDocType] = useState<DocumentType>(initial?.docType ?? defaultType);
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [partyId, setPartyId] = useState(initial?.partyId ?? '');
  const [partyDocNumber, setPartyDocNumber] = useState(initial?.partyDocNumber ?? '');
  const [placeOfSupply, setPlaceOfSupply] = useState(initial?.placeOfSupply ?? '');
  const [reverseCharge, setReverseCharge] = useState(initial?.isReverseCharge ?? false);
  const [reason, setReason] = useState<NoteReason>(initial?.reason ?? defaultReason ?? 'OTHER');
  const [againstDocumentId, setAgainstDocumentId] = useState(initial?.againstDocumentId ?? '');
  const [againstReference, setAgainstReference] = useState(initial?.againstReference ?? '');
  const [sellAccountId, setSellAccountId] = useState(initial?.sellAccountId ?? '');
  const [tdsSection, setTdsSection] = useState(initial?.tdsSection ?? '');
  const [tdsAmount, setTdsAmount] = useState(initial?.tdsAmount ? String(initial.tdsAmount) : '');
  const [roundOff, setRoundOff] = useState(initial?.roundOff ? String(initial.roundOff) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [rows, setRows] = useState<Row[]>(() => initial?.lines.length ? initial.lines.map((line) => newRow({
    description: line.description, accountId: line.accountId, hsnSac: line.hsnSac ?? '', quantity: String(line.quantity), rate: String(line.rate),
    discount: line.discount ? String(line.discount) : '', gstRate: String(line.gstRate), itcEligible: line.itcEligible, sellAccountId: line.sellAccountId ?? '', costCentreId: line.costCentreId ?? '',
  })) : [newRow()]);
  const [busy, setBusy] = useState(false);

  const purchaseSide = isPurchaseSide(docType);
  const isNote = docType === 'CREDIT_NOTE' || docType === 'DEBIT_NOTE';
  const originalType = originalTypeFor(docType);
  const originals = useResource(
    async () => (originalType && partyId ? (await api.get('/finance-hub/documents', { params: { types: originalType, status: 'POSTED', partyId, pageSize: 200 } })).data.documents as Array<{ id: string; number: string | null; partyDocNumber: string | null; date: string; total: number }> : []),
    `originals-${originalType}-${partyId}`,
  );

  // Purchase side lines go to expense/asset ledgers, sales side to income ledgers.
  const ledgerOptions = useMemo(() => lookups.accounts
    .filter((account) => account.isActive && account.allowManualPosting && !isCashBank(account))
    .filter((account) => {
      const nature = lookups.natureOf(account);
      return purchaseSide ? nature === 'EXPENSE' || nature === 'ASSET' : nature === 'INCOME';
    })
    .map(lookups.accountOption), [lookups, purchaseSide]);

  const totals = useMemo(() => {
    const taxable = rows.reduce((sum, row) => sum + lineTaxable(row), 0);
    const tax = rows.reduce((sum, row) => sum + Math.round(lineTaxable(row) * (Number(row.gstRate) || 0) / 100), 0);
    const round = Math.round((Number(roundOff) || 0) * 100);
    const total = taxable + (reverseCharge ? 0 : tax) + round;
    return { taxable, tax, total, payable: total - toPaise(tdsAmount) };
  }, [reverseCharge, roundOff, rows, tdsAmount]);

  const update = (key: string, patch: Partial<Row>) => setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const submit = async (post: boolean) => {
    setBusy(true);
    try {
      const payload = {
        docType, date, dueDate: dueDate || null, partyId, partyDocNumber: partyDocNumber || null, placeOfSupply: placeOfSupply || null,
        isReverseCharge: docType === 'PURCHASE_BILL' ? reverseCharge : false, reason: isNote ? reason : null,
        againstDocumentId: isNote ? againstDocumentId || null : null, againstReference: isNote ? againstReference || null : null,
        sellAccountId: sellAccountId || null, notes: notes || null, tdsSection: tdsSection || null, tdsAmount: docType === 'PURCHASE_BILL' ? tdsAmount || null : null,
        roundOff: roundOff || null,
        lines: rows.filter((row) => row.accountId || row.description).map((row) => ({
          description: row.description, accountId: row.accountId, hsnSac: row.hsnSac || null, quantity: row.quantity || '1', rate: row.rate || '0', discount: row.discount || null,
          gstRate: row.gstRate || '0', itcEligible: purchaseSide ? row.itcEligible : true, sellAccountId: row.sellAccountId || null, costCentreId: row.costCentreId || null,
        })),
      };
      const saved = initial?.id ? (await api.put(`/finance-hub/documents/${initial.id}`, payload)).data : (await api.post('/finance-hub/documents', payload)).data;
      if (post) {
        const result = (await api.post(`/finance-hub/documents/${saved.id}/post`)).data;
        toast.success(`Posted as ${result.number}.`);
      } else {
        toast.success('Draft saved.');
      }
      onSaved(saved.id);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the document.'));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => { event.preventDefault(); void submit(false); };
  const ready = Boolean(partyId) && totals.total > 0 && rows.some((row) => row.accountId) && (docType !== 'PURCHASE_BILL' || Boolean(partyDocNumber.trim()));

  return (
    <Modal
      title={initial?.id ? `Edit ${documentLabel[docType].toLowerCase()}` : `New ${documentLabel[docType].toLowerCase()}`}
      subtitle="Draft first; posting gives it a number and books it. CGST/SGST or IGST is decided from the place of supply when you save."
      onClose={() => { if (!busy) onClose(); }}
      wide
    >
      <form onSubmit={onSubmit} className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Document *">
            <select value={docType} onChange={(event) => { setDocType(event.target.value as DocumentType); setRows([newRow()]); setAgainstDocumentId(''); }} className={inputClass} disabled={Boolean(initial?.id) || createTypes.length === 1}>
              {(initial?.id ? [initial.docType] : createTypes).map((type) => <option key={type} value={type}>{documentLabel[type]}</option>)}
            </select>
          </Field>
          <Field label="Date *"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} required /></Field>
          {docType === 'PURCHASE_BILL' || docType === 'SALES_INVOICE' ? (
            <Field label="Due date"><input type="date" value={dueDate} min={date} onChange={(event) => setDueDate(event.target.value)} className={inputClass} /></Field>
          ) : (
            <Field label="Reason *">
              <select value={reason} onChange={(event) => setReason(event.target.value as NoteReason)} className={inputClass}>
                {NOTE_REASONS.map((item) => <option key={item} value={item}>{reasonLabel[item]}</option>)}
              </select>
            </Field>
          )}
          <Field label={docType === 'PURCHASE_BILL' ? 'Supplier bill number *' : 'Party reference'}>
            <input value={partyDocNumber} onChange={(event) => setPartyDocNumber(event.target.value.toUpperCase())} className={inputClass} maxLength={60} required={docType === 'PURCHASE_BILL'} />
          </Field>
          <Field label={purchaseSide ? 'Supplier *' : 'Customer *'} wide>
            <SearchableSelect buttonClassName={selectButtonClass} options={optionalChoices(lookups.partyOptions, partyId)} value={partyId} onChange={(option) => { setPartyId(String(option.id)); setAgainstDocumentId(''); }} placeholder="Choose party (add new ones in Party Ledgers)" />
          </Field>
          <Field label="Place of supply" hint="Blank: the party's state, else your own state.">
            <select value={placeOfSupply} onChange={(event) => setPlaceOfSupply(event.target.value)} className={inputClass}>
              <option value="">Party&apos;s state</option>
              {GST_STATES.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
            </select>
          </Field>
          <Field label="Vehicle (optional)">
            <SearchableSelect buttonClassName={selectButtonClass} options={optionalChoices(lookups.vehicleOptions, sellAccountId)} value={sellAccountId} onChange={(option) => setSellAccountId(String(option.id))} placeholder="—" />
          </Field>
          {isNote ? (
            <>
              <Field label={`Original ${originalType === 'SALES_INVOICE' ? 'invoice' : 'bill'} in this workspace`} wide>
                <select value={againstDocumentId} onChange={(event) => setAgainstDocumentId(event.target.value)} className={inputClass} disabled={!partyId}>
                  <option value="">{partyId ? (originals.data?.length ? '— not linked —' : 'None posted for this party') : 'Choose the party first'}</option>
                  {(originals.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.number}{item.partyDocNumber ? ` (${item.partyDocNumber})` : ''} · {formatDate(item.date)} · {formatInr(item.total)}</option>)}
                </select>
              </Field>
              <Field label="Or original number" wide hint="e.g. a Sold Vehicle tax invoice number or an older bill.">
                <input value={againstReference} onChange={(event) => setAgainstReference(event.target.value.toUpperCase())} className={inputClass} maxLength={80} />
              </Field>
            </>
          ) : null}
          {docType === 'PURCHASE_BILL' ? (
            <div className="flex items-end md:col-span-2"><Toggle checked={reverseCharge} onChange={setReverseCharge} label="Reverse charge (we pay the GST, supplier is paid the taxable value)" /></div>
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1320px] text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Description</th><th className="px-3 py-2">Ledger</th><th className="px-3 py-2">HSN/SAC</th><th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Discount</th><th className="px-3 py-2">GST %</th>
                {purchaseSide ? <th className="px-3 py-2">ITC</th> : null}<th className="px-3 py-2">Vehicle</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="w-56 px-3 py-2"><input value={row.description} onChange={(event) => update(row.key, { description: event.target.value })} className={`${inputClass} py-2`} maxLength={300} placeholder="Item or service" /></td>
                  <td className="w-60 px-3 py-2"><SearchableSelect buttonClassName={selectButtonClass} options={ledgerOptions} value={row.accountId} onChange={(option) => update(row.key, { accountId: String(option.id) })} placeholder="Ledger" size="sm" /></td>
                  <td className="w-24 px-3 py-2"><input value={row.hsnSac} onChange={(event) => update(row.key, { hsnSac: event.target.value.replace(/\D/g, '').slice(0, 8) })} className={`${inputClass} py-2`} inputMode="numeric" /></td>
                  <td className="w-24 min-w-[88px] px-3 py-2"><input type="number" min={0} step="0.001" value={row.quantity} onChange={(event) => update(row.key, { quantity: event.target.value })} className={`${inputClass} py-2 text-right`} /></td>
                  <td className="w-36 min-w-[128px] px-3 py-2"><input type="number" min={0} step="0.01" value={row.rate} onChange={(event) => update(row.key, { rate: event.target.value })} className={`${inputClass} py-2 text-right`} /></td>
                  <td className="w-28 min-w-[104px] px-3 py-2"><input type="number" min={0} step="0.01" value={row.discount} onChange={(event) => update(row.key, { discount: event.target.value })} className={`${inputClass} py-2 text-right`} /></td>
                  <td className="w-28 min-w-[100px] px-3 py-2">
                    <select value={row.gstRate} onChange={(event) => update(row.key, { gstRate: event.target.value })} className={`${inputClass} py-2`}>
                      {GST_RATES.map((rate) => <option key={rate} value={String(rate)}>{rate}%</option>)}
                    </select>
                  </td>
                  {purchaseSide ? <td className="px-3 py-2"><input type="checkbox" checked={row.itcEligible} onChange={(event) => update(row.key, { itcEligible: event.target.checked })} className="h-4 w-4 accent-amber-500" title="Input tax credit can be claimed" /></td> : null}
                  <td className="w-44 px-3 py-2"><SearchableSelect buttonClassName={selectButtonClass} options={optionalChoices(lookups.vehicleOptions, row.sellAccountId)} value={row.sellAccountId} onChange={(option) => update(row.key, { sellAccountId: String(option.id) })} placeholder="—" size="sm" /></td>
                  <td className="w-28 px-3 py-2 text-right font-semibold">{formatInr(lineTaxable(row) / 100)}</td>
                  <td className="px-3 py-2 text-right">{rows.length > 1 ? <button type="button" onClick={() => setRows(rows.filter((item) => item.key !== row.key))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[13px]">
            <Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setRows([...rows, newRow()])}>Add line</Button>
            <div className="flex flex-wrap items-center gap-3 font-semibold text-slate-800">
              <span>Taxable {formatInr(totals.taxable / 100)}</span>
              <span>GST {formatInr(totals.tax / 100)}{reverseCharge ? ' (RCM)' : ''}</span>
              <span>Total {formatInr(totals.total / 100)}</span>
              {docType === 'PURCHASE_BILL' && toPaise(tdsAmount) ? <span>Payable {formatInr(totals.payable / 100)}</span> : null}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {docType === 'PURCHASE_BILL' ? (
            <>
              <Field label="TDS section" hint="e.g. 194C, 194J, 194I, 194H"><input value={tdsSection} onChange={(event) => setTdsSection(event.target.value.toUpperCase())} className={inputClass} maxLength={10} /></Field>
              <Field label="TDS amount"><input type="number" min={0} step="0.01" value={tdsAmount} onChange={(event) => setTdsAmount(event.target.value)} className={inputClass} /></Field>
            </>
          ) : null}
          <Field label="Round off" hint="+ or − paise to match the printed total."><input type="number" step="0.01" min={-10} max={10} value={roundOff} onChange={(event) => setRoundOff(event.target.value)} className={inputClass} /></Field>
          <Field label="Notes" wide><input value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} maxLength={1000} /></Field>
        </div>

        <ModalFooter>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" busy={busy} disabled={!ready}>Save draft</Button>
          {canPost ? <Button variant="primary" busy={busy} disabled={!ready} onClick={() => void submit(true)}>Save &amp; post</Button> : null}
        </ModalFooter>
      </form>
    </Modal>
  );
}
