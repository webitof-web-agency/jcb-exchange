'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Building2,
  FileText,
  AlertCircle,
  Map,
  Globe,
  Share2,
  ShieldCheck,
  Tag,
  Package,
  Image as ImageIcon,
} from 'lucide-react';
import api from '@/lib/api';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { useTranslation } from '@/hooks/useTranslation';
import { useHeaderStore } from '@/store/headerStore';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { formatPortalCurrency, formatPortalDate } from '@/lib/partnerPortal';
import { resolvePartnerId } from '@/lib/routeResolvers';
import { generateAdminListingDetailPath, generateAdminPartnerDetailPath, generateAdminPartnerEditPath } from '@/lib/routePaths';

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

interface PartnerProfile {
  id: string;
  ownerName: string;
  alternateMobile: string;
  businessAddress: string;
  district: string;
  state: string;
  pinCode: string;
  gstNumber: string;
  businessRegistrationNumber: string;
  businessExperience: string;
  yearsInBusiness: string;
  teamSize: string;
  serviceAreas: string;
  workingHours: string;
  googleMapsLocation: string;
  socialLinks: string;
  referralCode: string;
  websiteUrl: string;
  businessDescription: string;
}

interface ManagedUser {
  id: string;
  email: string;
  mobile: string;
  name: string;
  fullName: string;
  role: string;
  partnerType: string;
  status: string;
  accountStatus: string;
  kycStatus: string;
  onboardingStatus: string;
  createdAt: string;
  partnerProfile?: PartnerProfile;
}

interface PartnerDetailPageProps {
  partnerId: string;
  backHref: string;
  editBaseHref: string;
  listingDetailBaseHref: string;
}

