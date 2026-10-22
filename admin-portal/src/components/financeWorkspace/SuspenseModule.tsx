'use client';

import { useState } from 'react';
import { useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import GeneralLedgerModule from './GeneralLedgerModule';
import { todayIso, useLedgerLookups } from './ledgerLookups';
import { Button } from './ui';
import VoucherForm, { type EditableVoucher } from './VoucherForm';

/**
 * Suspense ledger with a reclassify shortcut: a draft journal that moves an amount out of
 * Suspense into the right ledger. Bank-side corrections need a payment/receipt instead.
 */
export default function SuspenseModule() {
  const canManage = useFinanceWorkspaceAccess().can(['fh.books.manage']);
  const lookups = useLedgerLookups();
  const [draft, setDraft] = useState<EditableVoucher | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <>
      <GeneralLedgerModule
        key={reloadKey}
        fixedSystemKey="SUSPENSE"
        title="Suspense account"
        description="Amounts parked here are not yet classified (for example unexplained bank lines). Clear it to zero before closing the month."
        actions={(account) => (canManage && account ? (
          <Button variant="primary" onClick={() => setDraft({
            type: 'JOURNAL',
            date: todayIso(),
            narration: 'Reclassified from Suspense',
            reference: null,
            paymentMethod: null,
            lines: [
              { accountId: '', partyId: null, sellAccountId: null, costCentreId: null, debit: 0, credit: 0, narration: null },
              { accountId: account.id, partyId: null, sellAccountId: null, costCentreId: null, debit: 0, credit: 0, narration: null },
            ],
          })}>Reclassify</Button>
        ) : null)}
      />
      {draft && !lookups.loading ? (
        <VoucherForm lookups={lookups} initial={draft} allowedTypes={['JOURNAL']} defaultType="JOURNAL" onClose={() => setDraft(null)} onSaved={() => { setDraft(null); setReloadKey((value) => value + 1); }} />
      ) : null}
    </>
  );
}
