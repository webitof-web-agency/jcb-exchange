'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
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
  Copy,
  FileText,
  Truck,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { formatPortalCurrency, formatPortalDateTime, formatPortalLabel } from '@/lib/partnerPortal';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { resolveLeadId } from '@/lib/routeResolvers';
import { generateAdminLeadDetailPath } from '@/lib/routePaths';

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
  activities: ActivityItem[];
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

  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';
  const isEmployee = currentUserRole === 'EMPLOYEE';
  const backHref = isSuperAdmin ? '/superadmin/enquiries' : isEmployee ? '/employee/enquiries' : '/partner/leads';

  const fetchLeadDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const resolvedLeadId = (await resolveLeadId(leadId)) || leadId;
      const res = await api.get<{ lead: LeadDetail }>(`/leads/${resolvedLeadId}`);
      setLead(res.data.lead);
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

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent"></div>
        <p className="mt-4 text-sm font-medium text-gray-500">{t('enquiryDetails.loadingTimeline')}</p>
      </div>
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
                <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 mt-0.5">
                  {t('enquiryDetails.customer')}
                </span>
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
      </div>

      {/* Right Column: Activity Timeline */}
      <div className="lg:col-span-1">
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

          <div className="mt-6 relative space-y-8 before:absolute before:inset-y-0 before:left-4 before:-ml-px before:w-0.5 before:bg-gray-100">
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
    </div>
  );
}
