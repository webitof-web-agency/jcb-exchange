'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Download, Plus, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { isCashBank, todayIso, useLedgerLookups } from './ledgerLookups';
import { Badge, Button, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, Tabs, tableHeadClass } from './ui';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

type Tax = { igst: number; cgst: number; sgst: number };
type Totals = Tax & { count: number; taxable: number };
const thisMonth = () => todayIso().slice(0, 7);
const sumTax = (tax: Tax) => Math.round((tax.igst + tax.cgst + tax.sgst) * 100) / 100;
const fyStart = () => {
  const today = todayIso();
  return `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
};

export const downloadCsv = (name: string, header: string[], rows: Array<Array<string | number | null | undefined>>) => {
  const cell = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob([`﻿${[header.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\n')}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

const MonthPicker = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <Field label="Return period"><input type="month" value={value} max={thisMonth()} onChange={(event) => onChange(event.target.value)} className={inputClass} /></Field>
);
const TaxCells = ({ tax }: { tax: Tax }) => <><td className="px-3 py-2 text-right">{formatInr(tax.igst)}</td><td className="px-3 py-2 text-right">{formatInr(tax.cgst)}</td><td className="px-3 py-2 text-right">{formatInr(tax.sgst)}</td></>;

type Summary = {
  month: string;
  gstr3b: { outwardTaxable: Totals; inwardReverseCharge: Totals & { liability: number }; itc: { reverseCharge: Totals; other: Totals; ineligible: number; net: Tax } };
  gstr1: { sections: Array<Totals & { section: string }>; hsn: Array<{ hsn: string; rate: number; taxable: number; tax: number }> };
  ledger: { movement: { output: Tax; input: Tax; rcm: number }; closing: { output: Tax; input: Tax; rcm: number }; outputDifference: Tax; inputDifference: Tax };
  setOffPreview: { uses: Array<{ from: string; to: string; amount: number }>; cashPayable: Tax; creditCarriedForward: Tax; rcmCash: number };
  readiness: Array<{ check: string; count: number; ok: boolean }>;
};
const useSummary = (month: string, version = 0) => useResource(async () => (await api.get('/finance-hub/tax/gst/summary', { params: { month } })).data as Summary, `gst-summary-${month}-${version}`);

/** Month at a glance: output tax, ITC, cash payable after set-off, and whether the books are ready. */
export function GstDashboardModule() {
  const access = useFinanceWorkspaceAccess();
  const canPost = access.can(['fh.books.post']);
  const [month, setMonth] = useState(thisMonth());
  const [version, setVersion] = useState(0);
  const summary = useSummary(month, version);
  const [busy, setBusy] = useState(false);
  const data = summary.data;
  const tiesOut = data ? sumTax(data.ledger.outputDifference) === 0 && sumTax(data.ledger.inputDifference) === 0 : false;
  const postSetOff = async () => {
    if (!window.confirm(`Post the GST set-off journal for ${month}? Input credit will be used against output tax as of month end.`)) return;
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/tax/gst/set-off', { month })).data as { number: string };
      toast.success(`Set-off posted (${result.number}). Pay the balance with a GST challan.`);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not post the set-off.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="GST dashboard" description="Output tax, input tax credit and cash payable for a return period, straight from the books. Filing on the GST portal stays manual (portal access needs a GSP)." actions={canPost && data?.setOffPreview.uses.length ? <Button variant="primary" busy={busy} onClick={() => void postSetOff()}>Post set-off</Button> : null}>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4"><MonthPicker value={month} onChange={setMonth} /></div>
      {summary.loading ? <LoadingState /> : summary.error || !data ? <ErrorBanner message={summary.error || 'Could not load.'} schemaMissing={summary.schemaMissing} /> : (
        <>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Outward taxable value</p><p className="text-base font-bold">{formatInr(data.gstr3b.outwardTaxable.taxable)}</p><p className="text-[11px] text-slate-400">{data.gstr3b.outwardTaxable.count} invoices / notes</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Output tax</p><p className="text-base font-bold">{formatInr(sumTax(data.gstr3b.outwardTaxable))}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Input tax credit</p><p className="text-base font-bold">{formatInr(sumTax(data.gstr3b.itc.net))}</p>{data.gstr3b.itc.ineligible ? <p className="text-[11px] text-amber-700">{formatInr(data.gstr3b.itc.ineligible)} ineligible</p> : null}</div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Reverse charge payable</p><p className="text-base font-bold">{formatInr(data.gstr3b.inwardReverseCharge.liability)}</p></div>
            <div className="rounded-xl bg-slate-900 p-3 text-white"><p className="text-[11px] uppercase tracking-wide text-slate-300">Cash payable after set-off</p><p className="text-base font-bold">{formatInr(sumTax(data.setOffPreview.cashPayable) + data.setOffPreview.rcmCash)}</p><p className="text-[11px] text-slate-400">Credit carried forward {formatInr(sumTax(data.setOffPreview.creditCarriedForward))}</p></div>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-sm font-semibold">Filing readiness</p>
              <ul className="space-y-2 text-sm">
                {data.readiness.map((item) => <li key={item.check} className="flex items-start justify-between gap-3"><span>{item.check}</span><Badge tone={item.ok ? 'green' : 'amber'}>{item.ok ? (item.count ? `${item.count} ✓` : 'OK') : `${item.count} to check`}</Badge></li>)}
                <li className="flex items-start justify-between gap-3"><span>Registers agree with the GST ledgers</span><Badge tone={tiesOut ? 'green' : 'red'}>{tiesOut ? 'Agree' : 'Difference'}</Badge></li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-sm font-semibold">Ledger balances at month end</p>
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-slate-500"><tr><th className="py-1 text-left" /><th className="py-1 text-right">IGST</th><th className="py-1 text-right">CGST</th><th className="py-1 text-right">SGST</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="py-1.5">Output tax (liability)</td><td className="py-1.5 text-right">{formatInr(data.ledger.closing.output.igst)}</td><td className="py-1.5 text-right">{formatInr(data.ledger.closing.output.cgst)}</td><td className="py-1.5 text-right">{formatInr(data.ledger.closing.output.sgst)}</td></tr>
                  <tr><td className="py-1.5">Input credit</td><td className="py-1.5 text-right">{formatInr(data.ledger.closing.input.igst)}</td><td className="py-1.5 text-right">{formatInr(data.ledger.closing.input.cgst)}</td><td className="py-1.5 text-right">{formatInr(data.ledger.closing.input.sgst)}</td></tr>
                  <tr className="font-semibold"><td className="py-1.5">Cash payable after set-off</td><td className="py-1.5 text-right">{formatInr(data.setOffPreview.cashPayable.igst)}</td><td className="py-1.5 text-right">{formatInr(data.setOffPreview.cashPayable.cgst)}</td><td className="py-1.5 text-right">{formatInr(data.setOffPreview.cashPayable.sgst)}</td></tr>
                </tbody>
              </table>
              {data.setOffPreview.uses.length ? <p className="mt-2 text-xs text-slate-500">Set-off: {data.setOffPreview.uses.map((use) => `${use.from.toUpperCase()}→${use.to.toUpperCase()} ${formatInr(use.amount)}`).join(' · ')}</p> : null}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

type GstRow = { key: string; source: string; kind: string; date: string; number: string | null; invoiceNo: string; partyName: string | null; gstin: string | null; placeOfSupply: string | null; interState: boolean; taxable: number; igst: number; cgst: number; sgst: number; tax: number; invoiceValue: number; reverseCharge: boolean; ineligibleTax: number; marginScheme: boolean; section: string | null };
type RegisterTab = 'SALES' | 'PURCHASES';

/** Invoice-level GST data for sales and purchases with CSV export. */
export function GstRegisterModule() {
  const [tab, setTab] = useState<RegisterTab>('SALES');
  const [month, setMonth] = useState(thisMonth());
  const register = useResource(async () => (await api.get('/finance-hub/tax/gst/register', { params: { side: tab, month } })).data as { rows: GstRow[]; totals: { taxable: number; igst: number; cgst: number; sgst: number; tax: number; ineligibleTax: number } }, `gst-register-${tab}-${month}`);
  const rows = register.data?.rows ?? [];
  const exportCsv = () => downloadCsv(`gst-${tab.toLowerCase()}-${month}.csv`, ['Date', 'Voucher', 'Invoice no', 'Type', 'Section', 'Party', 'GSTIN', 'Place of supply', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total tax', 'Invoice value', 'Reverse charge', 'Ineligible ITC', 'Margin scheme', 'Source'], rows.map((row) => [row.date, row.number, row.invoiceNo, row.kind, row.section, row.partyName, row.gstin, row.placeOfSupply, row.taxable, row.igst, row.cgst, row.sgst, row.tax, row.invoiceValue, row.reverseCharge ? 'Y' : 'N', row.ineligibleTax, row.marginScheme ? 'Y' : 'N', row.source]));
  return (
    <Panel title="Sales & purchase GST register" description="Every posted invoice, bill and note with GST, including automatic entries (Sold Vehicles under the margin scheme, Prime, listings, brokerage)." actions={<Button icon={<Download className="h-4 w-4" />} disabled={!rows.length} onClick={exportCsv}>CSV</Button>}>
      <Tabs<RegisterTab> tabs={[{ key: 'SALES', label: 'Sales (outward)' }, { key: 'PURCHASES', label: 'Purchases (inward)' }]} active={tab} onChange={setTab} />
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4"><MonthPicker value={month} onChange={setMonth} />{register.data ? <span className="text-sm text-slate-600">Taxable {formatInr(register.data.totals.taxable)} · Tax {formatInr(register.data.totals.tax)}{tab === 'PURCHASES' && register.data.totals.ineligibleTax ? ` · Ineligible ${formatInr(register.data.totals.ineligibleTax)}` : ''}</span> : null}</div>
      {register.loading ? <LoadingState /> : register.error ? <ErrorBanner message={register.error} schemaMissing={register.schemaMissing} /> : !rows.length ? <EmptyState title="No GST entries in this period" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Party / GSTIN</th><th className="px-3 py-2">{tab === 'SALES' ? 'Section' : 'Type'}</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">IGST</th><th className="px-3 py-2 text-right">CGST</th><th className="px-3 py-2 text-right">SGST</th><th className="px-3 py-2 text-right">Value</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(row.date)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.invoiceNo}<span className="block font-sans text-[11px] text-slate-400">{row.number} · {enumLabel(row.source)}</span></td>
                  <td className="px-3 py-2 text-xs">{row.partyName ?? '—'}<span className="block font-mono text-slate-400">{row.gstin ?? 'Unregistered'}{row.placeOfSupply ? ` · POS ${row.placeOfSupply}` : ''}</span></td>
                  <td className="px-3 py-2 text-xs">{tab === 'SALES' ? <Badge tone={row.section === 'B2B' ? 'blue' : 'slate'}>{row.section}</Badge> : enumLabel(row.kind)}{row.marginScheme ? <span className="block text-[11px] text-violet-700">Margin scheme</span> : null}{row.reverseCharge ? <span className="block text-[11px] text-violet-700">RCM</span> : null}{row.ineligibleTax ? <span className="block text-[11px] text-amber-700">No ITC {formatInr(row.ineligibleTax)}</span> : null}</td>
                  <td className="px-3 py-2 text-right">{formatInr(row.taxable)}</td>
                  <TaxCells tax={row} />
                  <td className="px-3 py-2 text-right font-semibold">{formatInr(row.invoiceValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

type Recon = { month: string; uploaded: { fileName: string | null; rows: number; at: string } | null; summary: { matched: number; mismatch: number; onlyIn2b: number; onlyInBooks: number; itcIn2b: number; itcInBooks: number }; results: Array<{ status: string; gstin: string; invoiceNo: string; supplierName?: string | null; date: string; books: { taxable: number; tax: number } | null; portal: { taxable: number; igst: number; cgst: number; sgst: number } | null; taxDifference: number }> };
type ReturnsTab = 'gstr1' | 'gstr3b' | '2b';
const reconTone: Record<string, 'green' | 'amber' | 'red' | 'violet'> = { MATCHED: 'green', AMOUNT_MISMATCH: 'amber', ONLY_IN_2B: 'violet', ONLY_IN_BOOKS: 'red' };

const parse2bCsv = (text: string) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = (lines.shift() ?? '').split(',').map((cell) => cell.trim().toLowerCase().replace(/"/g, ''));
  const col = (...names: string[]) => header.findIndex((cell) => names.some((name) => cell.includes(name)));
  const index = { gstin: col('gstin'), name: col('trade', 'name'), invoice: col('invoice number', 'invoice no', 'inum', 'invoice'), date: col('date'), taxable: col('taxable'), igst: col('igst', 'integrated'), cgst: col('cgst', 'central'), sgst: col('sgst', 'state') };
  return lines.map((line) => {
    const cells = line.split(',').map((cell) => cell.trim().replace(/"/g, ''));
    return { gstin: cells[index.gstin] ?? '', supplierName: index.name >= 0 ? cells[index.name] : null, invoiceNo: cells[index.invoice] ?? '', date: cells[index.date] ?? '', taxable: Number(cells[index.taxable]) || 0, igst: Number(cells[index.igst]) || 0, cgst: Number(cells[index.cgst]) || 0, sgst: Number(cells[index.sgst]) || 0 };
  });
};

/** GSTR-1 and GSTR-3B working, and GSTR-2B reconciliation with purchase bills. */
export function GstReturnsModule() {
  const access = useFinanceWorkspaceAccess();
  const canUpload = access.can(['fh.tax.manage']);
  const [tab, setTab] = useState<ReturnsTab>('gstr3b');
  const [month, setMonth] = useState(thisMonth());
  const [version, setVersion] = useState(0);
  const summary = useSummary(month, version);
  const recon = useResource(async () => (tab === '2b' ? (await api.get('/finance-hub/tax/gst/2b', { params: { month } })).data as Recon : null), `gst-2b-${month}-${tab}-${version}`);
  const [statusFilter, setStatusFilter] = useState('');
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const body = file.name.toLowerCase().endsWith('.json') ? { month, fileName: file.name, json: JSON.parse(text) } : { month, fileName: file.name, rows: parse2bCsv(text) };
      const result = (await api.post('/finance-hub/tax/gst/2b', body)).data as { rows: number };
      toast.success(`${result.rows} invoices loaded from GSTR-2B.`);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not read the file. Use the portal JSON or a CSV.'));
    }
  };
  const data = summary.data;
  return (
    <Panel title="GST returns & reconciliation" description="Working papers for GSTR-1 and GSTR-3B from the books, and GSTR-2B matching. File the returns on the GST portal.">
      <Tabs<ReturnsTab> tabs={[{ key: 'gstr3b', label: 'GSTR-3B' }, { key: 'gstr1', label: 'GSTR-1' }, { key: '2b', label: 'GSTR-2B vs books' }]} active={tab} onChange={setTab} />
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <MonthPicker value={month} onChange={setMonth} />
        {tab === '2b' && canUpload ? <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300"><Upload className="h-4 w-4" />Upload GSTR-2B (JSON / CSV)<input type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} /></label> : null}
      </div>
      {tab === '2b' ? (
        recon.loading ? <LoadingState /> : recon.error || !recon.data ? <ErrorBanner message={recon.error || 'Could not load.'} schemaMissing={recon.schemaMissing} /> : !recon.data.uploaded ? <EmptyState title="No GSTR-2B uploaded for this period" description="Download GSTR-2B (JSON) from the GST portal → Returns → GSTR-2B, and upload it here." /> : (
          <>
            <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
              {[['Matched', recon.data.summary.matched], ['Amount differs', recon.data.summary.mismatch], ['Only in 2B', recon.data.summary.onlyIn2b], ['Only in books', recon.data.summary.onlyInBooks]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="text-base font-bold">{value}</p></div>)}
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">ITC in 2B</p><p className="text-base font-bold">{formatInr(recon.data.summary.itcIn2b)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">ITC in books (month)</p><p className="text-base font-bold">{formatInr(recon.data.summary.itcInBooks)}</p></div>
            </div>
            <div className="px-4 pb-2"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${inputClass} max-w-xs`}><option value="">All rows</option>{Object.keys(reconTone).map((status) => <option key={status} value={status}>{enumLabel(status)}</option>)}</select></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className={tableHeadClass}><tr><th className="px-3 py-2">Status</th><th className="px-3 py-2">Supplier / GSTIN</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2 text-right">Tax in books</th><th className="px-3 py-2 text-right">Tax in 2B</th><th className="px-3 py-2 text-right">Difference</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {recon.data.results.filter((row) => !statusFilter || row.status === statusFilter).map((row, index) => (
                    <tr key={`${row.gstin}-${row.invoiceNo}-${index}`}>
                      <td className="px-3 py-2"><Badge tone={reconTone[row.status] ?? 'slate'}>{enumLabel(row.status)}</Badge></td>
                      <td className="px-3 py-2 text-xs">{row.supplierName ?? '—'}<span className="block font-mono text-slate-400">{row.gstin}</span></td>
                      <td className="px-3 py-2 font-mono text-xs">{row.invoiceNo}<span className="block font-sans text-slate-400">{formatDate(row.date)}</span></td>
                      <td className="px-3 py-2 text-right">{row.books ? formatInr(row.books.tax) : '—'}</td>
                      <td className="px-3 py-2 text-right">{row.portal ? formatInr(row.portal.igst + row.portal.cgst + row.portal.sgst) : '—'}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${row.taxDifference ? 'text-amber-700' : ''}`}>{formatInr(row.taxDifference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : summary.loading ? <LoadingState /> : summary.error || !data ? <ErrorBanner message={summary.error || 'Could not load.'} schemaMissing={summary.schemaMissing} /> : tab === 'gstr3b' ? (
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Table</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">IGST</th><th className="px-3 py-2 text-right">CGST</th><th className="px-3 py-2 text-right">SGST</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr><td className="px-3 py-2">3.1(a) Outward taxable supplies</td><td className="px-3 py-2 text-right">{formatInr(data.gstr3b.outwardTaxable.taxable)}</td><TaxCells tax={data.gstr3b.outwardTaxable} /></tr>
              <tr><td className="px-3 py-2">3.1(d) Inward supplies liable to reverse charge</td><td className="px-3 py-2 text-right">{formatInr(data.gstr3b.inwardReverseCharge.taxable)}</td><TaxCells tax={data.gstr3b.inwardReverseCharge} /></tr>
              <tr><td className="px-3 py-2">4(A)(3) ITC on reverse charge</td><td /><TaxCells tax={data.gstr3b.itc.reverseCharge} /></tr>
              <tr><td className="px-3 py-2">4(A)(5) All other ITC</td><td /><TaxCells tax={data.gstr3b.itc.other} /></tr>
              <tr><td className="px-3 py-2">4(D) Ineligible ITC (added to cost)</td><td /><td className="px-3 py-2 text-right" colSpan={3}>{formatInr(data.gstr3b.itc.ineligible)}</td></tr>
              <tr className="font-semibold"><td className="px-3 py-2">4(C) Net ITC available</td><td /><TaxCells tax={data.gstr3b.itc.net} /></tr>
              <tr className="bg-slate-50 text-xs"><td className="px-3 py-2">Books vs output ledgers (difference)</td><td /><TaxCells tax={data.ledger.outputDifference} /></tr>
              <tr className="bg-slate-50 text-xs"><td className="px-3 py-2">Books vs input ledgers (difference)</td><td /><TaxCells tax={data.ledger.inputDifference} /></tr>
              <tr className="font-bold"><td className="px-3 py-2">6.1 Tax payable in cash (after set-off) + RCM {formatInr(data.setOffPreview.rcmCash)}</td><td /><TaxCells tax={data.setOffPreview.cashPayable} /></tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">A difference means a manual journal touched a GST ledger, or a document was cancelled in a later month. Open the GST ledgers in Master General Ledger to see the entries.</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sections</p>
            <table className="w-full text-sm"><thead className={tableHeadClass}><tr><th className="px-3 py-2">Section</th><th className="px-3 py-2 text-right">Docs</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">Tax</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{data.gstr1.sections.map((row) => <tr key={row.section}><td className="px-3 py-2 font-semibold">{row.section}</td><td className="px-3 py-2 text-right">{row.count}</td><td className="px-3 py-2 text-right">{formatInr(row.taxable)}</td><td className="px-3 py-2 text-right">{formatInr(sumTax(row))}</td></tr>)}</tbody></table>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">HSN / SAC summary</p>
            <table className="w-full text-sm"><thead className={tableHeadClass}><tr><th className="px-3 py-2">HSN / SAC</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">Tax</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{data.gstr1.hsn.map((row) => <tr key={`${row.hsn}-${row.rate}`}><td className="px-3 py-2 font-mono text-xs">{row.hsn || '—'}</td><td className="px-3 py-2 text-right">{row.rate}%</td><td className="px-3 py-2 text-right">{formatInr(row.taxable)}</td><td className="px-3 py-2 text-right">{formatInr(row.tax)}</td></tr>)}</tbody></table>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Eligible, ineligible and RCM credit for the month, ledger balances and the set-off. */
export function InputTaxCreditModule() {
  const [month, setMonth] = useState(thisMonth());
  const summary = useSummary(month);
  const data = summary.data;
  return (
    <Panel title="Input tax credit" description="Credit from purchase bills and automatic entries, credit lost on ineligible items (added to cost), and what remains in the input ledgers after set-off.">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4"><MonthPicker value={month} onChange={setMonth} /></div>
      {summary.loading ? <LoadingState /> : summary.error || !data ? <ErrorBanner message={summary.error || 'Could not load.'} schemaMissing={summary.schemaMissing} /> : (
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2" /><th className="px-3 py-2 text-right">IGST</th><th className="px-3 py-2 text-right">CGST</th><th className="px-3 py-2 text-right">SGST</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr><td className="px-3 py-2">Eligible ITC on bills this month ({data.gstr3b.itc.other.count})</td><TaxCells tax={data.gstr3b.itc.other} /><td className="px-3 py-2 text-right font-semibold">{formatInr(sumTax(data.gstr3b.itc.other))}</td></tr>
              <tr><td className="px-3 py-2">ITC on reverse charge ({data.gstr3b.itc.reverseCharge.count})</td><TaxCells tax={data.gstr3b.itc.reverseCharge} /><td className="px-3 py-2 text-right font-semibold">{formatInr(sumTax(data.gstr3b.itc.reverseCharge))}</td></tr>
              <tr className="text-amber-800"><td className="px-3 py-2">Ineligible (blocked credit added to cost)</td><td colSpan={3} /><td className="px-3 py-2 text-right font-semibold">{formatInr(data.gstr3b.itc.ineligible)}</td></tr>
              <tr><td className="px-3 py-2">Input ledger balance at month end</td><TaxCells tax={data.ledger.closing.input} /><td className="px-3 py-2 text-right font-semibold">{formatInr(sumTax(data.ledger.closing.input))}</td></tr>
              <tr><td className="px-3 py-2">Carried forward after set-off</td><TaxCells tax={data.setOffPreview.creditCarriedForward} /><td className="px-3 py-2 text-right font-semibold">{formatInr(sumTax(data.setOffPreview.creditCarriedForward))}</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">Claim only credit that appears in GSTR-2B: check “GSTR-2B vs books” on GST Returns & Reconciliation before filing.</p>
        </div>
      )}
    </Panel>
  );
}

type EInvoice = { sourceKind: 'DOCUMENT' | 'VOUCHER'; sourceId: string; date: string; number: string | null; invoiceNo: string; partyName: string | null; gstin: string | null; section: string | null; invoiceValue: number; interState: boolean; eInvoiceExpected: boolean; ref: { irn: string | null; ackNo: string | null; ackDate: string | null; ewbNo: string | null; ewbDate: string | null; ewbValidUpto: string | null; status: string; notes: string | null } | null };

/** IRN and e-way bill details entered against sales invoices (generation stays on the IRP / EWB portals). */
export function EInvoiceModule() {
  const access = useFinanceWorkspaceAccess();
  const canEdit = access.can(['fh.tax.manage']);
  const [month, setMonth] = useState(thisMonth());
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/tax/gst/e-invoices', { params: { month } })).data.invoices as EInvoice[], `e-invoices-${month}-${version}`);
  const [editing, setEditing] = useState<EInvoice | null>(null);
  const [form, setForm] = useState({ irn: '', ackNo: '', ackDate: '', ewbNo: '', ewbDate: '', ewbValidUpto: '', status: 'PENDING', notes: '' });
  const [busy, setBusy] = useState(false);
  const open = (row: EInvoice) => { setEditing(row); setForm({ irn: row.ref?.irn ?? '', ackNo: row.ref?.ackNo ?? '', ackDate: row.ref?.ackDate ?? '', ewbNo: row.ref?.ewbNo ?? '', ewbDate: row.ref?.ewbDate ?? '', ewbValidUpto: row.ref?.ewbValidUpto ?? '', status: row.ref?.status ?? 'PENDING', notes: row.ref?.notes ?? '' }); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await api.put('/finance-hub/tax/gst/e-invoices', { sourceKind: editing.sourceKind, sourceId: editing.sourceId, ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value || null])) });
      toast.success('Saved.');
      setEditing(null);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="E-invoice / e-way bill" description="Record the IRN, acknowledgement and e-way bill for each sales invoice. Generate them on the IRP / e-way bill portals (API integration needs GSP credentials and is off).">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4"><MonthPicker value={month} onChange={setMonth} /></div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="No sales invoices in this period" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Buyer</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2">E-invoice</th><th className="px-3 py-2">E-way bill</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((row) => (
                <tr key={`${row.sourceKind}-${row.sourceId}`}>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(row.date)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.invoiceNo}</td>
                  <td className="px-3 py-2 text-xs">{row.partyName ?? '—'}<span className="block font-mono text-slate-400">{row.gstin ?? 'Unregistered'} · {row.section}</span></td>
                  <td className="px-3 py-2 text-right">{formatInr(row.invoiceValue)}</td>
                  <td className="px-3 py-2 text-xs">{row.ref?.irn ? <span className="font-mono">{row.ref.irn.slice(0, 12)}…</span> : row.eInvoiceExpected ? <Badge tone="amber">IRN needed if turnover &gt; ₹5 cr</Badge> : <span className="text-slate-400">B2C — not needed</span>}</td>
                  <td className="px-3 py-2 text-xs">{row.ref?.ewbNo ? <span className="font-mono">{row.ref.ewbNo}{row.ref.ewbValidUpto ? ` · till ${formatDate(row.ref.ewbValidUpto)}` : ''}</span> : row.invoiceValue > 50000 ? <Badge tone="amber">Needed if goods move</Badge> : '—'}</td>
                  <td className="px-3 py-2 text-right">{canEdit ? <Button variant="ghost" onClick={() => open(row)}>{row.ref ? 'Edit' : 'Add'}</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <Modal title={`Invoice ${editing.invoiceNo}`} subtitle={`${editing.partyName ?? ''} · ${formatInr(editing.invoiceValue)}`} onClose={() => { if (!busy) setEditing(null); }}>
          <form onSubmit={save} className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="IRN" wide><input value={form.irn} onChange={(event) => setForm({ ...form, irn: event.target.value.trim() })} className={`${inputClass} font-mono text-xs`} maxLength={64} /></Field>
              <Field label="Ack number"><input value={form.ackNo} onChange={(event) => setForm({ ...form, ackNo: event.target.value })} className={inputClass} maxLength={30} /></Field>
              <Field label="Ack date"><input type="date" value={form.ackDate} onChange={(event) => setForm({ ...form, ackDate: event.target.value })} className={inputClass} /></Field>
              <Field label="E-way bill number"><input value={form.ewbNo} onChange={(event) => setForm({ ...form, ewbNo: event.target.value.replace(/\D/g, '').slice(0, 12) })} className={inputClass} inputMode="numeric" /></Field>
              <Field label="E-way bill date"><input type="date" value={form.ewbDate} onChange={(event) => setForm({ ...form, ewbDate: event.target.value })} className={inputClass} /></Field>
              <Field label="Valid up to"><input type="date" value={form.ewbValidUpto} onChange={(event) => setForm({ ...form, ewbValidUpto: event.target.value })} className={inputClass} /></Field>
              <Field label="Status"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={inputClass}>{['PENDING', 'GENERATED', 'CANCELLED', 'NOT_REQUIRED'].map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}</select></Field>
              <Field label="Notes" wide><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} maxLength={1000} /></Field>
            </div>
            <ModalFooter><Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Save</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}

type Withholding = { kind: string; side: string; account: { code: string; name: string }; from: string; to: string; opening: number; closing: number; sections: Array<{ section: string; deducted: number; deposited: number; parties: number; balance: number }>; rows: Array<{ id: string; date: string; voucherId: string; voucherNumber: string | null; narration: string; section: string; party: { name: string; pan: string | null } | null; movement: string; amount: number }> };
type WithholdingTab = 'PAYABLE' | 'RECEIVABLE';

/** TDS or TCS: deducted / collected by us (payable) and by others on us (receivable). */
export function WithholdingModule({ kind }: { kind: 'TDS' | 'TCS' }) {
  const [tab, setTab] = useState<WithholdingTab>('PAYABLE');
  const [range, setRange] = useState({ from: fyStart(), to: todayIso() });
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const register = useResource(async () => (await api.get('/finance-hub/tax/withholding', { params: { kind, side: tab, ...range } })).data as Withholding, `withholding-${kind}-${tab}-${range.from}-${range.to}`);
  const data = register.data;
  const word = kind === 'TDS' ? 'deducted' : 'collected';
  const exportCsv = () => data && downloadCsv(`${kind.toLowerCase()}-${tab.toLowerCase()}-${range.from}-${range.to}.csv`, ['Date', 'Voucher', 'Section', 'Party', 'PAN', 'Movement', 'Amount', 'Narration'], data.rows.map((row) => [row.date, row.voucherNumber, row.section, row.party?.name, row.party?.pan, row.movement, row.amount, row.narration]));
  return (
    <Panel title={kind === 'TDS' ? 'TDS management' : 'TCS management'} description={kind === 'TDS' ? 'TDS deducted on bills and settlements (payable, deposit with challan ITNS 281 by the 7th), and TDS deducted by customers on our income (receivable, claim in the return / Form 26AS).' : 'TCS collected on sales (payable) and TCS collected from us (receivable). Entries come from vouchers on the TCS ledgers.'} actions={<Button icon={<Download className="h-4 w-4" />} disabled={!data?.rows.length} onClick={exportCsv}>CSV</Button>}>
      <Tabs<WithholdingTab> tabs={[{ key: 'PAYABLE', label: `${kind} payable (${word} by us)` }, { key: 'RECEIVABLE', label: `${kind} receivable (${word} from us)` }]} active={tab} onChange={setTab} />
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[160px_160px]">
        <Field label="From"><input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To"><input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} className={inputClass} /></Field>
      </div>
      {register.loading ? <LoadingState /> : register.error || !data ? <ErrorBanner message={register.error || 'Could not load.'} schemaMissing={register.schemaMissing} /> : (
        <>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Opening</p><p className="text-base font-bold">{formatInr(data.opening)}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{tab === 'PAYABLE' ? 'Still to deposit' : 'To claim'}</p><p className="text-base font-bold">{formatInr(data.closing)}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Ledger</p><p className="text-sm font-semibold">{data.account.code} · {data.account.name}</p></div>
          </div>
          {data.sections.length ? (
            <div className="overflow-x-auto px-4">
              <table className="w-full text-sm"><thead className={tableHeadClass}><tr><th className="px-3 py-2">Section</th><th className="px-3 py-2 text-right">Parties</th><th className="px-3 py-2 text-right">{enumLabel(word)}</th><th className="px-3 py-2 text-right">Deposited / adjusted</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{data.sections.map((row) => <tr key={row.section}><td className="px-3 py-2 font-semibold">{row.section}</td><td className="px-3 py-2 text-right">{row.parties}</td><td className="px-3 py-2 text-right">{formatInr(row.deducted)}</td><td className="px-3 py-2 text-right">{formatInr(row.deposited)}</td><td className="px-3 py-2 text-right font-semibold">{formatInr(row.balance)}</td></tr>)}</tbody></table>
            </div>
          ) : null}
          {!data.rows.length ? <EmptyState title="No entries in this period" /> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Voucher</th><th className="px-3 py-2">Section</th><th className="px-3 py-2">Party / PAN</th><th className="px-3 py-2">Entry</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((row) => (
                    <tr key={row.id} onClick={() => setOpenVoucher(row.voucherId)} className="cursor-pointer hover:bg-amber-50/40">
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(row.date)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.voucherNumber}</td>
                      <td className="px-3 py-2 text-xs font-semibold">{row.section}</td>
                      <td className="px-3 py-2 text-xs">{row.party?.name ?? '—'}<span className="block font-mono text-slate-400">{row.party?.pan ?? (row.party ? 'PAN missing (higher rate u/s 206AA)' : '')}</span></td>
                      <td className="px-3 py-2"><Badge tone={row.movement === 'DEPOSITED' ? 'green' : 'slate'}>{enumLabel(row.movement)}</Badge></td>
                      <td className="px-3 py-2 text-right font-semibold">{formatInr(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={register.reload} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}

type Challan = { id: string; taxType: string; period: string; challanNo: string; bsrCode: string | null; date: string; total: number; breakdown: Record<string, number>; proofUrl: string | null; notes: string | null; voucher: { id: string; number: string | null } | null };
const TAX_TYPES = ['GST', 'TDS', 'TCS', 'ADVANCE_TAX', 'SELF_ASSESSMENT', 'PROFESSIONAL_TAX', 'PF', 'ESI', 'OTHER'];
const FIELDS: Record<string, Array<[string, string]>> = {
  GST: [['igst', 'IGST'], ['cgst', 'CGST'], ['sgst', 'SGST'], ['rcm', 'Reverse charge'], ['interest', 'Interest'], ['fee', 'Late fee']],
  DEFAULT: [['principal', 'Tax'], ['interest', 'Interest'], ['fee', 'Fee / penalty']],
};

/** Tax payments (GST PMT-06, TDS 281, advance tax 280, PT, PF, ESI) with their payment vouchers. */
export function ChallansModule({ fixedTypes }: { fixedTypes?: string[] }) {
  const access = useFinanceWorkspaceAccess();
  const canPost = access.can(['fh.books.post']);
  const lookups = useLedgerLookups();
  const banks = useMemo(() => lookups.accounts.filter((account) => account.isActive && isCashBank(account) && account.kind === 'BANK').map(lookups.accountOption), [lookups]);
  const ledgers = useMemo(() => lookups.accounts.filter((account) => account.isActive).map(lookups.accountOption), [lookups]);
  const [typeFilter, setTypeFilter] = useState('');
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/tax/challans', { params: { taxType: typeFilter || undefined } })).data.challans as Challan[], `challans-${typeFilter}-${version}`);
  const rows = (list.data ?? []).filter((row) => !fixedTypes || fixedTypes.includes(row.taxType));
  const [form, setForm] = useState<{ taxType: string; period: string; challanNo: string; bsrCode: string; date: string; bankAccountId: string; otherAccountId: string; proofUrl: string; notes: string; breakdown: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const fields = form ? FIELDS[form.taxType] ?? FIELDS.DEFAULT! : [];
  const total = form ? Object.values(form.breakdown).reduce((sum, value) => sum + (Number(value) || 0), 0) : 0;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/tax/challans', { ...form, otherAccountId: form.otherAccountId || null, bsrCode: form.bsrCode || null, proofUrl: form.proofUrl || null, notes: form.notes || null })).data as { number: string };
      toast.success(`Challan recorded; payment voucher ${result.number}.`);
      setForm(null);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not record the challan.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Tax payments & challans" description="Record each tax paid with its challan / CIN / CPIN. The payment voucher clears the liability (GST output, TDS payable, PT/PF/ESI payable) or builds advance tax; interest and late fee go to Interest & Penalty." actions={canPost ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!banks.length} onClick={() => setForm({ taxType: fixedTypes?.[0] ?? 'GST', period: thisMonth(), challanNo: '', bsrCode: '', date: todayIso(), bankAccountId: banks[0]?.id ?? '', otherAccountId: '', proofUrl: '', notes: '', breakdown: {} })}>Record challan</Button> : null}>
      {!fixedTypes ? <div className="border-b border-slate-100 p-4"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={`${inputClass} max-w-xs`}><option value="">All taxes</option>{TAX_TYPES.map((type) => <option key={type} value={type}>{enumLabel(type)}</option>)}</select></div> : null}
      {!canPost ? <ReadOnlyNotice>Recording challans needs “Post Vouchers”.</ReadOnlyNotice> : null}
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !rows.length ? <EmptyState title="No challans recorded" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Paid on</th><th className="px-3 py-2">Tax</th><th className="px-3 py-2">Period</th><th className="px-3 py-2">Challan</th><th className="px-3 py-2">Breakdown</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Voucher</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(row.date)}</td>
                  <td className="px-3 py-2"><Badge tone="violet">{enumLabel(row.taxType)}</Badge></td>
                  <td className="px-3 py-2 text-xs">{row.period}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.challanNo}{row.bsrCode ? <span className="block text-slate-400">BSR {row.bsrCode}</span> : null}{row.proofUrl ? <a href={row.proofUrl} target="_blank" rel="noreferrer" className="block font-sans text-blue-700 hover:underline">proof</a> : null}</td>
                  <td className="px-3 py-2 text-xs">{Object.entries(row.breakdown).map(([key, value]) => `${key} ${formatInr(value)}`).join(' · ')}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatInr(row.total)}</td>
                  <td className="px-3 py-2">{row.voucher ? <button type="button" onClick={() => setOpenVoucher(row.voucher!.id)} className="font-mono text-xs text-blue-700 hover:underline">{row.voucher.number}</button> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? (
        <Modal title="Record tax challan" onClose={() => { if (!busy) setForm(null); }} wide>
          <form onSubmit={save} className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Tax"><select value={form.taxType} onChange={(event) => setForm({ ...form, taxType: event.target.value, breakdown: {} })} className={inputClass}>{(fixedTypes ?? TAX_TYPES).map((type) => <option key={type} value={type}>{enumLabel(type)}</option>)}</select></Field>
              <Field label="Period *" hint="Month (YYYY-MM), quarter or FY"><input value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} className={inputClass} maxLength={20} required /></Field>
              <Field label="Challan / CIN / CPIN *"><input value={form.challanNo} onChange={(event) => setForm({ ...form, challanNo: event.target.value.toUpperCase() })} className={inputClass} maxLength={40} required /></Field>
              <Field label="BSR code"><input value={form.bsrCode} onChange={(event) => setForm({ ...form, bsrCode: event.target.value })} className={inputClass} maxLength={10} /></Field>
              <Field label="Paid on *"><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} required /></Field>
              <Field label="Paid from *" wide><SearchableSelect options={banks} value={form.bankAccountId} onChange={(option) => setForm({ ...form, bankAccountId: String(option.id) })} placeholder="Bank account" /></Field>
              {form.taxType === 'OTHER' ? <Field label="Ledger it clears *"><SearchableSelect options={ledgers} value={form.otherAccountId} onChange={(option) => setForm({ ...form, otherAccountId: String(option.id) })} placeholder="Ledger" /></Field> : <div />}
              {fields.map(([key, label]) => <Field key={key} label={label}><input type="number" min={0} step="0.01" value={form.breakdown[key] ?? ''} onChange={(event) => setForm({ ...form, breakdown: { ...form.breakdown, [key]: event.target.value } })} className={inputClass} /></Field>)}
              <Field label="Challan link" wide><input value={form.proofUrl} onChange={(event) => setForm({ ...form, proofUrl: event.target.value })} className={inputClass} maxLength={500} placeholder="https://" /></Field>
              <Field label="Notes" wide><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} maxLength={1000} /></Field>
            </div>
            <p className="mt-4 text-right text-base font-bold">Total {formatInr(total)}</p>
            <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!form.challanNo || !form.bankAccountId || total <= 0}>Record &amp; post</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={() => setVersion((value) => value + 1)} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Panel>
  );
}

type IncomeTax = { fy: { start: string; end: string }; provision: number; advanceTax: number; tdsReceivable: number; expenseThisYear: number; provisions: Array<{ id: string; number: string | null; date: string; narration: string; totalAmount: number }>; challans: Array<{ id: string; taxType: string; period: string; challanNo: string; date: string; total: number }> };
const INSTALMENTS: Array<[string, number]> = [['15 June', 15], ['15 September', 45], ['15 December', 75], ['15 March', 100]];

/** Provision, advance tax instalments, TDS receivable and the net position for the year. */
export function IncomeTaxModule() {
  const access = useFinanceWorkspaceAccess();
  const canPost = access.can(['fh.books.post']);
  const [version, setVersion] = useState(0);
  const data = useResource(async () => (await api.get('/finance-hub/tax/income-tax')).data as IncomeTax, `income-tax-${version}`);
  const [estimate, setEstimate] = useState('');
  const [provision, setProvision] = useState<{ date: string; amount: string; narration: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const estimated = Number(estimate) || 0;
  const paid = (data.data?.advanceTax ?? 0) + (data.data?.tdsReceivable ?? 0);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!provision) return;
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/tax/income-tax/provision', provision)).data as { number: string };
      toast.success(`Provision booked (${result.number}).`);
      setProvision(null);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not book the provision.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Income tax & provisions" description="Book the tax provision (Dr Income Tax Expense, Cr Provision for Income Tax), pay advance tax with a challan, and track TDS deducted by customers. Keep assessment documents in the Document Vault." actions={canPost ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setProvision({ date: todayIso(), amount: '', narration: '' })}>Book provision</Button> : null}>
      {data.loading ? <LoadingState /> : data.error || !data.data ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : (
        <>
          <div className="grid gap-3 p-4 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Provision for income tax</p><p className="text-base font-bold">{formatInr(data.data.provision)}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Advance tax paid</p><p className="text-base font-bold">{formatInr(data.data.advanceTax)}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">TDS receivable</p><p className="text-base font-bold">{formatInr(data.data.tdsReceivable)}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Tax expense this year</p><p className="text-base font-bold">{formatInr(data.data.expenseThisYear)}</p></div>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-sm font-semibold">Advance tax instalments (s.211)</p>
              <Field label="Estimated tax for the year"><input type="number" min={0} step="1" value={estimate} onChange={(event) => setEstimate(event.target.value)} className={inputClass} /></Field>
              <table className="mt-3 w-full text-sm"><thead className="text-[11px] uppercase text-slate-500"><tr><th className="py-1 text-left">Due by</th><th className="py-1 text-right">Cumulative</th><th className="py-1 text-right">Still to pay</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{INSTALMENTS.map(([due, percent]) => <tr key={due}><td className="py-1.5">{due} ({percent}%)</td><td className="py-1.5 text-right">{formatInr((estimated * percent) / 100)}</td><td className="py-1.5 text-right font-semibold">{formatInr(Math.max((estimated * percent) / 100 - paid, 0))}</td></tr>)}</tbody></table>
              <p className="mt-2 text-xs text-slate-500">Paid so far counts advance tax and TDS receivable. Record payments under Tax Payments & Challans (type Advance tax).</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-sm font-semibold">Provisions and payments</p>
              {!data.data.provisions.length && !data.data.challans.length ? <p className="text-sm text-slate-500">None yet.</p> : (
                <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">
                  {data.data.provisions.map((voucher) => <tr key={voucher.id}><td className="py-1.5">{formatDate(voucher.date)}</td><td className="py-1.5 text-xs">{voucher.narration}<span className="block font-mono text-slate-400">{voucher.number}</span></td><td className="py-1.5 text-right">{formatInr(voucher.totalAmount)}</td></tr>)}
                  {data.data.challans.map((challan) => <tr key={challan.id}><td className="py-1.5">{formatDate(challan.date)}</td><td className="py-1.5 text-xs">{enumLabel(challan.taxType)} {challan.period}<span className="block font-mono text-slate-400">{challan.challanNo}</span></td><td className="py-1.5 text-right">{formatInr(challan.total)}</td></tr>)}
                </tbody></table>
              )}
            </div>
          </div>
        </>
      )}
      {provision ? (
        <Modal title="Book income tax provision" subtitle="A negative amount reverses an excess provision." onClose={() => { if (!busy) setProvision(null); }}>
          <form onSubmit={save} className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date *"><input type="date" value={provision.date} onChange={(event) => setProvision({ ...provision, date: event.target.value })} className={inputClass} required /></Field>
              <Field label="Amount *"><input type="number" step="0.01" value={provision.amount} onChange={(event) => setProvision({ ...provision, amount: event.target.value })} className={inputClass} required /></Field>
              <Field label="Narration" wide><input value={provision.narration} onChange={(event) => setProvision({ ...provision, narration: event.target.value })} className={inputClass} maxLength={500} placeholder="e.g. Provision for FY 2026-27, Q2" /></Field>
            </div>
            <ModalFooter><Button onClick={() => setProvision(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!Number(provision.amount)}>Book</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}
