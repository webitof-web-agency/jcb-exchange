"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, CreditCard, FileText, RefreshCw, ShieldAlert, UserCircle2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import CustomerPrimePaymentModal from '@/components/payments/CustomerPrimePaymentModal';
import TaxInvoiceModal, { type InvoicePaymentData } from '@/components/payments/TaxInvoiceModal';
import BrandLoader from '@/components/ui/BrandLoader';

type PrimePaymentHistoryItem = {
  id: string;
  memberName: string;
  planName: string;
  amount: number;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  submittedAt: string;
  startedAt?: string | null;
  expiresAt?: string | null;
  receiptUrl?: string | null;
};

type HistoryResponse = {
  history: PrimePaymentHistoryItem[];
};

type ListingPaymentHistoryItem = {
  id: string;
  method: 'RTGS' | 'RAZORPAY' | 'PHONEPE';
  status: 'PENDING_VERIFICATION' | 'APPROVED' | 'REJECTED' | 'FAILED' | 'PAID';
  amount: number;
  transactionRef: string | null;
  receiptUrl: string | null;
  paymentNote: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  listing: {
    id: string;
    title: string;
    referenceNumber?: string | null;
    status: string;
    price: number;
  } | null;
};

type ListingPaymentHistoryResponse = {
  payments: ListingPaymentHistoryItem[];
};

const statusStyles: Record<PrimePaymentHistoryItem['status'], { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  ACTIVE: { label: 'Successful', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Rejected', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  EXPIRED: { label: 'Expired', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700 border-gray-200' },
};

