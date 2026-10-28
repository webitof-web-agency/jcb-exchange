'use client';

import { FormEvent, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { downloadTableFile } from '@/lib/tabularExport';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { isCashBank, toPaise, todayIso, useLedgerLookups } from './ledgerLookups';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, selectButtonClass, tableHeadClass, Tabs } from './ui';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

type OpenItem = { accountId: string; accountName: string; systemKey: string; sellAccountId: string | null; vehicle: string | null; balance: number };
type OpenParty = { party: { id: string; code: string; name: string; pan: string | null; tdsSection: string | null }; total: number; items: OpenItem[] };
type Settlement = { id: string; party: { code: string; name: string }; status: 'DRAFT' | 'PAID' | 'CANCELLED'; date: string; grossAmount: number; tdsAmount: number; tdsSection: string | null; netAmount: number; reference: string | null; voucherId: string | null; voucherNumber: string | null; notes: string | null; cancelReason: string | null };

const KIND_LABEL: Record<string, string> = { PARTNER_PAYABLES: 'Partner share', BROKER_PAYABLES: 'Brokerage', CONSIGNMENT_PAYABLE: 'Consignment proceeds' };
const statusTone = { DRAFT: 'slate', PAID: 'green', CANCELLED: 'red' } as const;
const PAYMENT_METHODS = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE', 'CASH', 'BANK_TRANSFER'];

type Tab = 'open' | 'history';

