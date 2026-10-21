'use client';

import { FormEvent, useState } from 'react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { optionalChoices, type PickerOption } from './ledgerLookups';
import { Button, ErrorBanner, Field, inputClass, LoadingState } from './ui';
import { useResource } from './useResource';

export type DealTerms = {
  sellAccountId: string; dealMode: 'OUTRIGHT' | 'CONSIGNMENT'; consignorPartyId: string | null; consignmentCommission: number | null;
  brokerPartyId: string | null; brokeragePayable: number; brokerageReceivable: number; brokerageReceivablePartyId: string | null;
  partnerPartyId: string | null; partnerShareAmount: number; notes: string | null; saved: boolean;
};

const text = (value: number | null) => (value ? String(value) : '');

/** Consignment, brokerage and partner-share terms of one Sold Vehicle. Saving re-posts the vehicle. */
export default function DealTermsPanel({ vehicleId, sale, purchase, onSaved }: { vehicleId: string; sale: number; purchase: number; onSaved: () => void }) {
  const access = useFinanceWorkspaceAccess();
  const canEdit = access.can(['fh.vehicle.manage']);
  const terms = useResource(async () => (await api.get(`/finance-hub/deal-terms/${vehicleId}`)).data as DealTerms, `deal-terms-${vehicleId}`);
  const parties = useResource(async () => [{ id: '', name: '—' }, ...((await api.get('/finance-hub/parties', { params: { pageSize: 500 } })).data.parties as Array<{ id: string; code: string; name: string }>).map((party) => ({ id: party.id, name: `${party.code} · ${party.name}` }))] as PickerOption[], 'deal-terms-parties');

  if (terms.loading || parties.loading) return <LoadingState />;
  if (terms.error || !terms.data) return <ErrorBanner message={terms.error || 'Could not load the deal terms.'} schemaMissing={terms.schemaMissing} />;
  return <TermsForm key={terms.data.saved ? 'saved' : 'new'} initial={terms.data} parties={parties.data ?? []} canEdit={canEdit} sale={sale} purchase={purchase} onSaved={() => { terms.reload(); onSaved(); }} />;
}

function TermsForm({ initial, parties, canEdit, sale, purchase, onSaved }: { initial: DealTerms; parties: PickerOption[]; canEdit: boolean; sale: number; purchase: number; onSaved: () => void }) {
  const [form, setForm] = useState({
    dealMode: initial.dealMode, consignorPartyId: initial.consignorPartyId ?? '', consignmentCommission: text(initial.consignmentCommission),
    brokerPartyId: initial.brokerPartyId ?? '', brokeragePayable: text(initial.brokeragePayable), brokerageReceivable: text(initial.brokerageReceivable),
    brokerageReceivablePartyId: initial.brokerageReceivablePartyId ?? '', partnerPartyId: initial.partnerPartyId ?? '', partnerShareAmount: text(initial.partnerShareAmount), notes: initial.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((previous) => ({ ...previous, ...patch }));
  const consignment = form.dealMode === 'CONSIGNMENT';
  const commission = form.consignmentCommission ? Number(form.consignmentCommission) : Math.max(sale - purchase, 0);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.put(`/finance-hub/deal-terms/${initial.sellAccountId}`, {
        ...form,
        consignorPartyId: consignment ? form.consignorPartyId || null : null,
        consignmentCommission: consignment ? form.consignmentCommission || null : null,
        brokerPartyId: form.brokerPartyId || null, brokerageReceivablePartyId: form.brokerageReceivablePartyId || null, partnerPartyId: form.partnerPartyId || null,
        brokeragePayable: form.brokeragePayable || null, brokerageReceivable: form.brokerageReceivable || null, partnerShareAmount: form.partnerShareAmount || null, notes: form.notes || null,
      });
      toast.success('Deal terms saved. The vehicle will be re-posted on the next posting run.');
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the deal terms.'));
    } finally {
      setBusy(false);
    }
  };

  const picker = (value: string, key: keyof typeof form, placeholder = '—') => (
    <SearchableSelect options={optionalChoices(parties, value)} value={value} onChange={(option) => set({ [key]: String(option.id) })} placeholder={placeholder} disabled={!canEdit} />
  );

  return (
    <form onSubmit={save} className="space-y-5 p-5">
      <p className="text-xs text-slate-500">These terms sit beside the Sold Vehicle record (which does not change) and drive extra ledger entries: brokerage, partner share and consignment. Parties are managed in Party Ledgers.</p>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Deal type">
          <select value={form.dealMode} onChange={(event) => set({ dealMode: event.target.value as DealTerms['dealMode'] })} className={inputClass} disabled={!canEdit}>
            <option value="OUTRIGHT">Outright (own stock)</option>
            <option value="CONSIGNMENT">Consignment (for owner)</option>
          </select>
        </Field>
        {consignment ? (
          <>
            <Field label="Consignor (owner)" hint="Blank: the seller on the record.">{picker(form.consignorPartyId, 'consignorPartyId', 'Seller on record')}</Field>
            <Field label="Our commission (incl. GST)" hint="Blank: sale price − agreed price.">
              <input type="number" min={0} step="0.01" value={form.consignmentCommission} onChange={(event) => set({ consignmentCommission: event.target.value })} className={inputClass} disabled={!canEdit} />
            </Field>
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-[11px] uppercase tracking-wide text-slate-500">Owed to owner</p><p className="font-bold">{formatInr(Math.max(sale - commission, 0))}</p><p className="text-[11px] text-slate-400">Sale {formatInr(sale)} − commission {formatInr(commission)}</p></div>
          </>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Broker / agent">{picker(form.brokerPartyId, 'brokerPartyId')}</Field>
        <Field label="Brokerage we pay"><input type="number" min={0} step="0.01" value={form.brokeragePayable} onChange={(event) => set({ brokeragePayable: event.target.value })} className={inputClass} disabled={!canEdit} /></Field>
        <Field label="Brokerage we earn (incl. GST)"><input type="number" min={0} step="0.01" value={form.brokerageReceivable} onChange={(event) => set({ brokerageReceivable: event.target.value })} className={inputClass} disabled={!canEdit} /></Field>
        <Field label="Earned brokerage paid by" hint="Blank: the purchaser.">{picker(form.brokerageReceivablePartyId, 'brokerageReceivablePartyId', 'Purchaser')}</Field>
        <Field label="Partner">{picker(form.partnerPartyId, 'partnerPartyId')}</Field>
        <Field label="Partner's share of profit" hint="Booked on the sale date."><input type="number" min={0} step="0.01" value={form.partnerShareAmount} onChange={(event) => set({ partnerShareAmount: event.target.value })} className={inputClass} disabled={!canEdit} /></Field>
        <Field label="Notes" wide><input value={form.notes} onChange={(event) => set({ notes: event.target.value })} className={inputClass} maxLength={1000} disabled={!canEdit} /></Field>
      </div>
      {canEdit ? <div className="flex justify-end"><Button type="submit" variant="primary" busy={busy}>Save deal terms</Button></div> : null}
    </form>
  );
}
