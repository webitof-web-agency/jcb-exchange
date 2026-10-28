'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import api from '@/lib/api';
import { enumLabel, formatDate, formatInr } from '@/lib/financeWorkspaceClient';
import { Badge, EmptyState, ErrorBanner, LoadingState, Tabs, tableHeadClass } from './ui';
import DealTermsPanel from './DealTermsPanel';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

type PostingRef = { id: string; number: string | null; status: string } | null;
export type VehicleDetailData = {
  vehicle: {
    id: string; label: string; recordNumber: string; vehicleNumber: string | null; chassisNumber: string | null; brandName: string | null; vehicleModel: string | null;
    sellerName: string | null; purchaserName: string | null; sourceType: string | null; purchaseType: string; saleType: string; purchaseExchangeVehicle: string | null;
    saleExchangeVehicle: string | null; brokerName: string | null; dealStatus: string; rtoStatus: string; isLocked: boolean; isDraft: boolean; invoiceNumber: string | null; storedNetProfit: number;
  };
  summary: {
    purchaseDate: string | null; saleDate: string | null; status: string; daysInStock: number | null; purchase: number; costs: Array<{ head: string; label: string; amount: number }>;
    costTotal: number; landedCost: number; sale: number; gstAmount: number; cgst: number; sgst: number; igst: number; taxType: string; saleExGst: number; margin: number; profit: number;
    profitPercent: number | null; purchaseExchangeValue: number; saleExchangeValue: number; sellerPaid: number; sellerBalance: number; purchaserReceived: number; purchaserBalance: number;
  };
  books: { hasEntries: boolean; stock: number; exchangeClearing: number; exchangeStock: number; costClearing: number; salesIncome: number; cogs: number; profit: number; dealProfit: number; difference: number | null };
  postings: { purchase: PostingRef; costs: PostingRef; sale: PostingRef; cogs: PostingRef };
  payments: Array<{ id: string; side: string; amount: number; paymentDate: string; method: string; reference: string | null; voucher: PostingRef }>;
  ledger: Array<{ id: string; date: string; voucherId: string; voucherNumber: string | null; voucherType: string; status: string; narration: string; account: string; party: string | null; debit: number; credit: number }>;
  accountTotals: Array<{ code: string; name: string; debit: number; credit: number }>;
};

export const vehicleStatusTone = { SOLD: 'green', IN_STOCK: 'blue', DRAFT: 'slate', NOT_BOOKED: 'amber' } as const;

const PostingBadge = ({ posting }: { posting: PostingRef }) =>
  !posting ? <Badge tone="amber">Not in books</Badge> : posting.status === 'POSTED' ? <Badge tone="green">{posting.number}</Badge> : <Badge>Draft</Badge>;

type Tab = 'cost' | 'ledger' | 'payments' | 'terms';

