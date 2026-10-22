'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { enumLabel, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import type { DealTerms } from './DealTermsPanel';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, LoadingState, Modal, Panel, tableHeadClass } from './ui';
import { useResource } from './useResource';
import VehicleDetail from './VehicleDetail';

type Deal = DealTerms & {
  vehicle: string; sellerName: string | null; purchaserName: string | null; sale: number; purchase: number; dealStatus: string;
  consignorName: string | null; brokerName: string | null; brokerageReceivableFrom: string | null; partnerName: string | null;
  commission: number | null; payableToConsignor: number | null;
};

/** Vehicles sold on consignment, or vehicles with brokerage; opens the vehicle on its Deal terms tab. */
export default function DealTermsListModule({ kind, embedded = false }: { kind: 'consignment' | 'brokerage'; embedded?: boolean }) {
  const access = useFinanceWorkspaceAccess();
  const canEdit = access.can(['fh.vehicle.manage']);
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/deal-terms', { params: kind === 'consignment' ? { mode: 'CONSIGNMENT' } : { brokerage: 'true' } })).data.deals as Deal[], `deal-terms-${kind}-${version}`);
  const vehicles = useResource(async () => (await api.get('/finance-hub/vehicles', { params: { limit: 500 } })).data.vehicles as Array<{ id: string; label: string }>, 'deal-terms-vehicles');
  const [picking, setPicking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const deals = list.data ?? [];

  const consignment = kind === 'consignment';
  const totals = consignment
    ? [['Vehicles', String(deals.length)], ['Sales', formatInr(deals.reduce((sum, deal) => sum + deal.sale, 0))], ['Our commission', formatInr(deals.reduce((sum, deal) => sum + (deal.commission ?? 0), 0))], ['Due to owners (before payments)', formatInr(deals.reduce((sum, deal) => sum + (deal.payableToConsignor ?? 0), 0))]]
    : [['Vehicles', String(deals.length)], ['Brokerage paid out', formatInr(deals.reduce((sum, deal) => sum + deal.brokeragePayable, 0))], ['Brokerage earned', formatInr(deals.reduce((sum, deal) => sum + deal.brokerageReceivable, 0))]];

  const body = (
    <>
      <div className="grid gap-3 p-4 sm:grid-cols-4">
        {totals.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="text-base font-bold text-slate-900">{value}</p></div>)}
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !deals.length ? (
        <EmptyState
          title={consignment ? 'No consignment deals yet' : 'No vehicle brokerage yet'}
          description={consignment ? 'Mark a Sold Vehicle as consignment from its Deal terms tab: the vehicle is then not our stock and the owner is owed the sale price less our commission.' : 'Add brokerage paid to a broker, or earned from a party, on a vehicle’s Deal terms tab.'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className={tableHeadClass}>
              {consignment ? (
                <tr><th className="px-4 py-2.5">Vehicle</th><th className="px-4 py-2.5">Owner</th><th className="px-4 py-2.5">Purchaser</th><th className="px-4 py-2.5 text-right">Sale</th><th className="px-4 py-2.5 text-right">Commission</th><th className="px-4 py-2.5 text-right">Due to owner</th><th className="px-4 py-2.5">Status</th></tr>
              ) : (
                <tr><th className="px-4 py-2.5">Vehicle</th><th className="px-4 py-2.5">Broker</th><th className="px-4 py-2.5 text-right">We pay</th><th className="px-4 py-2.5">Earned from</th><th className="px-4 py-2.5 text-right">We earn</th><th className="px-4 py-2.5">Status</th></tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deals.map((deal) => (
                <tr key={deal.sellAccountId} onClick={() => setOpenId(deal.sellAccountId)} className="cursor-pointer hover:bg-amber-50/40">
                  <td className={`${cellClass} text-xs font-semibold`}>{deal.vehicle}</td>
                  {consignment ? (
                    <>
                      <td className={`${cellClass} text-xs`}>{deal.consignorName ?? '—'}</td>
                      <td className={`${cellClass} text-xs`}>{deal.purchaserName ?? '—'}</td>
                      <td className={`${cellClass} text-right`}>{formatInr(deal.sale)}</td>
                      <td className={`${cellClass} text-right`}>{formatInr(deal.commission)}</td>
                      <td className={`${cellClass} text-right font-semibold`}>{formatInr(deal.payableToConsignor)}</td>
                    </>
                  ) : (
                    <>
                      <td className={`${cellClass} text-xs`}>{deal.brokerName ?? '—'}</td>
                      <td className={`${cellClass} text-right`}>{deal.brokeragePayable ? formatInr(deal.brokeragePayable) : '—'}</td>
                      <td className={`${cellClass} text-xs`}>{deal.brokerageReceivable ? deal.brokerageReceivableFrom ?? '—' : '—'}</td>
                      <td className={`${cellClass} text-right`}>{deal.brokerageReceivable ? formatInr(deal.brokerageReceivable) : '—'}</td>
                    </>
                  )}
                  <td className={cellClass}><Badge>{enumLabel(deal.dealStatus)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {picking ? (
        <Modal title="Choose a Sold Vehicle" onClose={() => setPicking(false)}>
          <div className="p-5">
            <Field label="Vehicle"><SearchableSelect options={(vehicles.data ?? []).map((vehicle) => ({ id: vehicle.id, name: vehicle.label }))} value="" onChange={(option) => { setPicking(false); setOpenId(String(option.id)); }} placeholder="Search record number, vehicle number…" /></Field>
          </div>
        </Modal>
      ) : null}
      {openId ? (
        <Modal title={deals.find((deal) => deal.sellAccountId === openId)?.vehicle ?? 'Vehicle'} onClose={() => { setOpenId(null); setVersion((value) => value + 1); }} wide>
          <VehicleDetail vehicleId={openId} includeDrafts initialTab="terms" />
        </Modal>
      ) : null}
    </>
  );

  const action = canEdit ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>Set terms for a vehicle</Button> : null;
  return embedded ? <div><div className="flex justify-end px-4 pt-4">{action}</div>{body}</div> : (
    <Panel
      title={consignment ? 'Consignment deals' : 'Vehicle brokerage'}
      description={consignment ? 'Vehicles sold on behalf of their owner: our income is the commission; the rest is owed to the owner (settle from Partner Commission & Settlement).' : 'Brokerage paid to brokers and earned on vehicle deals.'}
      actions={action}
    >
      {body}
    </Panel>
  );
}
