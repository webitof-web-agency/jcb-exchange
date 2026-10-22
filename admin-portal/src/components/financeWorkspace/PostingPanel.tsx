'use client';

import { FormEvent, useState } from 'react';
import { Eye, Play, RotateCcw } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { apiErrorMessage, enumLabel, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { Badge, Button, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, tableHeadClass, Toggle } from './ui';
import { useResource } from './useResource';

type Mode = 'OFF' | 'SHADOW' | 'LIVE';
type Source = 'SELL_ACCOUNT' | 'LISTING_PAYMENT' | 'CUSTOMER_PRIME' | 'PARTNER_DEPOSIT' | 'API_WALLET' | 'FINANCE_TRANSACTION';
type Status = {
  postingMode: Mode;
  config: { sources: Record<Source, boolean>; capitaliseVehicleCosts: boolean };
  state: { lastSweepAt: string | null; lastRunAt: string | null; lastRunSummary: Record<string, number | string> | null };
  queue: { counts: Record<string, number>; failing: Array<{ id: string; sourceType: string; sourceId: string; status: string; attempts: number; lastError: string | null; nextRunAt: string }> };
  autoDrafts: number;
  autoPosted: number;
};
type Preview = { report: Array<{ sourceType: string; sampled: number; records: Array<{ sourceId: string; ok: boolean; error?: string; created?: number; vouchers?: Array<{ key: string; type: string; date: string; total: number; lines: Array<{ account: string; debit: number; credit: number }> }> }> }> };

const SOURCE_LABELS: Record<Source, string> = {
  SELL_ACCOUNT: 'Sold Vehicles (purchase, costs, sale with GST, receipts, seller payments, exchange)',
  LISTING_PAYMENT: 'Listing payments (approved / paid) → customer advances',
  CUSTOMER_PRIME: 'Customer Prime subscriptions → subscription income + GST',
  PARTNER_DEPOSIT: 'Partner security deposits (received and refunded)',
  API_WALLET: 'Verification API wallet (recharges and daily usage)',
  FINANCE_TRANSACTION: 'Expenses page manual entries (category → ledger, account → bank/cash). Off by default: switch on only if those entries are not also recorded elsewhere',
};
const MODE_HELP: Record<Mode, string> = {
  OFF: 'Nothing is posted. Existing screens work as before.',
  SHADOW: 'Vouchers are created as drafts only, so the accountant / CA can review them before anything reaches the books.',
  LIVE: 'Vouchers are posted. Later changes to a source record reverse and re-post the affected vouchers automatically.',
};
const modeTone = { OFF: 'slate', SHADOW: 'amber', LIVE: 'green' } as const;
const when = (value: string | null) => (value ? new Date(value).toLocaleString('en-IN') : 'never');

export default function PostingPanel() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.settings.manage']);
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'SUPER_ADMIN');
  const status = useResource(async () => (await api.get('/finance-hub/posting/status')).data as Status, 'posting-status');
  const [busy, setBusy] = useState(false);
  const [modeChange, setModeChange] = useState<Mode | null>(null);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);

  const call = async (label: string, request: () => Promise<{ data: Record<string, unknown> }>) => {
    setBusy(true);
    try {
      const result = (await request()).data;
      toast.success(label);
      status.reload();
      return result;
    } catch (error) {
      toast.error(apiErrorMessage(error, `${label} failed.`));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = (patch: Partial<Status['config']>) => call('Posting settings saved.', () => api.put('/finance-hub/posting/settings', patch));

  const confirmMode = async (event: FormEvent) => {
    event.preventDefault();
    if (!modeChange) return;
    const result = await call(`Posting mode is now ${modeChange}.`, () => api.put('/finance-hub/posting/settings', { postingMode: modeChange, reason }));
    if (result) { setModeChange(null); setReason(''); }
  };

  const runPreview = async () => {
    setBusy(true);
    try {
      setPreview((await api.post('/finance-hub/posting/preview', { limit: 10 })).data as Preview);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Preview failed.'));
    } finally {
      setBusy(false);
    }
  };

  if (status.loading) return <Panel><LoadingState /></Panel>;
  if (status.error || !status.data) return <Panel><ErrorBanner message={status.error || 'Posting status unavailable.'} schemaMissing={status.schemaMissing} /></Panel>;
  const data = status.data;
  const summary = data.state.lastRunSummary;

  return (
    <Panel
      title="Automatic posting"
      description="Turns existing records into vouchers without changing them. A background job checks for new or changed records every minute; the first run after switching on processes all history (from the books begin date)."
      actions={canManage ? (
        <>
          <Button icon={<Eye className="h-4 w-4" />} busy={busy && !modeChange} onClick={runPreview}>Preview</Button>
          {data.postingMode !== 'OFF' ? <Button icon={<Play className="h-4 w-4" />} disabled={busy} onClick={() => call('Posting run finished.', () => api.post('/finance-hub/posting/run', {}))}>Run now</Button> : null}
        </>
      ) : null}
    >
      {!canManage ? <ReadOnlyNotice>Changing posting needs “Manage Finance Settings”.</ReadOnlyNotice> : null}
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mode</p>
          <div className="flex flex-wrap gap-2">
            {(['OFF', 'SHADOW', 'LIVE'] as Mode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={!isSuperAdmin || mode === data.postingMode || busy}
                onClick={() => { setReason(''); setModeChange(mode); }}
                className={`rounded-xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed ${mode === data.postingMode ? 'border-amber-300 bg-amber-50 text-slate-900 ring-1 ring-amber-200' : 'border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50'}`}
              >
                {mode}
              </button>
            ))}
          </div>
          <p className="text-xs leading-5 text-slate-600"><Badge tone={modeTone[data.postingMode]}>{data.postingMode}</Badge> {MODE_HELP[data.postingMode]}</p>
          {!isSuperAdmin ? <p className="text-[11px] text-slate-400">Only a super admin can change the mode.</p> : null}

          <p className="pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">What to post</p>
          <div className="space-y-2">
            {(Object.keys(SOURCE_LABELS) as Source[]).map((source) => (
              <Toggle key={source} checked={data.config.sources[source]} disabled={!canManage || busy} onChange={(value) => saveConfig({ sources: { ...data.config.sources, [source]: value } })} label={SOURCE_LABELS[source]} />
            ))}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <Toggle checked={data.config.capitaliseVehicleCosts} disabled={!canManage || busy} onChange={(value) => saveConfig({ capitaliseVehicleCosts: value })} label="Add Sold Vehicle form costs (transport, paperwork, RTO, other) to the vehicle's stock cost" />
            <p className="mt-1 pl-6 text-[11px] text-slate-400">Off = book them as direct vehicle expenses instead. Changing this re-posts affected vehicles.</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[['Automatic drafts', data.autoDrafts], ['Automatic posted', data.autoPosted], ['Queue waiting', data.queue.counts.PENDING ?? 0], ['Failed', data.queue.counts.FAILED ?? 0]].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="text-lg font-bold text-slate-900">{value}</p></div>
            ))}
          </div>
          <p className="text-xs text-slate-500">Last run: {when(data.state.lastRunAt)}{summary ? ` · checked ${summary.swept ?? 0} changed records, created ${summary.created ?? 0}, reversed ${summary.reversed ?? 0}, posted ${summary.posted ?? 0}, failed ${summary.failed ?? 0}` : ''}</p>
        </div>
      </div>

      {data.queue.failing.length ? (
        <div className="border-t border-slate-100">
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-sm font-bold text-slate-800">Needs attention</p>
            {canManage ? <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} disabled={busy} onClick={() => call('Failed items queued again.', () => api.post('/finance-hub/posting/queue/retry-failed'))}>Retry all failed</Button> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-4 py-2">Source</th><th className="px-4 py-2">Problem</th><th className="px-4 py-2">Tries</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.queue.failing.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 text-xs">{enumLabel(item.sourceType)}<span className="block font-mono text-[11px] text-slate-400">{item.sourceId.slice(0, 12)}</span></td>
                    <td className="max-w-[420px] px-4 py-2 text-xs text-red-700">{item.lastError}</td>
                    <td className="px-4 py-2 text-xs">{item.attempts}</td>
                    <td className="px-4 py-2"><Badge tone={item.status === 'FAILED' ? 'red' : 'amber'}>{item.status === 'FAILED' ? 'Failed' : 'Will retry'}</Badge></td>
                    <td className="px-4 py-2 text-right">{canManage ? <Button variant="ghost" disabled={busy} onClick={() => call('Queued again.', () => api.post(`/finance-hub/posting/queue/${item.id}/retry`))}>Retry</Button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {modeChange ? (
        <Modal title={`Switch automatic posting to ${modeChange}`} subtitle={MODE_HELP[modeChange]} onClose={() => { if (!busy) setModeChange(null); }}>
          <form onSubmit={confirmMode} className="space-y-4 p-5 sm:p-7">
            {modeChange !== 'OFF' && !data.state.lastSweepAt ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">First run: every existing record from the books begin date will be processed. Run Preview first and make sure bank accounts and payment methods are mapped.</p> : null}
            {modeChange === 'LIVE' && data.autoDrafts ? <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">{data.autoDrafts} automatic drafts will be posted on the next run.</p> : null}
            <Field label={modeChange === 'LIVE' ? 'Reason *' : 'Reason'}><textarea value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} min-h-20`} maxLength={500} required={modeChange === 'LIVE'} placeholder="e.g. CA reviewed the shadow drafts for October" /></Field>
            <ModalFooter><Button onClick={() => setModeChange(null)} disabled={busy}>Cancel</Button><Button type="submit" variant={modeChange === 'LIVE' ? 'primary' : 'secondary'} busy={busy}>Switch to {modeChange}</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}

      {preview ? (
        <Modal title="Posting preview" subtitle="Dry run on the latest records of each source. Nothing was saved." onClose={() => setPreview(null)} wide>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5 sm:p-7">
            {preview.report.map((source) => (
              <div key={source.sourceType} className="rounded-xl border border-slate-200">
                <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-800">{enumLabel(source.sourceType)} · {source.sampled} record(s)</p>
                {source.records.length ? source.records.map((record) => (
                  <div key={record.sourceId} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
                    {!record.ok ? <p className="text-xs text-red-700">{record.sourceId.slice(0, 12)}: {record.error}</p> : record.vouchers?.length ? record.vouchers.map((voucher) => (
                      <div key={voucher.key} className="mb-2 text-xs">
                        <p className="font-semibold text-slate-800">{enumLabel(voucher.type)} · {voucher.date} · {formatInr(voucher.total)} <span className="font-mono text-slate-400">{voucher.key}</span></p>
                        <div className="mt-1 grid gap-0.5 pl-3 text-slate-600">
                          {voucher.lines.map((line, index) => <p key={index}>{line.debit ? `Dr ${line.account} ${formatInr(line.debit)}` : `    Cr ${line.account} ${formatInr(line.credit)}`}</p>)}
                        </div>
                      </div>
                    )) : <p className="text-xs text-slate-400">{record.sourceId.slice(0, 12)}: nothing to post (draft, unpaid, before books begin, or not money).</p>}
                  </div>
                )) : <p className="px-4 py-3 text-xs text-slate-400">No records.</p>}
              </div>
            ))}
          </div>
          <div className="px-5 pb-5 sm:px-7"><ModalFooter><Button onClick={() => setPreview(null)}>Close</Button></ModalFooter></div>
        </Modal>
      ) : null}
    </Panel>
  );
}
