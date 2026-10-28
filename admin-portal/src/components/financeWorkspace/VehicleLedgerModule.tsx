'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { EmptyState, ErrorBanner, Field, LoadingState, Panel, selectButtonClass, Toggle } from './ui';
import { useResource } from './useResource';
import VehicleDetail from './VehicleDetail';

/** Pick one vehicle and see its complete finance file: cost sheet, ledger and payments. */
export default function VehicleLedgerModule() {
  const searchParams = useSearchParams();
  const vehicles = useResource(async () => (await api.get('/finance-hub/vehicles', { params: { limit: 500 } })).data.vehicles as Array<{ id: string; label: string }>, 'vehicle-ledger-list');
  const [vehicleId, setVehicleId] = useState(searchParams.get('vehicleId') ?? '');
  const [includeDrafts, setIncludeDrafts] = useState(false);

  return (
    <Panel title="Vehicle-wise ledger" description="Every book entry tagged to one vehicle, its cost sheet, and how the books compare with the Sold Vehicle record.">
      <div className="grid gap-3 border-b border-slate-100 p-3 md:grid-cols-[2fr_auto] md:items-end">
        <Field label="Vehicle">
          {vehicles.loading ? <LoadingState label="Loading vehicles…" /> : vehicles.error ? <ErrorBanner message={vehicles.error} schemaMissing={vehicles.schemaMissing} /> : (
            <SearchableSelect buttonClassName={selectButtonClass} options={(vehicles.data ?? []).map((vehicle) => ({ id: vehicle.id, name: vehicle.label }))} value={vehicleId} onChange={(option) => setVehicleId(String(option.id))} placeholder="Search record no., vehicle no. or model" />
          )}
        </Field>
        <div className="pb-2.5"><Toggle checked={includeDrafts} onChange={setIncludeDrafts} label="Include automatic drafts" /></div>
      </div>
      {vehicleId ? <VehicleDetail key={`${vehicleId}-${includeDrafts}`} vehicleId={vehicleId} includeDrafts={includeDrafts} initialTab="ledger" /> : <EmptyState title="Choose a vehicle" description="Or open one from Vehicle Purchase List, Stock Valuation or Profit & Margin." />}
    </Panel>
  );
}
