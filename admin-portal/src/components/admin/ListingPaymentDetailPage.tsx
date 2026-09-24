'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AxiosError } from 'axios';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  ListChecks,
  ReceiptText,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api, { API_ORIGIN } from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import ReceiptMedia from '@/components/shared/ReceiptMedia';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { useHeaderStore } from '@/store/headerStore';
import { resolveListingPaymentId } from '@/lib/routeResolvers';
import { generateAdminListingDetailPath, generateAdminListingPaymentDetailPath } from '@/lib/routePaths';

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
  reviewedAt: string | null;
  rejectionReason: string | null;
  buyer: { id: string; name?: string | null; mobile?: string | null; email?: string | null } | null;
  partner:
    | {
        id: string;
        name?: string | null;
        mobile?: string | null;
        email?: string | null;
        partnerProfile?: { partnerType?: string | null } | null;
      }
    | null;
  listing: { id: string; title: string; status: string; price: number } | null;
};

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || fallbackMessage;
};

const getAbsoluteFileUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getStatusMeta = (status: ListingPaymentRecord['status']) => {
  switch (status) {
    case 'APPROVED':
    case 'PAID':
      return {
        label: 'Approved',
        badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        dotClass: 'bg-emerald-500',
      };
    case 'REJECTED':
    case 'FAILED':
      return {
        label: 'Rejected',
        badgeClass: 'border-red-200 bg-red-50 text-red-700',
        dotClass: 'bg-red-500',
      };
    default:
      return {
        label: 'Pending',
        badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
        dotClass: 'bg-amber-500',
      };
  }
};

const getMethodLabel = (method: ListingPaymentRecord['method']) => {
  switch (method) {
    case 'RAZORPAY':
      return 'Razorpay';
    case 'PHONEPE':
      return 'PhonePe';
    default:
      return 'RTGS';
  }
};

