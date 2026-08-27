'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Package,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import api from '@/lib/api';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { useHeaderStore } from '@/store/headerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { formatPortalCurrency, formatPortalDate } from '@/lib/partnerPortal';
import { resolveVisitorId } from '@/lib/routeResolvers';
import { generateAdminListingDetailPath, generateAdminVisitorDetailPath } from '@/lib/routePaths';

type VisitorRecord = {
  id: string;
  name: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  role: string;
  status: string;
  authProvider: string;
  city: string | null;
  state: string | null;
  isPrimeCustomer?: boolean;
  customerCategory?: string | null;
  primeSubscriptionExpiresAt?: string | null;
  primeSubscriptionStatus?: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  } | null;
};

interface PartnerListing {
  id: string;
  title: string;
  price: number;
  status: string;
  createdAt: string;
  imageUrl?: string | null;
  images?: Array<{
    id: string;
    url: string;
    isFeatured: boolean;
  }>;
}

const statusClassNames: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PENDING: 'bg-orange-100 text-orange-700',
  REVIEW_PENDING: 'bg-orange-100 text-orange-700',
  PROFILE_PENDING: 'bg-orange-100 text-orange-700',
  KYC_PENDING: 'bg-orange-100 text-orange-700',
  AGREEMENT_PENDING: 'bg-orange-100 text-orange-700',
  REJECTED: 'bg-red-100 text-red-700',
  SOLD: 'bg-blue-100 text-blue-700',
  EXPIRED: 'bg-gray-100 text-gray-700',
  INACTIVE: 'bg-gray-100 text-gray-700',
};

interface VisitorDetailPageProps {
  visitorId: string;
  backHref: string;
  listingDetailBaseHref: string;
}

