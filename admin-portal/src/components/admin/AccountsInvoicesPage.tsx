/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileSpreadsheet, RefreshCw, Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { downloadAuthedFile, readBlobErrorMessage } from '@/lib/authedDownload';
import { downloadTableFile } from '@/lib/tabularExport';
import FinancePageHeader from '@/components/financeWorkspace/FinancePageHeader';
import { Badge, Button, inputClass, tableHeadClass } from '@/components/financeWorkspace/ui';

type InvoiceRecord = {
  id: string;
  recordNumber?: string | null;
  invoiceNumber?: string | null;
  invoiceGeneratedAt?: string | null;
  invoiceSentAt?: string | null;
  sellDate?: string | null;
  sellerName?: string | null;
  purchaserName?: string | null;
  vehicleNumber?: string | null;
  listingTitle?: string | null;
  brandName?: string | null;
  vehicleModel?: string | null;
  sellAmount?: number | string | null;
  dealStatus?: string | null;
};

type StatusFilter = 'all' | 'generated' | 'pending';

const money = (value: unknown) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = (value: unknown) => {
  if (!value) return '—';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
};
const label = (value: unknown) => String(value || '—').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
const vehicleTitle = (record: InvoiceRecord) => record.listingTitle || [record.brandName, record.vehicleModel].filter(Boolean).join(' ') || 'Vehicle sale';

