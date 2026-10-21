'use client';

import { useState } from 'react';
import DealTermsListModule from './DealTermsListModule';
import DocumentsModule from './DocumentsModule';
import { Panel, Tabs } from './ui';

type Tab = 'vehicle' | 'invoices';

/** Brokerage on vehicle deals plus service / commission invoices not tied to a vehicle sale. */
export default function BrokerageIncomeModule() {
  const [tab, setTab] = useState<Tab>('vehicle');
  return (
    <Panel title="Brokerage & other income" description="Brokerage earned or paid on vehicle deals, and other income invoiced from here (service fees, commission).">
      <Tabs<Tab> tabs={[{ key: 'vehicle', label: 'Vehicle brokerage' }, { key: 'invoices', label: 'Other income invoices' }]} active={tab} onChange={setTab} />
      {tab === 'vehicle' ? <DealTermsListModule kind="brokerage" embedded /> : (
        <DocumentsModule embedded title="Other income invoices" description="Tax invoices for services and commission. Choose an income ledger on each line." types={['SALES_INVOICE']} createTypes={['SALES_INVOICE']} />
      )}
    </Panel>
  );
}
