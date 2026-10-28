'use client';

import { FormEvent, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import api from '@/lib/api';
import { downloadTableFile } from '@/lib/tabularExport';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { enumLabel, formatDate, formatInr, useUrlFilters } from '@/lib/financeWorkspaceClient';
import { optionalChoices, useLedgerLookups } from './ledgerLookups';
import { Badge, Button, DatePresets, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Panel, selectButtonClass, tableHeadClass } from './ui';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

type LedgerResponse = {
  account: { id: string; code: string; name: string; nature: string; group: string; normalBalance: 'DR' | 'CR'; systemKey: string | null };
  from: string; to: string; truncated: boolean; opening: number; closing: number; totalDebit: number; totalCredit: number;
  rows: Array<{ id: string; date: string; voucherId: string; voucherNumber: string | null; voucherType: string; narration: string; lineNarration: string | null; partyName: string | null; debit: number; credit: number; balance: number }>;
};

export const drCr = (value: number) => (value === 0 ? formatInr(0) : `${formatInr(Math.abs(value))} ${value > 0 ? 'Dr' : 'Cr'}`);

const fyStartIso = () => {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
};

/** Account ledger. `fixedSystemKey` pins it to one system ledger (used by the Suspense screen). */
export default function GeneralLedgerModule({ fixedSystemKey, accountKinds, title = 'General ledger', description, actions }: {
  fixedSystemKey?: string;
  /** Limit the ledger picker to these account kinds (e.g. cash book). */
  accountKinds?: string[];
  title?: string;
  description?: string;
  actions?: (account: LedgerResponse['account'] | null, reload: () => void) => React.ReactNode;
}) {
  const lookups = useLedgerLookups();
  const fixedAccount = fixedSystemKey ? lookups.accounts.find((account) => account.systemKey === fixedSystemKey) : undefined;
  // Kept in the URL: Trial Balance drill-down, reload and shared links open the same ledger and period.
  const [applied, setApplied] = useUrlFilters({ accountId: '', partyId: '', from: fyStartIso(), to: '' });
  const [form, setForm] = useState(applied);
  const [openId, setOpenId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const accountId = fixedAccount?.id ?? applied.accountId;

  const ledger = useResource(
    async () => (accountId ? ((await api.get('/finance-hub/reports/general-ledger', { params: { accountId, partyId: applied.partyId || undefined, from: applied.from || undefined, to: applied.to || undefined } })).data as LedgerResponse) : null),
    `gl-${accountId}-${applied.partyId}-${applied.from}-${applied.to}-${version}`,
  );
  const accountOptions = useMemo(() => lookups.accounts.filter((account) => !accountKinds || accountKinds.includes(account.kind)).map(lookups.accountOption), [accountKinds, lookups]);

  const apply = (event: FormEvent) => { event.preventDefault(); setApplied(form); };
  const data = ledger.data;
  const exportCsv = () => {
    if (!data) return;
    const rows = [
      { date: data.from, voucher: '', type: '', particulars: 'Opening balance', party: '', debit: '', credit: '', balance: drCr(data.opening) },
      ...data.rows.map((row) => ({ date: row.date, voucher: row.voucherNumber ?? '', type: enumLabel(row.voucherType), particulars: [row.narration, row.lineNarration].filter(Boolean).join(' — '), party: row.partyName ?? '', debit: row.debit || '', credit: row.credit || '', balance: drCr(row.balance) })),
      { date: data.to, voucher: '', type: '', particulars: 'Total / closing', party: '', debit: data.totalDebit, credit: data.totalCredit, balance: drCr(data.closing) },
    ];
    type Line = (typeof rows)[number];
    downloadTableFile({
      columns: [
        { header: 'Date', value: (row: Line) => formatDate(row.date) },
        { header: 'Voucher', value: (row: Line) => row.voucher },
        { header: 'Type', value: (row: Line) => row.type },
        { header: 'Particulars', value: (row: Line) => row.particulars },
        { header: 'Party', value: (row: Line) => row.party },
        { header: 'Debit', value: (row: Line) => row.debit },
        { header: 'Credit', value: (row: Line) => row.credit },
        { header: 'Balance', value: (row: Line) => row.balance },
      ],
      rows,
      fileName: `ledger-${data.account.code}-${data.from}-to-${data.to}`,
      format: 'csv',
    });
  };

  return (
    <Panel
      title={title}
      description={description ?? 'Every posted entry on one ledger with a running balance. Balance-sheet ledgers carry their balance across years; income and expense ledgers start each year at zero.'}
      actions={(
        <>
          {data ? <Button icon={<FileSpreadsheet />} onClick={exportCsv}>Export CSV</Button> : null}
          {actions ? actions(data?.account ?? null, () => setVersion((value) => value + 1)) : null}
        </>
      )}
    >
      <form onSubmit={apply} className="grid gap-3 border-b border-slate-100 p-3 md:grid-cols-[2fr_1.5fr_150px_150px_auto] md:items-end">
        {fixedSystemKey ? <Field label="Ledger"><p className="py-2 text-[13px] font-semibold text-slate-900">{fixedAccount ? `${fixedAccount.code} · ${fixedAccount.name}` : 'Not installed'}</p></Field> : (
          <Field label="Ledger *"><SearchableSelect buttonClassName={selectButtonClass} options={accountOptions} value={form.accountId} onChange={(option) => setForm({ ...form, accountId: String(option.id) })} placeholder="Choose ledger" /></Field>
        )}
        <Field label="Party"><SearchableSelect buttonClassName={selectButtonClass} options={optionalChoices(lookups.partyOptions, form.partyId)} value={form.partyId} onChange={(option) => setForm({ ...form, partyId: String(option.id) })} placeholder="All parties" /></Field>
        <Field label="From"><input type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To"><input type="date" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} className={inputClass} /></Field>
        <Button type="submit" variant="primary">Show</Button>
        <div className="md:col-span-5"><DatePresets from={form.from} to={form.to} onSelect={(range) => { const next = { ...form, ...range }; setForm(next); setApplied(next); }} /></div>
      </form>

      {lookups.loading || ledger.loading ? <LoadingState /> : ledger.error ? <ErrorBanner message={ledger.error} schemaMissing={ledger.schemaMissing} /> : !data ? (
        <EmptyState title="Choose a ledger" description="Pick any ledger to see its entries, or open one from the Trial Balance." />
      ) : (
        <>
          <div className="grid gap-3 p-3 sm:grid-cols-4">
            {[['Opening', drCr(data.opening)], ['Debits', formatInr(data.totalDebit)], ['Credits', formatInr(data.totalCredit)], ['Closing', drCr(data.closing)]].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="text-[15px] font-semibold text-slate-900">{value}</p></div>
            ))}
          </div>
          <p className="px-3 text-xs text-slate-500">{data.account.code} · {data.account.name} · {data.account.group} · {formatDate(data.from)} – {formatDate(data.to)} {data.truncated ? <Badge tone="amber">Showing first 5000 entries — narrow the dates</Badge> : null}</p>
          {data.rows.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[13px]">
                <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Voucher</th><th className="px-3 py-2">Particulars</th><th className="px-3 py-2">Party</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50/60 text-xs text-slate-500"><td className="px-3 py-2" colSpan={6}>Opening balance</td><td className="px-3 py-2 text-right font-semibold">{drCr(data.opening)}</td></tr>
                  {data.rows.map((row) => (
                    <tr key={row.id} onClick={() => setOpenId(row.voucherId)} className="cursor-pointer hover:bg-amber-50/40">
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(row.date)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.voucherNumber}<span className="block font-sans text-[11px] text-slate-400">{enumLabel(row.voucherType)}</span></td>
                      <td className="max-w-[320px] px-3 py-2"><span className="line-clamp-2">{row.narration}</span>{row.lineNarration ? <span className="block text-xs text-slate-500">{row.lineNarration}</span> : null}</td>
                      <td className="px-3 py-2 text-xs">{row.partyName ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{row.debit ? formatInr(row.debit) : ''}</td>
                      <td className="px-3 py-2 text-right">{row.credit ? formatInr(row.credit) : ''}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{drCr(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-900"><tr><td className="px-3 py-2" colSpan={4}>Total / closing</td><td className="px-3 py-2 text-right">{formatInr(data.totalDebit)}</td><td className="px-3 py-2 text-right">{formatInr(data.totalCredit)}</td><td className="px-3 py-2 text-right">{drCr(data.closing)}</td></tr></tfoot>
              </table>
            </div>
          ) : <EmptyState title="No entries in this period" />}
        </>
      )}

      {openId ? <VoucherDetail key={openId} voucherId={openId} onClose={() => setOpenId(null)} onChanged={() => setVersion((value) => value + 1)} onOpen={setOpenId} onEdit={() => setOpenId(null)} /> : null}
    </Panel>
  );
}