export default function AccountsInvoicesPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const sellAccountsPath = pathname.startsWith('/employee') ? '/employee/accounts/sell-accounts' : '/admin/accounts/sell-accounts';

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/recruitment/admin/sell-accounts');
      setRecords(Array.isArray(response.data?.records) ? response.data.records : []);
    } catch {
      setError('Unable to load invoice records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const issuedCount = records.filter((record) => Boolean(record.invoiceNumber)).length;
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      if (status === 'generated' && !record.invoiceNumber) return false;
      if (status === 'pending' && record.invoiceNumber) return false;
      if (!query) return true;
      return [record.invoiceNumber, record.recordNumber, record.vehicleNumber, record.sellerName, record.purchaserName, record.listingTitle, record.brandName, record.vehicleModel]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [records, search, status]);
  const filteredTotal = filteredRecords.reduce((sum, record) => sum + Number(record.sellAmount || 0), 0);

  const downloadInvoice = async (record: InvoiceRecord) => {
    if (!record.invoiceNumber || downloadingId) return;
    try {
      setDownloadingId(record.id);
      await downloadAuthedFile(`/recruitment/admin/sell-accounts/${encodeURIComponent(record.id)}/invoice`, `${record.invoiceNumber}.pdf`);
      toast.success('Invoice downloaded.');
    } catch (caught) {
      toast.error(await readBlobErrorMessage(caught, 'Unable to download invoice.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const exportRows = () => {
    if (!filteredRecords.length) {
      toast.info('There are no invoices to export.');
      return;
    }
    downloadTableFile({
      columns: [
        { header: 'Invoice number', value: (row: InvoiceRecord) => row.invoiceNumber || '' },
        { header: 'Record number', value: (row: InvoiceRecord) => row.recordNumber || '' },
        { header: 'Vehicle number', value: (row: InvoiceRecord) => row.vehicleNumber || '' },
        { header: 'Vehicle', value: vehicleTitle },
        { header: 'Customer', value: (row: InvoiceRecord) => row.purchaserName || '' },
        { header: 'Seller', value: (row: InvoiceRecord) => row.sellerName || '' },
        { header: 'Sale date', value: (row: InvoiceRecord) => date(row.sellDate || row.invoiceGeneratedAt) },
        { header: 'Amount', value: (row: InvoiceRecord) => Number(row.sellAmount || 0) },
        { header: 'Invoice status', value: (row: InvoiceRecord) => (row.invoiceNumber ? 'Generated' : 'Pending') },
        { header: 'Deal status', value: (row: InvoiceRecord) => label(row.dealStatus) },
      ],
      rows: filteredRecords,
      fileName: `vehicle-sale-invoices-${new Date().toISOString().slice(0, 10)}`,
      format: 'csv',
    });
  };

  const chips: Array<[StatusFilter, string, number]> = [
    ['all', 'All', records.length],
    ['generated', 'Generated', issuedCount],
    ['pending', 'Pending invoice', Math.max(records.length - issuedCount, 0)],
  ];

  return (
    <div className="space-y-3 tabular-nums">
      <FinancePageHeader
        page={{ href: pathname, label: 'Vehicle Sale Invoices', group: 'Sales & Revenue' }}
        actions={(
          <>
            <Button icon={<FileSpreadsheet />} onClick={exportRows}>Export CSV</Button>
            <Button icon={<RefreshCw />} onClick={() => void loadRecords()}>Refresh</Button>
          </>
        )}
      />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1">
            {chips.map(([key, title, count]) => (
              <button key={key} type="button" onClick={() => setStatus(key)} className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition ${status === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {title}<span className={`rounded px-1 text-[11px] ${status === key ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
              </button>
            ))}
            <span className="ml-1 text-[12px] text-slate-500">Total <span className="font-medium text-slate-900">{money(filteredTotal)}</span></span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Invoice, vehicle, customer…" className={`${inputClass} pl-8`} />
          </div>
        </div>
        {loading ? <div className="flex min-h-48 items-center justify-center"><BrandLoader size="sm" /></div> : error ? <p className="p-6 text-center text-[13px] text-red-700">{error}</p> : filteredRecords.length === 0 ? <p className="p-8 text-center text-[13px] text-slate-500">No invoice records found.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead className={tableHeadClass}>
                <tr><th className="px-3 py-2 font-medium">Invoice</th><th className="px-3 py-2 font-medium">Vehicle</th><th className="px-3 py-2 font-medium">Customer</th><th className="px-3 py-2 font-medium">Sale date</th><th className="px-3 py-2 text-right font-medium">Amount</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 text-right font-medium">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record) => (
                  <tr key={record.id} onClick={() => router.push(`${sellAccountsPath}/${record.id}`)} className="cursor-pointer hover:bg-amber-50/40">
                    <td className="px-3 py-1.5"><p className={`font-mono text-[12px] font-medium ${record.invoiceNumber ? 'text-slate-900' : 'text-slate-400'}`}>{record.invoiceNumber || 'Not generated'}</p><p className="text-[11px] text-slate-500">{record.recordNumber || '—'}</p></td>
                    <td className="px-3 py-1.5"><p className="font-medium text-slate-900">{record.vehicleNumber || '—'}</p><p className="max-w-[220px] truncate text-[11px] text-slate-500">{vehicleTitle(record)}</p></td>
                    <td className="px-3 py-1.5"><p className="text-slate-900">{record.purchaserName || '—'}</p><p className="text-[11px] text-slate-500">Seller: {record.sellerName || '—'}</p></td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{date(record.sellDate || record.invoiceGeneratedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-slate-900">{money(record.sellAmount)}</td>
                    <td className="px-3 py-1.5"><Badge tone={record.invoiceNumber ? 'green' : 'amber'}>{record.invoiceNumber ? 'Generated' : 'Pending'}</Badge><p className="mt-0.5 text-[11px] text-slate-500">{label(record.dealStatus)}</p></td>
                    <td className="px-3 py-1.5 text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => router.push(`${sellAccountsPath}/${record.id}`)} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50"><ExternalLink className="h-3.5 w-3.5" />Open</button>
                        <button type="button" disabled={!record.invoiceNumber || downloadingId === record.id} onClick={() => void downloadInvoice(record)} className="inline-flex h-7 items-center gap-1 rounded-md bg-amber-400 px-2 text-[12px] font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-3.5 w-3.5" />{downloadingId === record.id ? '…' : 'PDF'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
