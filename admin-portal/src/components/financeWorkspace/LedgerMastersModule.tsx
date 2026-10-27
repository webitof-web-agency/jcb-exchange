'use client';

import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorMessage, enumLabel, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { loadChart } from './ChartOfAccountsModule';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, inputClass, LoadingState, Panel, ReadOnlyNotice, tableHeadClass, Tabs } from './ui';
import { useResource } from './useResource';

type CategoryRow = { category: string; transactionCount: number; accountId: string | null };
type PaymentMethods = {
  accounts: Array<{ id: string; code: string; name: string; isActive: boolean }>;
  sources: Array<{ source: string; label: string; methods: Array<{ method: string; accountId: string | null; suggestedAccountId: string | null }> }>;
};

type TabKey = 'system' | 'categories' | 'payments';

const SYSTEM_ROLE_HELP: Record<string, string> = {
  VEHICLE_STOCK: 'Vehicle purchases (stock-in-trade)',
  DEBTORS_CONTROL: 'Customer receivables',
  CREDITORS_CONTROL: 'Seller / vendor payables',
  CUSTOMER_ADVANCES: 'Money received before a sale is booked',
  SELLER_ADVANCES: 'Money paid before a purchase is booked',
  VEHICLE_SALES_MARGIN: 'Used-vehicle sales under margin scheme',
  COGS_VEHICLES: 'Cost of vehicles sold',
  EXCHANGE_CLEARING: 'Vehicle exchange settlement',
  VEHICLE_EXPENSE_CLEARING: 'Sold Vehicles form expenses awaiting payment',
  SUSPENSE: 'Unclassified bank entries',
  OPENING_DIFFERENCE: 'Difference while entering opening balances',
};