/** Everything about one vehicle: cost sheet, books vs Sold Vehicles, payments and its ledger. */
export default function VehicleDetail({ vehicleId, includeDrafts, initialTab = 'cost' }: { vehicleId: string; includeDrafts: boolean; initialTab?: Tab }) {
  const pathname = usePathname();
  const prefix = pathname.startsWith('/admin') ? '/admin' : '/employee';
  const detail = useResource(async () => (await api.get(`/finance-hub/vehicle-finance/${vehicleId}`, { params: { includeDrafts: includeDrafts ? 'true' : undefined } })).data as VehicleDetailData, `vehicle-${vehicleId}-${includeDrafts}`);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);

  if (detail.loading) return <LoadingState />;
  if (detail.error || !detail.data) return <ErrorBanner message={detail.error || 'Could not load the vehicle.'} schemaMissing={detail.schemaMissing} />;
  const { vehicle, summary, books, postings, payments, ledger, accountTotals } = detail.data;

  const cards: Array<[string, string, string?]> = [
    ['Purchase', formatInr(summary.purchase), summary.purchaseDate ? formatDate(summary.purchaseDate) : undefined],
    ['Costs', formatInr(summary.costTotal)],
    ['Landed cost', formatInr(summary.landedCost)],
    ['Sale', formatInr(summary.sale), summary.saleDate ? formatDate(summary.saleDate) : undefined],
    ['GST on margin', formatInr(summary.gstAmount), summary.taxType],
    ['Net profit', formatInr(summary.profit), summary.profitPercent !== null ? `${summary.profitPercent}% of sale` : undefined],
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <Badge tone={vehicleStatusTone[summary.status as keyof typeof vehicleStatusTone] ?? 'slate'}>{enumLabel(summary.status)}</Badge>
        <Badge>{enumLabel(vehicle.dealStatus)}</Badge>
        {vehicle.sourceType ? <Badge tone="violet">From {enumLabel(vehicle.sourceType)}</Badge> : null}
        {vehicle.isLocked ? <Badge tone="slate">Locked</Badge> : null}
        {summary.daysInStock !== null ? <span className="text-xs text-slate-500">{summary.daysInStock} days {summary.status === 'SOLD' ? 'to sell' : 'in stock'}</span> : null}
        <Link href={`${prefix}/accounts/sell-accounts/${vehicle.id}`} className="ml-auto text-xs font-semibold text-blue-700 hover:underline">Open Sold Vehicle →</Link>
      </div>
      <p className="px-4 pt-1 text-xs text-slate-500">Seller: {vehicle.sellerName ?? '—'} · Purchaser: {vehicle.purchaserName ?? '—'}{vehicle.brokerName ? ` · Broker: ${vehicle.brokerName}` : ''}{vehicle.invoiceNumber ? ` · Invoice ${vehicle.invoiceNumber}` : ''}</p>

      <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, value, hint]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="text-[15px] font-semibold text-slate-900">{value}</p>{hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}</div>
        ))}
      </div>

      <div className="mx-5 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
        <span className="font-semibold text-slate-700">Books:</span>
        {books.hasEntries ? (
          <>
            <span>profit {formatInr(books.profit)}</span>
            {books.difference === null ? <Badge>Sale not in books yet</Badge> : books.difference === 0 ? <Badge tone="green">Matches Sold Vehicles</Badge> : <Badge tone="red">Differs by {formatInr(books.difference)}</Badge>}
            {books.stock ? <span className="text-xs text-slate-500">Stock {formatInr(books.stock)}</span> : null}
            {books.costClearing ? <span className="text-xs text-slate-500">Cost clearing {formatInr(Math.abs(books.costClearing))} unpaid</span> : null}
            {books.exchangeClearing ? <span className="text-xs text-slate-500">Exchange clearing {formatInr(books.exchangeClearing)}</span> : null}
            {books.dealProfit !== books.profit ? <span className="text-xs font-semibold text-slate-700" title="All income and expense booked on this vehicle: brokerage, partner share, consignment commission and costs">Deal result {formatInr(books.dealProfit)}</span> : null}
          </>
        ) : <span className="text-slate-500">No entries yet (automatic posting off, waiting, or before books begin).</span>}
        <span className="ml-auto flex flex-wrap gap-1 text-xs">Purchase <PostingBadge posting={postings.purchase} /> Sale <PostingBadge posting={postings.sale} /></span>
      </div>

      <Tabs<Tab> tabs={[{ key: 'cost', label: 'Cost sheet' }, { key: 'ledger', label: `Ledger (${ledger.length})` }, { key: 'payments', label: `Payments (${payments.length})` }, { key: 'terms', label: 'Deal terms' }]} active={tab} onChange={setTab} />

      {tab === 'terms' ? <DealTermsPanel vehicleId={vehicle.id} sale={summary.sale} purchase={summary.purchase} onSaved={detail.reload} /> : tab === 'cost' ? (
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <tbody className="divide-y divide-slate-100">
              <tr><td className="py-2">Purchase price {vehicle.purchaseType === 'EXCHANGE' ? <span className="text-xs text-slate-500">(incl. {formatInr(summary.purchaseExchangeValue)} by exchange{vehicle.purchaseExchangeVehicle ? `: ${vehicle.purchaseExchangeVehicle}` : ''})</span> : null}</td><td className="py-2 text-right font-semibold">{formatInr(summary.purchase)}</td></tr>
              {summary.costs.map((cost) => <tr key={cost.head}><td className="py-2 pl-4 text-slate-600">+ {cost.label}</td><td className="py-2 text-right">{formatInr(cost.amount)}</td></tr>)}
              <tr className="font-semibold"><td className="py-2">Landed cost</td><td className="py-2 text-right">{formatInr(summary.landedCost)}</td></tr>
              <tr><td className="py-2">Sale price {vehicle.saleType === 'EXCHANGE' ? <span className="text-xs text-slate-500">(incl. {formatInr(summary.saleExchangeValue)} by exchange{vehicle.saleExchangeVehicle ? `: ${vehicle.saleExchangeVehicle}` : ''})</span> : null}</td><td className="py-2 text-right font-semibold">{formatInr(summary.sale)}</td></tr>
              <tr><td className="py-2 pl-4 text-slate-600">Margin (sale − purchase)</td><td className="py-2 text-right">{formatInr(summary.margin)}</td></tr>
              <tr><td className="py-2 pl-4 text-slate-600">− GST on margin ({summary.taxType}{summary.igst ? '' : `: CGST ${formatInr(summary.cgst)} + SGST ${formatInr(summary.sgst)}`})</td><td className="py-2 text-right">{formatInr(summary.gstAmount)}</td></tr>
              <tr><td className="py-2 pl-4 text-slate-600">− Costs</td><td className="py-2 text-right">{formatInr(summary.costTotal)}</td></tr>
              <tr className="text-[15px] font-semibold"><td className="py-2">Net profit</td><td className={`py-2 text-right ${summary.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatInr(summary.profit)}</td></tr>
              <tr className="text-xs text-slate-500"><td className="py-2">Stored on the Sold Vehicle record</td><td className="py-2 text-right">{formatInr(vehicle.storedNetProfit)}</td></tr>
            </tbody>
          </table>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3 text-[13px]"><p className="text-[11px] uppercase tracking-wide text-slate-500">Seller</p>Paid {formatInr(summary.sellerPaid)} · Balance <span className="font-semibold">{formatInr(summary.sellerBalance)}</span></div>
            <div className="rounded-lg bg-slate-50 p-3 text-[13px]"><p className="text-[11px] uppercase tracking-wide text-slate-500">Purchaser</p>Received {formatInr(summary.purchaserReceived)} · Balance <span className="font-semibold">{formatInr(summary.purchaserBalance)}</span></div>
          </div>
        </div>
      ) : tab === 'ledger' ? (
        ledger.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Voucher</th><th className="px-3 py-2">Ledger</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Particulars</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((line) => (
                  <tr key={line.id} onClick={() => setOpenVoucher(line.voucherId)} className="cursor-pointer hover:bg-amber-50/40">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(line.date)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{line.voucherNumber ?? 'Draft'}{line.status !== 'POSTED' ? <span className="block font-sans text-[11px] text-slate-400">{enumLabel(line.status)}</span> : null}</td>
                    <td className="px-3 py-2 text-xs">{line.account}</td>
                    <td className="px-3 py-2 text-xs">{line.party ?? '—'}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-xs" title={line.narration}>{line.narration}</td>
                    <td className="px-3 py-2 text-right">{line.debit ? formatInr(line.debit) : ''}</td>
                    <td className="px-3 py-2 text-right">{line.credit ? formatInr(line.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {accountTotals.map((account) => <div key={account.code} className="rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="font-mono text-slate-500">{account.code}</span> {account.name}: <span className="font-semibold">{formatInr(account.debit - account.credit)}</span> {account.debit - account.credit >= 0 ? 'Dr' : 'Cr'}</div>)}
            </div>
          </div>
        ) : <EmptyState title="No ledger entries for this vehicle yet" description="They appear when automatic posting runs (or as drafts in shadow mode — tick “Include drafts”)." />
      ) : payments.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Side</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">In books</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-3 py-2">{formatDate(payment.paymentDate)}</td>
                  <td className="px-3 py-2">{payment.side === 'SELLER_PAYMENT' ? 'Paid to seller' : 'Received from purchaser'}</td>
                  <td className="px-3 py-2 text-xs">{enumLabel(payment.method)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{payment.reference ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatInr(payment.amount)}</td>
                  <td className="px-3 py-2"><PostingBadge posting={payment.voucher} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No payments recorded" description="Payments are added on the Sold Vehicle record." />}

      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={detail.reload} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </div>
  );
}
