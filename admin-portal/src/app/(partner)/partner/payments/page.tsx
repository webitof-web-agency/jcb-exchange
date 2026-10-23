'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  ReceiptText,
  RotateCw,
  Search,
  ShieldCheck,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
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
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const getAbsoluteFileUrl = (url?: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
};

const getStatusBadge = (status: ListingPaymentRecord['status']) => {
  if (status === 'APPROVED' || status === 'PAID') {
    return {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      icon: CheckCircle2,
      label: 'Verified & Paid',
    };
  }

  if (status === 'REJECTED' || status === 'FAILED') {
    return {
      bg: 'bg-rose-50 text-rose-700 border-rose-200/80',
      icon: XCircle,
      label: 'Rejected',
    };
  }

  return {
    bg: 'bg-amber-50 text-amber-800 border-amber-200/80',
    icon: Clock,
    label: 'Under Verification',
  };
};

export default function PartnerPaymentsPage() {
  const [payments, setPayments] = useState<ListingPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');

  const loadPayments = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await api.get<{ success: boolean; payments: ListingPaymentRecord[] }>(
        '/listings/payment-submissions/partner',
      );
      setPayments(response.data.payments || []);
    } catch {
      setError('Unable to load listing payments.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPayments();
  }, []);

  const filteredPayments = useMemo(() => {
    return payments.filter((item) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.listing?.title.toLowerCase().includes(q) ||
        item.buyer?.name?.toLowerCase().includes(q) ||
        item.buyer?.mobile?.toLowerCase().includes(q) ||
        item.transactionRef?.toLowerCase().includes(q) ||
        item.paymentNote?.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (statusFilter === 'approved') return item.status === 'APPROVED' || item.status === 'PAID';
      if (statusFilter === 'pending') return item.status === 'PENDING_VERIFICATION';
      if (statusFilter === 'rejected') return item.status === 'REJECTED' || item.status === 'FAILED';

      return true;
    });
  }, [payments, search, statusFilter]);

  const totalAmount = useMemo(
    () => payments.reduce((sum, p) => sum + (p.amount || 0), 0),
    [payments]
  );
  const approvedCount = useMemo(
    () => payments.filter((p) => p.status === 'APPROVED' || p.status === 'PAID').length,
    [payments]
  );
  const pendingCount = useMemo(
    () => payments.filter((p) => p.status === 'PENDING_VERIFICATION').length,
    [payments]
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* 1. Executive Command Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Listing Payments & Buy Now Receipts
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
                {payments.length} Transactions
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Customer Buy Now slips, payment confirmations, and verified booking amounts.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadPayments(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs disabled:opacity-50 shrink-0 self-start sm:self-center"
        >
          <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* 2. Quick Financial Metric Strips */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl bg-white p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Transacted</p>
            <p className="text-xl font-black text-slate-900 mt-1">{formatCurrency(totalAmount)}</p>
          </div>
          <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
            <ReceiptText className="w-4 h-4" />
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verified & Approved</p>
            <p className="text-xl font-black text-emerald-700 mt-1">{approvedCount} payments</p>
          </div>
          <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Awaiting Verification</p>
            <p className="text-xl font-black text-amber-700 mt-1">{pendingCount} payments</p>
          </div>
          <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Toolbar: Search & Status Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All <span className="text-[10px] text-slate-400">({payments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'approved' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'pending' ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending ({pendingCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, mobile, vehicle, or ref..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-8 text-xs text-slate-900 shadow-2xs placeholder:text-slate-400 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 4. Table Section */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
        {loading ? (
          <BrandLoader variant="section" size="md" bg="light" text="Loading payments ledger..." />
        ) : error ? (
          <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            {error}
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
            <ReceiptText className="h-10 w-10 text-slate-300 mb-2" />
            <h3 className="text-sm font-bold text-slate-900">No payment records found</h3>
            <p className="text-xs text-slate-500 mt-0.5 max-w-sm">
              {search
                ? `No results matched "${search}". Try clearing search.`
                : 'Customer Buy Now payment submissions for your listings will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200/90 text-slate-600 uppercase text-[10.5px] font-bold tracking-wider">
                <tr>
                  <th className="px-4 py-3">Vehicle Listing</th>
                  <th className="px-4 py-3">Customer Details</th>
                  <th className="px-4 py-3">Payment Info</th>
                  <th className="px-4 py-3 text-center">Verification Status</th>
                  <th className="px-4 py-3">Submitted At</th>
                  <th className="px-4 py-3 text-right">Proof / Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredPayments.map((payment) => {
                  const receiptUrl = getAbsoluteFileUrl(payment.receiptUrl);
                  const badge = getStatusBadge(payment.status);
                  const BadgeIcon = badge.icon;

                  return (
                    <tr key={payment.id} className="hover:bg-amber-50/20 transition-colors">
                      <td className="px-4 py-3.5 max-w-[220px]">
                        <p className="font-bold text-slate-900 line-clamp-1 truncate" title={payment.listing?.title}>
                          {payment.listing?.title || 'Machinery'}
                        </p>
                        <p className="text-[10.5px] text-slate-400 mt-0.5 font-mono">
                          Ref: {payment.listing?.referenceNumber || payment.listing?.id?.slice(0, 8) || '-'}
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-900">{payment.buyer?.name || 'Customer'}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{payment.buyer?.mobile || payment.buyer?.email || '-'}</p>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-slate-900 text-sm">{formatCurrency(payment.amount)}</span>
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-0.5">
                          <span className="font-bold text-slate-700">{payment.method}</span>
                          {payment.transactionRef ? ` · ${payment.transactionRef}` : ''}
                        </p>
                        {payment.paymentNote && (
                          <p className="mt-1 max-w-xs text-[10.5px] text-slate-500 bg-slate-50 p-1.5 rounded-md border border-slate-100">
                            {payment.paymentNote}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}
                        >
                          <BadgeIcon className="w-3 h-3" />
                          {badge.label}
                        </span>
                        {payment.rejectionReason && (
                          <p className="text-[10px] text-rose-600 mt-1 max-w-[150px] mx-auto truncate" title={payment.rejectionReason}>
                            {payment.rejectionReason}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 text-[11px] whitespace-nowrap">
                        {formatDateTime(payment.submittedAt)}
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {receiptUrl ? (
                          <a
                            href={receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-amber-700 bg-slate-50 hover:bg-amber-50 border border-slate-200 rounded-lg transition-colors"
                          >
                            <span>Receipt</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">Online gateway</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
