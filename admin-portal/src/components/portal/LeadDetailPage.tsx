'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  MessageCircle,
  Mail,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  Building2,
  Check,
  ChevronDown,
  Copy,
  FileText,
  CreditCard,
  ExternalLink,
  ReceiptText,
  Truck,
  Crown,
  CircleDot,
  PlayCircle,
  BadgeCheck,
  ShieldCheck,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { formatPortalCurrency, formatPortalDateTime, formatPortalLabel } from '@/lib/partnerPortal';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { resolveLeadId } from '@/lib/routeResolvers';
import { generateAdminLeadDetailPath, generateAdminListingPaymentDetailPath } from '@/lib/routePaths';

type ActivityItem = {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata?: unknown;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    role: string;
  } | null;
};

type ListingPaymentSummary = {
  id: string;
  listingId: string;
  buyerId: string;
  partnerId: string;
  method: 'RTGS' | 'RAZORPAY' | 'PHONEPE';
  status: 'PENDING_VERIFICATION' | 'APPROVED' | 'REJECTED' | 'FAILED' | 'PAID';
  amount: number;
  transactionRef: string;
  paymentNote: string;
  receiptUrl: string;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string;
  isForCurrentListing: boolean;
  listing: {
    id: string;
    title: string;
    price: number;
    status: string;
  } | null;
};

type LeadDetail = {
  id: string;
  enquiryType: string;
  message: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    city: string;
    state: string;
    role?: string;
    createdAt?: string | null;
    isPrime?: boolean;
  };
  listing: {
    id: string;
    title: string;
    status: string;
    price: number;
    locationCity: string;
    locationState: string;
    categoryId?: string;
    categoryName?: string;
    brandName?: string;
    modelName?: string;
    manufacturingYear?: number;
    operatingHours?: number;
    condition?: string;
    description?: string;
    isNegotiable?: boolean;
    featuredImage?: string | null;
    media?: Array<{ id: string; url: string; type: string; isFeatured: boolean }>;
  };
  routing: {
    mode: 'SUPER_ADMIN' | 'SELLER';
  };
  recipient: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    whatsappNumber: string;
    role: string;
    partnerType: string | null;
  };
  listingOwner: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    whatsappNumber: string;
    partnerType: string | null;
  } | null;
  listingPayments?: ListingPaymentSummary[];
  activities: ActivityItem[];
};

type DealStage = 'OPEN' | 'ONGOING' | 'CLOSED';

const getDealStage = (status: string): DealStage => {
  const normalized = String(status || '').toUpperCase();

  if (normalized === 'WON' || normalized === 'LOST') {
    return 'CLOSED';
  }

  if (normalized === 'CONTACTED' || normalized === 'INTERESTED' || normalized === 'INSPECTION_SCHEDULED') {
    return 'ONGOING';
  }

  return 'OPEN';
};

const getDefaultStatusForStage = (stage: DealStage) => {
  if (stage === 'CLOSED') {
    return 'WON';
  }

  if (stage === 'ONGOING') {
    return 'CONTACTED';
  }

  return 'NEW';
};

const getStageStatusOptions = (stage: DealStage) => {
  if (stage === 'CLOSED') {
    return ['WON', 'LOST'] as const;
  }

  if (stage === 'ONGOING') {
    return ['CONTACTED', 'INTERESTED', 'INSPECTION_SCHEDULED'] as const;
  }

  return ['NEW'] as const;
};

const stageMeta: Record<
  DealStage,
  { label: string; helper: string; icon: typeof CircleDot }
> = {
  OPEN: {
    label: 'Open',
    helper: 'New or untouched enquiry',
    icon: CircleDot,
  },
  ONGOING: {
    label: 'Ongoing',
    helper: 'In progress and being followed up',
    icon: PlayCircle,
  },
  CLOSED: {
    label: 'Closed',
    helper: 'Deal completed or lost',
    icon: BadgeCheck,
  },
};

const getPaymentStatusMeta = (status: ListingPaymentSummary['status']) => {
  switch (status) {
    case 'APPROVED':
    case 'PAID':
      return {
        label: 'Approved',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        dotClassName: 'bg-emerald-500',
      };
    case 'REJECTED':
    case 'FAILED':
      return {
        label: 'Rejected',
        className: 'border-red-200 bg-red-50 text-red-700',
        dotClassName: 'bg-red-500',
      };
    default:
      return {
        label: 'Pending',
        className: 'border-amber-200 bg-amber-50 text-amber-800',
        dotClassName: 'bg-amber-500',
      };
  }
};

