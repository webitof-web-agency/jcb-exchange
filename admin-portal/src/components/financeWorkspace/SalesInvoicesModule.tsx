'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import DocumentsModule from './DocumentsModule';
import { EmptyState, Panel, Tabs } from './ui';
import VehicleRegisterModule from './VehicleRegisterModule';

type Tab = 'vehicle' | 'manual' | 'other';

/** Vehicle invoices from Sold Vehicles plus links to the existing listing and Prime invoice screens. */
export default function SalesInvoicesModule() {
  const pathname = usePathname();
  const prefix = pathname.startsWith('/admin') ? '/admin' : '/employee';
  const [tab, setTab] = useState<Tab>('vehicle');
  return (
    <div className="space-y-3">
      <Panel>
        <Tabs<Tab> tabs={[{ key: 'vehicle', label: 'Vehicle invoices' }, { key: 'manual', label: 'Other invoices' }, { key: 'other', label: 'Listing & Prime invoices' }]} active={tab} onChange={setTab} />
      </Panel>
      {tab === 'vehicle' ? <VehicleRegisterModule view="invoices" /> : tab === 'manual' ? (
        <DocumentsModule title="Other sales invoices" description="Service, brokerage and commission invoices entered here (not vehicles, listings or Prime)." types={['SALES_INVOICE']} createTypes={['SALES_INVOICE']} />
      ) : (
        <Panel title="Listing bills and Customer Prime invoices" description="These invoices are created and sent from their existing screens; nothing changes there.">
          <EmptyState
            title="Open the existing screens"
            description="Listing bills (non-tax / tax invoice) live with listing payment verification; Customer Prime invoices live in Recurrence. Manual service invoices are on the “Other invoices” tab."
            action={<div className="flex flex-wrap justify-center gap-3 text-[13px] font-semibold"><Link href={`${prefix}/invoices`} className="text-blue-700 hover:underline">Invoices →</Link><Link href={`${prefix}/recurrence`} className="text-blue-700 hover:underline">Recurrence (Prime) →</Link><Link href={`${prefix}/listings`} className="text-blue-700 hover:underline">Listings &amp; bills →</Link></div>}
          />
        </Panel>
      )}
    </div>
  );
}