const listingStatusStyles: Record<ListingPaymentHistoryItem['status'], { label: string; className: string }> = {
  PENDING_VERIFICATION: { label: 'Under Review', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PAID: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Rejected', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  FAILED: { label: 'Failed', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);

export default function PaymentHistoryTab() {
  const user = useAuthStore((state) => state.user);
  const [primeLoading, setPrimeLoading] = useState(() => !!user?.id);
  const [listingLoading, setListingLoading] = useState(() => !!user?.id);
  const [history, setHistory] = useState<PrimePaymentHistoryItem[]>([]);
  const [listingPayments, setListingPayments] = useState<ListingPaymentHistoryItem[]>([]);
  const [primeError, setPrimeError] = useState<string | null>(null);
  const [listingError, setListingError] = useState<string | null>(null);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [selectedInvoicePayment, setSelectedInvoicePayment] = useState<InvoicePaymentData | null>(null);
  const visibleHistory = useMemo(() => (user?.id ? history : []), [history, user?.id]);
  const visibleListingPayments = useMemo(() => (user?.id ? listingPayments : []), [listingPayments, user?.id]);
  const latestExpiredPayment = useMemo(
    () => visibleHistory.find((payment) => payment.status === 'EXPIRED') || null,
    [visibleHistory],
  );

  const loadHistory = useCallback(async () => {
    if (!user?.id) {
      setHistory([]);
      setListingPayments([]);
      setPrimeError(null);
      setListingError(null);
      setPrimeLoading(false);
      setListingLoading(false);
      return;
    }

    setPrimeLoading(true);
    setListingLoading(true);
    setPrimeError(null);
    setListingError(null);

    const [primeResult, listingResult] = await Promise.allSettled([
      api.get<HistoryResponse>('/auth/customer-prime/history'),
      api.get<ListingPaymentHistoryResponse>('/listings/payment-submissions/customer'),
    ]);

    if (primeResult.status === 'fulfilled') {
      setHistory(primeResult.value.data.history || []);
    } else {
      setHistory([]);
      setPrimeError('Unable to load Prime payment history right now.');
    }
    setPrimeLoading(false);

    if (listingResult.status === 'fulfilled') {
      setListingPayments(listingResult.value.data.payments || []);
    } else {
      setListingPayments([]);
      setListingError('Unable to load listing purchase history right now.');
    }
    setListingLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadHistory();
    }
  }, [loadHistory, user?.id]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50/60 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-yellow-100 text-yellow-700">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Payment History</h3>
            <p className="mt-1 text-sm text-gray-500">Your Prime subscription payments, purchase dates, and expiry dates</p>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {latestExpiredPayment ? (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-amber-600 shadow-sm">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-amber-950">Your Prime membership has expired</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Renew to continue Prime benefits. Your latest active plan ended on {formatDate(latestExpiredPayment.expiresAt || latestExpiredPayment.startedAt)}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRenewModalOpen(true)}
                className="inline-flex items-center justify-center rounded-full bg-[#111827] px-4 py-2 text-xs font-bold text-white transition hover:bg-black"
              >
                Renew Membership
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          {primeLoading ? (
            <div className="flex h-28 items-center justify-center rounded-2xl border border-gray-100 bg-gray-50">
              <BrandLoader size="sm" variant="section" bg="light" />
            </div>
          ) : primeError ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <span>{primeError}</span>
              <button type="button" onClick={() => void loadHistory()} className="shrink-0 font-bold underline">Retry</button>
            </div>
          ) : visibleHistory.length > 0 ? visibleHistory.map((payment) => {
            const statusMeta = statusStyles[payment.status] || statusStyles.PENDING;
            return (
              <div
                key={payment.id}
                className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-gray-200 hover:shadow-md"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-gray-900 group-hover:text-[#9A7600]">{payment.planName}</h4>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                        <span className="inline-flex items-center gap-1.5">
                          <UserCircle2 className="h-4 w-4 text-gray-400" />
                          {payment.memberName}
                        </span>
                        <span className="hidden h-1 w-1 rounded-full bg-gray-300 sm:block" />
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          Bought on {formatDate(payment.submittedAt)}
                        </span>
                        <span className="hidden h-1 w-1 rounded-full bg-gray-300 sm:block" />
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          Valid till {formatDate(payment.expiresAt || payment.startedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end lg:gap-2">
                    <div className="text-xl font-black text-gray-900">{formatAmount(payment.amount)}</div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${statusMeta.className}`}
                      >
                        {statusMeta.label}
                      </span>
                      {(payment.status === 'ACTIVE' || payment.status === 'EXPIRED') ? (
                        <button
                          type="button"
                          onClick={() => setSelectedInvoicePayment({
                            id: payment.id,
                            memberName: payment.memberName,
                            planName: payment.planName,
                            amount: payment.amount,
                            submittedAt: payment.submittedAt,
                            customerEmail: user?.email,
                            customerMobile: user?.mobile,
                            customerState: user?.state || null,
                          })}
                          className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400 bg-yellow-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-yellow-900 transition hover:bg-yellow-400 hover:text-black shadow-sm"
                        >
                          <FileText className="h-3.5 w-3.5 text-amber-600" />
                          Download Invoice
                        </button>
                      ) : null}
                      {payment.status === 'EXPIRED' && payment.id === latestExpiredPayment?.id ? (
                        <button
                          type="button"
                          onClick={() => setIsRenewModalOpen(true)}
                          className="inline-flex items-center rounded-full bg-[#FFC107] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-black transition hover:bg-yellow-400"
                        >
                          Renew
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : null}

          {listingLoading ? (
            <div className="flex h-28 items-center justify-center rounded-2xl border border-gray-100 bg-gray-50">
              <BrandLoader size="sm" variant="section" bg="light" />
            </div>
          ) : listingError ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <span>{listingError}</span>
              <button type="button" onClick={() => void loadHistory()} className="shrink-0 font-bold underline">Retry</button>
            </div>
          ) : visibleListingPayments.length > 0 ? (
            <div className="space-y-4 border-t border-gray-100 pt-6">
              <div>
                <h4 className="text-base font-bold text-gray-900">Listing Purchases</h4>
                <p className="mt-1 text-sm text-gray-500">Your RTGS, Razorpay, and PhonePe Buy Now payments</p>
              </div>
              {visibleListingPayments.map((payment) => {
                const statusMeta = listingStatusStyles[payment.status] || listingStatusStyles.PENDING_VERIFICATION;
                return (
                  <div
                    key={payment.id}
                    className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-gray-200 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h5 className="text-base font-bold text-gray-900">{payment.listing?.title || 'Listing Payment'}</h5>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                          <span className="inline-flex items-center gap-1.5">
                            <CreditCard className="h-4 w-4 text-gray-400" />
                            {payment.method}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            Paid on {formatDate(payment.submittedAt)}
                          </span>
                          {payment.transactionRef ? (
                            <span className="font-mono text-xs text-gray-500">
                              Ref: {payment.transactionRef}
                            </span>
                          ) : null}
                        </div>
                        {payment.rejectionReason ? (
                          <p className="mt-2 text-xs font-medium text-rose-600">{payment.rejectionReason}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end lg:gap-2">
                        <div className="text-xl font-black text-gray-900">{formatAmount(payment.amount)}</div>
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!primeLoading && !listingLoading && !primeError && !listingError && visibleHistory.length === 0 && visibleListingPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16 px-4 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm">
                <RefreshCw className="h-8 w-8" />
              </div>
              <h4 className="mb-1 text-lg font-bold text-gray-900">No Payments Yet</h4>
              <p className="max-w-sm text-sm text-gray-500">
                Your Prime payment history will appear here once you make a subscription payment.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {isRenewModalOpen && user?.id ? (
        <CustomerPrimePaymentModal
          isOpen={isRenewModalOpen}
          feature="SELL_LISTING"
          mode="renewal"
          onClose={() => {
            setIsRenewModalOpen(false);
            void loadHistory();
          }}
          onAccessGranted={() => {
            setIsRenewModalOpen(false);
            void loadHistory();
          }}
        />
      ) : null}

      <TaxInvoiceModal
        isOpen={Boolean(selectedInvoicePayment)}
        onClose={() => setSelectedInvoicePayment(null)}
        payment={selectedInvoicePayment}
      />
    </div>
  );
}