export default function VisitorDetailPage({
  visitorId,
  backHref,
  listingDetailBaseHref,
}: VisitorDetailPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [visitor, setVisitor] = useState<VisitorRecord | null>(null);
  const [listings, setListings] = useState<PartnerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingListings, setLoadingListings] = useState(true);
  const [error, setError] = useState('');
  const [resolvedVisitorId, setResolvedVisitorId] = useState<string | null>(null);

  const formatLabel = useCallback(
    (value?: string | null) =>
      value
        ? value
            .toLowerCase()
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        : t('visitorDetails.notSet'),
    [t]
  );

  const formatStatusLabel = useCallback(
    (value?: string | null) => {
      if (!value) {
        return t('visitorDetails.notSet');
      }

      switch (value.toUpperCase()) {
        case 'APPROVED':
        case 'ACTIVE':
          return t('visitorDetails.active');
        case 'PENDING':
        case 'REVIEW_PENDING':
        case 'PROFILE_PENDING':
        case 'KYC_PENDING':
        case 'AGREEMENT_PENDING':
          return t('visitorDetails.pending');
        case 'REJECTED':
          return t('visitorDetails.rejected');
        case 'INACTIVE':
          return t('visitorDetails.inactive');
        case 'SOLD':
          return t('visitorDetails.sold');
        case 'EXPIRED':
          return t('visitorDetails.expired');
        default:
          return formatLabel(value);
      }
    },
    [formatLabel, t]
  );

  const getVisitorName = useCallback(
    (currentVisitor: VisitorRecord) =>
      currentVisitor.fullName || currentVisitor.name || currentVisitor.email || t('visitorDetails.unnamedVisitor'),
    [t]
  );

  const fetchVisitorListings = useCallback(async () => {
    if (!resolvedVisitorId) {
      setListings([]);
      setLoadingListings(false);
      return;
    }

    try {
      setLoadingListings(true);
      const response = await api.get<{ listings: PartnerListing[] }>(`/superadmin/listings?partnerId=${resolvedVisitorId}`);
      setListings(response.data.listings || []);
    } catch (err) {
      console.error('Failed to load listings', err);
    } finally {
      setLoadingListings(false);
    }
  }, [resolvedVisitorId]);

  const fetchVisitorDetails = useCallback(async () => {
    try {
      setLoading(true);
      const nextResolvedVisitorId = (await resolveVisitorId(visitorId)) || visitorId;
      setResolvedVisitorId(nextResolvedVisitorId);
      const response = await api.get<{ visitors: VisitorRecord[] }>('/superadmin/visitors');
      const allVisitors = response.data.visitors || [];
      const foundVisitor = allVisitors.find((item) => String(item.id) === String(nextResolvedVisitorId));

      if (!foundVisitor) {
        setError(t('visitorDetails.visitorNotFound'));
      } else {
        setVisitor(foundVisitor);
      }
    } catch (err: unknown) {
      const message =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'data' in err.response &&
        err.response.data &&
        typeof err.response.data === 'object' &&
        'message' in err.response.data &&
        typeof err.response.data.message === 'string'
          ? err.response.data.message
          : t('visitorDetails.fetchFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [visitorId, t]);

  useEffect(() => {
    const loadVisitorData = async () => {
      await Promise.all([fetchVisitorDetails(), fetchVisitorListings()]);
    };

    void loadVisitorData();
  }, [fetchVisitorDetails, fetchVisitorListings]);

  useEffect(() => {
    if (!visitor) {
      return;
    }

    const canonicalPath = generateAdminVisitorDetailPath(backHref, {
      id: visitor.id,
      fullName: visitor.fullName,
      name: visitor.name,
      city: visitor.city,
    });

    if (pathname !== canonicalPath) {
      router.replace(canonicalPath);
    }
  }, [visitor, backHref, pathname, router]);

  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);

  useEffect(() => {
    if (visitor) {
      setCustomHeader(
        <div className="flex items-center gap-4">
          <Link
            href={backHref}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 shadow-sm transition-all hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('visitorDetails.title')}</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              {t('visitorDetails.receivedOn', { date: formatPortalDate(visitor.createdAt) })}
            </p>
          </div>
        </div>
      );
    }
    return () => setCustomHeader(null);
  }, [visitor, backHref, setCustomHeader, t]);

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#FFC107]"></div>
      </div>
    );
  }

  if (error || !visitor) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-2xl bg-white p-8 text-center shadow-sm">
        <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
        <h3 className="mb-2 text-xl font-bold text-gray-900">{t('visitorDetails.loadFailed')}</h3>
        <p className="mb-6 text-gray-500">{error || t('visitorDetails.visitorNotFound')}</p>
        <Link
          href={backHref}
          className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
        >
          {t('visitorDetails.goBack')}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="col-span-1 flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-3 lg:flex-row lg:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#FFC107]/10 text-xl font-bold text-[#FFC107]">
                {getVisitorName(visitor).charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{getVisitorName(visitor)}</h2>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      visitor.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {formatStatusLabel(visitor.status)}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                  <span className="text-sm font-medium text-gray-600">{formatLabel(visitor.role)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h4 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <Phone className="h-4 w-4" /> {t('visitorDetails.contactInformation')}
            </h4>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">{t('visitorDetails.mobile')}</p>
                <p className="text-sm font-medium text-gray-900">{visitor.mobile || t('visitorDetails.notProvided')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('visitorDetails.email')}</p>
                <p className="text-sm font-medium text-gray-900">{visitor.email || t('visitorDetails.notProvided')}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h4 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <MapPin className="h-4 w-4" /> {t('visitorDetails.location')}
            </h4>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">{t('visitorDetails.city')}</p>
                <p className="text-sm font-medium text-gray-900">{visitor.city || t('visitorDetails.notSpecified')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('visitorDetails.state')}</p>
                <p className="text-sm font-medium text-gray-900">{visitor.state || t('visitorDetails.notSpecified')}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h4 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <AlertCircle className="h-4 w-4" /> {t('visitorDetails.accountSettings')}
            </h4>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">{t('visitorDetails.authProvider')}</p>
                <p className="text-sm font-medium text-gray-900">{formatLabel(visitor.authProvider)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('visitorDetails.customerType')}</p>
                <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  {formatLabel(visitor.role)}
                  {visitor.isPrimeCustomer ? (
                    <span className="inline-flex rounded-full bg-[#FFC107]/20 px-2 py-0.5 text-[10px] font-bold text-yellow-800">
                      {t('visitorDetails.prime')}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-gray-500" />
              <h3 className="text-lg font-bold text-gray-900">{t('visitorDetails.listingsCreatedByVisitor')}</h3>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {t('visitorDetails.totalCount', { count: listings.length })}
            </span>
          </div>

          {loadingListings ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#FFC107]"></div>
            </div>
          ) : listings.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
              <Package className="mb-2 h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-500">{t('visitorDetails.noListings')}</p>
            </div>
          ) : (
            <div
              className="max-h-[600px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {listings.map((listing) => (
                  <div
                    key={listing.id}
                    onClick={() => router.push(generateAdminListingDetailPath(listingDetailBaseHref, listing))}
                    className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-gray-100">
                      {listing.imageUrl ? (
                        <Image
                          src={getAbsoluteFileUrl(listing.imageUrl)}
                          alt={listing.title}
                          fill
                          unoptimized
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : listing.images && listing.images.length > 0 ? (
                        <Image
                          src={getAbsoluteFileUrl(listing.images.find((image) => image.isFeatured)?.url || listing.images[0].url)}
                          alt={listing.title}
                          fill
                          unoptimized
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
                          <ImageIcon className="mb-2 h-8 w-8 opacity-50" />
                          <span className="text-xs font-medium uppercase tracking-wider">{t('visitorDetails.noImage')}</span>
                        </div>
                      )}
                      <div className="absolute right-2 top-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-bold shadow-sm ${statusClassNames[listing.status] || 'bg-gray-100 text-gray-700'}`}>
                          {formatStatusLabel(listing.status)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-grow flex-col justify-between p-4">
                      <h4 className="mb-2 line-clamp-2 text-sm font-bold leading-tight text-gray-900" title={listing.title}>
                        {listing.title}
                      </h4>
                      <div className="mt-auto flex items-end justify-between">
                        <p className="text-lg font-black text-[#FFC107]">{formatPortalCurrency(listing.price)}</p>
                        <p className="text-xs font-medium text-gray-400">{formatPortalDate(listing.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
