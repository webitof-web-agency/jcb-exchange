'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { formatInr } from '@/lib/financeWorkspaceClient';
import { drCr } from './GeneralLedgerModule';
import { Badge, EmptyState, ErrorBanner, LoadingState, Panel, tableHeadClass, Toggle } from './ui';
import { useResource } from './useResource';

type Response = {
  account: { code: string; name: string; normalBalance: 'DR' | 'CR' };
  total: number;
  balances: Array<{ partyId: string | null; partyName: string | null; partyMobile: string | null; sellAccountId: string | null; vehicle: string | null; entries: number; balance: number; ageDays: number | null }>;
};

/** Open balances on one system ledger, by party and vehicle (advances, deposits, clearing). */
export default function LedgerBalancesModule({ systemKey, title, description }: { systemKey: string; title: string; description: string }) {
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const data = useResource(async () => (await api.get('/finance-hub/ledger-balances', { params: { systemKey, includeDrafts: includeDrafts ? 'true' : undefined } })).data as Response, `balances-${systemKey}-${includeDrafts}`);

  return (
    <Panel title={title} description={description} actions={<Toggle checked={includeDrafts} onChange={setIncludeDrafts} label="Include automatic drafts" />}>
      {data.loading ? <LoadingState /> : data.error ? <ErrorBanner message={data.error} schemaMissing={data.schemaMissing} /> : !data.data?.balances.length ? (
        <EmptyState title="Nothing outstanding" description={`${data.data?.account.code ?? ''} ${data.data?.account.name ?? ''} has no open balance.`} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 px-4 pt-4 text-sm">
            <span className="text-slate-500">{data.data.account.code} · {data.data.account.name}</span>
            <Badge tone="amber">Total {drCr(data.data.total)}</Badge>
            <span className="text-xs text-slate-500">{data.data.balances.length} open balances</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Party</th><th className="px-4 py-2.5">Vehicle</th><th className="px-4 py-2.5 text-right">Entries</th><th className="px-4 py-2.5 text-right">Age (days)</th><th className="px-4 py-2.5 text-right">Balance</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.balances.map((row) => (
                  <tr key={`${row.partyId}-${row.sellAccountId}`}>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{row.partyName ?? '—'}<span className="block text-xs font-normal text-slate-500">{row.partyMobile ?? ''}</span></td>
                    <td className="px-4 py-2.5 text-xs">{row.vehicle ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">{row.entries}</td>
                    <td className="px-4 py-2.5 text-right"><span className={(row.ageDays ?? 0) > 30 ? 'font-semibold text-amber-700' : ''}>{row.ageDays ?? '—'}</span></td>
                    <td className="px-4 py-2.5 text-right font-semibold">{drCr(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold text-slate-900"><tr><td className="px-4 py-2.5" colSpan={4}>Total</td><td className="px-4 py-2.5 text-right">{formatInr(Math.abs(data.data.total))}</td></tr></tfoot>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
