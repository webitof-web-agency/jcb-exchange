'use client';

import { FormEvent, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorMessage, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { Button, ErrorBanner, Field, inputClass, LoadingState, ModalFooter, Panel, ReadOnlyNotice, Toggle } from './ui';
import PostingPanel from './PostingPanel';
import { useResource } from './useResource';

type Settings = {
  postingMode: 'OFF' | 'SHADOW' | 'LIVE';
  approval: { threshold: number | null; cashRequiresApproval: boolean };
  cashLimitPerVoucher: number | null;
  cashReceiptLimit: number | null;
  booksBeginDate: string | null;
};

export default function AutomationSettingsModule() {
  const canManage = useFinanceWorkspaceAccess().can(['fh.settings.manage']);
  const settings = useResource(async () => (await api.get('/finance-hub/settings')).data.settings as Settings, 'fh-settings');
  const [draft, setDraft] = useState<{ threshold: string; cash: boolean; cashLimit: string; receiptLimit: string; booksBegin: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const current = settings.data;
  const form = draft ?? (current ? {
    threshold: current.approval.threshold === null ? '' : String(current.approval.threshold),
    cash: current.approval.cashRequiresApproval,
    cashLimit: current.cashLimitPerVoucher === null ? '' : String(current.cashLimitPerVoucher),
    receiptLimit: current.cashReceiptLimit === null ? '' : String(current.cashReceiptLimit),
    booksBegin: current.booksBeginDate ?? '',
  } : null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      await api.put('/finance-hub/settings', {
        approvalThreshold: form.threshold || null,
        cashRequiresApproval: form.cash,
        cashLimitPerVoucher: form.cashLimit || null,
        cashReceiptLimit: form.receiptLimit || null,
        booksBeginDate: form.booksBegin || null,
        reason: 'Updated from Automation & Approval Rules',
      });
      toast.success('Settings saved.');
      setDraft(null);
      settings.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save settings.'));
    } finally {
      setBusy(false);
    }
  };

  if (settings.loading) return <Panel><LoadingState /></Panel>;
  if (settings.error || !form || !current) return <Panel><ErrorBanner message={settings.error || 'Settings unavailable.'} schemaMissing={settings.schemaMissing} /></Panel>;

  return (
    <div className="space-y-5">
      <Panel title="Voucher approvals (maker-checker)" description="When a posted voucher matches a rule it waits in Alerts & Pending Approvals until someone else with “Approve Finance Entries” approves it. Super admins may approve their own.">
        {!canManage ? <ReadOnlyNotice>Changing these needs “Manage Finance Settings”.</ReadOnlyNotice> : null}
        <form onSubmit={save} className="p-5 sm:p-7">
          <fieldset disabled={!canManage} className="grid gap-4 md:grid-cols-3">
            <Field label="Approval needed at or above (₹)" hint="Blank = no amount rule."><input type="number" min={0} step="0.01" value={form.threshold} onChange={(event) => setDraft({ ...form, threshold: event.target.value })} className={inputClass} /></Field>
            <div className="flex items-end pb-2.5 md:col-span-2"><Toggle checked={form.cash} onChange={(value) => setDraft({ ...form, cash: value })} label="Every voucher touching cash or petty cash needs approval" /></div>
            <Field label="Cash payment warning limit (₹)" hint="Sec 40A(3) — default ₹10,000 per party per day."><input type="number" min={0} step="0.01" value={form.cashLimit} onChange={(event) => setDraft({ ...form, cashLimit: event.target.value })} className={inputClass} /></Field>
            <Field label="Cash receipt limit (₹)" hint="Sec 269ST — default ₹2,00,000."><input type="number" min={0} step="0.01" value={form.receiptLimit} onChange={(event) => setDraft({ ...form, receiptLimit: event.target.value })} className={inputClass} /></Field>
            <Field label="Books begin on"><input type="date" value={form.booksBegin} onChange={(event) => setDraft({ ...form, booksBegin: event.target.value })} className={inputClass} /></Field>
          </fieldset>
          {canManage ? <ModalFooter><Button type="submit" variant="primary" busy={busy} icon={<Save className="h-4 w-4" />} disabled={!draft}>Save</Button></ModalFooter> : null}
        </form>
      </Panel>
      <PostingPanel />
    </div>
  );
}
