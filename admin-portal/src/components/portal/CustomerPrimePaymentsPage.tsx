'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import axios from 'axios';
import { CheckCircle2, ExternalLink, Eye, RefreshCw, Search, XCircle } from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import ReceiptMedia from '@/components/shared/ReceiptMedia';
import FinancePageHeader from '@/components/financeWorkspace/FinancePageHeader';
import { Badge, Button, buttonLinkClass, inputClass, Modal, tableHeadClass } from '@/components/financeWorkspace/ui';

type PrimePaymentRecord = {
  id: string;
  userId: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  transactionRef: string | null;
  paymentNote: string | null;
  receiptUrl: string | null;
  paidAmount: number;
  paidUpiId: string | null;
  submittedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    mobile?: string | null;
  } | null;
};

type PrimePaymentsResponse = {
  payments: PrimePaymentRecord[];
};

const STATUS_OPTIONS = ['ALL', 'PENDING', 'ACTIVE', 'REJECTED', 'EXPIRED', 'CANCELLED'] as const;

const formatPortalDate = (value?: string | null) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusTone = { PENDING: 'amber', ACTIVE: 'green', REJECTED: 'red', EXPIRED: 'slate', CANCELLED: 'slate' } as const;
const statusLabel = (status: string) => status.charAt(0) + status.slice(1).toLowerCase();
const inr = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || fallbackMessage;
  }

  return error instanceof Error ? error.message : fallbackMessage;
};