export default function ListingPaymentDetailPage({
  paymentId,
  backHref,
}: {
  paymentId: string;
  backHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [payment, setPayment] = useState<ListingPaymentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [, setResolvedPaymentId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const statusMeta = useMemo(() => getStatusMeta(payment?.status || 'PENDING_VERIFICATION'), [payment?.status]);
  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);

  useEffect(() => {
    let cancelled = false;

    const loadPayment = async () => {
      try {
        setLoading(true);
        setError('');

        const nextResolvedPaymentId = (await resolveListingPaymentId(paymentId)) || paymentId;

        if (cancelled) {
          return;
        }

        setResolvedPaymentId(nextResolvedPaymentId);

        const response = await api.get<{ payment: ListingPaymentRecord }>(`/superadmin/listing-payments/${nextResolvedPaymentId}`);

        if (cancelled) {
          return;
        }

        setPayment(response.data.payment);
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(getApiErrorMessage(loadError, 'Failed to load payment verification detail.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadPayment();

    return () => {
      cancelled = true;
    };
  }, [paymentId]);

  useEffect(() => {
    if (!payment) {
      return;
    }

    const canonicalPath = generateAdminListingPaymentDetailPath(backHref, {
      id: payment.id,
      listingTitle: payment.listing?.title,
      method: payment.method,
    });

    if (pathname !== canonicalPath) {
      router.replace(canonicalPath);
    }
  }, [backHref, pathname, payment, router]);

  useEffect(() => {
    if (!payment) {
      return () => setCustomHeader(null);
    }

    setCustomHeader(
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 shadow-sm transition hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Payment Verification</p>
            <h1 className="truncate text-base font-semibold text-gray-900 sm:text-lg" title={payment.listing?.title || 'Listing payment'}>
              {payment.listing?.title || 'Listing payment'}
            </h1>
            <p className="mt-0.5 text-xs text-gray-500">
              Submitted {formatDateTime(payment.submittedAt)}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${statusMeta.badgeClass}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
          {statusMeta.label}
        </span>
      </div>
    );

    return () => setCustomHeader(null);
  }, [backHref, payment, setCustomHeader, statusMeta.badgeClass, statusMeta.dotClass, statusMeta.label]);

  const handlePaymentStatusUpdate = async (status: 'APPROVED' | 'REJECTED', reason?: string) => {
    if (!payment) {
      return;
    }

    const finalReason = status === 'REJECTED' ? (reason ?? '').trim() : '';

    if (status === 'REJECTED' && !finalReason) {
      toast.error('Please add a rejection reason before rejecting this payment.');
      return;
    }

    try {
      setSavingStatus(status);
      const response = await api.patch<{ message: string; payment: ListingPaymentRecord }>(
        `/superadmin/listing-payments/${payment.id}/status`,
        {
          status,
          rejectionReason: finalReason,
        },
      );
      setPayment(response.data.payment);
      toast.success(response.data.message);
    } catch (updateError: unknown) {
      toast.error(getApiErrorMessage(updateError, 'Unable to update payment status.'));
    } finally {
      setSavingStatus(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectReasonInput.trim()) {
      toast.error('Please enter a rejection reason.');
      return;
    }
    await handlePaymentStatusUpdate('REJECTED', rejectReasonInput);
    setIsRejectModalOpen(false);
  };

  if (loading) {
    return (
      <BrandLoader variant="section" size="md" bg="light" />
    );
  }

  if (error || !payment) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <ReceiptText className="mb-4 h-12 w-12 text-gray-300" />
        <h3 className="text-lg font-semibold text-gray-900">Payment detail unavailable</h3>
        <p className="mt-2 max-w-md text-sm text-gray-500">{error || 'The selected payment submission could not be loaded.'}</p>
        <Link
          href={backHref}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-xs font-medium text-white transition hover:bg-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to payments
        </Link>
      </div>
    );
  }

  const listingOpenHref = payment.listing
    ? generateAdminListingDetailPath(backHref, {
        id: payment.listing.id,
        title: payment.listing.title,
      })
    : backHref;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Submitted receipt detail</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900">{payment.listing?.title || 'Listing payment'}</h2>
            <p className="mt-1 text-xs text-gray-500">
              Submitted on {formatDateTime(payment.submittedAt)}
              {payment.reviewedAt ? ` • Reviewed on ${formatDateTime(payment.reviewedAt)}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${statusMeta.badgeClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
              {statusMeta.label}
            </span>
            {payment.listing ? (
              <Link
                href={listingOpenHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                <ListChecks className="h-3.5 w-3.5" />
                Open listing
              </Link>
            ) : null}

            {payment.status === 'PENDING_VERIFICATION' ? (
              <>
                <button
                  type="button"
                  onClick={() => void handlePaymentStatusUpdate('APPROVED')}
                  disabled={savingStatus !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {savingStatus === 'APPROVED' ? 'Approving...' : 'Approve payment'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectReasonInput('');
                    setIsRejectModalOpen(true);
                  }}
                  disabled={savingStatus !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {savingStatus === 'REJECTED' ? 'Rejecting...' : 'Reject payment'}
                </button>
              </>
            ) : null}
          </div>
        </div>

        {payment.status === 'REJECTED' && payment.rejectionReason ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-800">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <span className="font-semibold">Rejection reason:</span> {payment.rejectionReason}
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Amount</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">₹{payment.amount.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Method</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{getMethodLabel(payment.method)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">UTR / Reference</p>
            <p className="mt-1 break-words text-base font-semibold text-gray-900">{payment.transactionRef || 'Not provided'}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Listing status</p>
            <p className="mt-1 text-base font-semibold text-gray-900">{payment.listing?.status || 'Unknown'}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">Buyer and partner</h3>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Buyer details</p>
            <p className="mt-1 text-base font-semibold text-gray-900">{payment.buyer?.name || 'Buyer'}</p>
            <div className="mt-2.5 space-y-1 text-xs text-gray-600">
              <p>{payment.buyer?.email || 'No email provided'}</p>
              <p>{payment.buyer?.mobile || 'No mobile provided'}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Partner details</p>
            <p className="mt-1 text-base font-semibold text-gray-900">{payment.partner?.name || 'Partner'}</p>
            <div className="mt-2.5 space-y-1 text-xs text-gray-600">
              <p>{payment.partner?.email || 'No email provided'}</p>
              <p>{payment.partner?.mobile || 'No mobile provided'}</p>
              <p className="mt-1 inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                {formatPartnerTypeLabel(payment.partner?.partnerProfile?.partnerType, 'Partner')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
            <FileText className="h-4.5 w-4.5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">Payment note</h3>
          </div>
          {payment.paymentNote ? (
            <div className="flex-1 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs font-normal leading-5 text-gray-800 whitespace-pre-wrap">
              {payment.paymentNote}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
              No payment note was submitted.
            </div>
          )}
        </section>

        <section className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-3.5 flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4.5 w-4.5 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">Receipt preview</h3>
            </div>
            {payment.receiptUrl ? (
              <button
                type="button"
                onClick={() => setReceiptViewerOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Open original
              </button>
            ) : null}
          </div>

          {payment.receiptUrl ? (
            <div className="relative h-48 sm:h-56 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-950">
              <ReceiptMedia
                url={getAbsoluteFileUrl(payment.receiptUrl)}
                alt={`${payment.listing?.title || 'Listing'} receipt`}
                className="h-full w-full p-1.5"
              />
            </div>
          ) : (
            <div className="flex flex-1 min-h-[160px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-500">
              No receipt image uploaded.
            </div>
          )}
        </section>
      </div>

      {isRejectModalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-semibold text-gray-900">Reject Payment</h3>
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Reason for rejection <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                rows={3}
                placeholder="Explain why the proof is being rejected"
                className="w-full rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-900 outline-none focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmReject()}
                disabled={savingStatus !== null}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {savingStatus === 'REJECTED' ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {receiptViewerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="relative flex w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-gray-500">Receipt original</p>
                <h3 className="mt-1 truncate text-base font-semibold text-gray-900">{payment.listing?.title || 'Listing payment'}</h3>
              </div>
              <button
                type="button"
                onClick={() => setReceiptViewerOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-gray-950 p-4 sm:p-6">
              <div className="relative h-[72vh] w-full overflow-hidden rounded-2xl bg-white">
                <ReceiptMedia
                  url={getAbsoluteFileUrl(payment.receiptUrl)}
                  alt={`${payment.listing?.title || 'Listing'} receipt`}
                  className="h-full w-full"
                  onClose={() => setReceiptViewerOpen(false)}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
