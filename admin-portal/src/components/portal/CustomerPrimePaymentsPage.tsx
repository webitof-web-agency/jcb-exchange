'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, ChevronDown, Search, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';

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

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || fallbackMessage;
  }

  return error instanceof Error ? error.message : fallbackMessage;
};

export default function CustomerPrimePaymentsPage() {
  const [payments, setPayments] = useState<PrimePaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>('ALL');
  const [paymentActionId, setPaymentActionId] = useState<string | null>(null);
  const [openFilterDropdown, setOpenFilterDropdown] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.filter-dropdown-container')) {
        return;
      }
      setOpenFilterDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

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

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}
      {actionMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{actionMessage}</div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-auto filter-dropdown-container">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpenFilterDropdown(!openFilterDropdown);
              }}
              className="flex w-full min-w-[160px] items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] hover:bg-gray-50"
            >
              <span>{statusFilter === 'ALL' ? 'All Statuses' : statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase()}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
            
            {openFilterDropdown && (
              <div className="absolute left-0 z-50 mt-1 w-full min-w-[160px] origin-top-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg outline-none">
                {availableStatuses.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setStatusFilter(option);
                      setOpenFilterDropdown(false);
                    }}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${statusFilter === option ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}
                  >
                    {option === 'ALL'
                      ? 'All Statuses'
                      : option.charAt(0) + option.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search payments..."
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 pl-10 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            />
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-sm text-gray-500">Loading payment queue...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-8">
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
              <h3 className="text-lg font-semibold text-gray-900">No payment requests found</h3>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[300px] pb-16">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <th className="p-4 font-semibold">Customer</th>
                  <th className="p-4 font-semibold">Payment</th>
                  <th className="p-4 font-semibold">Receipt</th>
                  <th className="p-4 font-semibold">Submitted</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="align-top transition-colors hover:bg-gray-50">
                    <td className="p-4">
                      <div className="font-medium text-gray-900">{payment.user?.name || payment.user?.email || 'Unknown customer'}</div>
                      <div className="mt-1 text-xs text-gray-500">{payment.user?.mobile || payment.user?.email || '-'}</div>
                    </td>
                    <td className="p-4 text-sm text-gray-700">
                      <div className="font-semibold">Rs {payment.paidAmount}</div>
                      <div className="mt-1 text-xs text-gray-500">{payment.paidUpiId || 'UPI not set'}</div>
                    </td>
                    <td className="p-4 text-sm text-gray-700">
                      {payment.receiptUrl ? (
                        <a
                          href={getAbsoluteFileUrl(payment.receiptUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-[#9A7600] transition hover:bg-yellow-50"
                        >
                          View Receipt
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">Receipt missing</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-700">{formatPortalDate(payment.submittedAt)}</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          payment.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : payment.status === 'REJECTED'
                              ? 'bg-red-50 text-red-700'
                              : payment.status === 'EXPIRED'
                                ? 'bg-gray-100 text-gray-700'
                                : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {payment.status}
                      </span>
                      {payment.expiresAt ? (
                        <div className="mt-1 text-xs text-gray-500">Expires {formatPortalDate(payment.expiresAt)}</div>
                      ) : null}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        {payment.status === 'PENDING' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handlePaymentReview(payment.id, 'ACTIVE')}
                              disabled={paymentActionId === payment.id}
                              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void handlePaymentReview(payment.id, 'REJECTED')}
                              disabled={paymentActionId === payment.id}
                              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                            >
                              <XCircle className="h-4 w-4" />
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-gray-500">
                            {payment.status === 'ACTIVE' ? 'Prime unlocked' : payment.rejectionReason || 'Closed'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
