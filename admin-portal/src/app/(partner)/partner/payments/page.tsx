'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, ExternalLink, ReceiptText, XCircle } from 'lucide-react';
import api, { API_ORIGIN } from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';

type ListingPaymentRecord = {
  id: string;
  method: 'RTGS' | 'RAZORPAY';
  status: 'PENDING_VERIFICATION' | 'APPROVED' | 'REJECTED' | 'FAILED' | 'PAID';
  amount: number;
  transactionRef?: string | null;
  receiptUrl?: string | null;
  paymentNote?: string | null;
  razorpayPaymentId?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  buyer?: {
    name?: string | null;
    email?: string | null;
    mobile?: string | null;
  } | null;
  listing?: {
    id: string;
    title: string;
    referenceNumber?: string | null;
    price: number;
    status: string;
  } | null;
};

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const getAbsoluteFileUrl = (url?: string | null) => {
  if (!url) {
    return null;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
};

const getStatusStyles = (status: ListingPaymentRecord['status']) => {
  if (status === 'APPROVED' || status === 'PAID') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (status === 'REJECTED' || status === 'FAILED') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
};

export default function PartnerPaymentsPage() {
  const [payments, setPayments] = useState<ListingPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadPayments = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get<{ success: boolean; payments: ListingPaymentRecord[] }>(
          '/listings/payment-submissions/partner',
        );

        if (mounted) {
          setPayments(response.data.payments || []);
        }
      } catch {
        if (mounted) {
          setError('Unable to load listing payments.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadPayments();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-full bg-gray-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Buy Now</p>
              <h2 className="mt-1 text-2xl font-black text-gray-900">Listing Payments</h2>
              <p className="mt-1 text-sm text-gray-500">
                Receipts and online payments submitted by customers for your listings.
              </p>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">
              {payments.length} submissions
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <BrandLoader variant="section" size="md" bg="light" />
          ) : error ? (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : payments.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
              <ReceiptText className="h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-lg font-bold text-gray-900">No payment receipts yet</h3>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                Customer Buy Now payment submissions for your listings will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Listing</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Buyer</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Payment</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Submitted</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-500">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {payments.map((payment) => {
                    const receiptUrl = getAbsoluteFileUrl(payment.receiptUrl);
                    const statusApproved = payment.status === 'APPROVED' || payment.status === 'PAID';
                    const statusRejected = payment.status === 'REJECTED' || payment.status === 'FAILED';

                    return (
                      <tr key={payment.id} className="align-top hover:bg-gray-50/70">
                        <td className="px-5 py-4">
                          <p className="font-bold text-gray-900">{payment.listing?.title || 'Listing'}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Ref: {payment.listing?.referenceNumber || payment.listing?.id || '-'}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-gray-900">{payment.buyer?.name || 'Customer'}</p>
                          <p className="mt-1 text-xs text-gray-500">{payment.buyer?.mobile || payment.buyer?.email || '-'}</p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-amber-600" />
                            <span className="font-bold text-gray-900">{formatCurrency(payment.amount)}</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {payment.method}{payment.transactionRef ? ` · ${payment.transactionRef}` : ''}
                          </p>
                          {payment.paymentNote ? (
                            <p className="mt-2 max-w-xs rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{payment.paymentNote}</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${getStatusStyles(payment.status)}`}>
                            {statusApproved ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                            {statusRejected ? <XCircle className="h-3.5 w-3.5" /> : null}
                            {payment.status.replace(/_/g, ' ')}
                          </span>
                          {payment.rejectionReason ? (
                            <p className="mt-2 max-w-xs text-xs text-red-600">{payment.rejectionReason}</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">{formatDateTime(payment.submittedAt)}</td>
                        <td className="px-5 py-4 text-right">
                          {receiptUrl ? (
                            <a
                              href={receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                            >
                              View
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-sm text-gray-400">Online</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
