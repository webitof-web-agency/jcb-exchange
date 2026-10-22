'use client';

import { useState } from 'react';
import DocumentsModule from './DocumentsModule';
import { Panel, Tabs } from './ui';

type Tab = 'credit' | 'debit';

/** Credit notes (to customers) and debit notes (to suppliers) for every reason. */
export default function NotesModule() {
  const [tab, setTab] = useState<Tab>('credit');
  return (
    <Panel title="Credit / debit notes" description="Corrections after an invoice or bill: returns, price changes, discounts and deficiencies. Link the original document so GST returns pick up the note.">
      <Tabs<Tab> tabs={[{ key: 'credit', label: 'Credit notes (customers)' }, { key: 'debit', label: 'Debit notes (suppliers)' }]} active={tab} onChange={setTab} />
      {tab === 'credit' ? (
        <DocumentsModule key="credit" embedded title="Credit notes" description="Reduce what a customer owes us and the output GST." types={['CREDIT_NOTE']} createTypes={['CREDIT_NOTE']} />
      ) : (
        <DocumentsModule key="debit" embedded title="Debit notes" description="Reduce what we owe a supplier and the input GST." types={['DEBIT_NOTE']} createTypes={['DEBIT_NOTE']} />
      )}
    </Panel>
  );
}