const getPaymentMethodLabel = (method: ListingPaymentSummary['method']) => {
  if (method === 'PHONEPE') {
    return 'PhonePe';
  }

  if (method === 'RAZORPAY') {
    return 'Razorpay';
  }

  return 'RTGS';
};

export default function LeadDetailPage({ leadId }: { leadId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const currentUserRole = useAuthStore((state) => state.user?.role);
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [dealStage, setDealStage] = useState<DealStage>('OPEN');
  const [selectedStatus, setSelectedStatus] = useState('NEW');
  const [closeNote, setCloseNote] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [selectedReceiptPayment, setSelectedReceiptPayment] = useState<ListingPaymentSummary | null>(null);
  const [savingPaymentStatus, setSavingPaymentStatus] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [paymentRejectReason, setPaymentRejectReason] = useState('');
  const [isPaymentRejectFormOpen, setIsPaymentRejectFormOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';
  const isEmployee = currentUserRole === 'EMPLOYEE';
  const backHref = isSuperAdmin ? '/superadmin/enquiries' : isEmployee ? '/employee/enquiries' : '/partner/leads';
  const paymentVerificationHref = isSuperAdmin
    ? '/superadmin/listings?view=payments'
    : isEmployee
      ? '/employee/listings?view=payments'
      : '/partner/listings';

  const fetchLeadDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const resolvedLeadId = (await resolveLeadId(leadId)) || leadId;
      const res = await api.get<{ lead: LeadDetail }>(`/leads/${resolvedLeadId}`);
      setLead(res.data.lead);
      const nextStage = getDealStage(res.data.lead.status);
      setDealStage(nextStage);
      setSelectedStatus(res.data.lead.status);
      setCloseNote('');
    } catch (err: unknown) {
      const apiError =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      console.error('Failed to load lead details:', err);
      setError(apiError || t('enquiryDetails.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [leadId, t]);

  useEffect(() => {
    if (leadId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchLeadDetails();
    }
  }, [fetchLeadDetails, leadId]);

  useEffect(() => {
    if (!lead) {
      return;
    }

    const detailBaseHref = isSuperAdmin ? '/superadmin/enquiries' : isEmployee ? '/employee/enquiries' : '/partner/leads';
    const canonicalPath = generateAdminLeadDetailPath(detailBaseHref, {
      id: lead.id,
      customerName: lead.customer?.name,
      listingTitle: lead.listing?.title,
    });

    if (pathname !== canonicalPath) {
      router.replace(canonicalPath);
    }
  }, [lead, isSuperAdmin, isEmployee, pathname, router]);

  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);

  useEffect(() => {
    if (lead) {
      setCustomHeader(
        <div className="flex items-center gap-4">
          <Link
            href={backHref}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 shadow-sm transition-all hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('enquiryDetails.title')}</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              {t('enquiryDetails.receivedOn', { date: formatPortalDateTime(lead.createdAt) })}
            </p>
          </div>
        </div>
      );
    }
    return () => setCustomHeader(null);
  }, [lead, backHref, setCustomHeader, t]);

  const copyToClipboard = (text: string, fieldName: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.info(t('enquiryDetails.copySuccess', { field: fieldName }));
    setTimeout(() => setCopiedField(null), 2000);
  };

  const saveDealStage = async () => {
    if (!lead) {
      return;
    }

    const normalizedStatus = String(selectedStatus || '').trim().toUpperCase();
    const isLossDeal = normalizedStatus === 'LOST';

    if (!normalizedStatus) {
      toast.error('Please select a deal status.');
      return;
    }

    if (dealStage !== getDealStage(normalizedStatus)) {
      toast.error('Please choose a status that matches the selected CRM stage.');
      return;
    }

    if (isLossDeal && !closeNote.trim()) {
      toast.error('Please add a close note before closing the deal.');
      return;
    }

    try {
      setSavingStatus(true);
      const response = await api.patch<{
        message: string;
        lead: Omit<LeadDetail, 'activities'>;
        activity?: ActivityItem | null;
      }>(`/leads/${lead.id}/status`, {
        status: normalizedStatus,
        note: isLossDeal ? closeNote.trim() : '',
      });
      toast.success('Deal status updated successfully.');
      setCloseNote('');
      const updatedLead = response.data.lead;
      const nextStage = getDealStage(updatedLead.status);

      setLead((current) =>
        current
          ? {
              ...current,
              ...updatedLead,
              activities: response.data.activity
                ? [...current.activities, response.data.activity]
                : current.activities,
            }
          : ({
              ...updatedLead,
              activities: response.data.activity ? [response.data.activity] : [],
            } as LeadDetail),
      );
      setDealStage(nextStage);
      setSelectedStatus(updatedLead.status);
      setIsStatusDropdownOpen(false);
    } catch (err: unknown) {
      const apiError =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      toast.error(apiError || 'Unable to update deal status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const updateLatestListingPayment = async (status: 'APPROVED' | 'REJECTED', reason?: string) => {
    if (!lead || !latestListingPayment) {
      return;
    }

    const rejectionReason = status === 'REJECTED' ? String(reason || '').trim() : '';
    if (status === 'REJECTED' && !rejectionReason) {
      setPaymentRejectReason('');
      setIsPaymentRejectFormOpen(true);
      toast.error('Please add a rejection reason before declining this payment.');
      return;
    }

    try {
      setSavingPaymentStatus(status);
      await api.patch(`/superadmin/listing-payments/${latestListingPayment.id}/status`, {
        status,
        rejectionReason,
      });
      toast.success(status === 'APPROVED' ? 'Payment approved successfully.' : 'Payment declined successfully.');
      setPaymentRejectReason('');
      setIsPaymentRejectFormOpen(false);
      await fetchLeadDetails();
    } catch (updateError: unknown) {
      const apiError =
        updateError && typeof updateError === 'object' && 'response' in updateError
          ? (updateError as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      toast.error(apiError || 'Unable to update payment status.');
    } finally {
      setSavingPaymentStatus(null);
    }
  };

  if (loading) {
    return (
      <BrandLoader variant="section" size="md" bg="light" text={t('enquiryDetails.loadingTimeline')} />
    );
  }

  if (error || !lead) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h3 className="mt-3 text-lg font-bold text-gray-900">{error || t('enquiryDetails.notFound')}</h3>
          <p className="mt-1 text-sm text-gray-600">{t('enquiryDetails.notFoundDescription')}</p>
          <div className="mt-6">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('enquiryDetails.backToEnquiries')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const customerCleanPhone = lead.customer.mobile ? lead.customer.mobile.replace(/\D/g, '') : '';
  const listingImageUrl = getAbsoluteFileUrl(
    lead.listing.media?.find((m) => m.isFeatured)?.url || lead.listing.media?.[0]?.url || lead.listing.featuredImage || null
  );
  const listingPayments = lead.listingPayments || [];
  const latestListingPayment = listingPayments[0] || null;
  const latestPaymentStatusMeta = latestListingPayment ? getPaymentStatusMeta(latestListingPayment.status) : null;
  const selectedReceiptUrl = selectedReceiptPayment?.receiptUrl
    ? getAbsoluteFileUrl(selectedReceiptPayment.receiptUrl)
    : '';

  return (
    <div className="space-y-6 pb-12">
      {/* Quick Contact Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 p-4 text-white shadow-md sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFC107] text-gray-900 font-bold">
            <User className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-gray-400">{t('enquiryDetails.customer')}</div>
            <div className="font-bold text-white leading-tight">{lead.customer.name}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-2">
          {lead.customer.mobile ? (
            <>
              <a
                href={`tel:${lead.customer.mobile}`}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#FFC107] hover:bg-[#E5AD06] px-4 py-2.5 text-xs font-bold text-black shadow-sm transition"
              >
                <Phone className="h-4 w-4" />
                {t('enquiryDetails.callCustomer')}
              </a>
              <a
                href={`https://wa.me/91${customerCleanPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition"
              >
                <MessageCircle className="h-4 w-4" />
                {t('enquiryDetails.whatsapp')}
              </a>
            </>
          ) : null}

          {lead.listingOwner?.mobile || lead.recipient.mobile ? (
            <a
              href={`tel:${lead.listingOwner?.mobile || lead.recipient.mobile}`}
              className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 rounded-xl bg-gray-700 hover:bg-gray-600 px-4 py-2.5 text-xs font-bold text-gray-200 shadow-sm transition hover:text-white"
            >
              <Phone className="h-4 w-4" />
              {t('enquiryDetails.callSeller')}
            </a>
          ) : null}
        </div>
      </div>

      {/* Payment Verification Summary */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">Listing Payment Verification</h2>
                {latestListingPayment && latestPaymentStatusMeta ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${latestPaymentStatusMeta.className}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${latestPaymentStatusMeta.dotClassName}`} />
                    {latestPaymentStatusMeta.label}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-600">
                    Not submitted
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {latestListingPayment
                  ? latestListingPayment.isForCurrentListing
                    ? 'Payment submitted for this enquiry listing.'
                    : 'Payment submitted by this buyer for another listing.'
                  : 'No payment proof has been submitted by this buyer yet.'}
              </p>
              {latestListingPayment?.listing && !latestListingPayment.isForCurrentListing ? (
                <p className="mt-1 text-xs font-semibold text-gray-600">
                  Related listing: {latestListingPayment.listing.title}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            {latestListingPayment && latestListingPayment.status === 'PENDING_VERIFICATION' ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void updateLatestListingPayment('APPROVED')}
                  disabled={savingPaymentStatus !== null}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {savingPaymentStatus === 'APPROVED' ? 'Approving...' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPaymentRejectFormOpen((prev) => !prev)}
                  disabled={savingPaymentStatus !== null}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" />
                  Decline
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {isSuperAdmin || isEmployee ? (
                <Link
                  href={paymentVerificationHref}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
                >
                  <ReceiptText className="h-3.5 w-3.5" />
                  Open verification page
                </Link>
              ) : null}
              {latestListingPayment ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">UTR / Ref</p>
                  <p className="mt-0.5 break-words text-sm font-bold text-gray-900">{latestListingPayment.transactionRef || 'Not provided'}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {latestListingPayment ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Amount</p>
              <p className="mt-0.5 text-sm font-black text-gray-900">{formatPortalCurrency(latestListingPayment.amount)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Method</p>
              <p className="mt-0.5 text-sm font-bold text-gray-900">{getPaymentMethodLabel(latestListingPayment.method)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Submitted</p>
              <p className="mt-0.5 text-sm font-bold text-gray-900">{formatPortalDateTime(latestListingPayment.submittedAt)}</p>
            </div>
          </div>
        ) : null}

        {latestListingPayment && latestListingPayment.status === 'PENDING_VERIFICATION' && isPaymentRejectFormOpen ? (
          <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/50 p-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
              Decline reason
            </label>
            <textarea
              value={paymentRejectReason}
              onChange={(event) => setPaymentRejectReason(event.target.value)}
              placeholder="Add a short reason for declining this payment"
              rows={3}
              className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-red-300 focus:ring-1 focus:ring-red-200"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void updateLatestListingPayment('REJECTED', paymentRejectReason)}
                disabled={savingPaymentStatus !== null}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" />
                {savingPaymentStatus === 'REJECTED' ? 'Declining...' : 'Confirm decline'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPaymentRejectFormOpen(false);
                  setPaymentRejectReason('');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (Customer, Seller, Machine) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Top Row: Customer & Authorized Place Side by Side */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          
          {/* Customer Information Card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFC107]/10 text-[#FFC107] text-lg font-bold">
                {lead.customer.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{lead.customer.name}</h3>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                    {t('enquiryDetails.customer')}
                  </span>
                  {lead.customer.isPrime ? (
                    <span
                      title="Prime Customer"
                      className="inline-flex items-center justify-center rounded-full bg-amber-100/90 p-0.5 text-amber-800 border border-amber-300 shadow-2xs shrink-0"
                    >
                      <Crown className="h-2.5 w-2.5 fill-amber-500 text-amber-600" />
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-gray-400" />
                  <div>
                  <div className="text-xs font-medium text-gray-500">{t('enquiryDetails.phone')}</div>
                    <div>
                      {lead.customer.mobile ? (
                        <a
                          href={`tel:${lead.customer.mobile}`}
                          className="group/call inline-flex items-center gap-1.5 font-semibold text-gray-900 font-mono hover:text-[#FFC107] transition-all"
                          title={t('enquiryDetails.clickToCall')}
                        >
                          {lead.customer.mobile}
                          <Phone className="h-3.5 w-3.5 text-gray-400 group-hover/call:text-[#FFC107] transition-colors" />
                        </a>
                      ) : (
                        <span className="font-semibold text-gray-900 font-mono">{t('enquiryDetails.notProvided')}</span>
                      )}
                    </div>
                  </div>
                </div>
                {lead.customer.mobile && (
                  <button
                    onClick={() => copyToClipboard(lead.customer.mobile, t('enquiryDetails.phoneField'))}
                    className="text-gray-400 hover:text-gray-600 transition"
                    title={t('enquiryDetails.copyNumber')}
                  >
                    {copiedField === t('enquiryDetails.phoneField') ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-xs font-medium text-gray-500">{t('enquiryDetails.email')}</div>
                  <div className="font-semibold text-gray-900">
                    {lead.customer.email || t('enquiryDetails.notProvided')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-xs font-medium text-gray-500">{t('enquiryDetails.location')}</div>
                  <div className="font-semibold text-gray-900">
                    {[lead.customer.city, lead.customer.state].filter(Boolean).join(', ') || t('enquiryDetails.notAvailable')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Routed Seller / Partner Card (Authorized Place) */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-purple-700 text-lg font-bold">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {lead.listingOwner?.name || lead.recipient.name}
                </h3>
                <span className="inline-flex rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-700 mt-0.5">
                  {formatPortalLabel(lead.listingOwner?.partnerType || lead.recipient.partnerType) || t('enquiryDetails.authorizedPlace')}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-gray-400" />
                  <div>
                    <div className="text-xs font-medium text-gray-500">{t('enquiryDetails.contactNumber')}</div>
                    <div>
                      {lead.listingOwner?.mobile || lead.recipient.mobile ? (
                        <a
                          href={`tel:${lead.listingOwner?.mobile || lead.recipient.mobile}`}
                          className="group/call inline-flex items-center gap-1.5 font-semibold text-gray-900 font-mono hover:text-[#FFC107] transition-all"
                          title={t('enquiryDetails.clickToCall')}
                        >
                          {lead.listingOwner?.mobile || lead.recipient.mobile}
                          <Phone className="h-3.5 w-3.5 text-gray-400 group-hover/call:text-[#FFC107] transition-colors" />
                        </a>
                      ) : (
                        <span className="font-semibold text-gray-900 font-mono">{t('enquiryDetails.notAvailable')}</span>
                      )}
                    </div>
                  </div>
                </div>
                {(lead.listingOwner?.mobile || lead.recipient.mobile) && (
                  <button
                    onClick={() =>
                      copyToClipboard(
                        lead.listingOwner?.mobile || lead.recipient.mobile,
                        t('enquiryDetails.sellerPhoneField')
                      )
                    }
                    className="text-gray-400 hover:text-gray-600 transition"
                    title={t('enquiryDetails.copyNumber')}
                  >
                    {copiedField === t('enquiryDetails.sellerPhoneField') ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
                  </button>
                )}
              </div>

              {(lead.listingOwner?.email || lead.recipient.email) && (
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-gray-400" />
                  <div>
                    <div className="text-xs font-medium text-gray-500">{t('enquiryDetails.email')}</div>
                    <div className="font-semibold text-gray-900">
                      {lead.listingOwner?.email || lead.recipient.email}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Machine / Listing Card (Full Width Below) */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700 font-bold border border-orange-200">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{t('enquiryDetails.enquiredMachine')}</h3>
                <p className="text-xs text-gray-500">{t('enquiryDetails.machineInterest')}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row">
            {/* Listing Thumbnail */}
            <div className="relative h-28 w-full sm:w-36 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-100">
              {listingImageUrl ? (
                <Image
                  src={listingImageUrl}
                  alt={lead.listing.title}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, 144px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
                  <Truck className="h-8 w-8 text-gray-300" />
                  <span className="mt-1 text-[10px] font-semibold">{t('enquiryDetails.noImage')}</span>
                </div>
              )}
            </div>

            {/* Listing Details */}
            <div className="flex-1 min-w-0">
              <h4 className="text-base font-bold text-gray-900 truncate">
                {lead.listing.title}
              </h4>
              <div className="mt-1 text-lg font-black text-amber-600">
                {lead.listing.price > 0 ? formatPortalCurrency(lead.listing.price) : t('enquiryDetails.priceOnRequest')}
                {lead.listing.isNegotiable ? (
                  <span className="ml-2 text-xs font-normal text-gray-500">({t('enquiryDetails.negotiable')})</span>
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-3">
                {lead.listing.categoryName ? (
                  <div className="rounded-lg bg-gray-50 p-2">
                    <span className="text-gray-400 block text-[10px]">{t('enquiryDetails.category')}</span>
                    <span className="font-semibold text-gray-900">{lead.listing.categoryName}</span>
                  </div>
                ) : null}
                {lead.listing.manufacturingYear ? (
                  <div className="rounded-lg bg-gray-50 p-2">
                    <span className="text-gray-400 block text-[10px]">{t('enquiryDetails.year')}</span>
                    <span className="font-semibold text-gray-900">{lead.listing.manufacturingYear}</span>
                  </div>
                ) : null}
                {lead.listing.operatingHours !== undefined && lead.listing.operatingHours !== null ? (
                  <div className="rounded-lg bg-gray-50 p-2">
                    <span className="text-gray-400 block text-[10px]">{t('enquiryDetails.hours')}</span>
                    <span className="font-semibold text-gray-900">
                      {t('enquiryDetails.hoursValue', { count: lead.listing.operatingHours })}
                    </span>
                  </div>
                ) : null}
                {lead.listing.condition ? (
                  <div className="rounded-lg bg-gray-50 p-2">
                    <span className="text-gray-400 block text-[10px]">{t('enquiryDetails.condition')}</span>
                    <span className="font-semibold text-gray-900">{formatPortalLabel(lead.listing.condition)}</span>
                  </div>
                ) : null}
                <div className="rounded-lg bg-gray-50 p-2 col-span-2 sm:col-span-1">
                  <span className="text-gray-400 block text-[10px]">{t('enquiryDetails.location')}</span>
                  <span className="font-semibold text-gray-900 truncate block">
                    {[lead.listing.locationCity, lead.listing.locationState].filter(Boolean).join(', ') || t('enquiryDetails.notSpecified')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Listing Payment Verification */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Payment Verification</h3>
                <p className="text-xs text-gray-500">
                  {latestListingPayment?.isForCurrentListing
                    ? 'Buyer payment proof for this enquiry listing'
                    : 'Buyer payment proof history from listing payments'}
                </p>
              </div>
            </div>
            {latestListingPayment && latestPaymentStatusMeta ? (
              <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${latestPaymentStatusMeta.className}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${latestPaymentStatusMeta.dotClassName}`} />
                {latestPaymentStatusMeta.label}
              </span>
            ) : null}
          </div>

          {latestListingPayment ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {latestListingPayment.listing ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 sm:col-span-2 xl:col-span-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      {latestListingPayment.isForCurrentListing ? 'Matched Listing' : 'Related Payment Listing'}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-6 text-gray-900">
                      {latestListingPayment.listing.title}
                    </p>
                  </div>
                ) : null}
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Amount</p>
                  <p className="mt-1 text-lg font-black text-gray-900">{formatPortalCurrency(latestListingPayment.amount)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Method</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{getPaymentMethodLabel(latestListingPayment.method)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">UTR / Reference</p>
                  <p className="mt-1 break-words text-sm font-bold text-gray-900">
                    {latestListingPayment.transactionRef || 'Not provided'}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Submitted</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{formatPortalDateTime(latestListingPayment.submittedAt)}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Payment Note</p>
                  </div>
                  {latestListingPayment.paymentNote ? (
                    <p className="mt-3 max-w-fit rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-800 whitespace-pre-wrap">
                      {latestListingPayment.paymentNote}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-gray-500">No note submitted.</p>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ReceiptText className="h-4 w-4 text-gray-500" />
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Receipt</p>
                    </div>
                    {latestListingPayment.receiptUrl ? (
                      <button
                        type="button"
                        onClick={() => setSelectedReceiptPayment(latestListingPayment)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-800 shadow-sm transition hover:bg-gray-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm text-gray-600">
                    {latestListingPayment.receiptUrl ? 'Receipt is available for review.' : 'No receipt image uploaded.'}
                  </p>
                  {latestListingPayment.status === 'REJECTED' && latestListingPayment.rejectionReason ? (
                    <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {latestListingPayment.rejectionReason}
                    </div>
                  ) : null}
                </div>
              </div>

              {isSuperAdmin ? (
                <Link
                  href={generateAdminListingPaymentDetailPath('/superadmin/listings', {
                    id: latestListingPayment.id,
                    listingTitle: latestListingPayment.listing?.title || lead.listing.title,
                    method: latestListingPayment.method,
                  })}
                  className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-black"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Open payment detail
                </Link>
              ) : null}

              {listingPayments.length > 1 ? (
                <div className="rounded-xl border border-gray-200">
                  <div className="border-b border-gray-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">
                    Previous Submissions
                  </div>
                  <div className="divide-y divide-gray-100">
                    {listingPayments.slice(1).map((payment) => {
                      const statusMeta = getPaymentStatusMeta(payment.status);
                      return (
                        <div key={payment.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-gray-900">
                              {formatPortalCurrency(payment.amount)} - {getPaymentMethodLabel(payment.method)}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {payment.transactionRef || 'No reference'} - {formatPortalDateTime(payment.submittedAt)}
                            </p>
                          </div>
                          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusMeta.className}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClassName}`} />
                            {statusMeta.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
              No buyer payment has been submitted for this enquiry yet.
            </div>
          )}
        </div>
      </div>

        {/* Right Column: CRM + Activity Timeline */}
      <div className="lg:col-span-1 space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <h3 className="font-bold text-gray-900">Deal CRM</h3>
              <p className="text-xs text-gray-500">Open, ongoing, and close with note</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700">
              <BadgeCheck className="h-3.5 w-3.5" />
              {stageMeta[dealStage].label}
            </div>
          </div>

          {latestListingPayment && latestPaymentStatusMeta ? (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Payment</span>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${latestPaymentStatusMeta.className}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${latestPaymentStatusMeta.dotClassName}`} />
                  {latestPaymentStatusMeta.label}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-gray-900">
                <span>{formatPortalCurrency(latestListingPayment.amount)}</span>
                <span className="text-gray-300">|</span>
                <span>{getPaymentMethodLabel(latestListingPayment.method)}</span>
              </div>
              <p className="mt-1 break-words text-xs text-gray-500">
                UTR: <span className="font-semibold text-gray-700">{latestListingPayment.transactionRef || 'Not provided'}</span>
              </p>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-3 gap-2">
            {(['OPEN', 'ONGOING', 'CLOSED'] as DealStage[]).map((stage) => {
              const StageIcon = stageMeta[stage].icon;
              const active = dealStage === stage;
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => {
                    setDealStage(stage);
                    const defaultStatus = getDefaultStatusForStage(stage);
                    setSelectedStatus(defaultStatus);
                    setCloseNote('');
                  }}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-[#FFC107] bg-[#FFC107]/10 text-gray-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <StageIcon className={`h-4 w-4 ${active ? 'text-[#B8860B]' : 'text-gray-400'}`} />
                  <div className="mt-2 text-xs font-bold uppercase tracking-wider">{stageMeta[stage].label}</div>
                  <div className="mt-1 text-[10px] leading-4 text-gray-500">{stageMeta[stage].helper}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
              Current Status
            </label>
            {dealStage === 'OPEN' ? (
              <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800">
                NEW
              </div>
            ) : (
              <div ref={statusDropdownRef} className="relative w-full">
                <button
                  type="button"
                  onClick={() => setIsStatusDropdownOpen((prev) => !prev)}
                  className={`w-full flex items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-gray-700 outline-none transition cursor-pointer shadow-xs ${
                    isStatusDropdownOpen
                      ? 'border-[#FFC107] ring-1 ring-[#FFC107]'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                  }`}
                >
                  <span className="truncate">{selectedStatus.replace(/_/g, ' ')}</span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-500 transition-transform duration-200 shrink-0 ${
                      isStatusDropdownOpen ? 'rotate-180 text-gray-700' : ''
                    }`}
                  />
                </button>

                {isStatusDropdownOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 w-full max-h-60 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl animate-in fade-in-50 zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-gray-400 border-b border-gray-100 mb-1">
                      CURRENT STATUS
                    </div>
                    {getStageStatusOptions(dealStage).map((option) => {
                      const isSelected = selectedStatus === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setSelectedStatus(option);
                            const nextStage = getDealStage(option);
                            setDealStage(nextStage);
                            if (option !== 'LOST') {
                              setCloseNote('');
                            }
                            setIsStatusDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition cursor-pointer ${
                            isSelected
                              ? 'bg-gray-100 text-gray-950 font-extrabold'
                              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          <span>{option.replace(/_/g, ' ')}</span>
                          {isSelected && <Check size={14} className="text-gray-950 stroke-[2.5]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedStatus === 'LOST' ? (
            <div className="mt-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                Loss Note
              </label>
              <textarea
                value={closeNote}
                onChange={(event) => setCloseNote(event.target.value)}
                rows={4}
                placeholder="Write why the deal was lost, next follow-up, or any summary note."
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void saveDealStage()}
            disabled={savingStatus}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#111827] px-4 py-3 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingStatus ? 'Saving...' : 'Save Deal Status'}
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sticky top-6">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 font-bold border border-blue-200">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">{t('enquiryDetails.activityTimeline')}</h3>
              <p className="text-xs text-gray-500">{t('enquiryDetails.timelineDescription')}</p>
            </div>
          </div>

          <div
            className="mt-6 relative space-y-8 before:absolute before:inset-y-0 before:left-4 before:-ml-px before:w-0.5 before:bg-gray-100 max-h-[420px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
          {lead.activities.map((activity, index) => {
            const isFollowUp = activity.type === 'FOLLOW_UP';
            const isStatusChange = activity.type === 'STATUS_CHANGE';
            const isNote = activity.type === 'NOTE';
            
            let Icon = Clock;
            let iconBg = 'bg-gray-100 text-gray-500';
            
            if (isFollowUp) {
              Icon = MessageSquare;
              iconBg = 'bg-[#FFC107] text-yellow-900';
            } else if (isStatusChange) {
              Icon = CheckCircle2;
              iconBg = 'bg-emerald-100 text-emerald-700';
            } else if (isNote) {
              Icon = FileText;
              iconBg = 'bg-blue-100 text-blue-700';
            } else if (activity.type === 'CREATED') {
              Icon = User;
              iconBg = 'bg-purple-100 text-purple-700';
            } else if (activity.type === 'WHATSAPP') {
              Icon = MessageCircle;
              iconBg = 'bg-[#25D366] text-white';
            } else if (activity.type === 'CALL') {
              Icon = Phone;
              iconBg = 'bg-indigo-100 text-indigo-700';
            }

            return (
              <div key={activity.id || index} className="relative flex gap-4">
                <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-4 border-white ${iconBg}`}>
                  <Icon className="h-4 w-4" />
                </div>
                
                <div className="flex-1 pt-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 sm:gap-4">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-gray-900 truncate">
                        {activity.title}
                        {isFollowUp && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-800">
                            {t('enquiryDetails.repeatEnquiry')}
                          </span>
                        )}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 whitespace-nowrap mt-1 sm:mt-0">
                      <Clock className="h-3 w-3" />
                      {formatPortalDateTime(activity.createdAt)}
                    </div>
                  </div>

                  {activity.content && (
                    <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-100 break-words">
                      {activity.content}
                    </div>
                  )}
                  
                  {activity.actor && (
                    <div className="mt-2 text-[10px] text-gray-400 flex items-center gap-1.5">
                      <User className="h-3 w-3" />
                      {t('enquiryDetails.loggedBy')} <span className="font-medium text-gray-600">{activity.actor.name}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </div>

    {selectedReceiptPayment && selectedReceiptUrl ? (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
        <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Payment Receipt</p>
              <h3 className="mt-1 truncate text-base font-bold text-gray-900" title={lead.listing.title}>
                {lead.listing.title}
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                {formatPortalCurrency(selectedReceiptPayment.amount)} - {getPaymentMethodLabel(selectedReceiptPayment.method)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedReceiptPayment(null)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="bg-gray-950 p-4">
            <div className="relative h-[70vh] min-h-[320px] w-full overflow-hidden rounded-xl bg-white">
              <Image
                src={selectedReceiptUrl}
                alt={`${lead.listing.title} payment receipt`}
                fill
                unoptimized
                sizes="100vw"
                className="object-contain"
              />
            </div>
          </div>
          <div className="flex justify-end border-t border-gray-100 bg-white px-5 py-3">
            <button
              type="button"
              onClick={() => setSelectedReceiptPayment(null)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-800 transition hover:bg-gray-50"
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