export default function PartnerDetailPage({
  partnerId,
  backHref,
  editBaseHref,
  listingDetailBaseHref,
}: PartnerDetailPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [partner, setPartner] = useState<ManagedUser | null>(null);
  const [listings, setListings] = useState<PartnerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingListings, setLoadingListings] = useState(true);
  const [error, setError] = useState('');
  const [resolvedPartnerId, setResolvedPartnerId] = useState<string | null>(null);

  const fetchPartnerListings = useCallback(async () => {
    if (!resolvedPartnerId) {
      setListings([]);
      setLoadingListings(false);
      return;
    }

    try {
      setLoadingListings(true);
      const response = await api.get<{ listings: PartnerListing[] }>(`/superadmin/listings?partnerId=${resolvedPartnerId}`);
      setListings(response.data.listings || []);
    } catch (err) {
      console.error('Failed to load listings', err);
    } finally {
      setLoadingListings(false);
    }
  }, [resolvedPartnerId]);

  const fetchPartnerDetails = useCallback(async () => {
    try {
      setLoading(true);
      const nextResolvedPartnerId = (await resolvePartnerId(partnerId)) || partnerId;
      setResolvedPartnerId(nextResolvedPartnerId);
      const response = await api.get<{ partners: ManagedUser[] }>('/superadmin/partners');
      const allPartners = response.data.partners;
      const foundPartner = allPartners.find((item) => item.id === nextResolvedPartnerId);

      if (!foundPartner) {
        setError(t('partnerDetails.partnerNotFound'));
      } else {
        setPartner(foundPartner);
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
          : t('partnerDetails.fetchFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [partnerId, t]);

  const formatStatusLabel = useCallback((value?: string | null) => {
    if (!value) {
      return t('partnerDetails.notSet');
    }

    switch (value.toUpperCase()) {
      case 'APPROVED':
      case 'ACTIVE':
        return t('partnerDetails.active');
      case 'PENDING':
      case 'REVIEW_PENDING':
      case 'PROFILE_PENDING':
      case 'KYC_PENDING':
      case 'AGREEMENT_PENDING':
        return t('partnerDetails.pending');
      case 'REJECTED':
        return t('partnerDetails.rejected');
      case 'CHANGES_REQUESTED':
        return t('partnerDetails.changesRequested');
      case 'INACTIVE':
        return t('partnerDetails.inactive');
      case 'SUSPENDED':
        return t('partnerDetails.suspended');
      case 'BLOCKED':
        return t('partnerDetails.blocked');
      case 'SOLD':
        return t('partnerDetails.sold');
      case 'EXPIRED':
        return t('partnerDetails.expired');
      default:
        return value
          .toLowerCase()
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
    }
  }, [t]);

  useEffect(() => {
    const loadPartnerData = async () => {
      await Promise.all([fetchPartnerDetails(), fetchPartnerListings()]);
    };

    void loadPartnerData();
  }, [fetchPartnerDetails, fetchPartnerListings]);

  const getPartnerStatus = useCallback((currentPartner: ManagedUser) => {
    if (currentPartner.status === 'INACTIVE') return t('partnerDetails.inactive');
    if (currentPartner.status === 'SUSPENDED') return t('partnerDetails.suspended');
    if (currentPartner.status === 'BLOCKED') return t('partnerDetails.blocked');
    if (
      currentPartner.accountStatus === 'ACTIVE' &&
      currentPartner.kycStatus === 'APPROVED' &&
      currentPartner.onboardingStatus === 'APPROVED'
    ) {
      return t('partnerDetails.active');
    }
    if (currentPartner.onboardingStatus === 'REJECTED' || currentPartner.kycStatus === 'REJECTED') {
      return t('partnerDetails.rejected');
    }
    if (
      currentPartner.onboardingStatus === 'CHANGES_REQUESTED' ||
      currentPartner.kycStatus === 'CHANGES_REQUESTED'
    ) {
      return t('partnerDetails.changesRequested');
    }
    return t('partnerDetails.pending');
  }, [t]);

  const getPartnerStatusClassName = useCallback((currentPartner: ManagedUser) => {
    if (currentPartner.status === 'INACTIVE') return 'bg-gray-100 text-gray-700';
    if (currentPartner.status === 'SUSPENDED') return 'bg-orange-100 text-orange-700';
    if (currentPartner.status === 'BLOCKED') return 'bg-red-100 text-red-700';
    if (
      currentPartner.accountStatus === 'ACTIVE' &&
      currentPartner.kycStatus === 'APPROVED' &&
      currentPartner.onboardingStatus === 'APPROVED'
    ) {
      return 'bg-green-100 text-green-700';
    }
    if (currentPartner.onboardingStatus === 'REJECTED' || currentPartner.kycStatus === 'REJECTED') {
      return 'bg-red-100 text-red-700';
    }
    if (
      currentPartner.onboardingStatus === 'CHANGES_REQUESTED' ||
      currentPartner.kycStatus === 'CHANGES_REQUESTED'
    ) {
      return 'bg-yellow-100 text-yellow-800';
    }
    return 'bg-blue-100 text-blue-700';
  }, []);

  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);
  const editHref = partner
    ? generateAdminPartnerEditPath(editBaseHref, {
        id: partner.id,
        name: partner.name,
        district: partner.partnerProfile?.district || '',
      })
    : backHref;

  useEffect(() => {
    if (!partner) {
      return;
    }

    const canonicalPath = generateAdminPartnerDetailPath(backHref, {
      id: partner.id,
      name: partner.name,
      businessName: partner.name,
      district: partner.partnerProfile?.district || '',
    });

    if (pathname !== canonicalPath) {
      router.replace(canonicalPath);
    }
  }, [partner, backHref, pathname, router]);

  useEffect(() => {
    if (partner) {
      const profile = partner.partnerProfile;
      const partnerStatus = getPartnerStatus(partner);
      const statusClass = getPartnerStatusClassName(partner);

      setCustomHeader(
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={backHref}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 shadow-sm transition hover:bg-gray-100 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1
                className="truncate text-base font-bold text-gray-900 sm:text-xl"
                title={partner.name || t('partnerDetails.unnamedBusiness')}
              >
                {partner.name || t('partnerDetails.unnamedBusiness')}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-gray-500 sm:text-xs">
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.25 text-[9px] font-bold uppercase tracking-wider ${statusClass}`}>
                  {partnerStatus}
                </span>
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3 shrink-0" />
                  <span className="max-w-[80px] truncate sm:max-w-none">
                    {formatPartnerTypeLabel(partner.partnerType, t('partnerDetails.partnerTypeNotSet'))}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="max-w-[80px] truncate sm:max-w-none">
                    {profile?.district || t('partnerDetails.notSet')}
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end pr-2 sm:pr-4">
            <Link
              href={editHref}
              className="flex h-8 items-center justify-center rounded-full bg-[#FFC107] px-3 text-xs font-bold text-black shadow-sm transition hover:bg-[#E5AD06]"
            >
              <span className="hidden sm:inline">{t('partnerDetails.editOnboarding')}</span>
              <span className="inline sm:hidden">{t('partnerDetails.edit')}</span>
            </Link>
          </div>
        </div>
      );
    }
    return () => setCustomHeader(null);
  }, [partner, backHref, editHref, setCustomHeader, getPartnerStatus, getPartnerStatusClassName, t]);

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#FFC107]"></div>
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-2xl bg-white p-8 text-center shadow-sm">
        <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
        <h3 className="mb-2 text-xl font-bold text-gray-900">{t('partnerDetails.loadFailed')}</h3>
        <p className="mb-6 text-gray-500">{error || t('partnerDetails.partnerNotFound')}</p>
        <Link
          href={backHref}
          className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
        >
          {t('partnerDetails.goBack')}
        </Link>
      </div>
    );
  }

  const profile = partner.partnerProfile;

  return (
    <div className="pb-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                <Building2 className="h-5 w-5 text-gray-500" />
                <h3 className="text-base font-bold text-gray-900">{t('partnerDetails.businessProfile')}</h3>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.businessName')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{partner.name || t('partnerDetails.notProvided')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.ownerName')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">
                    {profile?.ownerName || partner.fullName || t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.partnerType')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">
                    {formatPartnerTypeLabel(partner.partnerType, t('partnerDetails.notProvided'))}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.experience')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.businessExperience || t('partnerDetails.notProvided')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.yearsInBusiness')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.yearsInBusiness || t('partnerDetails.notProvided')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.teamSize')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.teamSize || t('partnerDetails.notProvided')}</p>
                </div>
              </div>

              {profile?.businessDescription ? (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.businessDescription')}</p>
                  <div className="mt-2 min-h-[4rem] whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    {profile.businessDescription}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                <MapPin className="h-5 w-5 text-gray-500" />
                <h3 className="text-base font-bold text-gray-900">{t('partnerDetails.contactLocation')}</h3>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.emailAddress')}</p>
                  <p className="mt-1 flex items-center gap-2 text-base font-medium text-gray-900">
                    <Mail className="h-4 w-4 text-gray-400" />
                    {partner.email || t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.mobileNumber')}</p>
                  <p className="mt-1 flex items-center gap-2 text-base font-medium text-gray-900">
                    <Phone className="h-4 w-4 text-gray-400" />
                    {partner.mobile || t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.alternateMobile')}</p>
                  <p className="mt-1 flex items-center gap-2 text-base font-medium text-gray-900">
                    <Phone className="h-4 w-4 text-gray-400" />
                    {profile?.alternateMobile || t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.businessAddress')}</p>
                  <p className="mt-1 flex items-start gap-2 text-base font-medium text-gray-900">
                    <Map className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    {[profile?.businessAddress, profile?.district, profile?.pinCode, profile?.state].filter(Boolean).join(', ') ||
                      t('partnerDetails.notProvided')}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.serviceAreas')}</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{profile?.serviceAreas || t('partnerDetails.notProvided')}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex h-full flex-col gap-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 border-b border-gray-100 pb-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{t('partnerDetails.accountSummary')}</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">{t('partnerDetails.kycStatus')}</span>
                  <span className="text-sm font-bold text-gray-900">{formatStatusLabel(partner.kycStatus)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">{t('partnerDetails.appliedOn')}</span>
                  <span className="text-sm font-bold text-gray-900">
                    {partner.createdAt ? formatPortalDate(partner.createdAt) : t('partnerDetails.na')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">{t('partnerDetails.workingHours')}</span>
                  <span className="text-sm font-bold text-gray-900">{profile?.workingHours || t('partnerDetails.na')}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                <ShieldCheck className="h-5 w-5 text-gray-500" />
                <h3 className="text-base font-bold text-gray-900">{t('partnerDetails.registrationDetails')}</h3>
              </div>

              <div
                className="h-[320px] space-y-3 overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <FileText className="h-4 w-4 text-gray-400" /> {t('partnerDetails.gstNumber')}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{profile?.gstNumber || t('partnerDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <FileText className="h-4 w-4 text-gray-400" /> {t('partnerDetails.registrationNumber')}
                  </span>
                  <span
                    className="max-w-[120px] truncate text-right text-sm font-semibold text-gray-900"
                    title={profile?.businessRegistrationNumber}
                  >
                    {profile?.businessRegistrationNumber || t('partnerDetails.na')}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <Share2 className="h-4 w-4 text-gray-400" /> {t('partnerDetails.referralCode')}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{profile?.referralCode || t('partnerDetails.na')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <Globe className="h-4 w-4 text-gray-400" /> {t('partnerDetails.websiteUrl')}
                  </span>
                  <span className="max-w-[120px] truncate text-right text-sm font-semibold text-blue-600">
                    {profile?.websiteUrl ? (
                      <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {t('partnerDetails.view')}
                      </a>
                    ) : t('partnerDetails.na')}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <Map className="h-4 w-4 text-gray-400" /> {t('partnerDetails.googleMaps')}
                  </span>
                  <span className="max-w-[120px] truncate text-right text-sm font-semibold text-blue-600">
                    {profile?.googleMapsLocation ? (
                      <a href={profile.googleMapsLocation} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {t('partnerDetails.viewOnMap')}
                      </a>
                    ) : t('partnerDetails.na')}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <Share2 className="h-4 w-4 text-gray-400" /> {t('partnerDetails.socialLinks')}
                  </span>
                  <span className="max-w-[120px] truncate text-right text-sm font-semibold text-gray-900" title={profile?.socialLinks}>
                    {profile?.socialLinks || t('partnerDetails.na')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-gray-500" />
              <h3 className="text-lg font-bold text-gray-900">{t('partnerDetails.vehicleListings')}</h3>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {t('partnerDetails.totalCount', { count: listings.length })}
            </span>
          </div>

          {loadingListings ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#FFC107]"></div>
            </div>
          ) : listings.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
              <Package className="mb-2 h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-500">{t('partnerDetails.noListings')}</p>
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
                          <span className="text-xs font-medium uppercase tracking-wider">{t('partnerDetails.noImage')}</span>
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
