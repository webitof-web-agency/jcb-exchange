/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, ReceiptText, RefreshCw, Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { downloadAuthedFile, readBlobErrorMessage } from '@/lib/authedDownload';

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

const money = (value: unknown) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = (value: unknown) => {
  if (!value) return '—';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
};
const label = (value: unknown) => String(value || '—').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());

export default function AccountsInvoicesPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [search, setSearch] = useState('');
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

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) => [record.invoiceNumber, record.recordNumber, record.vehicleNumber, record.sellerName, record.purchaserName, record.listingTitle, record.brandName, record.vehicleModel]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }, [records, search]);

  const issuedCount = records.filter((record) => Boolean(record.invoiceNumber)).length;

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

  return (
    <div className="min-h-full bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-[#3B61D9]"><ReceiptText className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Finance &amp; Accounts</span></div>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">Invoices</h1>
            <p className="mt-1 text-sm text-gray-500">All vehicle sale invoices in one place.</p>
          </div>
          <button type="button" onClick={() => void loadRecords()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><RefreshCw className="h-4 w-4" />Refresh</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Total records', records.length, 'text-gray-900'],
            ['Invoices generated', issuedCount, 'text-emerald-700'],
            ['Pending invoice', Math.max(records.length - issuedCount, 0), 'text-amber-700'],
          ].map(([title, value, color]) => <div key={String(title)} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p><p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p></div>)}
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
            <div><h2 className="text-sm font-semibold text-gray-900">Invoice register</h2><p className="mt-0.5 text-xs text-gray-500">Generated invoices can be downloaded from the sale record.</p></div>
            <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, vehicle, customer..." className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-[#3B61D9] focus:bg-white" /></div>
          </div>
          {loading ? <div className="flex min-h-56 items-center justify-center"><BrandLoader size="sm" /></div> : error ? <div className="p-8 text-center text-sm text-rose-600">{error}</div> : filteredRecords.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No invoice records found.</div> : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3 font-semibold">Invoice</th><th className="px-4 py-3 font-semibold">Vehicle</th><th className="px-4 py-3 font-semibold">Customer</th><th className="px-4 py-3 font-semibold">Sale date</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">Action</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRecords.map((record) => <tr key={record.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3"><p className="font-semibold text-gray-900">{record.invoiceNumber || 'Not generated'}</p><p className="text-xs text-gray-500">{record.recordNumber || '—'}</p></td>
                    <td className="px-4 py-3"><p className="font-medium text-gray-800">{record.vehicleNumber || '—'}</p><p className="max-w-[220px] truncate text-xs text-gray-500">{record.listingTitle || [record.brandName, record.vehicleModel].filter(Boolean).join(' ') || 'Vehicle sale'}</p></td>
                    <td className="px-4 py-3"><p className="font-medium text-gray-800">{record.purchaserName || '—'}</p><p className="text-xs text-gray-500">Seller: {record.sellerName || '—'}</p></td>
                    <td className="px-4 py-3 text-gray-600">{date(record.sellDate || record.invoiceGeneratedAt)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{money(record.sellAmount)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${record.invoiceNumber ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{record.invoiceNumber ? 'Generated' : 'Pending'}</span><p className="mt-1 text-xs text-gray-400">{label(record.dealStatus)}</p></td>
                    <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1.5"><button type="button" onClick={() => router.push(`${sellAccountsPath}/${record.id}`)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><ExternalLink className="h-3.5 w-3.5" />Open</button><button type="button" disabled={!record.invoiceNumber || downloadingId === record.id} onClick={() => void downloadInvoice(record)} className="inline-flex items-center gap-1 rounded-lg bg-[#FFC107] px-2.5 py-1.5 text-xs font-semibold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" />{downloadingId === record.id ? '...' : 'PDF'}</button></div></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