export default function LedgerMastersModule() {
  const canManage = useFinanceWorkspaceAccess().can(['fh.settings.manage']);
  const [tab, setTab] = useState<TabKey>('system');
  const chart = useResource(loadChart, 'chart');
  const categories = useResource(async () => (await api.get('/finance-hub/category-map')).data.items as CategoryRow[], 'category-map');
  const payments = useResource(async () => (await api.get('/finance-hub/payment-method-map')).data as PaymentMethods, 'payment-method-map');
  const [categoryDraft, setCategoryDraft] = useState<Record<string, string>>({});
  const [paymentDraft, setPaymentDraft] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);

  const ledgerOptions = useMemo(
    () => (chart.data?.accounts ?? []).filter((account) => account.isActive).map((account) => ({ id: account.id, label: `${account.code} · ${account.name}` })),
    [chart.data],
  );
  const systemLedgers = useMemo(() => (chart.data?.accounts ?? []).filter((account) => account.systemKey).sort((a, b) => a.code.localeCompare(b.code)), [chart.data]);

  const saveCategories = async () => {
    setBusy(true);
    try {
      const items = Object.entries(categoryDraft).map(([category, accountId]) => ({ category, accountId: accountId || null }));
      await api.put('/finance-hub/category-map', { items });
      toast.success('Category mapping saved.');
      setCategoryDraft({});
      categories.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the mapping.'));
    } finally {
      setBusy(false);
    }
  };

  const savePayments = async () => {
    if (!payments.data) return;
    setBusy(true);
    try {
      const map = Object.fromEntries(payments.data.sources.map((source) => [
        source.source,
        Object.fromEntries(source.methods.map((method) => [method.method, paymentDraft[source.source]?.[method.method] ?? method.accountId ?? null])),
      ]));
      await api.put('/finance-hub/payment-method-map', { map });
      toast.success('Payment method mapping saved.');
      setPaymentDraft({});
      payments.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the mapping.'));
    } finally {
      setBusy(false);
    }
  };

  const failure = chart.error || (tab === 'categories' && categories.error) || (tab === 'payments' && payments.error);
  const schemaMissing = chart.schemaMissing || categories.schemaMissing || payments.schemaMissing;

  return (
    <Panel title="Account & ledger masters" description="How existing records will land in the books once automatic posting is switched on.">
      <Tabs<TabKey> tabs={[{ key: 'system', label: 'System ledgers' }, { key: 'categories', label: 'Expense categories' }, { key: 'payments', label: 'Payment methods' }]} active={tab} onChange={setTab} />
      {!canManage ? <ReadOnlyNotice>Changing mappings needs “Manage Finance Settings”.</ReadOnlyNotice> : null}
      {chart.loading ? <LoadingState /> : failure ? <ErrorBanner message={failure} schemaMissing={schemaMissing} /> : !chart.data?.installed ? (
        <EmptyState title="Install the chart of accounts first" description="Accounting & Books → Chart of Accounts → Install default chart." />
      ) : tab === 'system' ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Role</th><th className="px-3 py-2">Ledger</th><th className="px-3 py-2">Used for</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {systemLedgers.map((account) => (
                <tr key={account.id}>
                  <td className={`${cellClass} font-mono text-xs text-slate-500`}>{account.systemKey}</td>
                  <td className={`${cellClass} font-semibold text-slate-900`}>{account.code} · {account.name} {!account.allowManualPosting ? <Badge>Auto only</Badge> : null}</td>
                  <td className={`${cellClass} text-xs text-slate-500`}>{SYSTEM_ROLE_HELP[account.systemKey!] ?? enumLabel(account.systemKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === 'categories' ? (
        categories.loading ? <LoadingState /> : (
          <>
            <p className="px-4 pt-3 text-xs leading-5 text-slate-500">Each category on the existing Expenses & Transactions page maps to a ledger. “Book to ledger” uses this; unmapped categories are asked for at booking time.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className={tableHeadClass}><tr><th className="px-3 py-2">Category</th><th className="px-3 py-2">Transactions</th><th className="px-3 py-2">Ledger</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(categories.data ?? []).map((row) => (
                    <tr key={row.category}>
                      <td className={`${cellClass} font-semibold text-slate-900`}>{row.category}</td>
                      <td className={cellClass}>{row.transactionCount}</td>
                      <td className={cellClass}>
                        <select value={categoryDraft[row.category] ?? row.accountId ?? ''} disabled={!canManage} onChange={(event) => setCategoryDraft({ ...categoryDraft, [row.category]: event.target.value })} className={`${inputClass} py-2`}>
                          <option value="">Not mapped — ask when booking</option>
                          {ledgerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canManage ? <div className="flex justify-end border-t border-slate-100 p-3"><Button variant="primary" icon={<Save className="h-4 w-4" />} busy={busy} disabled={!Object.keys(categoryDraft).length} onClick={saveCategories}>Save mapping</Button></div> : null}
          </>
        )
      ) : payments.loading ? <LoadingState /> : (
        <>
          <p className="px-4 pt-3 text-xs leading-5 text-slate-500">Which bank, cash or gateway account each payment method lands in. Add bank accounts in Banking & Cash → Bank Accounts first. Bank reconciliation confirms the actual account later.</p>
          {!payments.data?.accounts.length ? <EmptyState title="No bank or cash accounts yet" description="Create them in Banking & Cash → Bank Accounts. Cash in Hand comes with the default chart." /> : (
            <div className="space-y-3 p-4">
              {payments.data.sources.map((source) => (
                <div key={source.source} className="rounded-lg border border-slate-200">
                  <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-800">{source.label}</p>
                  <div className="grid gap-3 p-3 md:grid-cols-2">
                    {source.methods.map((method) => {
                      const value = paymentDraft[source.source]?.[method.method] ?? method.accountId ?? '';
                      return (
                        <label key={method.method} className="flex items-center gap-3 text-[13px]">
                          <span className="w-36 shrink-0 font-semibold text-slate-700">{enumLabel(method.method)}</span>
                          <select value={value} disabled={!canManage} onChange={(event) => setPaymentDraft({ ...paymentDraft, [source.source]: { ...paymentDraft[source.source], [method.method]: event.target.value } })} className={`${inputClass} py-2`}>
                            <option value="">Not set{method.suggestedAccountId ? ' (suggested below)' : ''}</option>
                            {payments.data!.accounts.filter((account) => account.isActive).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.id === method.suggestedAccountId ? ' (suggested)' : ''}</option>)}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {canManage ? <div className="flex justify-end"><Button variant="primary" icon={<Save className="h-4 w-4" />} busy={busy} disabled={!Object.keys(paymentDraft).length} onClick={savePayments}>Save mapping</Button></div> : null}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
