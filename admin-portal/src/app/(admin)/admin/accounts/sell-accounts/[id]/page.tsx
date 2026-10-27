'use client';

import Image from 'next/image';
import { type ReactNode, useEffect, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, ClipboardCheck, Car, Copy, Download, Edit2, FileText, Handshake, IndianRupee,
  Loader2, LockKeyhole, Phone, Receipt, Send, ShoppingCart, Undo2, User, Wallet, AlertTriangle,
} from 'lucide-react';
import SellAccountRefundsCard from '@/components/accounts/sold-vehicle/SellAccountRefundsCard';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';
import { normalizeSellAccountDocuments } from '@/lib/sellAccountDocuments.mjs';
import { calculateSellAccountFinance, getSellAccountTaxLines, GST_RATE_PERCENT, SELL_ACCOUNT_EXPENSE_FIELDS } from '@/lib/sellAccountFinance.mjs';
import { getSourceTypeLabel, JCB_EXCHANGE_COMPANY_NAME } from '@/lib/soldVehicleParties.mjs';
import { summarizeTransferTasks } from '@/lib/rtoTransferTasks.mjs';
import { downloadAuthedFile, readBlobErrorMessage } from '@/lib/authedDownload';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { getAccountDeletePermissions, getAccountUpdatePermissions } from '@/lib/accountsPermissions';
import { useAuthStore } from '@/store/authStore';
import BrandLoader from '@/components/ui/BrandLoader';
import {
  accountsPortalBase,
  DEAL_STATUS_CONFIG,
  formatDisplayDate as formatDate,
  formatInr,
  normalizeServerSellAccount,
  normalizeSellAccountRecord,
  type SellAccountApiRecord,
  type SellAccountDocument,
  type SellAccountDocuments,
  type SellAccountExpenseBreakdown,
  type SellAccountRecord,
  type StoredSellAccountRecord,
} from '@/components/accounts/sold-vehicle/soldVehicleModel';

