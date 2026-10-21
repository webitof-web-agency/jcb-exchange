'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { EmptyState, Panel, Tabs } from './ui';
import VehicleRegisterModule from './VehicleRegisterModule';

type Tab = 'vehicle' | 'other';

/** Vehicle invoices from Sold Vehicles plus links to the existing listing and Prime invoice screens. */
export default function SalesInvoicesModule() {
  const pathname = usePathname();
  const prefix = pathname.startsWith('/superadmin') ? '/superadmin' : pathname.startsWith('/admin') ? '/admin' : '/employee';
  const [tab, setTab] = useState<Tab>('vehicle');
  return (
    <div className="space-y-4">
      <Panel>
        <Tabs<Tab> tabs={[{ key: 'vehicle', label: 'Vehicle invoices' }, { key: 'other', label: 'Listing & Prime invoices' }]} active={tab} onChange={setTab} />
      </Panel>
      {tab === 'vehicle' ? <VehicleRegisterModule view="invoices" /> : (
        <Panel title="Listing bills and Customer Prime invoices" description="These invoices are created and sent from their existing screens; nothing changes there.">
          <EmptyState
            title="Open the existing screens"
            description="Listing bills (non-tax / tax invoice) live with listing payment verification; Customer Prime invoices live in Recurrence. Manual service invoices (brokerage, commission) arrive with the next update."
            action={<div className="flex flex-wrap justify-center gap-3 text-sm font-semibold"><Link href={`${prefix}/invoices`} className="text-blue-700 hover:underline">Invoices →</Link>{prefix !== '/admin' ? <Link href={`${prefix}/recurrence`} className="text-blue-700 hover:underline">Recurrence (Prime) →</Link> : null}{prefix !== '/admin' ? <Link href={`${prefix}/listings`} className="text-blue-700 hover:underline">Listings &amp; bills →</Link> : null}</div>}
          />
        </Panel>
      )}
    </div>
  );
}
