'use client';

import { FormEvent, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { financeModulePath, financePortalPrefix } from '@/lib/financeWorkspace';
import { downloadTableFile } from '@/lib/tabularExport';
import { enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { Badge, Button, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Panel, tableHeadClass, Toggle } from './ui';
import { useResource } from './useResource';

type Row = { accountId: string; code: string; name: string; groupId: string; nature: string; openingDebit: number; openingCredit: number; periodDebit: number; periodCredit: number; closingDebit: number; closingCredit: number; note: string | null };
type Response = {
  from: string; to: string; rows: Row[]; difference: number; priorYearsProfitAndLoss: number; retainedEarningsMissing: boolean;
  totals: Record<'openingDebit' | 'openingCredit' | 'periodDebit' | 'periodCredit' | 'closingDebit' | 'closingCredit', number>;
  groups: Array<{ id: string; code: string; name: string; nature: string; parentId: string | null }>;
};

const NATURE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const amount = (value: number) => (value ? formatInr(value) : '');

export default function TrialBalanceModule() {
  const router = useRouter();
  const pathname = usePathname();
  const canExport = useFinanceWorkspaceAccess().can(['fh.reports.export', 'fh.export']);
  const [form, setForm] = useState({ from: '', to: '', includeZero: false });
  const [applied, setApplied] = useState(form);
  const tb = useResource(
    async () => (await api.get('/finance-hub/reports/trial-balance', { params: { from: applied.from || undefined, to: applied.to || undefined, includeZero: applied.includeZero ? 'true' : undefined } })).data as Response,
    `tb-${applied.from}-${applied.to}-${applied.includeZero}`,
  );

  const sections = useMemo(() => {
    if (!tb.data) return [];
    const groups = new Map(tb.data.groups.map((group) => [group.id, group]));
    return NATURE_ORDER.map((nature) => {
      const rows = tb.data!.rows.filter((row) => row.nature === nature);
      const byGroup = new Map<string, Row[]>();
      rows.forEach((row) => byGroup.set(row.groupId, [...(byGroup.get(row.groupId) ?? []), row]));
      return { nature, groups: Array.from(byGroup.entries()).map(([groupId, items]) => ({ group: groups.get(groupId), rows: items })).sort((a, b) => (a.group?.code ?? '').localeCompare(b.group?.code ?? '')) };
    }).filter((section) => section.groups.length);
  }, [tb.data]);

  const openLedger = (accountId: string) => {
    if (!tb.data) return;
    router.push(financeModulePath(financePortalPrefix(pathname), 'master-general-ledger', { accountId, from: tb.data.from, to: tb.data.to }));
  };

  const exportFile = (format: 'csv' | 'xls') => {
    if (!tb.data) return;
    downloadTableFile({
      fileName: `trial-balance-${tb.data.from}-to-${tb.data.to}`,
      format,
      rows: tb.data.rows,
      columns: [
        { header: 'Code', value: (row: Row) => row.code },
        { header: 'Ledger', value: (row: Row) => row.name },
        { header: 'Nature', value: (row: Row) => row.nature },
        { header: 'Opening Dr', value: (row: Row) => row.openingDebit },
        { header: 'Opening Cr', value: (row: Row) => row.openingCredit },
        { header: 'Period Dr', value: (row: Row) => row.periodDebit },
        { header: 'Period Cr', value: (row: Row) => row.periodCredit },
        { header: 'Closing Dr', value: (row: Row) => row.closingDebit },
        { header: 'Closing Cr', value: (row: Row) => row.closingCredit },
      ],
    });
  };

  const apply = (event: FormEvent) => { event.preventDefault(); setApplied(form); };
  const data = tb.data;

  return (
    <Panel
      title="Trial balance"
      description="Posted entries only. Opening + period debits − period credits = closing. Debit and credit totals must agree."
      actions={canExport && data ? <><Button onClick={() => exportFile('xls')}>Export Excel</Button><Button onClick={() => exportFile('csv')}>CSV</Button></> : null}
    >
      <form onSubmit={apply} className="grid gap-3 border-b border-slate-100 p-3 md:grid-cols-[160px_160px_auto_auto] md:items-end">
        <Field label="From" hint="Blank = start of the FY"><input type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To" hint="Blank = today"><input type="date" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} className={inputClass} /></Field>
        <div className="pb-2.5"><Toggle checked={form.includeZero} onChange={(value) => setForm({ ...form, includeZero: value })} label="Show ledgers with no balance" /></div>
        <Button type="submit" variant="primary">Show</Button>
      </form>

      {tb.loading ? <LoadingState /> : tb.error ? <ErrorBanner message={tb.error} schemaMissing={tb.schemaMissing} /> : !data?.rows.length ? (
        <EmptyState title="Nothing posted yet" description="Post vouchers or finalise opening balances to see the trial balance." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-3 pt-3 text-[13px]">
            <span className="text-slate-500">{formatDate(data.from)} – {formatDate(data.to)}</span>
            {data.difference === 0 ? <Badge tone="green">Balanced</Badge> : <Badge tone="red">Out by {formatInr(Math.abs(data.difference))}</Badge>}
            {data.priorYearsProfitAndLoss ? <span className="text-xs text-slate-500">Earlier years&apos; {data.priorYearsProfitAndLoss > 0 ? 'profit' : 'loss'} of {formatInr(Math.abs(data.priorYearsProfitAndLoss))} is shown on Retained Earnings until year closing.</span> : null}
            {data.retainedEarningsMissing ? <Badge tone="red">Retained Earnings ledger missing</Badge> : null}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead className={tableHeadClass}>
                <tr><th className="px-3 py-2" rowSpan={2}>Ledger</th><th className="px-3 py-1.5 text-center" colSpan={2}>Opening</th><th className="px-3 py-1.5 text-center" colSpan={2}>Period</th><th className="px-3 py-1.5 text-center" colSpan={2}>Closing</th></tr>
                <tr>{['Dr', 'Cr', 'Dr', 'Cr', 'Dr', 'Cr'].map((label, index) => <th key={index} className="px-3 py-1.5 text-right">{label}</th>)}</tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <SectionRows key={section.nature} nature={section.nature} groups={section.groups} onOpen={openLedger} />
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                <tr><td className="px-3 py-2">Total</td>{(['openingDebit', 'openingCredit', 'periodDebit', 'periodCredit', 'closingDebit', 'closingCredit'] as const).map((key) => <td key={key} className="px-3 py-2 text-right">{formatInr(data.totals[key])}</td>)}</tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

function SectionRows({ nature, groups, onOpen }: { nature: string; groups: Array<{ group: { code: string; name: string } | undefined; rows: Row[] }>; onOpen: (accountId: string) => void }) {
  return (
    <>
      <tr className="bg-slate-100"><td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600" colSpan={7}>{enumLabel(nature)}</td></tr>
      {groups.map(({ group, rows }) => (
        <GroupRows key={group?.code ?? 'none'} label={group ? `${group.code} · ${group.name}` : 'Other'} rows={rows} onOpen={onOpen} />
      ))}
    </>
  );
}

function GroupRows({ label, rows, onOpen }: { label: string; rows: Row[]; onOpen: (accountId: string) => void }) {
  return (
    <>
      <tr className="border-t border-slate-100"><td className="px-3 pb-1 pt-2.5 text-xs font-semibold text-slate-500" colSpan={7}>{label}</td></tr>
      {rows.map((row) => (
        <tr key={row.accountId} onClick={() => onOpen(row.accountId)} className="cursor-pointer hover:bg-amber-50/40">
          <td className="px-3 py-2 pl-8"><span className="font-mono text-xs text-slate-500">{row.code}</span> <span className="text-slate-900">{row.name}</span>{row.note ? <span className="block text-[11px] text-slate-400">{row.note}</span> : null}</td>
          <td className="px-3 py-2 text-right">{amount(row.openingDebit)}</td>
          <td className="px-3 py-2 text-right">{amount(row.openingCredit)}</td>
          <td className="px-3 py-2 text-right">{amount(row.periodDebit)}</td>
          <td className="px-3 py-2 text-right">{amount(row.periodCredit)}</td>
          <td className="px-3 py-2 text-right font-semibold">{amount(row.closingDebit)}</td>
          <td className="px-3 py-2 text-right font-semibold">{amount(row.closingCredit)}</td>
        </tr>
      ))}
    </>
  );
}