/** What we owe partners, brokers and consignors (from posted entries) and the payouts against it. */
export default function SettlementsModule() {
  const access = useFinanceWorkspaceAccess();
  const canCreate = access.can(['fh.vehicle.manage', 'fh.arap.manage']);
  const canPay = access.can(['fh.books.post']);
  const [tab, setTab] = useState<Tab>('open');
  const [version, setVersion] = useState(0);
  const open = useResource(async () => (await api.get('/finance-hub/settlements/payables')).data.parties as OpenParty[], `settlement-open-${version}`);
  const history = useResource(async () => (await api.get('/finance-hub/settlements')).data.settlements as Settlement[], `settlement-history-${version}`);
  const [settling, setSettling] = useState<OpenParty | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const refresh = () => setVersion((value) => value + 1);

  const act = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const drafts = (history.data ?? []).filter((item) => item.status === 'DRAFT').length;
  const today = todayIso();
  const exportCsv = () => {
    if (tab === 'open') {
      const rows = (open.data ?? []).flatMap((entry) => entry.items.map((item) => ({ entry, item })));
      type Line = (typeof rows)[number];
      downloadTableFile({
        columns: [
          { header: 'Party code', value: (row: Line) => row.entry.party.code },
          { header: 'Party', value: (row: Line) => row.entry.party.name },
          { header: 'PAN', value: (row: Line) => row.entry.party.pan ?? '' },
          { header: 'TDS section', value: (row: Line) => row.entry.party.tdsSection ?? '' },
          { header: 'Kind', value: (row: Line) => KIND_LABEL[row.item.systemKey] ?? row.item.accountName },
          { header: 'Vehicle', value: (row: Line) => row.item.vehicle ?? '' },
          { header: 'Owed', value: (row: Line) => row.item.balance },
        ],
        rows,
        fileName: `settlements-owed-${today}`,
        format: 'csv',
      });
      return;
    }
    downloadTableFile({
      columns: [
        { header: 'Date', value: (row: Settlement) => formatDate(row.date) },
        { header: 'Party code', value: (row: Settlement) => row.party.code },
        { header: 'Party', value: (row: Settlement) => row.party.name },
        { header: 'Gross', value: (row: Settlement) => row.grossAmount },
        { header: 'TDS', value: (row: Settlement) => row.tdsAmount },
        { header: 'TDS section', value: (row: Settlement) => row.tdsSection ?? '' },
        { header: 'Paid', value: (row: Settlement) => row.netAmount },
        { header: 'Reference', value: (row: Settlement) => row.reference ?? '' },
        { header: 'Status', value: (row: Settlement) => enumLabel(row.status) },
        { header: 'Voucher', value: (row: Settlement) => row.voucherNumber ?? '' },
      ],
      rows: history.data ?? [],
      fileName: `settlements-history-${today}`,
      format: 'csv',
    });
  };
  const exportable = tab === 'open' ? Boolean(open.data?.length) : Boolean(history.data?.length);

  return (
    <Panel title="Partner commission & settlement" description="Partner profit share, brokerage and consignment proceeds owed (from posted ledger entries), and the payouts made against them." actions={exportable ? <Button icon={<FileSpreadsheet />} onClick={exportCsv}>Export CSV</Button> : null}>
      <ReadOnlyNotice>Only posted entries count. While automatic posting is in shadow mode the vehicle entries are drafts, so nothing shows here until they are posted (or posting goes live).</ReadOnlyNotice>
      <Tabs<Tab> tabs={[{ key: 'open', label: `Owed now${open.data?.length ? ` (${open.data.length})` : ''}` }, { key: 'history', label: `Settlements${drafts ? ` · ${drafts} draft` : ''}` }]} active={tab} onChange={setTab} />
      {tab === 'open' ? (
        open.loading ? <LoadingState /> : open.error ? <ErrorBanner message={open.error} schemaMissing={open.schemaMissing} /> : !open.data?.length ? (
          <EmptyState title="Nothing owed" description="Brokerage, partner share and consignment amounts appear here once their vouchers are posted." />
        ) : (
          <div className="space-y-3 p-3">
            {open.data.map((entry) => (
              <div key={entry.party.id} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-2">
                  <span className="font-semibold text-slate-900">{entry.party.name}</span>
                  <span className="font-mono text-xs text-slate-500">{entry.party.code}{entry.party.pan ? ` · PAN ${entry.party.pan}` : ''}</span>
                  <span className="ml-auto text-[15px] font-semibold">{formatInr(entry.total)}</span>
                  {canCreate ? <Button variant="primary" onClick={() => setSettling(entry)}>Settle…</Button> : null}
                </div>
                <table className="w-full text-left text-[13px]">
                  <tbody className="divide-y divide-slate-100">
                    {entry.items.map((item) => (
                      <tr key={`${item.accountId}-${item.sellAccountId}`}>
                        <td className="px-3 py-2"><Badge tone="violet">{KIND_LABEL[item.systemKey] ?? item.accountName}</Badge></td>
                        <td className="px-3 py-2 text-xs">{item.vehicle ?? 'Not tied to a vehicle'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatInr(item.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )
      ) : history.loading ? <LoadingState /> : history.error ? <ErrorBanner message={history.error} schemaMissing={history.schemaMissing} /> : !history.data?.length ? (
        <EmptyState title="No settlements yet" description="Settle an amount from the “Owed now” tab." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Party</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">TDS</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {history.data.map((item) => (
                <tr key={item.id}>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(item.date)}</td>
                  <td className={`${cellClass} text-xs`}>{item.party.name}{item.notes ? <span className="block text-slate-500">{item.notes}</span> : null}</td>
                  <td className={`${cellClass} text-right`}>{formatInr(item.grossAmount)}</td>
                  <td className={`${cellClass} text-right text-xs`}>{item.tdsAmount ? `${formatInr(item.tdsAmount)} (${item.tdsSection})` : '—'}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{formatInr(item.netAmount)}</td>
                  <td className={`${cellClass} font-mono text-xs`}>{item.reference ?? '—'}</td>
                  <td className={cellClass}>
                    <Badge tone={statusTone[item.status]}>{enumLabel(item.status)}</Badge>
                    {item.voucherNumber ? <button type="button" onClick={() => setOpenVoucher(item.voucherId)} className="ml-2 font-mono text-xs text-blue-700 hover:underline">{item.voucherNumber}</button> : null}
                    {item.cancelReason ? <span className="block text-[11px] text-red-600">{item.cancelReason}</span> : null}
                  </td>
                  <td className={`${cellClass} whitespace-nowrap text-right`}>
                    {item.status === 'DRAFT' && canPay ? <Button variant="primary" busy={busyId === item.id} onClick={() => void act(item.id, () => api.post(`/finance-hub/settlements/${item.id}/pay`), 'Paid and posted.')}>Pay &amp; post</Button> : null}
                    {item.status !== 'CANCELLED' && canPay ? (
                      <Button variant="ghost" busy={busyId === item.id} onClick={() => {
                        const reason = window.prompt(item.status === 'PAID' ? 'Reason for cancelling (the payment voucher will be reversed):' : 'Reason for cancelling this draft:');
                        if (reason?.trim()) void act(item.id, () => api.post(`/finance-hub/settlements/${item.id}/cancel`, { reason }), 'Settlement cancelled.');
                      }}>Cancel</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {settling ? <SettlementForm entry={settling} canPay={canPay} onClose={() => setSettling(null)} onSaved={() => { setSettling(null); setTab('history'); refresh(); }} /> : null}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={refresh} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}

function SettlementForm({ entry, canPay, onClose, onSaved }: { entry: OpenParty; canPay: boolean; onClose: () => void; onSaved: () => void }) {
  const lookups = useLedgerLookups();
  const banks = useMemo(() => lookups.accounts.filter((account) => account.isActive && isCashBank(account)).map(lookups.accountOption), [lookups]);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(entry.items.map((item) => [`${item.accountId}|${item.sellAccountId ?? ''}`, String(item.balance)])));
  const [form, setForm] = useState({ date: todayIso(), bankAccountId: '', paymentMethod: 'NEFT', reference: '', tdsSection: entry.party.tdsSection ?? '', tdsAmount: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const gross = entry.items.reduce((sum, item) => sum + toPaise(amounts[`${item.accountId}|${item.sellAccountId ?? ''}`] ?? ''), 0);
  const net = gross - toPaise(form.tdsAmount);

  const submit = async (pay: boolean) => {
    setBusy(true);
    try {
      const items = entry.items.map((item) => ({ accountId: item.accountId, sellAccountId: item.sellAccountId, amount: amounts[`${item.accountId}|${item.sellAccountId ?? ''}`] })).filter((item) => toPaise(item.amount ?? '') > 0);
      const saved = (await api.post('/finance-hub/settlements', { partyId: entry.party.id, ...form, tdsAmount: form.tdsAmount || null, tdsSection: form.tdsSection || null, items })).data as { id: string };
      if (pay) {
        const result = (await api.post(`/finance-hub/settlements/${saved.id}/pay`)).data as { number: string };
        toast.success(`Paid; voucher ${result.number}.`);
      } else {
        toast.success('Settlement saved as draft for the checker to pay.');
      }
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the settlement.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Settle with ${entry.party.name}`} subtitle="Pay part or all of what is owed. TDS deducted is credited to TDS Payable." onClose={() => { if (!busy) onClose(); }} wide>
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(false); }} className="p-4">
        <table className="w-full text-left text-[13px]">
          <thead className={tableHeadClass}><tr><th className="px-3 py-2">For</th><th className="px-3 py-2">Vehicle</th><th className="px-3 py-2 text-right">Owed</th><th className="px-3 py-2 text-right">Pay now</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {entry.items.map((item) => {
              const key = `${item.accountId}|${item.sellAccountId ?? ''}`;
              return (
                <tr key={key}>
                  <td className="px-3 py-2">{KIND_LABEL[item.systemKey] ?? item.accountName}</td>
                  <td className="px-3 py-2 text-xs">{item.vehicle ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{formatInr(item.balance)}</td>
                  <td className="w-40 px-3 py-2"><input type="number" min={0} max={item.balance} step="0.01" value={amounts[key] ?? ''} onChange={(event) => setAmounts({ ...amounts, [key]: event.target.value })} className={`${inputClass} py-2 text-right`} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Field label="Payment date *"><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} required /></Field>
          <Field label="Paid from *" wide><SearchableSelect buttonClassName={selectButtonClass} options={banks} value={form.bankAccountId} onChange={(option) => setForm({ ...form, bankAccountId: String(option.id) })} placeholder={banks.length ? 'Bank / cash account' : 'Add a bank account in Banking first'} /></Field>
          <Field label="Mode">
            <select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} className={inputClass}>
              {PAYMENT_METHODS.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}
            </select>
          </Field>
          <Field label="Reference / UTR"><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value.toUpperCase() })} className={inputClass} maxLength={80} /></Field>
          <Field label="TDS section" hint="194H brokerage/commission, 194C, 194J…"><input value={form.tdsSection} onChange={(event) => setForm({ ...form, tdsSection: event.target.value.toUpperCase() })} className={inputClass} maxLength={10} /></Field>
          <Field label="TDS amount"><input type="number" min={0} step="0.01" value={form.tdsAmount} onChange={(event) => setForm({ ...form, tdsAmount: event.target.value })} className={inputClass} /></Field>
          <Field label="Notes"><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} maxLength={1000} /></Field>
        </div>
        <p className="mt-3 text-right text-[13px] font-semibold text-slate-800">Gross {formatInr(gross / 100)} · TDS {formatInr(toPaise(form.tdsAmount) / 100)} · <span className="text-[15px]">Pay {formatInr(net / 100)}</span></p>
        <ModalFooter>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" busy={busy} disabled={gross <= 0 || net <= 0 || !form.bankAccountId}>Save draft</Button>
          {canPay ? <Button variant="primary" busy={busy} disabled={gross <= 0 || net <= 0 || !form.bankAccountId} onClick={() => void submit(true)}>Save &amp; pay</Button> : null}
        </ModalFooter>
      </form>
    </Modal>
  );
}