function SecurePdfDocument({ label, document }: { label: string; document?: SellAccountDocument | null }) {
  const [viewerUrl, setViewerUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const isImage = document?.mimeType?.startsWith('image/') || /\.(?:jpe?g|png|webp|gif)$/i.test(document?.originalName || '');

  useEffect(() => () => {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  }, [viewerUrl]);

  const fetchDocumentBlob = async () => {
    if (!document?.fileUrl) throw new Error('Document file is not available.');
    const response = await api.get(normalizeSecureDocumentPath(document.fileUrl), { responseType: 'blob' });
    const documentMimeType = isImage
      ? (document.mimeType?.startsWith('image/') ? document.mimeType : response.data.type || 'image/*')
      : document.mimeType || 'application/pdf';
    return new Blob([response.data], { type: documentMimeType });
  };

  const openDocument = async () => {
    if (!document?.fileUrl || viewerUrl || loading) return;
    setLoading(true);
    setError('');
    try {
      setViewerUrl(URL.createObjectURL(await fetchDocumentBlob()));
    } catch {
      setError('Unable to load this document.');
    } finally {
      setLoading(false);
    }
  };

  const downloadDocument = async () => {
    if (!document?.fileUrl || downloading) return;
    setDownloading(true);
    setError('');
    try {
      const downloadUrl = URL.createObjectURL(await fetchDocumentBlob());
      const anchor = window.document.createElement('a');
      const requestedName = document.originalName || document.fileName || `${label}.${isImage ? 'jpg' : 'pdf'}`;
      const safeName = requestedName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || `${label}.pdf`;
      anchor.href = downloadUrl;
      anchor.download = /\.(?:pdf|jpe?g|png|webp|gif)$/i.test(safeName) ? safeName : `${safeName}.${isImage ? 'jpg' : 'pdf'}`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch {
      setError('Unable to download this document.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
          <p className="truncate text-xs text-gray-700">{document?.originalName || 'Not uploaded'}</p>
        </div>
        {document ? (
          <div className="flex shrink-0 gap-1.5">
            <button type="button" onClick={() => void openDocument()} disabled={loading || downloading} className="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-gray-950 disabled:opacity-60">
              {loading ? 'Loading...' : viewerUrl ? 'Loaded' : 'View'}
            </button>
            <button type="button" onClick={() => void downloadDocument()} disabled={loading || downloading} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 disabled:opacity-60">
              <Download className="h-3 w-3" />{downloading ? '...' : 'Download'}
            </button>
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p> : null}
      {viewerUrl ? (
        isImage
          ? <Image src={viewerUrl} alt={label} width={800} height={450} unoptimized className="mt-2 max-h-64 w-full rounded-md border border-gray-200 bg-white object-contain p-1" />
          : <iframe title={label} src={viewerUrl} className="mt-2 h-56 w-full rounded-md border border-gray-200 bg-white" />
      ) : null}
    </div>
  );
}

function Card({ icon, title, children, className = '', aside }: { icon: ReactNode; title: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white shadow-xs ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700">{icon}{title}</h3>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Detail({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-0.5 truncate ${strong ? 'text-base font-extrabold text-gray-950' : 'text-sm font-semibold text-gray-800'}`}>{value || '—'}</p>
    </div>
  );
}

function PartyCard({ tone, icon, title, name, phone, lines }: { tone: 'amber' | 'dark' | 'blue'; icon: ReactNode; title: string; name: string; phone?: string; lines: Array<[string, ReactNode]> }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50/40',
    dark: 'border-gray-900/10 bg-gray-950 text-white',
    blue: 'border-blue-200 bg-blue-50/40',
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider ${tone === 'dark' ? 'text-amber-400' : tone === 'amber' ? 'text-amber-900' : 'text-blue-900'}`}>{icon}{title}</p>
      <p className={`truncate text-sm font-bold ${tone === 'dark' ? 'text-white' : 'text-gray-950'}`}>{name || '—'}</p>
      {phone ? <a href={`tel:${phone}`} className={`mt-0.5 inline-flex items-center gap-1 text-xs font-medium hover:underline ${tone === 'dark' ? 'text-gray-300' : 'text-blue-600'}`}><Phone className="h-3 w-3" />{phone}</a> : null}
      <dl className="mt-2 space-y-0.5 text-xs">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className={tone === 'dark' ? 'text-gray-400' : 'text-gray-500'}>{label}</dt>
            <dd className={`truncate text-right font-semibold ${tone === 'dark' ? 'text-white' : 'text-gray-800'}`}>{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function SellAccountDetailView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const id = params?.id as string;
  const portal = accountsPortalBase(pathname);
  const listPath = `${portal}/accounts/sell-accounts`;
  const rtoBasePath = `${portal}/accounts/rto-work-status`;
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const canUpdate = isAdmin || hasAnyPermission(currentUser?.permissions || [], getAccountUpdatePermissions('sell-accounts'));
  const canDelete = isAdmin || hasAnyPermission(currentUser?.permissions || [], getAccountDeletePermissions('sell-accounts'));
  // Refund approval is a separate permission, not part of Sold Vehicles CRUD.
  const canApproveRefund = isAdmin || hasAnyPermission(currentUser?.permissions || [], ['accounts.sell.refund.approve']);

  const [record, setRecord] = useState<SellAccountRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoiceBusy, setInvoiceBusy] = useState<'download' | 'resend' | null>(null);
  const [latestInvoiceUrl, setLatestInvoiceUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadRecord = async () => {
      if (!id) return;
      try {
        const response = await api.get<{ record?: SellAccountApiRecord }>(`/recruitment/admin/sell-accounts/${encodeURIComponent(id)}`);
        if (response.data?.record && !cancelled) {
          setRecord(normalizeServerSellAccount(response.data.record));
          setLoading(false);
          return;
        }
      } catch (error) {
        console.warn('Sold Vehicle API detail unavailable; checking local draft records.', error);
      }
      try {
        const parsed = JSON.parse(localStorage.getItem('jcb_sell_accounts_records') || '[]') as StoredSellAccountRecord[];
        const found = Array.isArray(parsed) ? parsed.find((item) => item.id === id) : null;
        if (found && !cancelled) setRecord(normalizeSellAccountRecord(found));
      } catch {
        // Legacy browser cache only.
      }
      if (!cancelled) setLoading(false);
    };
    void loadRecord();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <BrandLoader variant="section" size="sm" bg="light" text="Loading sold vehicle..." />;

  if (!record) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-gray-400" />
        <p className="text-lg font-medium text-gray-600">Record not found</p>
        <button onClick={() => router.push(listPath)} className="font-medium text-blue-600 hover:underline">Go back to list</button>
      </div>
    );
  }

  const statusInfo = DEAL_STATUS_CONFIG[record.dealStatus] || DEAL_STATUS_CONFIG.OPEN;
  const StatusIcon = statusInfo.icon;
  const saleExchangeValue = record.saleType === 'EXCHANGE' ? record.saleExchangeValue || 0 : 0;
  const purchaseExchangeValue = record.purchaseType === 'EXCHANGE' ? record.purchaseExchangeValue || 0 : 0;
  const finance = calculateSellAccountFinance({
    sellAmount: record.sellAmount,
    purchaseAmount: record.purchaseAmount,
    expenses: record.expenses,
    marginBasis: record.marginBasis,
    sellerState: record.sellerState,
    purchaserState: record.purchaserState,
    saleExchangeValue,
    purchaseExchangeValue,
    payments: record.payments,
    refunds: record.refunds,
    cancelled: Boolean(record.cancelledAt),
  });
  const documents = normalizeSellAccountDocuments(record) as SellAccountDocuments;
  const rtoProgress = summarizeTransferTasks((record.rtoRecord?.taskStatuses || []).map((status) => ({ status })));
  const breakdown = record.expenseBreakdown as SellAccountExpenseBreakdown | undefined;
  const deliveryChannels = record.invoiceDelivery?.channels || [];

  const downloadInvoice = async () => {
    setInvoiceBusy('download');
    try {
      await downloadAuthedFile(`/recruitment/admin/sell-accounts/${encodeURIComponent(record.id)}/invoice`, `Invoice-${record.invoiceNumber || record.id}.pdf`);
    } catch (error) {
      toast.error(await readBlobErrorMessage(error, 'Unable to download the invoice.'));
    } finally {
      setInvoiceBusy(null);
    }
  };

  const resendInvoice = async () => {
    if (!window.confirm('Send the invoice again to the customer on WhatsApp and SMS? A fresh link will be created and the old link will stop working.')) return;
    setInvoiceBusy('resend');
    try {
      const response = await api.post<{ record?: SellAccountApiRecord; delivery?: { invoiceUrl?: string; anySent?: boolean } }>(`/recruitment/admin/sell-accounts/${encodeURIComponent(record.id)}/invoice/resend`);
      if (response.data?.record) setRecord(normalizeServerSellAccount(response.data.record));
      setLatestInvoiceUrl(response.data?.delivery?.invoiceUrl || '');
      if (response.data?.delivery?.anySent) toast.success('Invoice sent to the customer.');
      else toast.warn('A new invoice link was created, but WhatsApp/SMS could not be sent. Check the automation settings.');
    } catch (error) {
      toast.error(await readBlobErrorMessage(error, 'Unable to resend the invoice.'));
    } finally {
      setInvoiceBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-3 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xs">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => router.push(listPath)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold text-gray-950">
              {record.listingTitle || [record.brandName, record.vehicleModel].filter(Boolean).join(' ') || 'Sold Vehicle'}
              <span className="ml-2 text-sm font-bold text-amber-700">{record.vehicleNumber}</span>
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 text-xs font-medium text-gray-500">
              <span>{record.recordNumber || record.id}</span>
              {record.invoiceNumber ? <span>· Invoice {record.invoiceNumber}</span> : null}
              {record.isLocked ? <span className="inline-flex items-center gap-1 font-semibold text-slate-600"><LockKeyhole className="h-3.5 w-3.5" />Locked — view only</span> : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
            <StatusIcon className="h-3.5 w-3.5" />{statusInfo.label}
          </span>
          {record.rtoRecord?.id ? (
            <button type="button" onClick={() => router.push(`${rtoBasePath}/${encodeURIComponent(record.rtoRecord!.id)}${record.isLocked ? '' : '/edit'}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-100">
              <ClipboardCheck className="h-3.5 w-3.5" />RTO Work{rtoProgress.total ? ` · ${rtoProgress.done}/${rtoProgress.total}` : ''}
            </button>
          ) : null}
          {!record.isLocked && canUpdate ? (
            <button onClick={() => router.push(`${listPath}/${encodeURIComponent(record.id)}/edit`)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">
              <Edit2 className="h-3.5 w-3.5" />Edit
            </button>
          ) : null}
        </div>
      </div>

      {/* Vehicle */}
      <Card icon={<Car className="h-4 w-4" />} title="Vehicle & Owner">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <Detail label="Registration No." value={record.vehicleNumber} strong />
          <Detail label="Chassis No." value={record.chassisNumber} />
          <Detail label="Model" value={record.vehicleModel} />
          <Detail label="Brand" value={record.brandName} />
          <Detail label="Category" value={record.vehicleType} />
          <Detail label="RC Owner" value={record.ownerName} />
          <Detail label="Owner Mobile" value={record.ownerNumber ? <a href={`tel:${record.ownerNumber}`} className="text-blue-600 hover:underline">{record.ownerNumber}</a> : ''} />
          <Detail label="Sell Date" value={formatDate(record.purchaserDate || record.sellDate)} />
        </div>
      </Card>

      {/* Deal flow */}
      <Card icon={<Handshake className="h-4 w-4" />} title="Purchase → Broker → Sale">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.7fr)_auto_minmax(0,1fr)]">
          <PartyCard
            tone="amber"
            icon={<ShoppingCart className="h-3.5 w-3.5" />}
            title={`Purchased from · ${getSourceTypeLabel(record.sourceType)}`}
            name={record.sellerName}
            phone={record.sellerNumber}
            lines={[
              ['Date', formatDate(record.sellerDate)],
              ['Location', [record.sellerCity, record.sellerState].filter(Boolean).join(', ')],
              ['Type', record.purchaseType === 'EXCHANGE' ? 'Exchange' : 'Purchase'],
              ['Amount', formatInr(record.purchaseAmount)],
              ...(record.purchaseType === 'EXCHANGE' ? [['Exchange vehicle', `${record.purchaseExchangeVehicle || '—'} (${formatInr(purchaseExchangeValue)})`] as [string, ReactNode]] : []),
            ]}
          />
          <div className="hidden items-center text-gray-300 lg:flex"><ArrowRight className="h-5 w-5" /></div>
          <PartyCard
            tone="dark"
            icon={<Handshake className="h-3.5 w-3.5" />}
            title={`Broker · ${JCB_EXCHANGE_COMPANY_NAME}`}
            name={record.brokerName || JCB_EXCHANGE_COMPANY_NAME}
            phone={record.brokerNumber}
            lines={[
              ['Margin (incl. GST)', formatInr(finance.gst.marginAmount)],
              [`GST ${GST_RATE_PERCENT}%`, formatInr(finance.gst.gstAmount)],
              ['Final profit', formatInr(finance.gst.netProfitAfterGst)],
            ]}
          />
          <div className="hidden items-center text-gray-300 lg:flex"><ArrowRight className="h-5 w-5" /></div>
          <PartyCard
            tone="blue"
            icon={<User className="h-3.5 w-3.5" />}
            title="Sold to customer"
            name={record.purchaserName}
            phone={record.purchaserNumber}
            lines={[
              ['Date', formatDate(record.purchaserDate || record.sellDate)],
              ['Location', [record.purchaserCity, record.purchaserState].filter(Boolean).join(', ')],
              ['Type', record.saleType === 'EXCHANGE' ? 'Exchange' : 'Sell'],
              ['Amount', formatInr(record.sellAmount)],
              ...(record.saleType === 'EXCHANGE' ? [['Exchange vehicle', `${record.saleExchangeVehicle || '—'} (${formatInr(saleExchangeValue)})`] as [string, ReactNode]] : []),
            ]}
          />
        </div>
      </Card>

      {/* Finance */}
      <Card
        icon={<IndianRupee className="h-4 w-4" />}
        title="Financial Breakdown"
        aside={<span className="text-[11px] font-semibold text-gray-500">{finance.gst.stateClassification} · {finance.gst.marginBasis === 'AFTER_EXPENSES' ? 'margin after expenses' : 'margin scheme'}</span>}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {((finance.gst.marginBasis === 'AFTER_EXPENSES'
            ? [
              ['Purchase', record.purchaseAmount, ''],
              ['Sell', record.sellAmount, ''],
              ['Expenses', record.expenses, ''],
              ['Margin (incl. GST)', finance.gst.marginAmount, ''],
              ...getSellAccountTaxLines(finance.gst).map((line) => [line.label, line.amount, 'blue'] as [string, number, string]),
              ['Final profit', finance.gst.netProfitAfterGst, 'emerald'],
            ]
            : [
              ['Purchase', record.purchaseAmount, ''],
              ['Sell', record.sellAmount, ''],
              ['Margin (incl. GST)', finance.gst.marginAmount, ''],
              ...getSellAccountTaxLines(finance.gst).map((line) => [line.label, line.amount, 'blue'] as [string, number, string]),
              ['Margin after GST', finance.gst.taxableAmount, ''],
              ['Expenses', record.expenses, ''],
              ['Final profit', finance.gst.netProfitAfterGst, 'emerald'],
            ]) as Array<[string, number, string]>).map(([label, value, accent]) => (
            <div key={label} className={`rounded-lg border px-3 py-2 ${accent === 'blue' ? 'border-blue-200 bg-blue-50/60' : accent === 'emerald' ? 'border-emerald-200 bg-emerald-50/70' : 'border-gray-200 bg-gray-50/60'}`}>
              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
              <p className={`mt-0.5 text-base font-extrabold tabular-nums ${value < 0 ? 'text-rose-600' : accent === 'emerald' ? 'text-emerald-700' : 'text-gray-950'}`}>{formatInr(value)}</p>
            </div>
          ))}
        </div>
        {breakdown && record.expenses > 0 ? (
          <p className="mt-2 text-xs text-gray-600">
            Expenses: {SELL_ACCOUNT_EXPENSE_FIELDS.filter((field) => Number(breakdown[field.key as keyof SellAccountExpenseBreakdown] || 0) > 0)
              .map((field) => `${field.key === 'other' && breakdown.otherLabel ? breakdown.otherLabel : field.label} ${formatInr(Number(breakdown[field.key as keyof SellAccountExpenseBreakdown]))}`)
              .join(' · ')}
          </p>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* Payments */}
        <Card icon={<Wallet className="h-4 w-4" />} title="Payments" aside={<span className="text-[11px] font-bold text-gray-600">{finance.payments.purchaserPaymentStatus}</span>}>
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Detail label="Customer pays (cash)" value={formatInr(finance.payments.customerCashReceivable)} />
            <Detail label="Received" value={formatInr(finance.payments.purchaserReceived)} />
            <Detail label="Customer balance" value={formatInr(finance.payments.purchaserBalance)} />
            <Detail label="Seller balance" value={formatInr(finance.payments.sellerBalance)} />
          </div>
          {(record.payments || []).length ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500"><tr><th className="px-2.5 py-2">Side</th><th className="px-2.5 py-2">Amount</th><th className="px-2.5 py-2">Date</th><th className="px-2.5 py-2">Method</th><th className="px-2.5 py-2">Ref.</th><th className="px-2.5 py-2">Receipt</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {(record.payments || []).map((payment, index) => (
                    <tr key={payment.id || index} className={payment.receiptStatus === 'CANCELLED' ? 'opacity-60' : undefined}>
                      <td className="px-2.5 py-1.5 font-semibold">{payment.side === 'PURCHASER_RECEIPT' ? 'Customer' : 'Seller'}</td>
                      <td className="px-2.5 py-1.5 font-bold tabular-nums">{formatInr(payment.amount)}</td>
                      <td className="px-2.5 py-1.5">{formatDate(payment.paymentDate)}</td>
                      <td className="px-2.5 py-1.5">{payment.method.replace('_', ' ')}</td>
                      <td className="px-2.5 py-1.5 font-mono text-[11px] text-gray-500">{payment.reference || '—'}{payment.drawnOn ? ` · ${payment.drawnOn}` : ''}</td>
                      <td className="px-2.5 py-1.5 text-[11px]">
                        {payment.side !== 'PURCHASER_RECEIPT' ? '—'
                          : payment.receiptStatus === 'DRAFT' ? <span className="font-bold text-amber-700">Draft</span>
                            : payment.receiptStatus === 'CANCELLED' ? <span className="font-bold text-gray-500" title={payment.cancelReason || undefined}>Cancelled {payment.receiptNumber || ''}</span>
                              : <span className="font-mono text-emerald-700">{payment.receiptNumber || 'Real'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-gray-500">No payments recorded.</p>}
          {finance.payments.purchaserDraftPending > 0 ? (
            <p className="mt-2 text-[11px] text-amber-700">
              {formatInr(finance.payments.purchaserDraftPending)} is in draft receipts and is not counted yet. Convert them to real receipts from the Edit screen.
            </p>
          ) : null}
        </Card>

        {/* Invoice */}
        <Card icon={<Receipt className="h-4 w-4" />} title="Customer Invoice">
          {record.invoiceNumber ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Detail label="Invoice No." value={record.invoiceNumber} strong />
                <Detail label="Generated" value={formatDate(record.invoiceGeneratedAt || '')} />
                <Detail label="Last sent" value={record.invoiceSentAt ? formatDate(record.invoiceSentAt) : 'Not sent'} />
              </div>
              {deliveryChannels.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {deliveryChannels.map((channel) => (
                    <span key={channel.channel} title={channel.detail || undefined} className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${channel.sent ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                      {channel.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}: {channel.sent ? 'Sent' : channel.status.replaceAll('_', ' ').toLowerCase()}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={invoiceBusy !== null} onClick={() => void downloadInvoice()} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-60">
                  {invoiceBusy === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Download PDF
                </button>
                {canUpdate ? (
                  <button type="button" disabled={invoiceBusy !== null} onClick={() => void resendInvoice()} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
                    {invoiceBusy === 'resend' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Resend to customer
                  </button>
                ) : null}
              </div>
              {latestInvoiceUrl ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
                  <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-600">{latestInvoiceUrl}</p>
                  <button type="button" onClick={() => { void navigator.clipboard?.writeText(latestInvoiceUrl); toast.success('Link copied.'); }} className="rounded-md p-1 text-gray-500 hover:bg-white" aria-label="Copy invoice link"><Copy className="h-3.5 w-3.5" /></button>
                </div>
              ) : null}
              <p className="text-[11px] text-gray-500">The customer link only works for 180 days and only the latest link is valid.</p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              The Bill of Supply (no GST charged) is generated automatically once real money receipts cover the full sale amount.
            </p>
          )}
        </Card>
      </div>

      {!record.isDraft ? (
        <Card
          icon={<Undo2 className="h-4 w-4" />}
          title="Refunds & Cancellation"
          aside={finance.payments.purchaserRefunded > 0 ? <span className="text-[11px] font-bold text-gray-600">Refunded {formatInr(finance.payments.purchaserRefunded)}</span> : undefined}
        >
          <SellAccountRefundsCard
            record={record}
            refundable={finance.payments.purchaserRefundable}
            onRecordChange={setRecord}
            currentUserId={currentUser?.id}
            isSuperAdmin={currentUser?.role === 'SUPER_ADMIN'}
            canRequest={canUpdate}
            canApprove={canApproveRefund}
            canCancelSale={canDelete}
          />
        </Card>
      ) : null}

      {/* Documents */}
      <Card icon={<FileText className="h-4 w-4" />} title="Deeds & Documents">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Purchase side</p>
            <SecurePdfDocument label="Purchase Deed" document={documents.purchaseDeed} />
            <SecurePdfDocument label="Aadhaar Card" document={documents.purchaseAadhaarCard} />
            <SecurePdfDocument label="PAN Card" document={documents.purchasePanCard} />
            <SecurePdfDocument label="GST Certificate" document={documents.purchaseGstCertificate} />
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Sale side</p>
            <SecurePdfDocument label="Sell Deed" document={documents.sellDeed} />
            <SecurePdfDocument label="Aadhaar Card" document={documents.sellAadhaarCard} />
            <SecurePdfDocument label="PAN Card" document={documents.sellPanCard} />
            <SecurePdfDocument label="GST Certificate" document={documents.sellGstCertificate} />
          </div>
        </div>
      </Card>

      <Card icon={<FileText className="h-4 w-4" />} title="Transfer Details & Remark">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm font-medium text-gray-900">{record.transferDetails || 'No transfer details specified.'}</div>
          <div className="whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-900">{record.noteSheet || 'No additional notes.'}</div>
        </div>
      </Card>
    </div>
  );
}
