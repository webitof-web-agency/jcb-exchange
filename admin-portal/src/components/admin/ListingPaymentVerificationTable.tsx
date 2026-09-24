'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  MoreVertical,
  Phone,
  ReceiptText,
  RefreshCcw,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api, { API_ORIGIN } from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { generateAdminListingPaymentDetailPath } from '@/lib/routePaths';
import { useAuthStore } from '@/store/authStore';
import ReceiptMedia from '@/components/shared/ReceiptMedia';

function CustomSelectPill({
  value,
  onChange,
  options,
  defaultLabel,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  defaultLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = value === 'ALL' ? null : options.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : defaultLabel;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const rawOptions = options.filter((o) => o.value !== 'ALL');
  const allOptions = [{ value: 'ALL', label: defaultLabel }, ...rawOptions];

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-9 items-center justify-between gap-2 rounded-full border border-gray-300 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-2xs outline-none transition hover:border-gray-400 hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] cursor-pointer ${isOpen ? 'border-[#FFC107] ring-1 ring-[#FFC107]' : ''
          }`}
      >
        <span className="truncate max-w-[140px]">{displayLabel}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[170px] max-w-[260px] max-h-60 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {allOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left rounded-xl px-3.5 py-2 text-xs font-medium transition cursor-pointer flex items-center justify-between gap-2 ${isSelected
                    ? 'bg-gray-100 text-gray-950 font-bold'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950'
                  }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-[#FFC107] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type ListingPaymentRecord = {
  id: string;
  listingId: string;
  method: 'RTGS' | 'RAZORPAY' | 'PHONEPE';
  status: 'PENDING_VERIFICATION' | 'APPROVED' | 'REJECTED' | 'FAILED' | 'PAID';
  amount: number;
  transactionRef: string | null;
  paymentNote: string | null;
  receiptUrl: string | null;
  submittedAt: string;
  rejectionReason: string | null;
  buyer: { name?: string | null; mobile?: string | null; email?: string | null } | null;
  partner:
  | {
    name?: string | null;
    mobile?: string | null;
    email?: string | null;
    partnerProfile?: { partnerType?: string | null } | null;
  }
  | null;
  listing: { title: string; status: string; price: number } | null;
};

type PaymentMethodFilter = 'ALL' | ListingPaymentRecord['method'];

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || fallbackMessage;
};

const getAbsoluteFileUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

const getStatusMeta = (status: ListingPaymentRecord['status']) => {
  switch (status) {
    case 'APPROVED':
    case 'PAID':
      return {
        label: 'Approved',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotClass: 'bg-emerald-500',
      };
    case 'REJECTED':
    case 'FAILED':
      return {
        label: 'Rejected',
        badgeClass: 'bg-red-50 text-red-700 border-red-200',
        dotClass: 'bg-red-500',
      };
    default:
      return {
        label: 'Pending',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
      };
  }
};

type ListingPaymentVerificationTableProps = {
  onPendingCountChange?: (count: number) => void;
  basePath?: string;
};

export default function ListingPaymentVerificationTable({ onPendingCountChange, basePath }: ListingPaymentVerificationTableProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const effectiveBasePath = basePath || (user?.role === 'SUPER_ADMIN' ? '/superadmin/listings' : '/employee/listings');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<ListingPaymentRecord[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [methodFilter, setMethodFilter] = useState<PaymentMethodFilter>('ALL');

  // Receipt Modal State
  const [previewPayment, setPreviewPayment] = useState<ListingPaymentRecord | null>(null);
  const [receiptViewerPayment, setReceiptViewerPayment] = useState<ListingPaymentRecord | null>(null);
  // Full Note Modal State
  const [noteModalPayment, setNoteModalPayment] = useState<ListingPaymentRecord | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ payments: ListingPaymentRecord[] }>('/superadmin/listing-payments');
      setPayments(response.data.payments || []);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Unable to load listing payment receipts.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPayments();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPayments]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-payment-menu]')) {
        return;
      }
      setOpenMenuId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
        setPreviewPayment(null);
        setReceiptViewerPayment(null);
        setNoteModalPayment(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleStatusUpdate = async (paymentId: string, status: 'APPROVED' | 'REJECTED') => {
    const rejectionReason = status === 'REJECTED' ? window.prompt('Reason for rejection?') || '' : '';
    if (status === 'REJECTED' && rejectionReason.trim() === '') {
      return;
    }

    try {
      const response = await api.patch<{ message: string; payment: ListingPaymentRecord }>(
        `/superadmin/listing-payments/${paymentId}/status`,
        { status, rejectionReason },
      );
      setPayments((current) => current.map((payment) => (payment.id === paymentId ? response.data.payment : payment)));
      setOpenMenuId(null);
      if (previewPayment?.id === paymentId) {
        setPreviewPayment(response.data.payment);
      }
      if (receiptViewerPayment?.id === paymentId) {
        setReceiptViewerPayment(response.data.payment);
      }
      toast.success(response.data.message);
    } catch (updateError) {
      toast.error(getApiErrorMessage(updateError, 'Unable to update payment status.'));
    }
  };

  const openPaymentDetail = useCallback(
    (payment: ListingPaymentRecord) => {
      if (!payment.id) {
        toast.error('Payment detail is not available.');
        return;
      }

      router.push(
        generateAdminListingPaymentDetailPath(effectiveBasePath, {
          id: payment.id,
          listingTitle: payment.listing?.title || 'Listing payment',
          method: payment.method,
        })
      );
    },
    [effectiveBasePath, router]
  );

  const methodOptions = useMemo(() => {
    const counts = new Map<ListingPaymentRecord['method'], number>();
    payments.forEach((payment) => {
      counts.set(payment.method, (counts.get(payment.method) || 0) + 1);
    });

    const labels: Record<ListingPaymentRecord['method'], string> = {
      RTGS: 'RTGS',
      RAZORPAY: 'Razorpay',
      PHONEPE: 'PhonePe',
    };

    const methods: ListingPaymentRecord['method'][] = ['RTGS', 'RAZORPAY', 'PHONEPE'];
    const visibleMethods = counts.size > 0 ? methods.filter((method) => counts.has(method)) : methods;

    return [
      { value: 'ALL' as const, label: 'All Methods' },
      ...visibleMethods.map((method) => ({
        value: method,
        label: `${labels[method]} (${counts.get(method) || 0})`,
      })),
    ];
  }, [payments]);

  // Metrics counts for filter pills
  const metrics = useMemo(() => {
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    payments.forEach((p) => {
      if (p.status === 'PENDING_VERIFICATION') pendingCount++;
      else if (p.status === 'APPROVED' || p.status === 'PAID') approvedCount++;
      else if (p.status === 'REJECTED' || p.status === 'FAILED') rejectedCount++;
    });

    return {
      total: payments.length,
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    };
  }, [payments]);

  useEffect(() => {
    onPendingCountChange?.(metrics.pending);
  }, [metrics.pending, onPendingCountChange]);

  // Filtered Rows
  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      // Status Filter
      if (statusFilter === 'PENDING' && payment.status !== 'PENDING_VERIFICATION') return false;
      if (statusFilter === 'APPROVED' && payment.status !== 'APPROVED' && payment.status !== 'PAID') return false;
      if (statusFilter === 'REJECTED' && payment.status !== 'REJECTED' && payment.status !== 'FAILED') return false;

      // Method Filter
      if (methodFilter !== 'ALL' && payment.method !== methodFilter) return false;

      // Search Query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const listingTitle = (payment.listing?.title || '').toLowerCase();
      const buyerName = (payment.buyer?.name || '').toLowerCase();
      const buyerPhone = (payment.buyer?.mobile || '').toLowerCase();
      const partnerName = (payment.partner?.name || '').toLowerCase();
      const txRef = (payment.transactionRef || '').toLowerCase();
      const method = (payment.method || '').toLowerCase();

      return (
        listingTitle.includes(q) ||
        buyerName.includes(q) ||
        buyerPhone.includes(q) ||
        partnerName.includes(q) ||
        txRef.includes(q) ||
        method.includes(q)
      );
    });
  }, [payments, statusFilter, methodFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Payment Filter Bar: Status Pills + Method Select + Search + Refresh */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Pills */}
          <div className="flex flex-wrap items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${statusFilter === 'ALL'
                  ? 'bg-[#FFC107] text-black shadow-2xs font-bold'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              All ({metrics.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PENDING')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${statusFilter === 'PENDING'
                  ? 'bg-amber-400 text-black shadow-2xs font-bold'
                  : 'text-gray-600 hover:text-amber-800'
                }`}
            >
              Pending ({metrics.pending})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('APPROVED')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${statusFilter === 'APPROVED'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-gray-600 hover:text-emerald-800'
                }`}
            >
              Approved ({metrics.approved})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('REJECTED')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${statusFilter === 'REJECTED'
                  ? 'bg-red-600 text-white shadow-2xs font-bold'
                  : 'text-gray-600 hover:text-red-800'
                }`}
            >
              Rejected ({metrics.rejected})
            </button>
          </div>

          {/* Payment Method Filter Dropdown */}
          <CustomSelectPill
            value={methodFilter}
            onChange={(val) => setMethodFilter(val as PaymentMethodFilter)}
            options={methodOptions}
            defaultLabel="All Methods"
          />

          {(statusFilter !== 'ALL' || methodFilter !== 'ALL' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ALL');
                setMethodFilter('ALL');
                setSearchQuery('');
              }}
              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        {/* Search Input & Refresh Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search receipts or UTR..."
              className="w-full rounded-full border border-gray-300 bg-white py-1.5 pl-9 pr-8 text-xs text-gray-900 shadow-2xs placeholder:text-gray-400 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => void loadPayments()}
            disabled={loading}
            title="Refresh payment receipts"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-2xs transition hover:border-[#FFC107] hover:bg-[#FFC107]/10 hover:text-gray-900 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Main Table Wrapper with Self Scroll & Hidden Scrollbar */}
      <div className="overflow-x-auto overflow-y-auto max-h-[580px] rounded-2xl border border-gray-200 bg-white shadow-2xs [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm text-gray-600">
          <thead className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50 uppercase text-gray-500 shadow-2xs">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide">Listing & Date</th>
              <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide">Buyer Details</th>
              <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide">Partner</th>
              <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide">Payment & UTR</th>
              <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold tracking-wide">Status</th>
              <th className="whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                  <BrandLoader variant="inline" size="sm" bg="light" text="Loading payment receipts..." />
                </td>
              </tr>
            ) : filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <ReceiptText className="h-8 w-8 text-gray-300" />
                    <p className="font-semibold text-gray-700">No payment receipts found</p>
                    <p className="text-xs text-gray-400">
                      {searchQuery || statusFilter !== 'ALL' || methodFilter !== 'ALL'
                        ? 'Try clearing your search or filters.'
                        : 'Customer payment submissions will appear here.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredPayments.map((payment, index) => {
                const statusMeta = getStatusMeta(payment.status);
                const receiptUrl = getAbsoluteFileUrl(payment.receiptUrl);
                const partnerType = formatPartnerTypeLabel(payment.partner?.partnerProfile?.partnerType, 'Partner');
                const isPending = payment.status === 'PENDING_VERIFICATION';

                // Smart Dropdown positioning: If row is in lower part of list, open UPWARDS
                const isNearBottom = index >= Math.max(filteredPayments.length - 2, 0);

                return (
                  <tr
                    key={payment.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open payment detail for ${payment.listing?.title || 'listing payment'}`}
                    onClick={() => openPaymentDetail(payment)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openPaymentDetail(payment);
                      }
                    }}
                    className="cursor-pointer transition hover:bg-gray-50/80"
                  >
                    {/* Listing & Date */}
                    <td className="px-4 py-3.5 align-top">
                      <p className="max-w-[240px] truncate text-xs font-bold text-gray-900" title={payment.listing?.title || 'Listing'}>
                        {payment.listing?.title || 'Listing'}
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-gray-400">
                        {payment.submittedAt ? new Date(payment.submittedAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }) : '-'}
                      </p>
                    </td>

                    {/* Buyer (with Phone Logo & Clickable tel link) */}
                    <td className="px-4 py-3.5 align-top">
                      <p className="text-xs font-bold text-gray-900">{payment.buyer?.name || 'Customer'}</p>
                      {payment.buyer?.mobile ? (
                        <a
                          href={`tel:${payment.buyer.mobile}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 transition hover:text-amber-950 hover:underline"
                          title={`Click to call ${payment.buyer.mobile}`}
                        >
                          <Phone className="h-3 w-3 text-amber-600 shrink-0" />
                          <span>{payment.buyer.mobile}</span>
                        </a>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-gray-500">{payment.buyer?.email || '-'}</p>
                      )}
                    </td>

                    {/* Partner (with Phone Link if available) */}
                    <td className="px-4 py-3.5 align-top">
                      <p className="text-xs font-bold text-gray-900">{payment.partner?.name || 'Partner'}</p>
                      {payment.partner?.mobile ? (
                        <a
                          href={`tel:${payment.partner.mobile}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-gray-600 hover:text-gray-900 hover:underline"
                          title={`Call ${payment.partner.mobile}`}
                        >
                          <Phone className="h-2.5 w-2.5 text-gray-400 shrink-0" />
                          <span>{payment.partner.mobile}</span>
                        </a>
                      ) : null}
                      <div>
                        <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                          {partnerType}
                        </span>
                      </div>
                    </td>

                    {/* Payment & UTR & Expandable Note */}
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-900">₹{(payment.amount || 0).toLocaleString('en-IN')}</span>
                        <span className="rounded bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-900">
                          {payment.method}
                        </span>
                      </div>
                      {payment.transactionRef ? (
                        <p className="mt-1 text-[11px] font-mono text-gray-600" title="UTR / Reference">
                          UTR: <span className="font-semibold text-gray-800">{payment.transactionRef}</span>
                        </p>
                      ) : null}

                      {/* Payment Note with View Full Note Button */}
                      {payment.paymentNote ? (
                        <div className="mt-1.5 flex flex-col items-start gap-0.5">
                          <p className="max-w-[180px] truncate text-[11px] italic text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-100" title={payment.paymentNote}>
                            {payment.paymentNote}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNoteModalPayment(payment);
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 hover:text-amber-900 transition hover:underline cursor-pointer"
                          >
                            <FileText className="h-3 w-3" />
                            <span>View note</span>
                          </button>
                        </div>
                      ) : null}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5 align-top">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusMeta.badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                        {statusMeta.label}
                      </span>
                      {payment.rejectionReason ? (
                        <p className="mt-1 max-w-xs text-[11px] text-red-600" title={payment.rejectionReason}>
                          {payment.rejectionReason}
                        </p>
                      ) : null}
                    </td>

                    {/* Actions Menu */}
                    <td className="px-4 py-3.5 text-right align-top">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="relative inline-block text-left" data-payment-menu>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenMenuId((current) => (current === payment.id ? null : payment.id));
                            }}
                            aria-label="Open payment actions"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-2xs transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuId === payment.id ? (
                            <div
                              className={`absolute right-0 z-50 w-48 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${isNearBottom ? 'bottom-full mb-1.5 origin-bottom-right' : 'top-full mt-1.5 origin-top-right'
                                }`}
                            >
                              {receiptUrl ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setPreviewPayment(payment);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 hover:text-gray-950 cursor-pointer"
                                >
                                  <Eye className="h-3.5 w-3.5 text-gray-500" />
                                  View Receipt
                                </button>
                              ) : null}

                              {isPending ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleStatusUpdate(payment.id, 'APPROVED');
                                      setOpenMenuId(null);
                                    }}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 cursor-pointer"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    Approve Payment
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleStatusUpdate(payment.id, 'REJECTED');
                                      setOpenMenuId(null);
                                    }}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 cursor-pointer"
                                  >
                                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                                    Reject Payment
                                  </button>
                                </>
                              ) : (
                                <div className="px-3.5 py-2 text-xs text-gray-400 font-medium">Status finalized</div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for Viewing Receipt Image/PDF */}
      {previewPayment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Payment Receipt Preview</h3>
                <p className="text-xs text-gray-500">
                  {previewPayment.listing?.title} &bull; ₹{(previewPayment.amount || 0).toLocaleString('en-IN')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPayment(null)}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body with hidden scroll */}
            <div className="flex-1 overflow-y-auto p-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-600">Buyer:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-900">{previewPayment.buyer?.name || 'Customer'}</span>
                    {previewPayment.buyer?.mobile ? (
                      <a
                        href={`tel:${previewPayment.buyer.mobile}`}
                        className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-900 hover:underline"
                      >
                        <Phone className="h-3 w-3 text-amber-700" />
                        <span>{previewPayment.buyer.mobile}</span>
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-600">Partner:</span>
                  <span className="font-bold text-gray-900">{previewPayment.partner?.name || 'Partner'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-600">Method & UTR:</span>
                  <span className="font-mono font-bold text-amber-900">{previewPayment.method} - {previewPayment.transactionRef || 'N/A'}</span>
                </div>
                {previewPayment.paymentNote ? (
                  <div className="pt-2 border-t border-amber-200/60">
                    <span className="font-semibold text-gray-600 block mb-1">Customer Note:</span>
                    <p className="italic text-gray-800 bg-white p-2 rounded border border-amber-100 whitespace-pre-wrap">
                      {previewPayment.paymentNote}
                    </p>
                  </div>
                ) : null}
              </div>

              {previewPayment.receiptUrl ? (
                <div className="relative flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gray-900 p-2">
                  <div className="relative h-[50vh] w-full overflow-hidden rounded-lg bg-white">
                    <ReceiptMedia
                      url={getAbsoluteFileUrl(previewPayment.receiptUrl)}
                      alt="Payment Receipt"
                      className="h-full w-full"
                      onClose={() => setPreviewPayment(null)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setReceiptViewerPayment(previewPayment)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold text-gray-900 shadow-md backdrop-blur-xs transition hover:bg-white cursor-pointer"
                  >
                    Open
                  </button>
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                  No receipt image provided.
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 bg-gray-50">
              <button
                type="button"
                onClick={() => setPreviewPayment(null)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-100 cursor-pointer"
              >
                Close
              </button>

              {previewPayment.status === 'PENDING_VERIFICATION' ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleStatusUpdate(previewPayment.id, 'REJECTED')}
                    className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-red-700 cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStatusUpdate(previewPayment.id, 'APPROVED')}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-emerald-700 cursor-pointer"
                  >
                    Approve Payment
                  </button>
                </div>
              ) : (
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${getStatusMeta(previewPayment.status).badgeClass}`}>
                  {getStatusMeta(previewPayment.status).label}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {receiptViewerPayment ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Receipt Preview</p>
                <h3 className="mt-1 break-words text-lg font-bold text-gray-900">
                  {receiptViewerPayment.listing?.title || 'Listing payment'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReceiptViewerPayment(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-gray-950 p-4 sm:p-6">
              <div className="relative h-[72vh] w-full overflow-hidden rounded-2xl bg-white">
                {receiptViewerPayment.receiptUrl ? (
                  <ReceiptMedia
                    url={getAbsoluteFileUrl(receiptViewerPayment.receiptUrl)}
                    alt="Payment Receipt"
                    className="h-full w-full"
                    onClose={() => setReceiptViewerPayment(null)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">
                    No receipt image provided.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal for Viewing Full Note */}
      {noteModalPayment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-gray-900">Payment Note Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setNoteModalPayment(null)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Listing Title</p>
                <p className="text-xs font-bold text-gray-900 mt-0.5">{noteModalPayment.listing?.title || 'Listing'}</p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Full Customer Note</p>
                <div className="mt-1 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs font-medium text-gray-800 leading-relaxed max-h-60 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden whitespace-pre-wrap">
                  {noteModalPayment.paymentNote}
                </div>
              </div>

              {noteModalPayment.buyer?.mobile ? (
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                  <span className="text-gray-500 font-medium">Customer Contact:</span>
                  <a
                    href={`tel:${noteModalPayment.buyer.mobile}`}
                    className="inline-flex items-center gap-1 font-bold text-amber-800 hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5 text-amber-600" />
                    <span>{noteModalPayment.buyer.mobile}</span>
                  </a>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setNoteModalPayment(null)}
                className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