export default function CustomerPrimePaymentsPage() {
  const pathname = usePathname();
  const [payments, setPayments] = useState<PrimePaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>('ALL');
  const [paymentActionId, setPaymentActionId] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);



  const loadPayments = async () => {
    try {
      setLoading(true);
      const response = await api.get<PrimePaymentsResponse>('/superadmin/customer-prime-payments');
      setPayments(response.data.payments || []);
      setError('');
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Unable to load customer Prime payments.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPayments();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const availableStatuses = useMemo(() => {
    const statuses = new Set(payments.map((p) => p.status));
    return STATUS_OPTIONS.filter((opt) => opt === 'ALL' || statuses.has(opt));
  }, [payments]);

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return payments.filter((payment) => {
      const matchesStatus = statusFilter === 'ALL' || payment.status === statusFilter;
      const matchesSearch =
        query.length === 0 ||
        (payment.user?.name || '').toLowerCase().includes(query) ||
        (payment.user?.email || '').toLowerCase().includes(query) ||
        (payment.user?.mobile || '').toLowerCase().includes(query) ||
        (payment.paidUpiId || '').toLowerCase().includes(query) ||
        (payment.transactionRef || '').toLowerCase().includes(query) ||
        payment.status.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [payments, search, statusFilter]);

  const handlePaymentReview = async (paymentId: string, status: 'ACTIVE' | 'REJECTED') => {
    setPaymentActionId(paymentId);
    setError('');
    setActionMessage('');

    try {
      const response = await api.patch<{ message: string }>(
        `/superadmin/customer-prime-payments/${paymentId}/status`,
        { status },
      );

      setActionMessage(response.data.message);
      await loadPayments();
    } catch (reviewError) {
      setError(getApiErrorMessage(reviewError, 'Unable to update payment status.'));
    } finally {
      setPaymentActionId(null);
    }
  };

  const statusCount = (status: (typeof STATUS_OPTIONS)[number]) => (status === 'ALL' ? payments.length : payments.filter((payment) => payment.status === status).length);
  const collected = payments.filter((payment) => payment.status === 'ACTIVE' || payment.status === 'EXPIRED').reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
  const kpis: Array<[string, string, string]> = [
    ['Waiting for review', String(statusCount('PENDING')), statusCount('PENDING') ? 'text-amber-700' : 'text-slate-900'],
    ['Active members', String(statusCount('ACTIVE')), 'text-emerald-700'],
    ['Rejected', String(statusCount('REJECTED')), 'text-slate-900'],
    ['Collected (approved)', inr(collected), 'text-slate-900'],
  ];

  return (
    <div className="space-y-3 tabular-nums">
      <FinancePageHeader
        page={{ href: pathname, label: 'Customer Prime Payments', group: 'Sales & Revenue' }}
        actions={<Button icon={<RefreshCw />} onClick={() => void loadPayments()}>Refresh</Button>}
      />

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div> : null}
      {actionMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">{actionMessage}</div> : null}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 lg:grid-cols-4">
        {kpis.map(([title, value, tone]) => (
          <div key={title} className="bg-white px-3 py-2.5">
            <p className="text-[11px] font-medium text-slate-500">{title}</p>
            <p className={`mt-0.5 text-[15px] font-semibold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1">
            {availableStatuses.map((option) => (
              <button key={option} type="button" onClick={() => setStatusFilter(option)} className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition ${statusFilter === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {option === 'ALL' ? 'All' : statusLabel(option)}
                <span className={`rounded px-1 text-[11px] ${statusFilter === option ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>{statusCount(option)}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, mobile, UPI, UTR…" className={`${inputClass} pl-8`} />
          </div>
        </div>
        {loading ? (
          <BrandLoader variant="section" size="sm" bg="light" text="Loading payment queue..." />
        ) : filteredPayments.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-slate-500">No payment requests found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">UPI / reference</th>
                  <th className="px-3 py-2 font-medium">Submitted</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((payment) => {
                  const busy = paymentActionId === payment.id;
                  return (
                    <tr key={payment.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-1.5">
                        <p className="font-medium text-slate-900">{payment.user?.name || payment.user?.email || 'Unknown customer'}</p>
                        <p className="text-[11px] text-slate-500">{payment.user?.mobile || payment.user?.email || '—'}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-slate-900">{inr(payment.paidAmount)}</td>
                      <td className="px-3 py-1.5">
                        <p className="text-slate-700">{payment.paidUpiId || 'UPI not set'}</p>
                        <p className="font-mono text-[11px] text-slate-500">{payment.transactionRef || '—'}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{formatPortalDate(payment.submittedAt)}</td>
                      <td className="px-3 py-1.5">
                        <Badge tone={statusTone[payment.status]}>{statusLabel(payment.status)}</Badge>
                        {payment.expiresAt ? <p className="mt-0.5 text-[11px] text-slate-500">Expires {formatPortalDate(payment.expiresAt)}</p> : null}
                        {payment.rejectionReason ? <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-red-600" title={payment.rejectionReason}>{payment.rejectionReason}</p> : null}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          {payment.receiptUrl ? (
                            <button type="button" onClick={() => setSelectedReceipt(getAbsoluteFileUrl(payment.receiptUrl))} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" />Receipt</button>
                          ) : <span className="px-2 text-[11px] text-slate-400">No receipt</span>}
                          {payment.status === 'PENDING' ? (
                            <>
                              <button type="button" disabled={busy} onClick={() => void handlePaymentReview(payment.id, 'ACTIVE')} className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-2 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />Approve</button>
                              <button type="button" disabled={busy} onClick={() => void handlePaymentReview(payment.id, 'REJECTED')} className="inline-flex h-7 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 text-[12px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" />Reject</button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedReceipt ? (
        <Modal title="Payment receipt" subtitle="Check the amount, UPI ID and reference before approving." onClose={() => setSelectedReceipt(null)}>
          <div className="flex h-[70vh] max-h-[680px] items-center justify-center bg-slate-50 p-3">
            <ReceiptMedia url={selectedReceipt} alt="Payment Receipt" className="rounded-lg" onClose={() => setSelectedReceipt(null)} />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-2.5">
            <a href={selectedReceipt} target="_blank" rel="noopener noreferrer" className={buttonLinkClass('secondary')}><ExternalLink className="h-3.5 w-3.5" />Open in new tab</a>
            <Button onClick={() => setSelectedReceipt(null)}>Close</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
